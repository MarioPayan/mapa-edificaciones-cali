import { describe, expect, it } from 'vitest'
import logica from './logica.js'

const { validarEnvio, validarRegistro, codigoDeRegistro, decidir } = logica

const AHORA = new Date('2026-08-12T14:00:00.000Z').getTime()

function envio(extra = {}) {
  return {
    uuid: 'u-1',
    tipo: 'reclamar',
    edificacionId: 'E-0417',
    cuadrilla: 'C-07',
    creadoEn: '2026-08-12T13:30:00.000Z',
    ...extra,
  }
}

function fila(extra = {}) {
  return {
    id: 'E-0417',
    estado: 'NARANJA',
    reclamada_por: '',
    reclamada_en: '',
    ...extra,
  }
}

describe('validarEnvio', () => {
  it('acepta un envío bien formado', () => {
    expect(validarEnvio(envio(), ['C-07', 'C-03'])).toBe('')
  })

  it('rechaza tipo desconocido, campos faltantes y cuadrilla no reconocida', () => {
    expect(validarEnvio(envio({ tipo: 'borrar' }), [])).toBe('tipo_desconocido')
    expect(validarEnvio(envio({ uuid: '' }), [])).toBe('falta_uuid')
    expect(validarEnvio(envio({ edificacionId: '' }), [])).toBe('falta_edificacion')
    expect(validarEnvio(envio(), ['C-01'])).toBe('cuadrilla_no_reconocida')
  })

  it('sin lista de cuadrillas no exige código', () => {
    expect(validarEnvio(envio({ cuadrilla: 'C-99' }), [])).toBe('')
  })

  it('rechaza «registrar» como envío normal: se atiende por otro camino', () => {
    expect(validarEnvio(envio({ tipo: 'registrar' }), [])).toBe('tipo_desconocido')
  })

  it('rechaza coordenadas ausentes o fuera de Colombia', () => {
    const ubicar = (datos) => validarEnvio(envio({ tipo: 'ubicar', datos }), [])
    expect(ubicar({ lat: 3.49, lon: -76.52 })).toBe('')
    expect(ubicar({ lat: '3.49', lon: -76.52 })).toBe('coordenada_invalida')
    // (0,0) es el destino clásico de un GPS mal leído.
    expect(ubicar({ lat: 0, lon: 0 })).toBe('coordenada_fuera_de_rango')
    expect(ubicar({ lat: 40.7, lon: -74 })).toBe('coordenada_fuera_de_rango')
  })
})

describe('validarRegistro — CU-12', () => {
  const registro = (datos) => ({ uuid: 'u-1', tipo: 'registrar', datos })

  it('acepta el mínimo contactable: nombre y teléfono', () => {
    expect(validarRegistro(registro({ nombre: 'Dania', telefono: '3001234567' }))).toBe('')
  })

  it('no exige código de cuadrilla: quien se registra todavía no tiene uno', () => {
    // A propósito no hay campo `cuadrilla` en el registro.
    expect(validarRegistro(registro({ nombre: 'Dania', telefono: '3001234567' }))).toBe('')
  })

  it('rechaza lo incompleto', () => {
    expect(validarRegistro(null)).toBe('envio_ilegible')
    expect(validarRegistro({ tipo: 'registrar', datos: { nombre: 'Dania', telefono: '300' } })).toBe('falta_uuid')
    expect(validarRegistro(registro({ telefono: '3001234567' }))).toBe('falta_nombre')
    expect(validarRegistro(registro({ nombre: 'Dania' }))).toBe('falta_telefono')
  })

  it('los códigos se asignan en serie', () => {
    expect(codigoDeRegistro(1)).toBe('R-01')
    expect(codigoDeRegistro(12)).toBe('R-12')
    expect(codigoDeRegistro(120)).toBe('R-120')
  })
})

