import { cargarEdificaciones, type Edificacion } from '@dania/data'
import { useCallback, useEffect, useRef, useState } from 'react'

/** El CSV publicado por Google se actualiza con minutos de retraso; refrescar más seguido no sirve. */
const INTERVALO_MS = 5 * 60_000

export interface EstadoCarga {
  edificaciones: Edificacion[]
  columnasProhibidas: string[]
  cargando: boolean
  error: string | null
  actualizadoEn: Date | null
}

/**
 * Descarga el CSV publicado y lo refresca solo.
 *
 * Ante un fallo de red conserva los últimos datos buenos: en campo, un mapa de
 * hace diez minutos sirve; una pantalla vacía, no.
 */
export function useEdificaciones(url: string) {
  const [estado, setEstado] = useState<EstadoCarga>({
    edificaciones: [],
    columnasProhibidas: [],
    cargando: true,
    error: null,
    actualizadoEn: null,
  })
  const vivo = useRef(true)

  const recargar = useCallback(async () => {
    setEstado((e) => ({ ...e, cargando: true }))
    try {
      const { edificaciones, columnasProhibidas } = await cargarEdificaciones(url)
      if (!vivo.current) return
      setEstado({
        edificaciones,
        columnasProhibidas,
        cargando: false,
        error: null,
        actualizadoEn: new Date(),
      })
    } catch (error) {
      if (!vivo.current) return
      setEstado((previo) => ({
        ...previo,
        cargando: false,
        error: error instanceof Error ? error.message : 'No se pudo cargar la información',
      }))
    }
  }, [url])

  useEffect(() => {
    vivo.current = true
    void recargar()

    const intervalo = setInterval(() => void recargar(), INTERVALO_MS)
    // Volver a la pestaña después de un rato es la señal más clara de «muéstrame lo de ahora».
    const alVolver = () => {
      if (document.visibilityState === 'visible') void recargar()
    }
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      vivo.current = false
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [recargar])

  return { ...estado, recargar }
}
