/**
 * Único punto de escritura de la operación (documentado en el README).
 *
 * Recibe un envío desde el mapa, lo anexa crudo a `log` y solo después toca
 * `edificaciones`. Si la lógica falla algún día, el `log` permite reconstruir:
 * nunca se pierde lo que mandó una cuadrilla.
 *
 * Las reglas viven en `logica.js`, que en Apps Script comparte ámbito global.
 */

var HOJA_EDIFICACIONES = 'edificaciones'
var HOJA_LOG = 'log'
var HOJA_CUADRILLAS = 'cuadrillas'
var HOJA_COORDINACION = 'coordinacion'
var HOJA_REGISTROS = 'registros'

/**
 * Lectura: el mismo web app sirve la vista pública como CSV. Reemplaza el
 * «Publicar en la web» de la hoja: no hay pestaña que elegir mal, no hay
 * minutos de retraso — lo que responde sale de `edificaciones` al momento,
 * con las mismas exclusiones que la fórmula de `publico` (contacto, fotos,
 * duplicados). Una sola URL para leer (GET) y escribir (POST).
 */
function doGet(e) {
  var libro = SpreadsheetApp.getActive()
  // Primer toque sobre una hoja virgen: se instala sola. La puesta en marcha
  // queda en subir el código y abrir esta URL una vez.
  if (!libro.getSheetByName(HOJA_EDIFICACIONES)) instalar()

  // Acción administrativa: geocodificar lo «sin ubicar» que trae dirección
  // (p. ej. tras una importación). Exige un código de coordinación, como todo
  // lo que cambia el universo de puntos.
  var parametros = (e && e.parameter) || {}
  if (parametros.accion === 'geocodificar') {
    var codigos = codigosDe(libro, HOJA_COORDINACION)
    if (codigos.length === 0 || codigos.indexOf(String(parametros.codigo || '').trim()) === -1) {
      return ContentService.createTextOutput('requiere_coordinacion').setMimeType(
        ContentService.MimeType.TEXT,
      )
    }
    var hechas = geocodificarSinUbicar()
    return ContentService.createTextOutput('geocodificadas: ' + hechas).setMimeType(
      ContentService.MimeType.TEXT,
    )
  }

  return ContentService.createTextOutput(csvPublico(libro)).setMimeType(ContentService.MimeType.CSV)
}

function csvPublico(libro) {
  var valores = libro.getSheetByName(HOJA_EDIFICACIONES).getDataRange().getValues()
  var encabezado = valores[0].map(normalizar)
  var publicas = []
  for (var c = 0; c < encabezado.length; c++) {
    if (COLUMNAS_PRIVADAS.indexOf(encabezado[c]) === -1) publicas.push(c)
  }
  var columnaId = encabezado.indexOf('id')
  var columnaDuplicado = encabezado.indexOf('duplicado_de')

  var lineas = []
  for (var f = 0; f < valores.length; f++) {
    if (f > 0) {
      if (columnaId !== -1 && String(valores[f][columnaId]).trim() === '') continue
      if (columnaDuplicado !== -1 && String(valores[f][columnaDuplicado]).trim() !== '') continue
    }
    var campos = []
    for (var p = 0; p < publicas.length; p++) campos.push(escaparCSV(valores[f][publicas[p]]))
    lineas.push(campos.join(','))
  }
  return lineas.join('\n')
}