describe('reportar — CU-13, la puerta del residente', () => {
  const reporte = (datos = {}) =>
    envio({
      tipo: 'reportar',
      edificacionId: 'V-1',
      cuadrilla: '',
      datos: {
        nombre: 'Dania',
        telefono: '3001234567',
        correo: '',
        direccionTexto: 'Carrera 44 con calle 5',
        barrio: 'El Lido',
        comuna: '19',
        unidadApto: '',
        lat: 3.42,
        lon: -76.54,
        ...datos,
      },
    })

  it('no exige código de cuadrilla, ni siquiera con la lista configurada', () => {
    expect(validarEnvio(reporte(), ['C-07'], ['K-01'])).toBe('')
  })

  it('exige ser contactable y una dirección', () => {
    expect(validarEnvio(reporte({ nombre: '' }), [])).toBe('falta_nombre')
    expect(validarEnvio(reporte({ telefono: '' }), [])).toBe('falta_telefono')
    expect(validarEnvio(reporte({ direccionTexto: '' }), [])).toBe('falta_direccion')
  })

  it('con GPS el punto queda como aproximado: la cuadrilla lo corrige en la puerta', () => {
    const r = decidir(reporte(), {}, AHORA)
    expect(r.ok).toBe(true)
    expect(r.cambios).toMatchObject({
      estado: 'NARANJA',
      origen: 'reporte_app',
      lat_reporte: 3.42,
      precision_reporte: 'manual',
      contacto_nombre: 'Dania',
      contacto_telefono: '3001234567',
    })
  })

  it('un GPS malo no bota el reporte: entra sin ubicar', () => {
    // (0,0) es el destino clásico de un GPS mal leído.
    const r = decidir(reporte({ lat: 0, lon: 0 }), {}, AHORA)
    expect(r.ok).toBe(true)
    expect(r.cambios).toMatchObject({ lat_reporte: '', precision_reporte: 'sin_ubicar' })
    const sinGPS = decidir(reporte({ lat: null, lon: null }), {}, AHORA)
    expect(sinGPS.cambios).toMatchObject({ precision_reporte: 'sin_ubicar' })
  })
})

describe('decidir — reclamar', () => {
  it('reclama una edificación libre', () => {
    const r = decidir(envio(), fila(), AHORA)
    expect(r.ok).toBe(true)
    // El reclamo cuenta desde que llega, no desde que se capturó sin señal.
    expect(r.cambios).toEqual({
      reclamada_por: 'C-07',
      reclamada_en: '2026-08-12T14:00:00.000Z',
    })
  })

  it('rechaza si otra cuadrilla la tiene reclamada y el reclamo sigue vigente', () => {
    const r = decidir(
      envio(),
      fila({ reclamada_por: 'C-03', reclamada_en: '2026-08-12T12:00:00.000Z' }),
      AHORA,
    )
    expect(r).toEqual({ ok: false, error: 'reclamada_por_C-03' })
  })

  it('permite reclamar si el reclamo ajeno ya venció (4 h)', () => {
    const r = decidir(
      envio(),
      fila({ reclamada_por: 'C-03', reclamada_en: '2026-08-12T09:00:00.000Z' }),
      AHORA,
    )
    expect(r.ok).toBe(true)
  })

  it('la misma cuadrilla puede refrescar su propio reclamo', () => {
    const r = decidir(
      envio(),
      fila({ reclamada_por: 'C-07', reclamada_en: '2026-08-12T13:00:00.000Z' }),
      AHORA,
    )
    expect(r.ok).toBe(true)
  })

  it('no deja reclamar lo ya visitado', () => {
    expect(decidir(envio(), fila({ estado: 'VERDE' }), AHORA)).toEqual({
      ok: false,
      error: 'ya_visitada',
    })
  })
})

