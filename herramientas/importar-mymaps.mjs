/**
 * Importa un mapa de Google My Maps (como el de la sala de crisis de SGRED)
 * a filas de la pestaña `edificaciones`, listas para pegar en la hoja.
 *
 * Uso:
 *   node herramientas/importar-mymaps.mjs <enlace de My Maps | archivo .kml o .kmz> [salida.csv]
 *
 * Con un enlace de My Maps descarga el KML él solo (forcekml=1). El CSV de
 * salida trae las 32 columnas de la maestra en orden: se pega debajo de la
 * última fila de `edificaciones`, sin el encabezado.
 *
 * Mapeo de estado — las categorías de esos mapas describen el daño reportado,
 * no una visita de evaluación, así que todo entra como pendiente salvo el
 * colapso confirmado:
 *   «Colapso …» (sin «riesgo»)  → ROJO  (colapsada)
 *   todo lo demás               → NARANJA (por visitar)
 * La categoría original y el TIPO DE DAÑO no se pierden: van en observaciones.
 *
 * My Maps guarda muchos puntos solo como dirección (la geocodifica al pintar,
 * y esa coordenada no viaja en el KML). Esas filas entran «sin ubicar»; después
 * de pegarlas, ejecutar `geocodificarSinUbicar` en el Apps Script de la hoja
 * las ubica con el mismo geocodificador que usa la ingesta del Form.
 *
 * Volver a importar el mismo mapa genera los mismos ids (M-0001…) en el mismo
 * orden, pero pegar dos veces duplica filas: este archivo se pega una vez.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { normalizarClave } from '../packages/data/src/csv.ts'
import { BARRIOS } from '../packages/data/src/barrios.ts'

// Espejo de COLUMNAS_MAESTRA en packages/apps-script/src/Instalar.gs.
const COLUMNAS = [
  'id', 'creado_en', 'origen', 'direccion_texto', 'barrio', 'comuna',
  'lat_reporte', 'lon_reporte', 'precision_reporte', 'lat_visita', 'lon_visita',
  'estado', 'reclamada_por', 'reclamada_en', 'tipo_edificacion', 'num_torres',
  'apts_por_torre', 'ocupacion', 'caracterizacion', 'fallecidos_atrapados',
  'rescatadas_en_sitio', 'rescatadas_fuente', 'visitada_por', 'visitada_en',
  'observaciones', 'duplicado_de', 'contacto_nombre', 'contacto_telefono',
  'contacto_correo', 'unidad_apto', 'fotos', 'uuid_envio',
]

// Caja de Cali, la misma de geocodificarEnCali (Ingesta.gs).
const CAJA = { latMin: 3.32, latMax: 3.55, lonMin: -76.62, lonMax: -76.44 }

const entrada = process.argv[2]
if (!entrada) {
  console.error('Uso: node herramientas/importar-mymaps.mjs <enlace de My Maps | archivo .kml o .kmz> [salida.csv]')
  process.exit(1)
}
const salida = process.argv[3] || 'importadas-mymaps.csv'

const kml = await leerKML(entrada)

async function leerKML(fuente) {
  if (/^https?:\/\//.test(fuente)) {
    const mid = new URL(fuente).searchParams.get('mid')
    if (!mid) {
      console.error('El enlace no trae mid=…; comparte el enlace del mapa de My Maps.')
      process.exit(1)
    }
    // Sin forcekml=1 a propósito: esa variante responde KML pero sin la
    // geometría de los puntos. El KMZ sí la trae.
    const respuesta = await fetch(`https://www.google.com/maps/d/kml?mid=${mid}`)
    if (!respuesta.ok) {
      console.error(`No se pudo descargar el mapa (HTTP ${respuesta.status}). ¿El mapa es público o compartido por enlace?`)
      process.exit(1)
    }
    const bytes = Buffer.from(await respuesta.arrayBuffer())
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const temporal = path.join(tmpdir(), `mymaps-${mid}.kmz`)
      writeFileSync(temporal, bytes)
      return desempacar(temporal)
    }
    return bytes.toString('utf8')
  }
  if (fuente.toLowerCase().endsWith('.kmz')) return desempacar(fuente)
  return readFileSync(fuente, 'utf8')
}

function desempacar(ruta) {
  return execFileSync('unzip', ['-p', ruta, '*.kml'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function desescapar(texto) {
  const cdata = texto.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/)
  const s = cdata ? cdata[1] : texto
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim()
}

function etiqueta(bloque, nombre) {
  const m = bloque.match(new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`))
  return m ? desescapar(m[1]) : ''
}

const nombreMapa = etiqueta(kml.match(/<Document>[\s\S]*?(?=<Style|<Folder|<Placemark)/)?.[0] ?? '', 'name')

// Catálogo de barrios indexado por clave normalizada, para recuperar la comuna.
const porBarrio = new Map(BARRIOS.map((b) => [normalizarClave(b.nombre), b]))

const filas = []
const fueraDeCali = []
const barriosSinCatalogo = new Map()
const porCategoria = new Map()

const bloques = kml.match(/<Placemark>[\s\S]*?<\/Placemark>/g) ?? []
for (const bloque of bloques) {
  const categoria = etiqueta(bloque, 'name')
  porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + 1)

  const coordenadas = etiqueta(bloque, 'coordinates').split(',')
  const lon = Number(coordenadas[0])
  const lat = Number(coordenadas[1])
  const ubicada = Number.isFinite(lat) && Number.isFinite(lon) && coordenadas.length >= 2

  // ExtendedData con claves normalizadas: «TIPO DE DAÑO» → tipo_de_dano.
  const datos = {}
  for (const dato of bloque.match(/<Data name="[^"]*">[\s\S]*?<\/Data>/g) ?? []) {
    const clave = normalizarClave(dato.match(/name="([^"]*)"/)[1])
    const valor = etiqueta(dato, 'value')
    if (clave && valor) datos[clave] = valor
  }

  const id = `M-${String(filas.length + 1).padStart(4, '0')}`
  const dano = datos.tipo_de_dano ?? ''
  const enCatalogo = porBarrio.get(normalizarClave(datos.barrio ?? ''))
  if (datos.barrio && !enCatalogo)
    barriosSinCatalogo.set(datos.barrio, (barriosSinCatalogo.get(datos.barrio) ?? 0) + 1)
  if (ubicada && (lat < CAJA.latMin || lat > CAJA.latMax || lon < CAJA.lonMin || lon > CAJA.lonMax))
    fueraDeCali.push(`${id} (${categoria})`)

  const observaciones = [
    `Importado de My Maps «${nombreMapa}», categoría: ${categoria}.`,
    dano && `TIPO DE DAÑO: ${dano}.`,
    ...Object.entries(datos)
      .filter(([k]) => !['barrio', 'tipo_de_dano', 'tipo_edificacion', 'direccion_base', 'direccion_larga'].includes(k))
      .map(([k, v]) => `${k}: ${v}.`),
  ].filter(Boolean).join(' ')

  filas.push({
    ...Object.fromEntries(COLUMNAS.map((c) => [c, ''])),
    id,
    creado_en: new Date().toISOString().slice(0, 10),
    origen: 'my_maps',
    direccion_texto: datos.direccion_base || etiqueta(bloque, 'address'),
    barrio: enCatalogo ? enCatalogo.nombre : (datos.barrio ?? ''),
    comuna: enCatalogo ? enCatalogo.comuna : '',
    lat_reporte: ubicada ? lat.toFixed(6) : '',
    lon_reporte: ubicada ? lon.toFixed(6) : '',
    precision_reporte: ubicada ? 'manual' : 'sin_ubicar',
    estado: /colapso/i.test(categoria) && !/ri.?e?sgo/i.test(categoria) ? 'ROJO' : 'NARANJA',
    tipo_edificacion: datos.tipo_edificacion ?? '',
    fallecidos_atrapados: /atrapad|fallecid/i.test(dano) ? 'Sí' : 'Desconocido',
    observaciones,
  })
}

function escapar(valor) {
  const s = String(valor ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const csv = [COLUMNAS.join(','), ...filas.map((f) => COLUMNAS.map((c) => escapar(f[c])).join(','))].join('\n')
writeFileSync(salida, csv + '\n')

const porEstado = new Map()
for (const f of filas) porEstado.set(f.estado, (porEstado.get(f.estado) ?? 0) + 1)

console.log(`Mapa: ${nombreMapa || '(sin nombre)'}`)
console.log(`${filas.length} edificaciones → ${salida}`)
for (const [estado, n] of porEstado) console.log(`  ${estado}: ${n}`)
console.log('Categorías del mapa:')
for (const [cat, n] of porCategoria) console.log(`  ${cat}: ${n}`)
if (barriosSinCatalogo.size > 0)
  console.log(`Barrios fuera del catálogo (quedan sin comuna): ${[...barriosSinCatalogo.entries()].map(([b, n]) => `${b} (${n})`).join(', ')}`)
const sinUbicar = filas.filter((f) => f.precision_reporte === 'sin_ubicar').length
if (sinUbicar > 0)
  console.log(`Sin coordenada en el KML, entran «sin ubicar»: ${sinUbicar}. Tras pegarlas, ejecutar geocodificarSinUbicar en el Apps Script de la hoja.`)
if (fueraDeCali.length > 0) console.log(`Fuera de la caja de Cali (revisar): ${fueraDeCali.join(', ')}`)
console.log('\nPara subirlo: abrir el CSV, copiar las filas SIN el encabezado y pegarlas debajo de la última fila de la pestaña `edificaciones`. Pegar dos veces duplica.')
