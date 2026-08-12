/**
 * Ejecuta de verdad `Codigo.gs` e `Ingesta.gs` contra una hoja simulada.
 *
 * Hasta aquí, la mitad del sistema que vive en Google era código leído: las
 * pruebas de `logica.test.js` cubren las reglas puras, pero nunca se había
 * ejecutado el pegamento (candado, bitácora, búsqueda de la fila, alta de filas
 * nuevas, activador de ingesta). Los dos fallos más caros del proyecto estaban
 * justo ahí.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  COLUMNAS_EDIFICACIONES,
  crearEntorno,
  filaEdificacion,
  proyectarPublico,
} from '../simulacro/entorno.mjs'

const CUADRILLAS = [['codigo'], ['C-07'], ['C-03']]
const COORDINACION = [['codigo'], ['K-01']]

function hojasBase() {
  return {
    edificaciones: [
      COLUMNAS_EDIFICACIONES,
      filaEdificacion({
        id: 'D-0001',
        estado: 'NARANJA',
        direccion_texto: 'Calle 1 2-3',
        barrio: 'Chipichape',
        comuna: '02',
        lat_reporte: 3.474,
        lon_reporte: -76.528,
        precision_reporte: 'geocodificada',
        contacto_nombre: 'Ana',
        contacto_telefono: '3001234567',
      }),
      filaEdificacion({
        id: 'D-0002',
        estado: 'VERDE',
        direccion_texto: 'Calle 4 5-6',
        barrio: 'Granada',
        comuna: '02',
        lat_visita: 3.462,
        lon_visita: -76.534,
      }),
    ],
    cuadrillas: CUADRILLAS,
    coordinacion: COORDINACION,
  }
}

function envio(extra = {}) {
  return {
    uuid: `u-${Math.random().toString(16).slice(2)}`,
    tipo: 'reclamar',
    edificacionId: 'D-0001',
    cuadrilla: 'C-07',
    creadoEn: new Date().toISOString(),
    ...extra,
  }
}

let entorno
beforeEach(() => {
  entorno = crearEntorno({ hojas: hojasBase() })
})

const fila = (id) => entorno.libro.comoObjetos('edificaciones').find((f) => f.id === id)

describe('doPost — recorrido completo sobre la hoja', () => {
  it('reclamar escribe cuadrilla y hora en la fila correcta', () => {
    const respuesta = entorno.doPost(envio())
    expect(respuesta.ok).toBe(true)
    expect(fila('D-0001').reclamada_por).toBe('C-07')
    expect(fila('D-0001').reclamada_en).not.toBe('')
    // No toca a las demás.
    expect(fila('D-0002').reclamada_por).toBe('')
  })

  it('caracterizar cierra la visita y libera el reclamo', () => {
    entorno.doPost(envio())
    entorno.doPost(
      envio({
        tipo: 'caracterizar',
        datos: {
          caracterizacion: 'Grietas en la escalera',
          tipoEdificacion: 'conjunto de torres',
          numTorres: 5,
          aptsPorTorre: 36,
          ocupacion: 'varía',
          fallecidosAtrapados: 'No',
          observaciones: '',
        },
      }),
    )
    expect(fila('D-0001')).toMatchObject({
      estado: 'VERDE',
      visitada_por: 'C-07',
      reclamada_por: '',
      apts_por_torre: 36,
      ocupacion: 'varía',
    })
  })

  it('rechaza el reclamo de una cuadrilla sobre lo que otra tiene tomado', () => {
    entorno.doPost(envio({ cuadrilla: 'C-07' }))
    const segunda = entorno.doPost(envio({ cuadrilla: 'C-03' }))
    expect(segunda).toEqual({ ok: false, error: 'reclamada_por_C-07' })
    expect(fila('D-0001').reclamada_por).toBe('C-07')
  })

  it('rechaza códigos que no están en la pestaña de cuadrillas', () => {
    expect(entorno.doPost(envio({ cuadrilla: 'C-99' }))).toEqual({
      ok: false,
      error: 'cuadrilla_no_reconocida',
    })
  })

  it('rechaza una edificación que no existe', () => {
    expect(entorno.doPost(envio({ edificacionId: 'NO-EXISTE' }))).toEqual({
      ok: false,
      error: 'edificacion_desconocida',
    })
  })

  it('devuelve «ocupado_reintente» si el candado está tomado, sin escribir', () => {
    const ocupado = crearEntorno({ hojas: hojasBase(), candadoOcupado: true })
    expect(ocupado.doPost(envio())).toEqual({ ok: false, error: 'ocupado_reintente' })
    expect(ocupado.libro.comoObjetos('edificaciones')[0].reclamada_por).toBe('')
  })

  it('un cuerpo ilegible no revienta el web app', () => {
    const salida = entorno.contexto.doPost({ postData: { contents: 'esto no es json' } })
    expect(JSON.parse(salida.getContent()).ok).toBe(false)
  })
})

describe('doPost — idempotencia', () => {
  it('el mismo envío dos veces escribe una sola vez', () => {
    const e = envio({ tipo: 'colapsar', datos: { rescatadasEnSitio: 3, rescatadasFuente: 'C-07', fallecidosAtrapados: 'Sí' } })
    expect(entorno.doPost(e).ok).toBe(true)
    const segunda = entorno.doPost(e)
    expect(segunda).toEqual({ ok: true, repetido: true })
    const aplicados = entorno.libro
      .comoObjetos('log')
      .filter((f) => f.uuid === e.uuid && f.aplicado === 'si')
    expect(aplicados).toHaveLength(1)
  })

  it('dos reintentos que se cruzan antes del candado no pierden el cambio', () => {
    // Reproduce el fallo real: ambos quedan registrados como recibidos antes de
    // que ninguno tome el candado. Contando recibidos, los dos se declaraban
    // repetidos y el cambio no se escribía nunca.
    const e = envio()
    const log = entorno.libro.getSheetByName('log') ?? entorno.libro.insertSheet('log')
    if (log.getLastRow() === 0) {
      log.appendRow(['recibido_en', 'uuid', 'tipo', 'edificacion_id', 'cuadrilla', 'crudo', 'aplicado'])
    }
    log.appendRow([new Date().toISOString(), e.uuid, e.tipo, e.edificacionId, e.cuadrilla, '{}', ''])

    expect(entorno.doPost(e).ok).toBe(true)
    expect(fila('D-0001').reclamada_por).toBe('C-07')
  })

  it('la bitácora guarda incluso lo que se rechaza', () => {
    entorno.doPost(envio({ cuadrilla: 'C-99' }))
    const registrados = entorno.libro.comoObjetos('log')
    expect(registrados).toHaveLength(1)
    expect(registrados[0]).toMatchObject({ cuadrilla: 'C-99', aplicado: '' })
  })
})

describe('doPost — coordinación', () => {
  it('crear exige código de coordinación y luego aparece la fila', () => {
    const datos = {
      direccionTexto: 'Calle nueva 1-23',
      barrio: 'Granada',
      comuna: '02',
      lat: 3.46,
      lon: -76.53,
      estado: 'ROJO',
    }
    expect(entorno.doPost(envio({ tipo: 'crear', edificacionId: 'N-1', datos }))).toEqual({
      ok: false,
      error: 'requiere_coordinacion',
    })

    const creada = entorno.doPost(
      envio({ tipo: 'crear', edificacionId: 'N-1', cuadrilla: 'K-01', datos }),
    )
    expect(creada.ok).toBe(true)
    expect(fila('N-1')).toMatchObject({
      direccion_texto: 'Calle nueva 1-23',
      estado: 'ROJO',
      origen: 'coordinacion',
    })
  })

  it('no se puede crear dos veces la misma', () => {
    const datos = { direccionTexto: 'X', barrio: '', comuna: '02', lat: 3.46, lon: -76.53, estado: 'ROJO' }
    entorno.doPost(envio({ tipo: 'crear', edificacionId: 'N-2', cuadrilla: 'K-01', datos }))
    expect(
      entorno.doPost(envio({ tipo: 'crear', edificacionId: 'N-2', cuadrilla: 'K-01', datos })),
    ).toEqual({ ok: false, error: 'ya_existe' })
  })

  it('fusionar saca el duplicado de la vista pero conserva la fila', () => {
    entorno.doPost(
      envio({ tipo: 'duplicar', cuadrilla: 'K-01', datos: { duplicadoDe: 'D-0002' } }),
    )
    expect(fila('D-0001').duplicado_de).toBe('D-0002')
    expect(fila('D-0001').contacto_telefono).toBe('3001234567')
    expect(proyectarPublico(entorno.libro)).not.toContain('D-0001')
  })
})

describe('la pestaña publico', () => {
  it('no deja salir ninguna columna de contacto', () => {
    const csv = proyectarPublico(entorno.libro)
    expect(csv).not.toContain('3001234567')
    expect(csv).not.toContain('Ana')
    expect(csv).not.toContain('contacto_')
    expect(csv).toContain('D-0001')
  })

  it('refleja lo que acaba de escribir una cuadrilla', () => {
    entorno.doPost(envio())
    expect(proyectarPublico(entorno.libro)).toContain('C-07')
  })
})

describe('ingerirReportes — CU-01', () => {
  function conReportes(filas, geocodificar) {
    return crearEntorno({
      hojas: {
        ...hojasBase(),
        reportes: [
          ['marca_temporal', 'direccion_texto', 'barrio', 'comuna', 'falla_observada', 'contacto_nombre', 'contacto_telefono'],
          ...filas,
        ],
      },
      geocodificar,
    })
  }

  it('convierte un reporte del Form en una edificación por visitar', () => {
    const e = conReportes(
      [['2026-08-12T10:00:00Z', 'Calle 44 12-30', 'Chipichape', '2', 'Grietas', 'Ana', '3001234567']],
      () => ({ lat: 3.474, lng: -76.528 }),
    )
    e.ingerirReportes()
    const nuevas = e.libro.comoObjetos('edificaciones').filter((f) => f.origen === 'form_residente')
    expect(nuevas).toHaveLength(1)
    expect(nuevas[0]).toMatchObject({
      estado: 'NARANJA',
      comuna: '02',
      precision_reporte: 'geocodificada',
      lat_reporte: 3.474,
      contacto_telefono: '3001234567',
    })
    // Y el contacto no sale a la vista pública.
    expect(proyectarPublico(e.libro)).not.toContain('3001234567')
  })

  it('lo que no se puede geocodificar entra igual, como «sin ubicar»', () => {
    const e = conReportes([['', 'Calle 70 con Carrera 3', 'La Campiña', '2', '', '', '']], () => null)
    e.ingerirReportes()
    const nueva = e.libro.comoObjetos('edificaciones').find((f) => f.origen === 'form_residente')
    expect(nueva).toMatchObject({ precision_reporte: 'sin_ubicar', lat_reporte: '' })
  })

  it('correrla dos veces no duplica: marca lo ya procesado', () => {
    const e = conReportes(
      [
        ['', 'Calle 1', 'Chipichape', '2', '', '', ''],
        ['', 'Calle 2', 'Granada', '2', '', '', ''],
      ],
      () => ({ lat: 3.47, lng: -76.53 }),
    )
    e.ingerirReportes()
    e.ingerirReportes()
    const nuevas = e.libro.comoObjetos('edificaciones').filter((f) => f.origen === 'form_residente')
    expect(nuevas).toHaveLength(2)
    expect(e.libro.comoObjetos('reportes').every((r) => r.id_edificacion)).toBe(true)
  })

  it('un geocodificador que revienta no detiene la ingesta', () => {
    const e = conReportes([['', 'Calle 3', 'Granada', '2', '', '', '']], () => {
      throw new Error('cuota agotada')
    })
    expect(() => e.ingerirReportes()).not.toThrow()
    expect(e.libro.comoObjetos('edificaciones').find((f) => f.origen === 'form_residente')).toMatchObject({
      precision_reporte: 'sin_ubicar',
    })
  })
})
