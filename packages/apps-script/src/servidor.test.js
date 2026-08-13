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

describe('registrar — CU-12, código en autoservicio', () => {
  const registro = (extra = {}) => ({
    uuid: `u-${Math.random().toString(16).slice(2)}`,
    tipo: 'registrar',
    creadoEn: new Date().toISOString(),
    datos: { nombre: 'Dania P.', telefono: '3001234567', correo: 'd@ejemplo.co', entidad: 'independiente' },
    ...extra,
  })

  it('asigna códigos en serie, guarda el contacto y autoriza como cuadrilla', () => {
    const primera = entorno.doPost(registro())
    const segunda = entorno.doPost(registro())
    expect(primera).toMatchObject({ ok: true, codigo: 'R-01' })
    expect(segunda).toMatchObject({ ok: true, codigo: 'R-02' })

    expect(entorno.libro.comoObjetos('registros')[0]).toMatchObject({
      codigo: 'R-01',
      nombre: 'Dania P.',
      telefono: '3001234567',
    })
    // Autorizada como cuadrilla al instante — pero NUNCA como coordinación.
    const cuadrillas = entorno.libro.comoObjetos('cuadrillas').map((f) => f.codigo)
    expect(cuadrillas).toContain('R-01')
    expect(entorno.libro.comoObjetos('coordinacion').map((f) => f.codigo)).not.toContain('R-01')
  })

  it('el código recién asignado ya puede reclamar', () => {
    const codigo = entorno.doPost(registro()).codigo
    const respuesta = entorno.doPost(envio({ cuadrilla: codigo }))
    expect(respuesta.ok).toBe(true)
    expect(fila('D-0001').reclamada_por).toBe(codigo)
  })

  it('el reintento del mismo registro devuelve el MISMO código', () => {
    const intento = registro({ uuid: 'u-fijo' })
    expect(entorno.doPost(intento).codigo).toBe('R-01')
    expect(entorno.doPost(intento)).toMatchObject({ ok: true, codigo: 'R-01', repetido: true })
    expect(entorno.libro.comoObjetos('registros')).toHaveLength(1)
  })

  it('rechaza un registro sin teléfono y no toca las pestañas', () => {
    const respuesta = entorno.doPost(registro({ datos: { nombre: 'Ana', telefono: '' } }))
    expect(respuesta).toMatchObject({ ok: false, error: 'falta_telefono' })
    expect(entorno.libro.getSheetByName('registros')).toBeNull()
  })

  it('el contacto del registro nunca sale a la vista pública', () => {
    entorno.doPost(registro())
    expect(proyectarPublico(entorno.libro)).not.toContain('3001234567')
    expect(proyectarPublico(entorno.libro)).not.toContain('Dania P.')
  })
})

describe('reportar — CU-13, la puerta del residente sobre la hoja', () => {
  const reporte = (extra = {}) => ({
    uuid: `u-${Math.random().toString(16).slice(2)}`,
    tipo: 'reportar',
    edificacionId: 'V-PRUEBA',
    cuadrilla: '',
    creadoEn: new Date().toISOString(),
    datos: {
      nombre: 'Vecina Prueba',
      telefono: '3017654321',
      correo: 'v@ejemplo.co',
      direccionTexto: 'Carrera 44 con calle 5',
      barrio: 'El Lido',
      comuna: '19',
      unidadApto: 'apto 302',
      lat: 3.42,
      lon: -76.54,
    },
    ...extra,
  })

  it('crea la fila por visitar con el contacto en la maestra', () => {
    expect(entorno.doPost(reporte()).ok).toBe(true)
    expect(fila('V-PRUEBA')).toMatchObject({
      estado: 'NARANJA',
      origen: 'reporte_app',
      direccion_texto: 'Carrera 44 con calle 5',
      contacto_telefono: '3017654321',
      unidad_apto: 'apto 302',
    })
  })

  it('el contacto del residente nunca sale a la vista pública', () => {
    entorno.doPost(reporte())
    const publico = proyectarPublico(entorno.libro)
    expect(publico).toContain('V-PRUEBA')
    expect(publico).not.toContain('3017654321')
    expect(publico).not.toContain('Vecina Prueba')
  })

  it('reportar dos veces el mismo uuid no duplica la fila', () => {
    const r = reporte({ uuid: 'u-reporte-fijo' })
    entorno.doPost(r)
    expect(entorno.doPost(r)).toMatchObject({ ok: true, repetido: true })
    expect(
      entorno.libro.comoObjetos('edificaciones').filter((f) => f.id === 'V-PRUEBA'),
    ).toHaveLength(1)
  })
})

