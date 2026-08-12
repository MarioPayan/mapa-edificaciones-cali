import { crearEnvio } from '@dania/data'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * IndexedDB de mentira con un retardo en la escritura.
 *
 * El retardo es el punto: sin él la carrera no se reproduce. Con él, dos
 * escrituras concurrentes leen el mismo estado y la segunda pisa a la primera
 * — que fue exactamente el fallo que borraba la ubicación GPS capturada
 * automáticamente al caracterizar.
 */
const almacen = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  get: async (clave: string) => {
    await new Promise((r) => setTimeout(r, 1))
    return almacen.get(clave)
  },
  set: async (clave: string, valor: unknown) => {
    await new Promise((r) => setTimeout(r, 5))
    almacen.set(clave, valor)
  },
}))

const { encolar, leerCola, quitarDeCola } = await import('./cola.ts')

describe('cola — escrituras concurrentes', () => {
  beforeEach(() => almacen.clear())

  it('encolar dos envíos a la vez no pierde ninguno', async () => {
    const ubicar = crearEnvio('ubicar', 'D-0009', 'C-07', {
      lat: 3.47,
      lon: -76.53,
      exactitudM: 8,
    })
    const caracterizar = crearEnvio('caracterizar', 'D-0009', 'C-07', {
      caracterizacion: 'Grietas',
      tipoEdificacion: 'edificio',
      numTorres: null,
      aptsPorTorre: null,
      ocupacion: '',
      fallecidosAtrapados: 'No',
      observaciones: '',
    })

    // Sin serializar, la segunda escritura pisaba a la primera.
    await Promise.all([encolar(ubicar), encolar(caracterizar)])

    const cola = await leerCola()
    expect(cola.map((e) => e.tipo).sort()).toEqual(['caracterizar', 'ubicar'])
  })

  it('vaciar la cola no se lleva lo que se capturó mientras se enviaba', async () => {
    const enviado = crearEnvio('reclamar', 'D-0001', 'C-07')
    await encolar(enviado)

    // Se resuelve el envío viejo justo cuando entra uno nuevo.
    const nuevo = crearEnvio('reclamar', 'D-0002', 'C-07')
    const [restantes] = await Promise.all([
      quitarDeCola(new Set([enviado.uuid])),
      encolar(nuevo),
    ])

    const cola = await leerCola()
    expect(cola.map((e) => e.edificacionId)).toEqual(['D-0002'])
    expect(restantes.some((e) => e.uuid === enviado.uuid)).toBe(false)
  })

  it('diez capturas seguidas quedan las diez', async () => {
    const envios = Array.from({ length: 10 }, (_, i) =>
      crearEnvio('reclamar', `D-${i}`, 'C-07'),
    )
    await Promise.all(envios.map(encolar))
    expect((await leerCola()).length).toBe(10)
  })
})
