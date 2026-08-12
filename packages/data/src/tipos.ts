/**
 * Modelo de datos de una edificación afectada.
 * Refleja la pestaña `publico` de la hoja: el subconjunto de columnas que SÍ
 * pueden salir de la operación. Las columnas de contacto
 * (nombre, teléfono, correo, unidad) no existen en este tipo a propósito:
 * lo que no se modela no se puede pintar por accidente.
 */

/** Semáforo (R-02): rojo = colapsada, naranja = por visitar, verde = visitada. */
export const ESTADOS = ['ROJO', 'NARANJA', 'VERDE'] as const
export type Estado = (typeof ESTADOS)[number]

/** De dónde salió la coordenada que se está pintando. */
export type Precision = 'visita' | 'geocodificada' | 'manual' | 'sin_ubicar'

export interface Edificacion {
  id: string
  creadoEn: string
  origen: string
  direccionTexto: string
  barrio: string
  /** Comuna de Cali, '01'..'22'. Cadena, no número: el cero a la izquierda importa. */
  comuna: string
  /** Coordenada efectiva: la de la visita si existe, si no la del reporte. */
  lat: number | null
  lon: number | null
  precision: Precision
  estado: Estado
  reclamadaPor: string
  reclamadaEn: string
  tipoEdificacion: string
  numTorres: number | null
  aptsPorTorre: number | null
  /** Texto libre a propósito: «varía» es una respuesta válida (R-05). */
  ocupacion: string
  caracterizacion: string
  fallecidosAtrapados: string
  rescatadasEnSitio: number | null
  rescatadasFuente: string
  visitadaPor: string
  visitadaEn: string
  observaciones: string
  /**
   * Id de la edificación principal cuando este reporte es un duplicado
   * (una torre de 36 apartamentos genera decenas de reportes — R-16).
   * La hoja ya excluye los duplicados de la pestaña `publico`; esto existe
   * para poder fusionar en pantalla antes de que el CSV se entere.
   */
  duplicadoDe: string
}

/** Una edificación que sí se puede dibujar en el mapa. */
export type EdificacionUbicada = Edificacion & { lat: number; lon: number }

export function estaUbicada(e: Edificacion): e is EdificacionUbicada {
  return e.lat !== null && e.lon !== null
}

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  ROJO: 'Colapsada',
  NARANJA: 'Por visitar',
  VERDE: 'Visitada',
}
