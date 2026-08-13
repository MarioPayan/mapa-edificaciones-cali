import { estaUbicada, type Edificacion, type Estado } from './tipos.ts'

/**
 * Un envío es una intención de cambio hecha en campo: reclamar, ubicar,
 * caracterizar, marcar colapsada o liberar.
 *
 * Se guarda en el teléfono y se manda cuando haya señal. La autoridad sobre si
 * el cambio procede es del `doPost` (valida contra la hoja en el momento de
 * escribir); aquí solo se modela para poder encolarlo y para pintar el cambio
 * de inmediato mientras llega.
 */
export type TipoEnvio =
  | 'reclamar'
  | 'liberar'
  | 'ubicar'
  | 'caracterizar'
  | 'colapsar'
  // Un residente reporta su edificación (CU-13). No exige código de cuadrilla.
  | 'reportar'
  // Solo coordinación (el script exige un código de la pestaña `coordinacion`):
  | 'crear'
  | 'duplicar'

export interface DatosCaracterizar {
  caracterizacion: string
  tipoEdificacion: string
  numTorres: number | null
  aptsPorTorre: number | null
  /** Texto libre: «varía» es una respuesta válida (R-05). */
  ocupacion: string
  fallecidosAtrapados: string
  observaciones: string
}

export interface DatosUbicar {
  lat: number
  lon: number
  /** Precisión del GPS en metros, tal como la reporta el navegador. */
  exactitudM: number | null
  /** Referencia opcional escrita en la puerta: «torre B, entrada por la 58N». */
  referencia?: string
  /** La ubicación la puso coordinación tocando el mapa, no un GPS en sitio. */
  manual?: boolean
}

/** Coordinación crea una edificación que nadie reportó (CU-09: un colapso sin reporte previo). */
export interface DatosCrear {
  direccionTexto: string
  barrio: string
  comuna: string
  lat: number
  lon: number
  estado: Estado
}

/** Coordinación marca un reporte como duplicado de otro (CU-11). */
export interface DatosDuplicar {
  duplicadoDe: string
}

/**
 * CU-13: «vengan, revisen mi casa». El contacto identifica al residente (no hay
 * código); el GPS es opcional — sin él la fila entra «sin ubicar» y
 * coordinación la pone en el mapa (CU-11).
 */
export interface DatosReportar {
  nombre: string
  telefono: string
  correo: string
  direccionTexto: string
  barrio: string
  comuna: string
  unidadApto: string
  lat: number | null
  lon: number | null
}

export interface DatosColapsar {
  rescatadasEnSitio: number | null
  rescatadasFuente: string
  fallecidosAtrapados: string
}

export interface Envio {
  /** Idempotencia: el script ignora un uuid que ya escribió. */
  uuid: string
  tipo: TipoEnvio
  /** Id de la edificación afectada. */
  edificacionId: string
  /** Código de cuadrilla. Atribución, no seguridad. */
  cuadrilla: string
  /** Hora del dispositivo al capturar. Es cuándo pasó, no cuándo se envió. */
  creadoEn: string
  datos?: DatosCaracterizar | DatosUbicar | DatosColapsar | DatosCrear | DatosDuplicar | DatosReportar
}

