/**
 * Deja la hoja lista de una sola ejecución.
 *
 * Montar esto a mano son quince pasos, y uno de ellos —la fórmula de `publico`—
 * decide si los teléfonos de las familias salen o no a una página web. Eso no se
 * teclea a las once de la noche: se genera.
 *
 * Uso: pegar los archivos en Apps Script, elegir `instalar` y ejecutar. Se puede
 * correr las veces que haga falta; no borra nada ni pisa datos existentes.
 */

/** Columnas de la hoja maestra, en orden. Cambiar aquí cambia todo lo demás. */
var COLUMNAS_MAESTRA = [
  'id',
  'creado_en',
  'origen',
  'direccion_texto',
  'barrio',
  'comuna',
  'lat_reporte',
  'lon_reporte',
  'precision_reporte',
  'lat_visita',
  'lon_visita',
  'estado',
  'reclamada_por',
  'reclamada_en',
  'tipo_edificacion',
  'num_torres',
  'apts_por_torre',
  'ocupacion',
  'caracterizacion',
  'fallecidos_atrapados',
  'rescatadas_en_sitio',
  'rescatadas_fuente',
  'visitada_por',
  'visitada_en',
  'observaciones',
  'duplicado_de',
  'contacto_nombre',
  'contacto_telefono',
  'contacto_correo',
  'unidad_apto',
  'fotos',
  'uuid_envio',
]

/** Lo que NUNCA puede salir a la pestaña publicada. */
var COLUMNAS_PRIVADAS = [
  'contacto_nombre',
  'contacto_telefono',
  'contacto_correo',
  'unidad_apto',
  'fotos',
  'uuid_envio',
]

function instalar() {
  var libro = SpreadsheetApp.getActive()
  var hecho = []

  hecho.push(asegurarHoja(libro, HOJA_EDIFICACIONES, COLUMNAS_MAESTRA))
  hecho.push(
    asegurarHoja(libro, HOJA_LOG, [
      'recibido_en',
      'uuid',
      'tipo',
      'edificacion_id',
      'cuadrilla',
      'crudo',
      'aplicado',
    ]),
  )
  hecho.push(asegurarHoja(libro, HOJA_CUADRILLAS, ['codigo']))
  hecho.push(asegurarHoja(libro, HOJA_COORDINACION, ['codigo']))
  // CU-12: aquí caen los registros en autoservicio, con su contacto. Privada.
  hecho.push(
    asegurarHoja(libro, HOJA_REGISTROS, [
      'creado_en',
      'codigo',
      'nombre',
      'telefono',
      'correo',
      'entidad',
      'uuid',
    ]),
  )

  var publico = libro.getSheetByName('publico')
  if (!publico) publico = libro.insertSheet('publico')
  escribirVistaPublica(publico)
  hecho.push('publico: fórmula puesta')

  var resumen = hecho.join('\n')
  // En el editor sale en el registro; ejecutándolo desde el menú, en un cartel.
  Logger.log(resumen)
  return resumen
}

/** Crea la hoja si falta y le pone el encabezado si está vacía. */
function asegurarHoja(libro, nombre, encabezado) {
  var hoja = libro.getSheetByName(nombre)
  if (!hoja) {
    hoja = libro.insertSheet(nombre)
    hoja.appendRow(encabezado)
    return nombre + ': creada'
  }
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(encabezado)
    return nombre + ': encabezado puesto'
  }
  return nombre + ': ya existía, sin tocar'
}

/**
 * Escribe en `publico` el encabezado y una fórmula que copia solo las columnas
 * publicables y solo las filas que no son duplicado de otra.
 *
 * Se genera a partir de `COLUMNAS_MAESTRA` para que no haya que recalcular
 * letras a mano cuando la hoja cambie: ahí es donde se cuela un teléfono.
 */
function escribirVistaPublica(hoja) {
  var publicas = []
  for (var i = 0; i < COLUMNAS_MAESTRA.length; i++) {
    if (COLUMNAS_PRIVADAS.indexOf(COLUMNAS_MAESTRA[i]) === -1) {
      publicas.push({ nombre: COLUMNAS_MAESTRA[i], letra: letraDeColumna(i + 1) })
    }
  }

  hoja.getRange(1, 1, 1, publicas.length).setValues([
    publicas.map(function (c) {
      return c.nombre
    }),
  ])

  hoja.getRange(2, 1).setFormula(formulaVistaPublica(publicas))
}

/** La fórmula, aparte, para poder comprobarla sin una hoja de verdad. */
function formulaVistaPublica(publicas) {
  var columnas = publicas.map(function (c) {
    return HOJA_EDIFICACIONES + '!' + c.letra + '2:' + c.letra
  })
  var letraId = letraDeColumna(COLUMNAS_MAESTRA.indexOf('id') + 1)
  var letraDuplicado = letraDeColumna(COLUMNAS_MAESTRA.indexOf('duplicado_de') + 1)

  return (
    '=IFERROR(FILTER({' +
    columnas.join(',') +
    '}, ' +
    HOJA_EDIFICACIONES + '!' + letraId + '2:' + letraId + '<>"", ' +
    HOJA_EDIFICACIONES + '!' + letraDuplicado + '2:' + letraDuplicado + '=""), "")'
  )
}

/** 1 → A, 26 → Z, 27 → AA. */
function letraDeColumna(numero) {
  var letra = ''
  var n = numero
  while (n > 0) {
    var resto = (n - 1) % 26
    letra = String.fromCharCode(65 + resto) + letra
    n = Math.floor((n - 1) / 26)
  }
  return letra
}