describe('decidir — caracterizar', () => {
  const datos = {
    caracterizacion: 'Fisuras en juntas de dilatación, con desprendimiento de acabados.',
    tipoEdificacion: 'conjunto de torres',
    numTorres: 5,
    aptsPorTorre: 36,
    ocupacion: 'varía',
    fallecidosAtrapados: 'No',
    observaciones: 'Acceso por la 58N',
  }

  it('marca VERDE, libera el reclamo y guarda la hora de campo, no la de llegada', () => {
    const r = decidir(envio({ tipo: 'caracterizar', datos }), fila(), AHORA)
    expect(r.ok).toBe(true)
    expect(r.cambios).toMatchObject({
      estado: 'VERDE',
      visitada_por: 'C-07',
      // Capturada a las 13:30 sin señal; llega a las 14:00. Vale la de captura.
      visitada_en: '2026-08-12T13:30:00.000Z',
      reclamada_por: '',
      num_torres: 5,
      apts_por_torre: 36,
      ocupacion: 'varía',
    })
  })

  it('acepta «varía» donde el formulario oficial exige un número', () => {
    const r = decidir(
      envio({ tipo: 'caracterizar', datos: { ...datos, numTorres: '', aptsPorTorre: 'no sé' } }),
      fila(),
      AHORA,
    )
    expect(r.cambios.num_torres).toBe('')
    expect(r.cambios.apts_por_torre).toBe('')
    expect(r.cambios.ocupacion).toBe('varía')
  })

  it('recorta el texto libre para que un pegado accidental no llene la hoja', () => {
    const largo = 'x'.repeat(9000)
    const r = decidir(
      envio({ tipo: 'caracterizar', datos: { ...datos, caracterizacion: largo } }),
      fila(),
      AHORA,
    )
    expect(r.cambios.caracterizacion.length).toBe(4000)
  })

  it('con fecha de dispositivo ilegible usa la del servidor', () => {
    const r = decidir(envio({ tipo: 'caracterizar', datos, creadoEn: 'ayer' }), fila(), AHORA)
    expect(r.cambios.visitada_en).toBe('2026-08-12T14:00:00.000Z')
  })
})

describe('decidir — colapsar y liberar', () => {
  it('colapsar marca ROJO con lo observado en sitio', () => {
    const r = decidir(
      envio({
        tipo: 'colapsar',
        datos: { rescatadasEnSitio: 14, rescatadasFuente: 'cuadrilla C-03', fallecidosAtrapados: 'Sí' },
      }),
      fila(),
      AHORA,
    )
    expect(r.cambios).toMatchObject({
      estado: 'ROJO',
      rescatadas_en_sitio: 14,
      rescatadas_fuente: 'cuadrilla C-03',
    })
  })

  it('liberar solo funciona sobre el reclamo propio', () => {
    expect(
      decidir(envio({ tipo: 'liberar' }), fila({ reclamada_por: 'C-03' }), AHORA),
    ).toEqual({ ok: false, error: 'reclamada_por_otra' })
    const propio = decidir(envio({ tipo: 'liberar' }), fila({ reclamada_por: 'C-07' }), AHORA)
    expect(propio.cambios).toEqual({ reclamada_por: '', reclamada_en: '' })
  })
})

