import { filasComoObjetos, normalizarClave, parsearCSV } from './csv.ts'
import { ESTADOS, type Edificacion, type Estado, type Precision } from './tipos.ts'

/**
 * Columnas que NUNCA deben salir de la hoja (PLAN.md §7, R-17).
 * Si aparecen en el CSV publicado significa que se publicó la pestaña equivocada:
 * el fallo es de la hoja, pero se detecta aquí y se grita, porque aquí es donde
 * se nota. Los datos se descartan igual — el mapeo solo lee columnas conocidas.
 */
export const COLUMNAS_PROHIBIDAS = [
  'contacto_nombre',
  'contacto_telefono',
  'contacto_correo',
  'unidad_apto',
  'fotos',
  'uuid_envio',
] as const

export interface ResultadoCarga {
  edificaciones: Edificacion[]
  /** Columnas de datos personales encontradas en el CSV. Vacío = todo en orden. */
  columnasProhibidas: string[]
}

const SINONIMOS_ESTADO: Record<string, Estado> = {
  rojo: 'ROJO',
  colapsada: 'ROJO',
  colapsado: 'ROJO',
  naranja: 'NARANJA',
  por_visitar: 'NARANJA',
  pendiente: 'NARANJA',
  verde: 'VERDE',
  visitada: 'VERDE',
  visitado: 'VERDE',
}

function aEstado(valor: string): Estado {
  const clave = normalizarClave(valor)
  const directo = ESTADOS.find((e) => e === clave.toUpperCase())
  if (directo) return directo
  // Sin estado legible se asume PENDIENTE, nunca VISITADA: el error caro es
  // esconder una edificación que nadie ha visitado (1.ogg 03:27).
  return SINONIMOS_ESTADO[clave] ?? 'NARANJA'
}

function aNumero(valor: string | undefined): number | null {
  if (!valor) return null
  const n = Number(valor.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function aComuna(valor: string): string {
  const limpio = valor.trim()
  if (!limpio) return ''
  const n = Number(limpio)
  // '2' y '02' son la misma comuna; se normaliza a dos dígitos para agrupar bien.
  return Number.isInteger(n) && n >= 1 && n <= 22 ? String(n).padStart(2, '0') : limpio
}

function aPrecision(valor: string): Precision {
  const clave = normalizarClave(valor)
  if (clave === 'manual' || clave === 'visita' || clave === 'geocodificada') return clave
  return 'sin_ubicar'
}

function filaAEdificacion(f: Record<string, string>, indice: number): Edificacion {
  const latVisita = aNumero(f['lat_visita'])
  const lonVisita = aNumero(f['lon_visita'])
  const hayVisita = latVisita !== null && lonVisita !== null

  // La coordenada de la visita manda sobre la del reporte (PLAN.md §6, R-09):
  // la tomó una cuadrilla parada frente al inmueble.
  const lat = hayVisita ? latVisita : aNumero(f['lat_reporte'])
  const lon = hayVisita ? lonVisita : aNumero(f['lon_reporte'])

  return {
    id: f['id'] || `sin-id-${indice}`,
    creadoEn: f['creado_en'] ?? '',
    origen: f['origen'] ?? '',
    direccionTexto: f['direccion_texto'] ?? '',
    barrio: f['barrio'] ?? '',
    comuna: aComuna(f['comuna'] ?? ''),
    lat,
    lon,
    precision: hayVisita ? 'visita' : aPrecision(f['precision_reporte'] ?? ''),
    estado: aEstado(f['estado'] ?? ''),
    reclamadaPor: f['reclamada_por'] ?? '',
    reclamadaEn: f['reclamada_en'] ?? '',
    tipoEdificacion: f['tipo_edificacion'] ?? '',
    numTorres: aNumero(f['num_torres']),
    aptsPorTorre: aNumero(f['apts_por_torre']),
    ocupacion: f['ocupacion'] ?? '',
    caracterizacion: f['caracterizacion'] ?? '',
    fallecidosAtrapados: f['fallecidos_atrapados'] ?? '',
    rescatadasEnSitio: aNumero(f['rescatadas_en_sitio']),
    rescatadasFuente: f['rescatadas_fuente'] ?? '',
    visitadaPor: f['visitada_por'] ?? '',
    visitadaEn: f['visitada_en'] ?? '',
    observaciones: f['observaciones'] ?? '',
    duplicadoDe: f['duplicado_de'] ?? '',
  }
}

/** Convierte el CSV publicado en edificaciones, avisando si trae datos personales. */
export function parsearEdificaciones(csv: string): ResultadoCarga {
  const encabezado = parsearCSV(csv)[0] ?? []
  const claves = encabezado.map(normalizarClave)
  const columnasProhibidas = claves.filter(
    (c) => (COLUMNAS_PROHIBIDAS as readonly string[]).includes(c) || c.startsWith('contacto'),
  )

  return {
    edificaciones: filasComoObjetos(csv).map(filaAEdificacion).filter((e) => e.id !== ''),
    columnasProhibidas,
  }
}

/** Descarga y parsea el CSV publicado de la pestaña `publico`. */
export async function cargarEdificaciones(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoCarga> {
  const respuesta = await fetchImpl(url, { redirect: 'follow' })
  if (!respuesta.ok) {
    throw new Error(`No se pudo leer el CSV publicado (HTTP ${respuesta.status})`)
  }
  return parsearEdificaciones(await respuesta.text())
}
