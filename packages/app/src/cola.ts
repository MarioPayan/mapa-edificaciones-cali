import type { Envio } from '@dania/data'
import { get, set } from 'idb-keyval'

/**
 * Cola de envíos en el teléfono.
 *
 * IndexedDB y no localStorage: la fase 3 mete fotos y localStorage se queda sin
 * espacio. `idb-keyval` porque la API cruda de IndexedDB son cuarenta líneas de
 * ceremonia para guardar un arreglo.
 */
const CLAVE_COLA = 'dania:cola'
const CLAVE_RECHAZOS = 'dania:rechazos'
/** Modo práctica: envíos que se quedan en este teléfono y nunca se mandan. */
const CLAVE_APLICADOS = 'dania:practica'

export interface Rechazo {
  uuid: string
  edificacionId: string
  motivo: string
}

/** Errores transitorios: reintentar sirve. Cualquier otro motivo, no. */
const TRANSITORIOS = ['ocupado_reintente', 'error_interno']

/**
 * Toda modificación de la cola pasa por aquí, una detrás de otra.
 *
 * Sin esto, dos escrituras concurrentes (encolar mientras se está vaciando, o
 * dos capturas seguidas) hacen leer-modificar-escribir sobre la misma clave y
 * la última pisa a la primera: se pierde un envío de campo sin dejar rastro, y
 * el que sobrevive se manda dos veces. Pasó de verdad — caracterizar disparaba
 * la captura automática de GPS y una de las dos desaparecía.
 */
let cadena: Promise<unknown> = Promise.resolve()

function enSerie<T>(tarea: () => Promise<T>): Promise<T> {
  const siguiente = cadena.then(tarea, tarea)
  cadena = siguiente.then(
    () => undefined,
    () => undefined,
  )
  return siguiente
}

export async function leerCola(): Promise<Envio[]> {
  return (await get<Envio[]>(CLAVE_COLA)) ?? []
}

export async function guardarCola(cola: Envio[]): Promise<void> {
  await enSerie(() => set(CLAVE_COLA, cola))
}

export function encolar(envio: Envio): Promise<Envio[]> {
  return enSerie(async () => {
    const cola = [...(await leerCola()), envio]
    await set(CLAVE_COLA, cola)
    return cola
  })
}

/**
 * Quita de la cola lo que el servidor ya resolvió (aceptado o rechazado).
 * Se filtra por uuid en vez de sobrescribir con «lo que quedaba»: mientras se
 * enviaba, la cuadrilla pudo capturar algo más y eso no se puede perder.
 */
export function quitarDeCola(uuids: Set<string>): Promise<Envio[]> {
  return enSerie(async () => {
    const cola = (await leerCola()).filter((envio) => !uuids.has(envio.uuid))
    await set(CLAVE_COLA, cola)
    return cola
  })
}

export async function leerAplicados(): Promise<Envio[]> {
  return (await get<Envio[]>(CLAVE_APLICADOS)) ?? []
}

/** Modo práctica: el cambio se aplica solo aquí, sin red de por medio. */
export function aplicarLocalmente(envio: Envio): Promise<Envio[]> {
  return enSerie(async () => {
    const aplicados = [...(await leerAplicados()), envio]
    await set(CLAVE_APLICADOS, aplicados)
    return aplicados
  })
}

export function guardarAplicados(aplicados: Envio[]): Promise<Envio[]> {
  return enSerie(async () => {
    await set(CLAVE_APLICADOS, aplicados)
    return aplicados
  })
}

export async function leerRechazos(): Promise<Rechazo[]> {
  return (await get<Rechazo[]>(CLAVE_RECHAZOS)) ?? []
}

export async function guardarRechazos(rechazos: Rechazo[]): Promise<void> {
  await set(CLAVE_RECHAZOS, rechazos)
}

export interface ResultadoEnvio {
  restantes: Envio[]
  /** Los que el servidor aceptó. Se siguen pintando hasta que el CSV los traiga. */
  enviados: Envio[]
  rechazos: Rechazo[]
  /** Verdadero si se cortó por falta de red (no por un rechazo del servidor). */
  interrumpido: boolean
}

/**
 * Cuánto se sigue pintando un cambio ya aceptado.
 *
 * El CSV publicado por Google se refresca con minutos de retraso. Sin esta
 * ventana, entre que el servidor dice «ok» y el CSV se entera, la cuadrilla ve
 * desaparecer su propio reclamo — y vuelve a reclamar. Que sobre tiempo: si el
 * CSV llega antes, manda el CSV porque el envío ya no cambia nada.
 */
export const VENTANA_APLICADOS_MS = 20 * 60_000

/** Descarta los envíos aplicados que el CSV ya debería reflejar. */
export function podarAplicados(aplicados: Envio[], ahora = Date.now()): Envio[] {
  return aplicados.filter((envio) => {
    const t = new Date(envio.creadoEn).getTime()
    return Number.isNaN(t) ? false : ahora - t < VENTANA_APLICADOS_MS
  })
}

/**
 * Manda la cola en orden, uno por uno.
 *
 * El orden importa: reclamar antes que caracterizar. Si falla la red se corta y
 * se conserva todo lo que falte — nunca se descarta por un problema de señal.
 * Un rechazo con motivo (ya visitada, reclamada por otra) sí sale de la cola:
 * reintentarlo daría el mismo resultado para siempre.
 */
export async function enviarCola(
  url: string,
  cola: Envio[],
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoEnvio> {
  const rechazos: Rechazo[] = []
  const enviados: Envio[] = []

  for (let i = 0; i < cola.length; i++) {
    const envio = cola[i]!
    let respuesta: Response
    try {
      respuesta = await fetchImpl(url, {
        method: 'POST',
        // text/plain a propósito: con application/json el navegador manda un
        // preflight OPTIONS que un web app de Apps Script no responde.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(envio),
        redirect: 'follow',
      })
    } catch {
      return { restantes: cola.slice(i), enviados, rechazos, interrumpido: true }
    }

    if (!respuesta.ok) {
      // 5xx o el script caído: es del servidor, no del envío. Se reintenta.
      return { restantes: cola.slice(i), enviados, rechazos, interrumpido: true }
    }

    let cuerpo: { ok?: boolean; error?: string }
    try {
      cuerpo = await respuesta.json()
    } catch {
      return { restantes: cola.slice(i), enviados, rechazos, interrumpido: true }
    }

    if (cuerpo.ok) {
      enviados.push(envio)
    } else {
      const motivo = cuerpo.error ?? 'error_desconocido'
      if (TRANSITORIOS.includes(motivo)) {
        return { restantes: cola.slice(i), enviados, rechazos, interrumpido: true }
      }
      rechazos.push({ uuid: envio.uuid, edificacionId: envio.edificacionId, motivo })
    }
  }

  return { restantes: [], enviados, rechazos, interrumpido: false }
}
