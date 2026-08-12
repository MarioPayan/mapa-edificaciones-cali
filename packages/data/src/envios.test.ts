import { describe, expect, it } from 'vitest'
import { parsearEdificaciones } from './edificaciones.ts'
import { aplicarEnvios, crearEnvio, type Envio } from './envios.ts'

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
