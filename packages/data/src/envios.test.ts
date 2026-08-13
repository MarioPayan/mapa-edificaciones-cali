import { describe, expect, it } from 'vitest'
import { parsearEdificaciones } from './edificaciones.ts'
import { aplicarEnvios, crearEnvio, registrarCuadrilla, type Envio } from './envios.ts'

const CSV = `id,estado,reclamada_por,reclamada_en,lat_reporte,lon_reporte,precision_reporte,caracterizacion
E-1,NARANJA,,,3.1,-76.1,geocodificada,
E-2,NARANJA,,,3.2,-76.2,geocodificada,
`

const { edificaciones } = parsearEdificaciones(CSV)

function envio(tipo: Envio['tipo'], datos?: Envio['datos'], id = 'E-1'): Envio {
  return crearEnvio(tipo, id, 'C-07', datos)
}

describe('aplicarEnvios', () => {
  it('sin envíos devuelve exactamente lo mismo', () => {
    expect(aplicarEnvios(edificaciones, [])).toBe(edificaciones)
  })

  it('un reclamo se ve de inmediato, aunque no haya salido del teléfono', () => {
    const [e1, e2] = aplicarEnvios(edificaciones, [envio('reclamar')])
    expect(e1).toMatchObject({ reclamadaPor: 'C-07' })
    expect(e1!.reclamadaEn).not.toBe('')
    // Y no toca a las demás.
    expect(e2).toMatchObject({ id: 'E-2', reclamadaPor: '' })
  })

  it('caracterizar pinta VERDE y suelta el reclamo', () => {
    const cola = [
      envio('reclamar'),
      envio('caracterizar', {
        caracterizacion: 'Grietas en juntas de dilatación',
        tipoEdificacion: 'conjunto de torres',
        numTorres: 5,
        aptsPorTorre: 36,
        ocupacion: 'varía',
        fallecidosAtrapados: 'No',
        observaciones: '',
      }),
    ]
    const [e1] = aplicarEnvios(edificaciones, cola)
    expect(e1).toMatchObject({
      estado: 'VERDE',
      visitadaPor: 'C-07',
      reclamadaPor: '',
      aptsPorTorre: 36,
      ocupacion: 'varía',
    })
  })

  it('ubicar reemplaza la coordenada del reporte por la de la visita', () => {
    const [e1] = aplicarEnvios(edificaciones, [
      envio('ubicar', { lat: 3.47122, lon: -76.53781, exactitudM: 8 }),
    ])
    expect(e1).toMatchObject({ lat: 3.47122, lon: -76.53781, precision: 'visita' })
  })

  it('colapsar deja ROJO con lo observado en sitio', () => {
    const [e1] = aplicarEnvios(edificaciones, [
      envio('colapsar', {
        rescatadasEnSitio: 14,
        rescatadasFuente: 'cuadrilla C-03',
        fallecidosAtrapados: 'Sí',
      }),
    ])
    expect(e1).toMatchObject({ estado: 'ROJO', rescatadasEnSitio: 14 })
  })

  it('respeta el orden de la cola: lo último manda', () => {
    const [e1] = aplicarEnvios(edificaciones, [envio('reclamar'), envio('liberar')])
    expect(e1).toMatchObject({ reclamadaPor: '', reclamadaEn: '' })
  })

  it('cada envío lleva su propio uuid', () => {
    expect(envio('reclamar').uuid).not.toBe(envio('reclamar').uuid)
  })
})

describe('aplicarEnvios — reportar (CU-13)', () => {
  const datos = {
    nombre: 'Dania',
    telefono: '3001234567',
    correo: '',
    direccionTexto: 'Carrera 44 con calle 5',
    barrio: 'El Lido',
    comuna: '19',
    unidadApto: '',
    lat: 3.42,
    lon: -76.54,
  }

  it('el reporte del residente se pinta de inmediato, sin contacto', () => {
    const resultado = aplicarEnvios(edificaciones, [crearEnvio('reportar', 'V-1', '', datos)])
    const nueva = resultado.find((e) => e.id === 'V-1')
    expect(nueva).toMatchObject({
      estado: 'NARANJA',
      origen: 'reporte_app',
      lat: 3.42,
      precision: 'manual',
    })
    // Edificacion no modela contacto: no hay campo que pueda filtrarlo.
    expect(JSON.stringify(nueva)).not.toContain('3001234567')
  })

  it('sin GPS entra sin ubicar y no revienta el mapa', () => {
    const resultado = aplicarEnvios(edificaciones, [
      crearEnvio('reportar', 'V-2', '', { ...datos, lat: null, lon: null }),
    ])
    expect(resultado.find((e) => e.id === 'V-2')).toMatchObject({
      lat: null,
      precision: 'sin_ubicar',
    })
  })
})

describe('registrarCuadrilla — CU-12', () => {
  const DATOS = { nombre: 'Dania', telefono: '3001234567', correo: '', entidad: '' }
  const respuestaFalsa = (cuerpo: unknown) =>
    (() => Promise.resolve({ json: () => Promise.resolve(cuerpo) } as Response)) as typeof fetch

  it('manda el registro como text/plain y devuelve el código asignado', async () => {
    let capturado: RequestInit | undefined
    const fetchFalso = ((url: string, init: RequestInit) => {
      capturado = init
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, codigo: 'R-07' }) } as Response)
    }) as unknown as typeof fetch

    await expect(registrarCuadrilla('https://hoja/exec', DATOS, fetchFalso)).resolves.toBe('R-07')
    const cuerpo = JSON.parse(String(capturado?.body)) as Record<string, unknown>
    expect(cuerpo).toMatchObject({ tipo: 'registrar', datos: DATOS })
    expect(cuerpo['uuid']).toBeTruthy()
    // text/plain a propósito: application/json dispara un preflight que Apps Script no responde.
    expect((capturado?.headers as Record<string, string>)['Content-Type']).toContain('text/plain')
  })

  it('un rechazo del servidor se convierte en error con su motivo', async () => {
    await expect(
      registrarCuadrilla('https://hoja/exec', DATOS, respuestaFalsa({ ok: false, error: 'falta_telefono' })),
    ).rejects.toThrow('falta_telefono')
  })
})
