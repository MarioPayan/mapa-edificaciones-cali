/**
 * Reglas de escritura. Sin dependencias y sin tocar SpreadsheetApp: son
 * funciones puras sobre una fila ya leída, para poder probarlas en Node.
 *
 * Apps Script no tiene módulos: los archivos de un proyecto comparten ámbito
 * global, así que `Codigo.gs` ve estas funciones sin importar nada. El
 * `module.exports` del final solo existe para las pruebas — en Apps Script
 * `module` no está definido y la línea no hace nada.
 */

/** Horas que dura un reclamo antes de liberarse solo (documentado en el README). */
var HORAS_RECLAMO = 4

/** Tope de texto libre. Evita que un pegado accidental llene la hoja. */
var MAX_TEXTO = 4000

var TIPOS = ['reclamar', 'liberar', 'ubicar', 'caracterizar', 'colapsar', 'crear', 'duplicar']

/** Tipos reservados a coordinación: cambian el universo de puntos, no un dato de campo. */
var TIPOS_COORDINACION = ['crear', 'duplicar']

function texto(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor).trim().slice(0, MAX_TEXTO)
}

function numeroONulo(valor) {
  if (valor === null || valor === undefined || valor === '') return ''
  var n = Number(valor)
  return isFinite(n) ? n : ''
}

function reclamoVigente(fila, ahoraMs) {
  if (!fila['reclamada_por'] || !fila['reclamada_en']) return false
  var t = new Date(fila['reclamada_en']).getTime()
  if (isNaN(t)) return false
  return ahoraMs - t < HORAS_RECLAMO * 3600000
}

/** Fecha de captura en campo; si el teléfono manda basura, la del servidor. */
function fechaDeCampo(envio, ahoraMs) {
  var t = new Date(envio.creadoEn).getTime()
  return isNaN(t) ? new Date(ahoraMs).toISOString() : new Date(t).toISOString()
}

/** ¿La coordenada cae en Colombia? El (0,0) es el destino clásico de un GPS mal leído. */
function coordenadaPlausible(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false
  return lat >= -5 && lat <= 14 && lon >= -82 && lon <= -66
}

/**
 * Valida la forma del envío antes de tocar la hoja.
 * Listas vacías significan que no se está exigiendo ese código.
 */
function validarEnvio(envio, cuadrillasValidas, codigosCoordinacion) {
  if (!envio || typeof envio !== 'object') return 'envio_ilegible'
  if (TIPOS.indexOf(envio.tipo) === -1) return 'tipo_desconocido'
  if (!texto(envio.uuid)) return 'falta_uuid'
  if (!texto(envio.edificacionId)) return 'falta_edificacion'
  if (!texto(envio.cuadrilla)) return 'falta_cuadrilla'
  // Un código de coordinación vale como código de cuadrilla: obligar a
  // apuntarlo en las dos pestañas era una trampa para quien monta la hoja —
  // se apunta en `coordinacion` y todo se rechaza por «cuadrilla desconocida».
  var reconocidos = (cuadrillasValidas || []).concat(codigosCoordinacion || [])
  if (cuadrillasValidas && cuadrillasValidas.length > 0) {
    if (reconocidos.indexOf(texto(envio.cuadrilla)) === -1) return 'cuadrilla_no_reconocida'
  }

  // Crear y fusionar cambian el universo de puntos: exigen código de coordinación.
  // Si la hoja `coordinacion` no existe, no se permiten en absoluto — abrir eso
  // por omisión sería peor que no tener la función.
  if (TIPOS_COORDINACION.indexOf(envio.tipo) !== -1) {
    if (!codigosCoordinacion || codigosCoordinacion.length === 0) return 'coordinacion_no_configurada'
    if (codigosCoordinacion.indexOf(texto(envio.cuadrilla)) === -1) return 'requiere_coordinacion'
  }

  var d = envio.datos || {}
  if (envio.tipo === 'ubicar' || envio.tipo === 'crear') {
    if (typeof d.lat !== 'number' || typeof d.lon !== 'number') return 'coordenada_invalida'
    if (!coordenadaPlausible(d.lat, d.lon)) return 'coordenada_fuera_de_rango'
  }
  if (envio.tipo === 'crear' && !texto(d.direccionTexto)) return 'falta_direccion'
  if (envio.tipo === 'duplicar') {
    if (!texto(d.duplicadoDe)) return 'falta_principal'
    if (texto(d.duplicadoDe) === texto(envio.edificacionId)) return 'duplicado_de_si_misma'
  }
  return ''
}

/**
 * Decide qué columnas cambian. No escribe: devuelve la intención.
 * Devuelve { ok: true, cambios: {...} } o { ok: false, error: '<motivo>' }.
 */
