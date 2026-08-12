/**
 * CU-01: los reportes de residentes entran al sistema.
 *
 * El Form existente sigue cayendo en `reportes`. Esto normaliza cada respuesta
 * nueva hacia `edificaciones`: le pone id, estado NARANJA e intenta geocodificar
 * la dirección. Lo que no se pueda geocodificar NO se descarta: queda «sin
 * ubicar» para que coordinación lo ponga en el mapa a mano (CU-11).
 *
 * Instalación: Activadores → nuevo activador → `ingerirReportes`, «Al enviar el
 * formulario». Se puede ejecutar a mano cuantas veces se quiera: solo procesa
 * las filas que no tengan `id_edificacion`.
 */

var HOJA_REPORTES = 'reportes'
var COLUMNA_MARCA = 'id_edificacion'

function ingerirReportes() {
  var libro = SpreadsheetApp.getActive()
  var origen = libro.getSheetByName(HOJA_REPORTES)
  var destino = libro.getSheetByName(HOJA_EDIFICACIONES)
  if (!origen || !destino) return

  var candado = LockService.getScriptLock()
  if (!candado.tryLock(30000)) return

  try {
    var filas = origen.getDataRange().getValues()
    if (filas.length < 2) return

    var encabezadoOrigen = filas[0].map(normalizar)
    var columnaMarca = encabezadoOrigen.indexOf(COLUMNA_MARCA)
    if (columnaMarca === -1) {
      // Primera vez: se agrega la columna que marca lo ya procesado.
      columnaMarca = encabezadoOrigen.length
      origen.getRange(1, columnaMarca + 1).setValue(COLUMNA_MARCA)
      encabezadoOrigen.push(COLUMNA_MARCA)
    }

    var encabezadoDestino = destino.getDataRange().getValues()[0].map(normalizar)
    var consecutivo = destino.getLastRow() // la fila 1 es encabezado

    for (var i = 1; i < filas.length; i++) {
      if (String(filas[i][columnaMarca] || '').trim() !== '') continue

      var reporte = {}
      for (var c = 0; c < encabezadoOrigen.length; c++) reporte[encabezadoOrigen[c]] = filas[i][c]

      var normalizado = normalizarReporte(reporte, consecutivo, geocodificarEnCali)
      consecutivo++

      var filaDestino = encabezadoDestino.map(function (columna) {
        return normalizado[columna] !== undefined ? normalizado[columna] : ''
      })
      destino.appendRow(filaDestino)
      origen.getRange(i + 1, columnaMarca + 1).setValue(normalizado.id)
    }
  } finally {
    candado.releaseLock()
  }
}

/**
 * Geocodificación aproximada. Basta para saber a qué manzana ir: la ubicación
 * que vale la pone la cuadrilla en sitio (R-09).
 * Devuelve {lat, lon} o null.
 */
function geocodificarEnCali(direccion) {
  var respuesta = Maps.newGeocoder()
    .setRegion('co')
    // Caja de Cali: sin esto, «Calle 44» resuelve en cualquier ciudad del mundo.
    .setBounds(3.32, -76.62, 3.55, -76.44)
    .geocode(direccion)

  if (respuesta.status !== 'OK' || !respuesta.results || respuesta.results.length === 0) return null

  var punto = respuesta.results[0].geometry.location
  if (!coordenadaPlausible(punto.lat, punto.lng)) return null
  return { lat: punto.lat, lon: punto.lng }
}