function escaparCSV(valor) {
  if (valor === null || valor === undefined) return ''
  // La hoja convierte los ISO escritos en celdas de fecha; de vuelta salen
  // como Date y su String() no es parseable en todos lados.
  var s = valor instanceof Date ? valor.toISOString() : String(valor)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function doPost(e) {
  try {
    // Cuerpo en text/plain a propósito: un JSON con Content-Type application/json
    // dispara preflight OPTIONS, y un web app de Apps Script no responde OPTIONS.
    var envio = JSON.parse((e && e.postData && e.postData.contents) || '{}')
    return responder(procesar(envio))
  } catch (error) {
    return responder({ ok: false, error: 'error_interno', detalle: String(error) })
  }
}

function procesar(envio) {
  var libro = SpreadsheetApp.getActive()
  // Se registra todo lo que llega, incluso lo que se va a rechazar: el `log` es
  // la red de seguridad y no depende de que la lógica acierte.
  var filaLog = registrarEnLog(libro, envio)

  // El registro de cuadrilla (CU-12) no toca `edificaciones` y se atiende antes
  // de exigir código: quien se registra todavía no tiene uno.
  if (envio && envio.tipo === 'registrar') return procesarRegistro(libro, envio, filaLog)

  var problema = validarEnvio(
    envio,
    codigosDe(libro, HOJA_CUADRILLAS),
    codigosDe(libro, HOJA_COORDINACION),
  )
  if (problema) return { ok: false, error: problema }

  // Un solo escritor a la vez: dos cuadrillas pueden reclamar el mismo punto
  // en el mismo segundo y la segunda debe ver el reclamo de la primera.
  var candado = LockService.getScriptLock()
  if (!candado.tryLock(15000)) return { ok: false, error: 'ocupado_reintente' }

  try {
    // Se pregunta por lo APLICADO, no por lo recibido. Dos reintentos del mismo
    // uuid que llegan a la vez se registran los dos antes de que ninguno tome el
    // candado: contando recibidos, ambos se creerían repetidos y el cambio no se
    // escribiría nunca — y la cuadrilla ya lo habría dado por enviado.
    if (uuidYaAplicado(libro, envio.uuid)) {
      return { ok: true, repetido: true }
    }

    var hoja = libro.getSheetByName(HOJA_EDIFICACIONES)
    if (!hoja) return { ok: false, error: 'falta_hoja_edificaciones' }

    var valores = hoja.getDataRange().getValues()
    var encabezado = valores[0].map(normalizar)
    var columnaId = encabezado.indexOf('id')
    if (columnaId === -1) return { ok: false, error: 'falta_columna_id' }

    var numeroFila = -1
    for (var i = 1; i < valores.length; i++) {
      if (String(valores[i][columnaId]).trim() === String(envio.edificacionId).trim()) {
        numeroFila = i
        break
      }
    }

    if (envio.tipo === 'crear' || envio.tipo === 'reportar') {
      if (numeroFila !== -1) return { ok: false, error: 'ya_existe' }
      // Fila nueva solo con el id; los demás datos los pone `decidir`.
      var filaNueva = new Array(encabezado.length).fill('')
      filaNueva[columnaId] = String(envio.edificacionId).trim()
      hoja.appendRow(filaNueva)
      numeroFila = valores.length
      valores.push(filaNueva)
    } else if (numeroFila === -1) {
      return { ok: false, error: 'edificacion_desconocida' }
    }

    var fila = {}
    for (var c = 0; c < encabezado.length; c++) fila[encabezado[c]] = valores[numeroFila][c]

    var decision = decidir(envio, fila, Date.now())
    if (!decision.ok) return decision

    escribirCambios(hoja, encabezado, numeroFila, decision.cambios, envio.uuid)
    marcarAplicado(libro, filaLog)
    return { ok: true, edificacionId: envio.edificacionId, cambios: decision.cambios }
  } finally {
    candado.releaseLock()
  }
}

/**
 * CU-12: asigna un código de cuadrilla en autoservicio. El contacto queda en
 * `registros` (pestaña privada: nunca entra a la fórmula de `publico`) y el
 * código entra a `cuadrillas` al instante — como cuadrilla, nunca como
 * coordinación. Sigue siendo atribución, no seguridad: lo que cambia es que
 * nadie tiene que esperar a que le repartan un código (R-12).
 */
function procesarRegistro(libro, envio, filaLog) {
  var problema = validarRegistro(envio)
  if (problema) return { ok: false, error: problema }

  var candado = LockService.getScriptLock()
  if (!candado.tryLock(15000)) return { ok: false, error: 'ocupado_reintente' }

  try {
    var hoja = libro.getSheetByName(HOJA_REGISTROS)
    if (!hoja) {
      hoja = libro.insertSheet(HOJA_REGISTROS)
      hoja.appendRow(['creado_en', 'codigo', 'nombre', 'telefono', 'correo', 'entidad', 'uuid'])
    }

    // El reintento de un registro devuelve el MISMO código: dos códigos para la
    // misma persona partirían su atribución en dos.
    var filas = hoja.getDataRange().getValues()
    for (var i = 1; i < filas.length; i++) {
      if (String(filas[i][6]) === String(envio.uuid)) {
        return { ok: true, codigo: String(filas[i][1]), repetido: true }
      }
    }

    var d = envio.datos || {}
    var codigo = codigoDeRegistro(filas.length)
    hoja.appendRow([
      new Date().toISOString(),
      codigo,
      texto(d.nombre),
      texto(d.telefono),
      texto(d.correo),
      texto(d.entidad),
      texto(envio.uuid),
    ])

    var cuadrillas = libro.getSheetByName(HOJA_CUADRILLAS)
    if (cuadrillas) cuadrillas.appendRow([codigo])

    marcarAplicado(libro, filaLog)
    return { ok: true, codigo: codigo }
  } finally {
    candado.releaseLock()
  }
}

function escribirCambios(hoja, encabezado, numeroFila, cambios, uuid) {
  var conUuid = cambios
  conUuid['uuid_envio'] = uuid
  for (var columna in conUuid) {
    var indice = encabezado.indexOf(columna)
    // Una columna que la hoja no tiene se ignora: la hoja la edita gente y
    // puede ir por detrás del cliente. Nunca se crean columnas al vuelo.
    if (indice !== -1) {
      hoja.getRange(numeroFila + 1, indice + 1).setValue(conUuid[columna])
    }
  }
}

/** Columna del `log` donde se marca que el envío llegó a escribirse. */
var COLUMNA_APLICADO = 7

/** Todo lo que llega, tal como llega, antes de cualquier decisión. */
function registrarEnLog(libro, envio) {
  var hoja = libro.getSheetByName(HOJA_LOG)
  if (!hoja) {
    hoja = libro.insertSheet(HOJA_LOG)
    hoja.appendRow([
      'recibido_en',
      'uuid',
      'tipo',
      'edificacion_id',
      'cuadrilla',
      'crudo',
      'aplicado',
    ])
  }
  hoja.appendRow([
    new Date().toISOString(),
    String((envio && envio.uuid) || ''),
    String((envio && envio.tipo) || ''),
    String((envio && envio.edificacionId) || ''),
    String((envio && envio.cuadrilla) || ''),
    JSON.stringify(envio).slice(0, 40000),
    '',
  ])
  return hoja.getLastRow()
}

/** Deja constancia de que este envío sí modificó la hoja. */
function marcarAplicado(libro, filaLog) {
  var hoja = libro.getSheetByName(HOJA_LOG)
  if (hoja && filaLog) hoja.getRange(filaLog, COLUMNA_APLICADO).setValue('si')
}

/**
 * ¿Este uuid ya se ESCRIBIÓ? Se pregunta al `log`, no a `edificaciones`: la fila
 * solo guarda el último uuid y varios envíos tocan la misma fila.
 */
function uuidYaAplicado(libro, uuid) {
  var hoja = libro.getSheetByName(HOJA_LOG)
  if (!hoja) return false
  var filas = hoja.getDataRange().getValues()
  for (var i = 1; i < filas.length; i++) {
    if (
      String(filas[i][1]) === String(uuid) &&
      String(filas[i][COLUMNA_APLICADO - 1]).toLowerCase() === 'si'
    ) {
      return true
    }
  }
  return false
}

/**
 * Códigos listados en la columna A de una pestaña.
 * Sin pestaña `cuadrillas` no se exige código de cuadrilla; sin pestaña
 * `coordinacion` no se permite ninguna acción de coordinación.
 */
function codigosDe(libro, nombreHoja) {
  var hoja = libro.getSheetByName(nombreHoja)
  if (!hoja) return []
  return hoja
    .getRange(1, 1, Math.max(hoja.getLastRow(), 1), 1)
    .getValues()
    .map(function (f) {
      return String(f[0]).trim()
    })
    .filter(function (v) {
      return v && v.toLowerCase() !== 'codigo'
    })
}

function normalizar(encabezado) {
  return String(encabezado)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function responder(cuerpo) {
  return ContentService.createTextOutput(JSON.stringify(cuerpo)).setMimeType(
    ContentService.MimeType.JSON,
  )
}