function decidir(envio, fila, ahoraMs) {
  var ahoraISO = new Date(ahoraMs).toISOString()
  var enCampo = fechaDeCampo(envio, ahoraMs)
  var datos = envio.datos || {}

  switch (envio.tipo) {
    case 'reclamar':
      if (fila['estado'] === 'VERDE') return { ok: false, error: 'ya_visitada' }
      if (reclamoVigente(fila, ahoraMs) && fila['reclamada_por'] !== envio.cuadrilla) {
        return { ok: false, error: 'reclamada_por_' + fila['reclamada_por'] }
      }
      // El reclamo cuenta desde que llega, no desde que se encoló: un reclamo
      // hecho sin señal hace tres horas no debe bloquear el punto cuatro más.
      return { ok: true, cambios: { reclamada_por: envio.cuadrilla, reclamada_en: ahoraISO } }

    case 'liberar':
      if (fila['reclamada_por'] && fila['reclamada_por'] !== envio.cuadrilla) {
        return { ok: false, error: 'reclamada_por_otra' }
      }
      return { ok: true, cambios: { reclamada_por: '', reclamada_en: '' } }

    case 'ubicar': {
      var cambiosUbicar = {
        lat_visita: datos.lat,
        lon_visita: datos.lon,
        precision_reporte: datos.manual ? 'manual' : 'visita',
      }
      if (texto(datos.referencia)) {
        cambiosUbicar.observaciones = texto(
          (fila['observaciones'] ? fila['observaciones'] + ' ' : '') + datos.referencia,
        )
      }
      return { ok: true, cambios: cambiosUbicar }
    }

    case 'duplicar':
      // Fusionar es reversible (se borra la celda); perder un reporte no. Por eso
      // el duplicado conserva todos sus datos y solo sale de `publico`.
      return { ok: true, cambios: { duplicado_de: texto(datos.duplicadoDe) } }

    case 'crear':
      return {
        ok: true,
        cambios: {
          direccion_texto: texto(datos.direccionTexto),
          barrio: texto(datos.barrio),
          comuna: texto(datos.comuna),
          lat_reporte: datos.lat,
          lon_reporte: datos.lon,
          precision_reporte: 'manual',
          estado: datos.estado === 'ROJO' || datos.estado === 'VERDE' ? datos.estado : 'NARANJA',
          origen: 'coordinacion',
          creado_en: ahoraISO,
        },
      }

    case 'caracterizar':
      return {
        ok: true,
        cambios: {
          estado: 'VERDE',
          visitada_por: envio.cuadrilla,
          visitada_en: enCampo,
          reclamada_por: '',
          reclamada_en: '',
          caracterizacion: texto(datos.caracterizacion),
          tipo_edificacion: texto(datos.tipoEdificacion),
          num_torres: numeroONulo(datos.numTorres),
          apts_por_torre: numeroONulo(datos.aptsPorTorre),
          ocupacion: texto(datos.ocupacion),
          fallecidos_atrapados: texto(datos.fallecidosAtrapados),
          observaciones: texto(datos.observaciones),
        },
      }

    case 'colapsar':
      return {
        ok: true,
        cambios: {
          estado: 'ROJO',
          visitada_por: envio.cuadrilla,
          visitada_en: enCampo,
          rescatadas_en_sitio: numeroONulo(datos.rescatadasEnSitio),
          rescatadas_fuente: texto(datos.rescatadasFuente),
          fallecidos_atrapados: texto(datos.fallecidosAtrapados),
        },
      }

    default:
      return { ok: false, error: 'tipo_desconocido' }
  }
}

/**
 * Normaliza una fila del Form de residentes hacia `edificaciones` (CU-01).
 * `geocodificar` recibe la dirección y devuelve {lat, lon} o null; se inyecta
 * para poder probar la normalización sin llamar a Google.
 */
function normalizarReporte(reporte, consecutivo, geocodificar) {
  var direccion = texto(reporte['direccion_texto'] || reporte['direccion'] || '')
  var comuna = texto(reporte['comuna'])
  var n = Number(comuna)
  if (n >= 1 && n <= 22) comuna = n < 10 ? '0' + n : String(n)

  var punto = null
  if (direccion && typeof geocodificar === 'function') {
    try {
      punto = geocodificar(direccion + ', Cali, Colombia')
    } catch (error) {
      punto = null
    }
  }

  return {
    id: 'E-' + String(consecutivo).padStart(4, '0'),
    creado_en: texto(reporte['marca_temporal'] || reporte['creado_en']) || new Date().toISOString(),
    origen: 'form_residente',
    direccion_texto: direccion,
    barrio: texto(reporte['barrio']),
    comuna: comuna,
    lat_reporte: punto ? punto.lat : '',
    lon_reporte: punto ? punto.lon : '',
    // Sin coordenada la fila no se pierde: entra a la lista de «sin ubicar»
    // que coordinación resuelve tocando el mapa (CU-11).
    precision_reporte: punto ? 'geocodificada' : 'sin_ubicar',
    estado: 'NARANJA',
    caracterizacion: texto(reporte['falla_observada'] || reporte['descripcion']),
    contacto_nombre: texto(reporte['contacto_nombre'] || reporte['nombre']),
    contacto_telefono: texto(reporte['contacto_telefono'] || reporte['telefono']),
    contacto_correo: texto(reporte['contacto_correo'] || reporte['correo']),
    unidad_apto: texto(reporte['unidad_apto'] || reporte['apartamento']),
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    HORAS_RECLAMO,
    validarEnvio,
    decidir,
    reclamoVigente,
    fechaDeCampo,
    normalizarReporte,
    coordenadaPlausible,
  }
}
