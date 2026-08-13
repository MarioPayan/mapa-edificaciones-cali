/**
 * Humo contra la operación real: la URL /exec de verdad, de punta a punta y
 * sin navegador. Registra una cuadrilla de prueba, crea un reporte de
 * residente, lo reclama con el código recién asignado, verifica que el CSV lo
 * refleja al momento sin exponer el contacto, y al final esconde la fila de
 * prueba de la vista pública (fusión con el código de coordinación K-01, el
 * que siembra `instalar`; si lo cambiaron, pasar el código como segundo
 * argumento).
 *
 * Queda en la hoja: la fila de prueba (fusionada, fuera de `publico`) y el
 * registro de la cuadrilla de prueba en `registros`. Se pueden borrar a mano.
 *
 * Uso: node pruebas/humo-produccion.mjs <URL /exec> [código de coordinación]
 */
const url = process.argv[2]
const coordinacion = process.argv[3] || 'K-01'
if (!url) {
  console.error('Uso: node pruebas/humo-produccion.mjs <URL /exec> [código de coordinación]')
  process.exit(1)
}

const resultados = []
const comprobar = (titulo, condicion, detalle = '') => {
  resultados.push(Boolean(condicion))
  console.log(`  ${condicion ? '✓' : '✗'} ${titulo}${detalle ? ` — ${detalle}` : ''}`)
}

const post = async (envio) => {
  const respuesta = await fetch(url, {
    method: 'POST',
    // text/plain a propósito: como el cliente real, sin preflight.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify(envio),
  })
  return respuesta.json()
}
const leerCSV = async () => (await fetch(url, { redirect: 'follow' })).text()
const uuid = () => `humo-${Date.now()}-${Math.random().toString(16).slice(2)}`
const ahora = () => new Date().toISOString()

console.log(`\nHumo contra ${url}\n`)

// 1. Lectura: el web app responde el CSV (y en una hoja virgen, se instala solo).
const antes = await leerCSV()
comprobar('GET responde el CSV con su encabezado', antes.split('\n')[0]?.includes('id,'))
comprobar('sin columnas de contacto', !antes.split('\n')[0]?.includes('contacto_'))

// 2. CU-12: registro de cuadrilla en autoservicio.
const registro = await post({
  uuid: uuid(),
  tipo: 'registrar',
  creadoEn: ahora(),
  datos: { nombre: 'Prueba Humo', telefono: '3000000000', correo: '', entidad: 'prueba' },
})
comprobar('registrar asigna un código', registro.ok && /^R-/.test(registro.codigo || ''),
  registro.codigo || registro.error)

// 3. CU-13: reporte de residente, sin código.
const idReporte = `V-HUMO-${Date.now().toString(36).toUpperCase()}`
const reporte = await post({
  uuid: uuid(),
  tipo: 'reportar',
  edificacionId: idReporte,
  cuadrilla: '',
  creadoEn: ahora(),
  datos: {
    nombre: 'Prueba Humo',
    telefono: '3000000000',
    correo: '',
    direccionTexto: 'Calle de prueba 1-23 (humo)',
    barrio: '',
    comuna: '',
    unidadApto: '',
    lat: 3.45,
    lon: -76.53,
  },
})
comprobar('reportar crea la edificación por visitar', reporte.ok === true, reporte.error || '')

// 4. El código recién asignado ya trabaja.
const reclamo = await post({
  uuid: uuid(),
  tipo: 'reclamar',
  edificacionId: idReporte,
  cuadrilla: registro.codigo,
  creadoEn: ahora(),
})
comprobar('el código recién asignado reclama el punto', reclamo.ok === true, reclamo.error || '')

// 5. La siguiente lectura ya lo trae todo, sin contacto.
const despues = await leerCSV()
comprobar('el CSV trae el punto nuevo al momento', despues.includes(idReporte))
comprobar('con el reclamo puesto',
  despues.split('\n').some((l) => l.includes(idReporte) && l.includes(registro.codigo || '')))
comprobar('y sin el teléfono del residente', !despues.includes('3000000000'))

// 6. Limpieza: la fila de prueba sale de la vista pública.
const limpieza = await post({
  uuid: uuid(),
  tipo: 'duplicar',
  edificacionId: idReporte,
  cuadrilla: coordinacion,
  creadoEn: ahora(),
  datos: { duplicadoDe: 'PRUEBA-HUMO' },
})
const final = await leerCSV()
comprobar('la fila de prueba queda escondida (limpieza)',
  limpieza.ok === true && !final.includes(idReporte), limpieza.error || '')

const pasaron = resultados.filter(Boolean).length
console.log(`\n${pasaron}/${resultados.length} comprobaciones pasaron`)
process.exit(pasaron === resultados.length ? 0 : 1)