describe('doGet — el web app sirve la vista pública como CSV', () => {
  it('responde el CSV sin contacto y sin duplicados', () => {
    entorno.doPost(
      envio({ tipo: 'duplicar', cuadrilla: 'K-01', datos: { duplicadoDe: 'D-0002' } }),
    )
    const csv = entorno.doGet()
    expect(csv.split('\n')[0]).toContain('id,')
    expect(csv).toContain('D-0002')
    expect(csv).not.toContain('D-0001,') // fusionada: fuera de la vista
    expect(csv).not.toContain('contacto_')
    expect(csv).not.toContain('3001234567')
  })

  it('sobre un libro virgen se instala solo y responde el encabezado', () => {
    const virgen = crearEntorno({ hojas: {} })
    const csv = virgen.doGet()
    expect(virgen.libro.getSheetByName('edificaciones')).not.toBeNull()
    expect(csv.split('\n')[0]).toContain('id,')
    // Y deja el código de coordinación inicial para poder operar desde ya.
    expect(virgen.libro.comoObjetos('coordinacion').map((f) => f.codigo)).toContain('K-01')
  })

  it('lo que escribe una cuadrilla sale en la siguiente lectura, al momento', () => {
    entorno.doPost(envio())
    expect(entorno.doGet()).toContain('C-07')
  })

  it('la acción geocodificar exige código de coordinación', () => {
    expect(entorno.doGet({ accion: 'geocodificar' })).toBe('requiere_coordinacion')
    expect(entorno.doGet({ accion: 'geocodificar', codigo: 'C-07' })).toBe('requiere_coordinacion')
  })

  it('con código de coordinación, geocodifica lo pendiente y responde el conteo', () => {
    const e = crearEntorno({
      hojas: {
        ...hojasBase(),
        edificaciones: [
          COLUMNAS_EDIFICACIONES,
          filaEdificacion({ id: 'M-0001', direccion_texto: 'Calle 9 8-7', precision_reporte: 'sin_ubicar' }),
        ],
      },
      geocodificar: () => ({ lat: 3.44, lng: -76.51 }),
    })
    expect(e.doGet({ accion: 'geocodificar', codigo: 'K-01' })).toBe('geocodificadas: 1')
    expect(e.libro.comoObjetos('edificaciones')[0]).toMatchObject({ precision_reporte: 'geocodificada' })
  })
})

