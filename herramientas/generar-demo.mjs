/**
 * Genera los datos de ejemplo (`packages/app/public/demo/edificaciones.csv`)
 * repartidos por toda la ciudad, usando el catálogo real de barrios.
 *
 * Las direcciones son inventadas y llevan «(ejemplo)»; las coordenadas salen
 * del punto representativo de cada barrio con un desplazamiento pequeño, para
 * que el mapa se parezca a una operación de verdad sin señalar inmuebles reales.
 *
 * Uso: node herramientas/generar-demo.mjs
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { BARRIOS } from '../packages/data/src/barrios.ts'

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DESTINO = path.join(RAIZ, 'packages/app/public/demo/edificaciones.csv')

/** Generador determinista: el mismo archivo en cada ejecución. */
function aleatorio(semilla) {
  let s = semilla
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}
const rnd = aleatorio(20260812)

const COLUMNAS = [
  'id', 'creado_en', 'origen', 'direccion_texto', 'barrio', 'comuna',
  'lat_reporte', 'lon_reporte', 'precision_reporte', 'lat_visita', 'lon_visita',
  'estado', 'reclamada_por', 'reclamada_en', 'tipo_edificacion', 'num_torres',
  'apts_por_torre', 'ocupacion', 'caracterizacion', 'fallecidos_atrapados',
  'rescatadas_en_sitio', 'rescatadas_fuente', 'visitada_por', 'visitada_en',
  'observaciones', 'duplicado_de',
]

const TIPOS = ['casa', 'edificio', 'conjunto de torres', 'vivienda unifamiliar']
const CARACTERIZACIONES = [
  'Fisuras en las juntas de dilatación entre bloques, con desprendimiento localizado de acabados.',
  'Grietas diagonales en los muros de la caja de escaleras, principalmente en esquinas.',
  'Desprendimiento de piezas de mampostería de ladrillo en fachada, con exposición de material interno.',
  'Fisuras finas en muros divisorios y en el encuentro muro-cielo del último piso.',
  'Grietas horizontales en muros contiguos a las juntas, repetidas en varios niveles.',
]
const COLAPSOS = [
  'Colapso estructural parcial: losa de entrepiso caída y columnas con fisuras pasantes.',
  'Colapso total de la edificación. Estructura no recuperable.',
  'Riesgo alto de colapso: desplome del muro de carga en el costado posterior.',
]
const OCUPACIONES = ['varía', 'evacuado', '2 pisos ocupados', '4 personas', 'sin dato']
const CUADRILLAS = ['C-01', 'C-03', 'C-07', 'C-11']

const elegir = (lista) => lista[Math.floor(rnd() * lista.length)]
const jitter = () => (rnd() - 0.5) * 0.004

