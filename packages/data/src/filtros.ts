import { barriosDeComuna } from './barrios.ts'
import { ESTADOS, estaUbicada, type Edificacion, type Estado } from './tipos.ts'

export interface Filtro {
  /** Vacío = todos los estados. */
  estados: Estado[]
  /** '' = todas. */
  comuna: string
  /** '' = todos. */
  barrio: string
  /** Busca en dirección, barrio e id. */
  texto: string
}

export const FILTRO_VACIO: Filtro = { estados: [], comuna: '', barrio: '', texto: '' }

/** Horas que dura un reclamo antes de liberarse solo (documentado en el README). */
export const HORAS_RECLAMO = 4

function sinTildes(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function filtrar(edificaciones: Edificacion[], filtro: Filtro): Edificacion[] {
  const texto = sinTildes(filtro.texto.trim())
  return edificaciones.filter((e) => {
    if (filtro.estados.length > 0 && !filtro.estados.includes(e.estado)) return false
    if (filtro.comuna && e.comuna !== filtro.comuna) return false
    if (filtro.barrio && e.barrio !== filtro.barrio) return false
    if (texto && !sinTildes(`${e.direccionTexto} ${e.barrio} ${e.id}`).includes(texto)) return false
    return true
  })
}

export function contarPorEstado(edificaciones: Edificacion[]): Record<Estado, number> {
  const conteo = { ROJO: 0, NARANJA: 0, VERDE: 0 }
  for (const e of edificaciones) conteo[e.estado]++
  return conteo
}

/** Valores únicos de una columna, ordenados, sin vacíos: alimenta los selectores. */
export function opcionesDe(edificaciones: Edificacion[], campo: 'comuna' | 'barrio'): string[] {
  return [...new Set(edificaciones.map((e) => e[campo]).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  )
}

/**
 * Barrios que ofrece el selector: los del catálogo de Cali para esa comuna, más
 * los que aparezcan en los datos y no estén en el catálogo.
 *
 * Se listan aunque no tengan ni un reporte: una cuadrilla busca por el barrio
 * donde está, no por el barrio donde alguien ya reportó. Y nunca se esconde un
 * barrio que sí tiene reportes solo porque el catálogo no lo conozca.
 */
export function barriosParaFiltro(edificaciones: Edificacion[], comuna: string): string[] {
  const enDatos = comuna ? edificaciones.filter((e) => e.comuna === comuna) : edificaciones
  const nombres = new Set(barriosDeComuna(comuna).map((b) => b.nombre))
  for (const barrio of opcionesDe(enDatos, 'barrio')) nombres.add(barrio)
  return [...nombres].sort((a, b) => a.localeCompare(b, 'es'))
}

/**
 * Un reclamo vence solo a las 4 h: si una cuadrilla reclamó y no fue, la
 * edificación vuelve a estar disponible sin que nadie tenga que liberarla.
 */
export function reclamoVigente(e: Edificacion, ahora: Date = new Date()): boolean {
  if (!e.reclamadaPor || !e.reclamadaEn) return false
  const reclamo = new Date(e.reclamadaEn)
  if (Number.isNaN(reclamo.getTime())) return false
  return ahora.getTime() - reclamo.getTime() < HORAS_RECLAMO * 3600_000
}

/** Edificaciones sin coordenada: no se pueden pintar, pero no se pueden perder (CU-11). */
export function sinUbicar(edificaciones: Edificacion[]): Edificacion[] {
  return edificaciones.filter((e) => !estaUbicada(e))
}

/**
 * Quita los reportes fusionados como duplicados de otro (R-16).
 * La hoja ya los excluye de `publico`; esto los quita en pantalla en el momento
 * en que coordinación los fusiona, sin esperar el refresco del CSV.
 */
export function sinDuplicados(edificaciones: Edificacion[]): Edificacion[] {
  return edificaciones.filter((e) => !e.duplicadoDe)
}

export { ESTADOS }

/**
 * Fecha legible para una cuadrilla. La hoja mezcla formatos: ISO de los envíos,
 * «12/08 09:15» escrito a mano, o solo la fecha. Lo que no se entienda se
 * muestra tal cual — inventarle un formato a un dato ajeno lo empeora.
 */
export function fechaLegible(valor: string): string {
  const limpio = valor.trim()
  if (!limpio) return ''

  // Solo fecha: se formatea a mano. `new Date('2026-08-10')` es medianoche UTC
  // y en Colombia (UTC-5) se mostraría como el día anterior.
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpio)
  if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`

  const fecha = new Date(limpio)
  if (Number.isNaN(fecha.getTime())) return limpio

  // A mano y en 24 h: `toLocaleString('es-CO')` devuelve «12/8, 12:56 a. m.»,
  // que en una pantalla al sol y con prisa se lee peor que «12/08 00:56».
  const dosDigitos = (n: number) => String(n).padStart(2, '0')
  return (
    `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)} ` +
    `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
  )
}