describe('geocodificarSinUbicar — importaciones por dirección', () => {
  function conImportadas(filas, geocodificar) {
    return crearEntorno({
      hojas: {
        ...hojasBase(),
        edificaciones: [COLUMNAS_EDIFICACIONES, ...filas.map(filaEdificacion)],
      },
      geocodificar,
    })
  }

  it('ubica lo «sin ubicar» que trae dirección, con el barrio como pista', () => {
    const direcciones = []
    const e = conImportadas(
      [{ id: 'M-0001', estado: 'ROJO', direccion_texto: 'Carrera 44 con calle 5', barrio: 'El Lido', precision_reporte: 'sin_ubicar' }],
      (direccion) => {
        direcciones.push(direccion)
        return { lat: 3.42, lng: -76.54 }
      },
    )
    expect(e.contexto.geocodificarSinUbicar()).toBe(1)
    expect(e.libro.comoObjetos('edificaciones').find((f) => f.id === 'M-0001')).toMatchObject({
      lat_reporte: 3.42,
      lon_reporte: -76.54,
      precision_reporte: 'geocodificada',
    })
    expect(direcciones[0]).toBe('Carrera 44 con calle 5, El Lido, Cali, Colombia')
  })

  it('no toca lo ya ubicado ni lo que no tiene dirección', () => {
    const e = conImportadas(
      [
        { id: 'M-0001', direccion_texto: 'Calle 9 8-7', precision_reporte: 'manual', lat_reporte: 3.4, lon_reporte: -76.5 },
        { id: 'M-0002', direccion_texto: '', precision_reporte: 'sin_ubicar' },
      ],
      () => ({ lat: 3.9, lng: -76.9 }),
    )
    expect(e.contexto.geocodificarSinUbicar()).toBe(0)
    expect(e.libro.comoObjetos('edificaciones').find((f) => f.id === 'M-0001')).toMatchObject({
      lat_reporte: 3.4,
      precision_reporte: 'manual',
    })
    expect(e.libro.comoObjetos('edificaciones').find((f) => f.id === 'M-0002')).toMatchObject({
      lat_reporte: '',
      precision_reporte: 'sin_ubicar',
    })
  })

  it('lo que el geocodificador no encuentra (o lo revienta) sigue sin ubicar', () => {
    const e = conImportadas(
      [
        { id: 'M-0001', direccion_texto: 'hotel la luna', precision_reporte: 'sin_ubicar' },
        { id: 'M-0002', direccion_texto: 'Calle 1 2-3', precision_reporte: 'sin_ubicar' },
      ],
      (direccion) => {
        if (direccion.indexOf('hotel') === 0) throw new Error('cuota agotada')
        return null
      },
    )
    expect(() => e.contexto.geocodificarSinUbicar()).not.toThrow()
    for (const id of ['M-0001', 'M-0002']) {
      expect(e.libro.comoObjetos('edificaciones').find((f) => f.id === id)).toMatchObject({
        precision_reporte: 'sin_ubicar',
      })
    }
  })
})

describe('instalar — dejar la hoja lista de una ejecución', () => {
  it('crea todas las pestañas con su encabezado sobre un libro vacío', () => {
    const vacio = crearEntorno({ hojas: {} })
    vacio.instalar()
    for (const nombre of ['edificaciones', 'log', 'cuadrillas', 'coordinacion', 'publico']) {
      expect(vacio.libro.getSheetByName(nombre), nombre).not.toBeNull()
    }
    // El instalador y el simulacro tienen que hablar de la misma hoja: si una
    // lista se mueve sin la otra, las pruebas dejarían de probar la realidad.
    const encabezado = vacio.libro.getSheetByName('edificaciones').getDataRange().getValues()[0]
    expect(encabezado).toEqual(COLUMNAS_EDIFICACIONES)
  })

  it('no pisa nada si se vuelve a ejecutar', () => {
    const e = crearEntorno({ hojas: hojasBase() })
    e.instalar()
    const antes = e.libro.comoObjetos('edificaciones').length
    e.instalar()
    expect(e.libro.comoObjetos('edificaciones')).toHaveLength(antes)
    expect(e.libro.comoObjetos('edificaciones')[0].id).toBe('D-0001')
  })

  it('la fórmula de `publico` no referencia ninguna columna de contacto', () => {
    const e = crearEntorno({ hojas: {} })
    e.instalar()
    const publico = e.libro.getSheetByName('publico').getDataRange().getValues()
    const encabezadoPublico = publico[0].filter(Boolean)
    for (const privada of ['contacto_nombre', 'contacto_telefono', 'contacto_correo', 'unidad_apto', 'fotos', 'uuid_envio']) {
      expect(encabezadoPublico, privada).not.toContain(privada)
    }
    expect(encabezadoPublico).toContain('id')
    expect(encabezadoPublico).toContain('caracterizacion')
  })

  it('la fórmula excluye las filas marcadas como duplicadas', () => {
    const e = crearEntorno({ hojas: {} })
    e.instalar()
    const formula = e.libro.getSheetByName('publico').getDataRange().getValues()[1][0]
    expect(formula).toContain('FILTER(')
    // `duplicado_de` es la columna Z en el orden actual; la condición debe estar.
    expect(formula).toMatch(/edificaciones!([A-Z]+)2:\1=""\)/)
    expect(formula).not.toContain('AA2:AA,')
  })
})
