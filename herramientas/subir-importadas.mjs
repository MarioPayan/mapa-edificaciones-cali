/**
 * Sube a la operación real las filas de una importación (el CSV que produce
 * `importar-mymaps.mjs`), una a una por el `doPost` de verdad: mismo camino,
 * misma validación y misma bitácora que cualquier envío de campo.
 *
 * Idempotente dos veces: el uuid es fijo por fila (`import-<id>`) y el id de
 * edificación ya existente responde `ya_existe` — volver a correrlo no duplica.
 *
 * Uso: node herramientas/subir-importadas.mjs <importadas.csv> <URL /exec> <código coordinación>
 */
import { readFileSync } from 'node:fs'
import { filasComoObjetos } from '../packages/data/src/csv.ts'

const [archivo, url, codigo] = process.argv.slice(2)
if (!archivo || !url || !codigo) {
  console.error('Uso: node herramientas/subir-importadas.mjs <importadas.csv> <URL /exec> <código coordinación>')
  process.exit(1)
}

const filas = filasComoObjetos(readFileSync(archivo, 'utf8'))
let subidas = 0
let yaExistian = 0
const errores = []

for (const fila of filas) {
  const conGPS = fila['lat_reporte'] !== '' && fila['lon_reporte'] !== ''
  const envio = {
    uuid: `import-${fila['id']}`,
    tipo: 'crear',
    edificacionId: fila['id'],
    cuadrilla: codigo,
    creadoEn: fila['creado_en'] || new Date().toISOString(),
    datos: {
      direccionTexto: fila['direccion_texto'],
      barrio: fila['barrio'],
      comuna: fila['comuna'],
      ...(conGPS ? { lat: Number(fila['lat_reporte']), lon: Number(fila['lon_reporte']) } : {}),
      estado: fila['estado'],
      origen: fila['origen'] || 'my_maps',
      creadoEn: fila['creado_en'],
      tipoEdificacion: fila['tipo_edificacion'],
      fallecidosAtrapados: fila['fallecidos_atrapados'],
      observaciones: fila['observaciones'],
    },
  }

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify(envio),
  })
  const cuerpo = await respuesta.json().catch(() => ({ ok: false, error: 'respuesta_ilegible' }))

  if (cuerpo.ok) subidas++
  else if (cuerpo.error === 'ya_existe') yaExistian++
  else errores.push(`${fila['id']}: ${cuerpo.error}`)

  // Sin afán: Apps Script serializa con candado y tiene cuotas.
  await new Promise((r) => setTimeout(r, 250))
}

console.log(`${subidas} subidas, ${yaExistian} ya existían, ${errores.length} errores de ${filas.length} filas`)
if (errores.length > 0) {
  console.log(errores.slice(0, 10).join('\n'))
  process.exit(1)
}