describe('decidir — coordinación (CU-11)', () => {
  it('crear exige código de coordinación y dirección', () => {
    const crear = (datos, coord) =>
      validarEnvio(envio({ tipo: 'crear', datos }), [], coord)
    const datos = { direccionTexto: 'Calle 5 12-30', barrio: 'X', comuna: '02', lat: 3.45, lon: -76.53, estado: 'ROJO' }
    expect(crear(datos, ['C-07'])).toBe('')
    expect(crear(datos, ['OTRO'])).toBe('requiere_coordinacion')
    // Sin pestaña `coordinacion` no se abre la puerta por omisión.
    expect(crear(datos, [])).toBe('coordinacion_no_configurada')
    expect(crear({ ...datos, direccionTexto: '' }, ['C-07'])).toBe('falta_direccion')
    expect(crear({ ...datos, lat: 0, lon: 0 }, ['C-07'])).toBe('coordenada_fuera_de_rango')
  })

  it('crear escribe la edificación nueva como reporte de coordinación', () => {
    const r = decidir(
      envio({
        tipo: 'crear',
        datos: { direccionTexto: 'Calle 5 12-30', barrio: 'San Antonio', comuna: '03', lat: 3.45, lon: -76.53, estado: 'ROJO' },
      }),
      fila(),
      AHORA,
    )
    expect(r.cambios).toMatchObject({
      direccion_texto: 'Calle 5 12-30',
      estado: 'ROJO',
      origen: 'coordinacion',
      precision_reporte: 'manual',
    })
  })

  it('duplicar exige un principal distinto de sí misma', () => {
    const dup = (duplicadoDe) => validarEnvio(envio({ tipo: 'duplicar', datos: { duplicadoDe } }), [], ['C-07'])
    expect(dup('E-0301')).toBe('')
    expect(dup('')).toBe('falta_principal')
    expect(dup('E-0417')).toBe('duplicado_de_si_misma')
  })

  it('fusionar no borra nada: solo marca la columna', () => {
    const r = decidir(envio({ tipo: 'duplicar', datos: { duplicadoDe: 'E-0301' } }), fila(), AHORA)
    expect(r.cambios).toEqual({ duplicado_de: 'E-0301' })
  })

  it('ubicar de coordinación queda como «manual», no como visita', () => {
    const r = decidir(
      envio({ tipo: 'ubicar', datos: { lat: 3.45, lon: -76.53, exactitudM: null, manual: true } }),
      fila(),
      AHORA,
    )
    expect(r.cambios.precision_reporte).toBe('manual')
  })

  it('la referencia de campo se anexa a las observaciones sin pisarlas', () => {
    const r = decidir(
      envio({ tipo: 'ubicar', datos: { lat: 3.49, lon: -76.52, referencia: 'Torre B, entrada por la 58N' } }),
      fila({ observaciones: 'Portería cerrada.' }),
      AHORA,
    )
    expect(r.cambios.observaciones).toBe('Portería cerrada. Torre B, entrada por la 58N')
  })
})

describe('normalizarReporte — CU-01', () => {
  const { normalizarReporte } = logica
  const reporte = {
    marca_temporal: '2026-08-12T10:00:00.000Z',
    direccion_texto: 'Calle 100 Norte 11-11',
    barrio: 'La Flora',
    comuna: '2',
    falla_observada: 'Grietas en la escalera',
    contacto_nombre: 'Ana',
    contacto_telefono: '3001234567',
  }

  it('asigna id consecutivo, estado NARANJA y comuna de dos dígitos', () => {
    const r = normalizarReporte(reporte, 417, () => ({ lat: 3.49, lon: -76.52 }))
    expect(r).toMatchObject({
      id: 'E-0417',
      estado: 'NARANJA',
      comuna: '02',
      origen: 'form_residente',
      precision_reporte: 'geocodificada',
      lat_reporte: 3.49,
    })
  })

  it('si la geocodificación falla la fila NO se pierde: queda sin ubicar', () => {
    const nula = normalizarReporte(reporte, 1, () => null)
    expect(nula).toMatchObject({ precision_reporte: 'sin_ubicar', lat_reporte: '' })
    // Y si el geocodificador revienta, tampoco se cae la ingesta.
    const revienta = normalizarReporte(reporte, 1, () => {
      throw new Error('cuota agotada')
    })
    expect(revienta.precision_reporte).toBe('sin_ubicar')
  })

  it('conserva el contacto en la fila maestra (nunca sale a `publico`)', () => {
    const r = normalizarReporte(reporte, 1, () => null)
    expect(r.contacto_nombre).toBe('Ana')
    expect(r.contacto_telefono).toBe('3001234567')
  })
})
