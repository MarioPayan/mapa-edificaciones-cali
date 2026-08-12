/**
 * Un Google Apps Script de mentira, suficiente para correr `Codigo.gs` e
 * `Ingesta.gs` de verdad dentro de Node.
 *
 * Por qué existe: la mitad del sistema que vive en Google no se podía ejecutar
 * sin una cuenta, así que era código leído y no código probado. Ahí aparecieron
 * los dos fallos más caros del proyecto. Este simulacro no reemplaza una prueba
 * en Google —no imita cuotas, ni el redirect 302 del web app, ni permisos— pero
 * sí ejecuta toda la lógica del servidor contra una hoja que se comporta como
 * una hoja: filas, columnas, rangos y una bitácora que crece.
 *
 * Solo implementa la superficie que los scripts usan de verdad.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FUENTE = join(AQUI, '..', 'src')

/** Una hoja: matriz de celdas que crece sola, como la de Google. */
class HojaFalsa {
  constructor(nombre, filas = []) {
    this.nombre = nombre
    this.filas = filas.map((f) => [...f])
  }

  getName() {
    return this.nombre
  }

  getLastRow() {
    return this.filas.length
  }

  getLastColumn() {
    return this.filas.reduce((max, f) => Math.max(max, f.length), 0)
  }

  appendRow(valores) {
    this.filas.push([...valores])
  }

  getDataRange() {
    const ancho = this.getLastColumn()
    const valores = this.filas.map((f) => {
      const fila = [...f]
      while (fila.length < ancho) fila.push('')
      return fila
    })
    return { getValues: () => valores }
  }

  /** getRange(fila, columna[, nFilas, nColumnas]) — 1-indexado, como Google. */
  getRange(fila, columna, nFilas = 1, nColumnas = 1) {
    const hoja = this
    return {
      setValue(valor) {
        hoja.#asegurar(fila, columna)
        hoja.filas[fila - 1][columna - 1] = valor
      },
      setFormula(formula) {
        hoja.#asegurar(fila, columna)
        hoja.filas[fila - 1][columna - 1] = formula
      },
      setValues(matriz) {
        matriz.forEach((f, i) =>
          f.forEach((valor, c) => {
            hoja.#asegurar(fila + i, columna + c)
            hoja.filas[fila + i - 1][columna + c - 1] = valor
          }),
        )
      },
      getValues() {
        const salida = []
        for (let f = 0; f < nFilas; f++) {
          const origen = hoja.filas[fila - 1 + f] ?? []
          const destino = []
          for (let c = 0; c < nColumnas; c++) destino.push(origen[columna - 1 + c] ?? '')
          salida.push(destino)
        }
        return salida
      },
    }
  }

  #asegurar(fila, columna) {
    while (this.filas.length < fila) this.filas.push([])
    const f = this.filas[fila - 1]
    while (f.length < columna) f.push('')
  }
}

class LibroFalso {
  constructor(hojas = {}) {
    this.hojas = new Map()
    for (const [nombre, filas] of Object.entries(hojas)) {
      this.hojas.set(nombre, new HojaFalsa(nombre, filas))
    }
  }

  getSheetByName(nombre) {
    return this.hojas.get(nombre) ?? null
  }

  insertSheet(nombre) {
    const hoja = new HojaFalsa(nombre)
    this.hojas.set(nombre, hoja)
    return hoja
  }

  /** Ayuda para las pruebas: la hoja como lista de objetos por encabezado. */
  comoObjetos(nombre) {
    const hoja = this.getSheetByName(nombre)
    if (!hoja) return []
    const [encabezado = [], ...resto] = hoja.getDataRange().getValues()
    return resto.map((fila) => {
      const obj = {}
      encabezado.forEach((clave, i) => {
        if (clave) obj[String(clave)] = fila[i]
      })
      return obj
    })
  }
}

/**
 * Crea el entorno y evalúa los scripts dentro, como hace Apps Script: todos los
 * archivos comparten un único ámbito global.
 *
 * @param {object} opciones
 * @param {object} opciones.hojas       contenido inicial, { nombre: filas }
 * @param {Function} opciones.geocodificar  (direccion) => {lat, lng} | null
 * @param {boolean} opciones.candadoOcupado  simula que otro proceso tiene el candado
 */