export function nuevoUuid(): string {
  // crypto.randomUUID existe en todo navegador con service worker; el respaldo
  // es para entornos de prueba sin crypto.
  return globalThis.crypto?.randomUUID?.() ?? `u-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function crearEnvio(
  tipo: TipoEnvio,
  edificacionId: string,
  cuadrilla: string,
  datos?: Envio['datos'],
): Envio {
  return {
    uuid: nuevoUuid(),
    tipo,
    edificacionId,
    cuadrilla,
    creadoEn: new Date().toISOString(),
    ...(datos ? { datos } : {}),
  }
}

/** CU-12: lo que pide el registro en autoservicio. Nombre y teléfono son el mínimo contactable. */
export interface DatosRegistro {
  nombre: string
  telefono: string
  correo: string
  entidad: string
}

/**
 * Registra una cuadrilla y devuelve el código asignado (R-01, R-02…).
 *
 * No pasa por la cola offline a propósito: la respuesta trae el código y sin él
 * no hay nada que guardar en el teléfono. Registrarse exige señal — es un paso
 * único; el trabajo de campo sigue funcionando sin red.
 */
export async function registrarCuadrilla(
  urlEnvios: string,
  datos: DatosRegistro,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const respuesta = await fetchImpl(urlEnvios, {
    method: 'POST',
    // text/plain a propósito: application/json dispara un preflight OPTIONS que
    // Apps Script no responde (mismo motivo que en la cola).
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify({
      uuid: nuevoUuid(),
      tipo: 'registrar',
      creadoEn: new Date().toISOString(),
      datos,
    }),
  })
  const cuerpo = (await respuesta.json()) as { ok?: boolean; codigo?: string; error?: string }
  if (!cuerpo.ok || !cuerpo.codigo) throw new Error(cuerpo.error || 'registro_rechazado')
  return cuerpo.codigo
}

/**
 * Pinta sobre las edificaciones los envíos que aún están en la cola.
 *
 * Sin esto, una cuadrilla sin señal reclama y no ve pasar nada — y vuelve a
 * reclamar. El resultado es optimista a propósito: si el servidor rechaza el
 * cambio, el siguiente refresco del CSV lo corrige.
 */
export function aplicarEnvios(edificaciones: Edificacion[], envios: Envio[]): Edificacion[] {
  if (envios.length === 0) return edificaciones
  const porId = new Map<string, Envio[]>()
  for (const envio of envios) {
    const lista = porId.get(envio.edificacionId)
    if (lista) lista.push(envio)
    else porId.set(envio.edificacionId, [envio])
  }

  const existentes = edificaciones.map((e) => {
    const pendientes = porId.get(e.id)
    return pendientes ? pendientes.reduce(aplicarEnvio, e) : e
  })

  // Las creadas por coordinación o reportadas por un residente aún no están en
  // el CSV: se agregan aparte para que se vean desde el momento en que nacen.
  const yaEsta = new Set(edificaciones.map((e) => e.id))
  const creadas = envios
    .filter(
      (envio) =>
        (envio.tipo === 'crear' || envio.tipo === 'reportar') && !yaEsta.has(envio.edificacionId),
    )
    .map((envio) => nuevaEdificacion(envio))

  return creadas.length > 0 ? [...existentes, ...creadas] : existentes
}

/**
 * Edificación en blanco a partir de un envío `crear` o `reportar`. El contacto
 * del reporte NO pasa: `Edificacion` no tiene esos campos a propósito — lo que
 * no se modela no se puede pintar por accidente.
 */
function nuevaEdificacion(envio: Envio): Edificacion {
  const esReporte = envio.tipo === 'reportar'
  const d = envio.datos as DatosCrear & Partial<DatosReportar>
  const conGPS = typeof d.lat === 'number' && typeof d.lon === 'number'
  return {
    id: envio.edificacionId,
    creadoEn: envio.creadoEn,
    origen: esReporte ? 'reporte_app' : 'coordinacion',
    direccionTexto: d.direccionTexto,
    barrio: d.barrio,
    comuna: d.comuna,
    lat: conGPS ? d.lat : null,
    lon: conGPS ? d.lon : null,
    precision: conGPS ? 'manual' : 'sin_ubicar',
    estado: esReporte ? 'NARANJA' : d.estado,
    reclamadaPor: '',
    reclamadaEn: '',
    tipoEdificacion: '',
    numTorres: null,
    aptsPorTorre: null,
    ocupacion: '',
    caracterizacion: '',
    fallecidosAtrapados: '',
    rescatadasEnSitio: null,
    rescatadasFuente: '',
    visitadaPor: '',
    visitadaEn: '',
    observaciones: '',
    duplicadoDe: '',
  }
}

function aplicarEnvio(e: Edificacion, envio: Envio): Edificacion {
  switch (envio.tipo) {
    case 'reclamar':
      return { ...e, reclamadaPor: envio.cuadrilla, reclamadaEn: envio.creadoEn }
    case 'liberar':
      return { ...e, reclamadaPor: '', reclamadaEn: '' }
    case 'ubicar': {
      const d = envio.datos as DatosUbicar
      return {
        ...e,
        lat: d.lat,
        lon: d.lon,
        precision: d.manual ? 'manual' : 'visita',
        observaciones: d.referencia ? `${e.observaciones} ${d.referencia}`.trim() : e.observaciones,
      }
    }

    case 'crear':
    case 'reportar':
      return e

    case 'duplicar':
      return { ...e, duplicadoDe: (envio.datos as DatosDuplicar).duplicadoDe }
    case 'caracterizar': {
      const d = envio.datos as DatosCaracterizar
      return {
        ...e,
        estado: 'VERDE',
        visitadaPor: envio.cuadrilla,
        visitadaEn: envio.creadoEn,
        reclamadaPor: '',
        reclamadaEn: '',
        caracterizacion: d.caracterizacion,
        tipoEdificacion: d.tipoEdificacion,
        numTorres: d.numTorres,
        aptsPorTorre: d.aptsPorTorre,
        ocupacion: d.ocupacion,
        fallecidosAtrapados: d.fallecidosAtrapados,
        observaciones: d.observaciones,
      }
    }
    case 'colapsar': {
      const d = envio.datos as DatosColapsar
      return {
        ...e,
        estado: 'ROJO',
        visitadaPor: envio.cuadrilla,
        visitadaEn: envio.creadoEn,
        rescatadasEnSitio: d.rescatadasEnSitio,
        rescatadasFuente: d.rescatadasFuente,
        fallecidosAtrapados: d.fallecidosAtrapados,
      }
    }
  }
}

/** ¿Tiene sentido pedir la ubicación GPS? Solo si aún no la tomó una cuadrilla. */
export function necesitaUbicacion(e: Edificacion): boolean {
  return e.precision !== 'visita' || !estaUbicada(e)
}
