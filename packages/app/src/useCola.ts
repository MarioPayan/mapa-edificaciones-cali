import type { Envio } from '@dania/data'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  aplicarLocalmente,
  encolar,
  enviarCola,
  guardarAplicados,
  guardarRechazos,
  leerAplicados,
  leerCola,
  leerRechazos,
  podarAplicados,
  quitarDeCola,
  type Rechazo,
} from './cola.ts'

/** Reintento periódico por si el evento `online` no llega (pasa en Android). */
const REINTENTO_MS = 60_000

/**
 * @param practica Modo práctica: los envíos se aplican solo en este teléfono y
 * nunca salen. Sirve para enseñar el flujo sobre los datos de ejemplo.
 */
export function useCola(urlEnvios: string, practica = false) {
  const [cola, setCola] = useState<Envio[]>([])
  const [aplicados, setAplicados] = useState<Envio[]>([])
  const [rechazos, setRechazos] = useState<Rechazo[]>([])
  const [enviando, setEnviando] = useState(false)
  const [hayRed, setHayRed] = useState(() => navigator.onLine)
  // Dos disparadores (evento `online` e intervalo) pueden coincidir; sin este
  // cerrojo el mismo envío saldría dos veces y el uuid tendría que salvarnos.
  const enviandoRef = useRef(false)

  const enviar = useCallback(async () => {
    // El cerrojo se toma ANTES de cualquier await: si se tomara después de leer
    // la cola, dos disparadores concurrentes la leerían ambos y mandarían todo
    // dos veces.
    if (enviandoRef.current || !urlEnvios) return
    enviandoRef.current = true
    setEnviando(true)
    try {
      // Se repite mientras haya avance: lo que la cuadrilla capture mientras se
      // está enviando entra a la cola y saldría solo en el siguiente intento
      // (hasta un minuto después) — que es justo cuando la captura automática
      // de GPS al caracterizar deja un envío rezagado.
      for (;;) {
        const pendientes = await leerCola()
        if (pendientes.length === 0) return

        const resultado = await enviarCola(urlEnvios, pendientes)
        const resueltos = new Set([
          ...resultado.enviados.map((e) => e.uuid),
          ...resultado.rechazos.map((r) => r.uuid),
        ])
        setCola(await quitarDeCola(resueltos))

        // Lo aceptado se sigue pintando un rato: el CSV publicado tarda minutos
        // en reflejarlo y quien acaba de reclamar no puede ver desaparecer su
        // reclamo (si no, vuelve a reclamar).
        if (resultado.enviados.length > 0) {
          const vigentes = podarAplicados([...(await leerAplicados()), ...resultado.enviados])
          await guardarAplicados(vigentes)
          setAplicados(vigentes)
        }
        if (resultado.rechazos.length > 0) {
          const todos = [...(await leerRechazos()), ...resultado.rechazos]
          await guardarRechazos(todos)
          setRechazos(todos)
        }

        // Sin red, o sin nada resuelto, no tiene sentido volver a intentar ya.
        if (resultado.interrumpido || resueltos.size === 0) return
      }
    } finally {
      enviandoRef.current = false
      setEnviando(false)
    }
  }, [urlEnvios])

  const agregar = useCallback(
    async (envio: Envio) => {
      if (practica) {
        setAplicados(await aplicarLocalmente(envio))
        return
      }
      setCola(await encolar(envio))
      void enviar()
    },
    [enviar, practica],
  )

  const descartarRechazos = useCallback(async () => {
    await guardarRechazos([])
    setRechazos([])
  }, [])

  useEffect(() => {
    void leerCola().then(setCola)
    void leerRechazos().then(setRechazos)
    // En modo práctica los cambios son el estado del ejercicio y no caducan;
    // en modo real son solo el puente hasta que el CSV se actualice.
    void leerAplicados().then((guardados) => {
      const vigentes = practica ? guardados : podarAplicados(guardados)
      if (vigentes.length !== guardados.length) void guardarAplicados(vigentes)
      setAplicados(vigentes)
    })

    const conRed = () => {
      setHayRed(true)
      void enviar()
    }
    const sinRed = () => setHayRed(false)
    window.addEventListener('online', conRed)
    window.addEventListener('offline', sinRed)
    const intervalo = setInterval(() => {
      if (navigator.onLine) void enviar()
    }, REINTENTO_MS)

    void enviar()

    return () => {
      window.removeEventListener('online', conRed)
      window.removeEventListener('offline', sinRed)
      clearInterval(intervalo)
    }
  }, [enviar, practica])

  return { cola, aplicados, rechazos, enviando, hayRed, agregar, enviar, descartarRechazos }
}