export function crearEntorno({ hojas = {}, geocodificar = () => null, candadoOcupado = false } = {}) {
  const libro = new LibroFalso(hojas)
  const respuestas = []

  const contexto = {
    console,
    Date,
    JSON,
    Math,
    String,
    Number,
    Array,
    Object,
    isFinite,
    isNaN,
    parseInt,
    parseFloat,

    SpreadsheetApp: { getActive: () => libro },

    LockService: {
      getScriptLock: () => ({
        tryLock: () => !candadoOcupado,
        releaseLock: () => {},
      }),
    },

    Logger: { log: () => {} },

    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (texto) => {
        const salida = {
          texto,
          tipo: '',
          setMimeType(tipo) {
            salida.tipo = tipo
            return salida
          },
          getContent: () => salida.texto,
        }
        respuestas.push(salida)
        return salida
      },
    },

    Maps: {
      newGeocoder: () => {
        const geocoder = {
          setRegion: () => geocoder,
          setBounds: () => geocoder,
          geocode: (direccion) => {
            const punto = geocodificar(direccion)
            return punto
              ? { status: 'OK', results: [{ geometry: { location: punto } }] }
              : { status: 'ZERO_RESULTS', results: [] }
          },
        }
        return geocoder
      },
    },
  }

  vm.createContext(contexto)
  for (const archivo of ['logica.js', 'Codigo.gs', 'Ingesta.gs', 'Instalar.gs']) {
    vm.runInContext(readFileSync(join(FUENTE, archivo), 'utf8'), contexto, { filename: archivo })
  }

  return {
    libro,
    contexto,
    /** Llama a `doPost` como lo haría el web app y devuelve el JSON de vuelta. */
    doPost(envio) {
      const salida = contexto.doPost({ postData: { contents: JSON.stringify(envio) } })
      return JSON.parse(salida.getContent())
    },
    ingerirReportes: () => contexto.ingerirReportes(),
    instalar: () => contexto.instalar(),
  }
}

/** Encabezado de `edificaciones` tal como lo espera el resto del sistema. */
export const COLUMNAS_EDIFICACIONES = [
  'id', 'creado_en', 'origen', 'direccion_texto', 'barrio', 'comuna',
  'lat_reporte', 'lon_reporte', 'precision_reporte', 'lat_visita', 'lon_visita',
  'estado', 'reclamada_por', 'reclamada_en', 'tipo_edificacion', 'num_torres',
  'apts_por_torre', 'ocupacion', 'caracterizacion', 'fallecidos_atrapados',
  'rescatadas_en_sitio', 'rescatadas_fuente', 'visitada_por', 'visitada_en',
  'observaciones', 'duplicado_de', 'contacto_nombre', 'contacto_telefono',
  'contacto_correo', 'unidad_apto', 'fotos', 'uuid_envio',
]

/** Fila de `edificaciones` a partir de un objeto parcial. */
export function filaEdificacion(datos) {
  return COLUMNAS_EDIFICACIONES.map((columna) => datos[columna] ?? '')
}

/**
 * Lo que la pestaña `publico` debe producir: todo menos las columnas de
 * contacto, las fotos, el uuid y las filas marcadas como duplicadas.
 *
 * Aquí es código porque en la hoja es una fórmula; tenerlo escrito sirve de
 * especificación de esa fórmula y permite probar el recorrido completo.
 */
export const COLUMNAS_PRIVADAS = [
  'contacto_nombre',
  'contacto_telefono',
  'contacto_correo',
  'unidad_apto',
  'fotos',
  'uuid_envio',
]

export function proyectarPublico(libro) {
  const hoja = libro.getSheetByName('edificaciones')
  if (!hoja) return ''
  const [encabezado, ...filas] = hoja.getDataRange().getValues()
  const indices = encabezado
    .map((c, i) => [String(c), i])
    .filter(([c]) => c && !COLUMNAS_PRIVADAS.includes(c))
  const columnaDuplicado = encabezado.indexOf('duplicado_de')

  const escapar = (valor) => {
    const s = String(valor ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const lineas = [indices.map(([c]) => c).join(',')]
  for (const fila of filas) {
    if (!String(fila[encabezado.indexOf('id')] ?? '').trim()) continue
    if (columnaDuplicado !== -1 && String(fila[columnaDuplicado] ?? '').trim()) continue
    lineas.push(indices.map(([, i]) => escapar(fila[i])).join(','))
  }
  return lineas.join('\n') + '\n'
}