function escapar(valor) {
  const s = String(valor ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Un barrio de cada comuna, y luego se rellena hasta llegar al total.
const conComuna = BARRIOS.filter((b) => b.comuna)
const porComuna = new Map()
for (const b of conComuna) {
  const lista = porComuna.get(b.comuna) ?? []
  lista.push(b)
  porComuna.set(b.comuna, lista)
}

const elegidos = []
for (const [, lista] of [...porComuna.entries()].sort()) {
  elegidos.push(lista[Math.floor(rnd() * lista.length)])
  if (lista.length > 6) elegidos.push(lista[Math.floor(rnd() * lista.length)])
}

const filas = []
let n = 0

for (const barrio of elegidos) {
  n++
  const id = `D-${String(n).padStart(4, '0')}`
  const suerte = rnd()
  const estado = suerte < 0.16 ? 'ROJO' : suerte < 0.68 ? 'NARANJA' : 'VERDE'
  const tipo = elegir(TIPOS)
  const esConjunto = tipo === 'conjunto de torres'
  const lat = +(barrio.lat + jitter()).toFixed(5)
  const lon = +(barrio.lon + jitter()).toFixed(5)
  const visitada = estado !== 'NARANJA'
  const cuadrilla = elegir(CUADRILLAS)
  const reclamada = estado === 'NARANJA' && rnd() < 0.18

  filas.push({
    id,
    creado_en: `2026-08-${String(9 + Math.floor(rnd() * 4)).padStart(2, '0')}`,
    origen: rnd() < 0.75 ? 'form_residente' : 'cruz_roja',
    direccion_texto: `Calle ${10 + Math.floor(rnd() * 90)} ${1 + Math.floor(rnd() * 60)}-${10 + Math.floor(rnd() * 80)} (ejemplo)`,
    barrio: barrio.nombre,
    comuna: barrio.comuna,
    lat_reporte: lat,
    lon_reporte: lon,
    precision_reporte: 'geocodificada',
    lat_visita: visitada ? lat : '',
    lon_visita: visitada ? lon : '',
    estado,
    reclamada_por: reclamada ? cuadrilla : '',
    // Reclamo reciente para que se vea vigente al abrir la demostración.
    reclamada_en: reclamada ? new Date(Date.now() - 45 * 60000).toISOString() : '',
    tipo_edificacion: tipo,
    num_torres: esConjunto ? 2 + Math.floor(rnd() * 5) : '',
    apts_por_torre: esConjunto ? 8 + Math.floor(rnd() * 30) : '',
    ocupacion: elegir(OCUPACIONES),
    caracterizacion: estado === 'ROJO' ? elegir(COLAPSOS) : visitada ? elegir(CARACTERIZACIONES) : '',
    fallecidos_atrapados: estado === 'ROJO' ? (rnd() < 0.5 ? 'Sí' : 'Desconocido') : 'No',
    rescatadas_en_sitio: estado === 'ROJO' && rnd() < 0.6 ? 1 + Math.floor(rnd() * 20) : '',
    rescatadas_fuente: estado === 'ROJO' && rnd() < 0.6 ? `cuadrilla ${cuadrilla} en sitio` : '',
    visitada_por: visitada ? cuadrilla : '',
    visitada_en: visitada ? '2026-08-11 14:20' : '',
    observaciones: '',
    duplicado_de: '',
  })
}

// Dos reportes sin geocodificar: alimentan el modo coordinación (CU-11).
for (const barrio of [elegidos[3], elegidos[12]]) {
  n++
  filas.push({
    ...Object.fromEntries(COLUMNAS.map((c) => [c, ''])),
    id: `D-${String(n).padStart(4, '0')}`,
    creado_en: '2026-08-12',
    origen: 'form_residente',
    direccion_texto: `Calle ${20 + Math.floor(rnd() * 60)} con Carrera ${1 + Math.floor(rnd() * 40)} (ejemplo)`,
    barrio: barrio.nombre,
    comuna: barrio.comuna,
    precision_reporte: 'sin_ubicar',
    estado: 'NARANJA',
    fallecidos_atrapados: 'Desconocido',
    observaciones: 'Dirección incompleta: hay que ubicarla en campo.',
  })
}

// Un segundo reporte de la misma edificación: candidato a fusionar (CU-11).
const principal = filas[0]
n++
filas.push({
  ...principal,
  id: `D-${String(n).padStart(4, '0')}`,
  direccion_texto: `${principal.direccion_texto.replace(' (ejemplo)', '')} apto 302 (ejemplo)`,
  estado: 'NARANJA',
  lat_visita: '',
  lon_visita: '',
  visitada_por: '',
  visitada_en: '',
  caracterizacion: '',
  reclamada_por: '',
  reclamada_en: '',
  observaciones: 'Segundo reporte de la misma edificación: candidato a fusionar.',
})

const csv = [
  COLUMNAS.join(','),
  ...filas.map((f) => COLUMNAS.map((c) => escapar(f[c])).join(',')),
].join('\n')

writeFileSync(DESTINO, csv + '\n')
console.log(`${filas.length} edificaciones en ${new Set(filas.map((f) => f.barrio)).size} barrios de ${new Set(filas.map((f) => f.comuna)).size} comunas`)
console.log(DESTINO)
