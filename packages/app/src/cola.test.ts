import { crearEnvio, type Envio } from '@dania/data'
import { describe, expect, it } from 'vitest'
import { enviarCola } from './cola.ts'

const URL_FALSA = 'https://script.google.test/exec'

function cola(n: number): Envio[] {
  return Array.from({ length: n }, (_, i) => crearEnvio('reclamar', `E-${i + 1}`, 'C-07'))
}

/** fetch de mentira: responde según el índice del envío que llega. */
function fetchQue(respuestas: (Response | Error)[]): {
  fetch: typeof fetch
  cuerpos: string[]
  cabeceras: (string | undefined)[]
} {
  const cuerpos: string[] = []
  const cabeceras: (string | undefined)[] = []
  let i = 0
  const fetchImpl = (async (_url: string, opciones: RequestInit) => {
    cuerpos.push(String(opciones.body))
    cabeceras.push((opciones.headers as Record<string, string>)['Content-Type'])
    const respuesta = respuestas[i++]
    if (respuesta instanceof Error) throw respuesta
    return respuesta!
  }) as unknown as typeof fetch
  return { fetch: fetchImpl, cuerpos, cabeceras }
}

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 })
const rechazo = (error: string) => new Response(JSON.stringify({ ok: false, error }), { status: 200 })

describe('enviarCola', () => {
  it('vacía la cola cuando todo entra', async () => {
    const falso = fetchQue([ok(), ok(), ok()])
    const r = await enviarCola(URL_FALSA, cola(3), falso.fetch)
    expect(r).toMatchObject({ restantes: [], rechazos: [], interrumpido: false })
    expect(falso.cuerpos).toHaveLength(3)
  })

  it('manda text/plain para no disparar preflight contra Apps Script', async () => {
    const falso = fetchQue([ok()])
    await enviarCola(URL_FALSA, cola(1), falso.fetch)
    expect(falso.cabeceras[0]).toContain('text/plain')
    expect(JSON.parse(falso.cuerpos[0]!)).toMatchObject({ tipo: 'reclamar', cuadrilla: 'C-07' })
  })

  it('si se cae la red conserva ese envío y todos los que siguen', async () => {
    const falso = fetchQue([ok(), new Error('Failed to fetch')])
    const r = await enviarCola(URL_FALSA, cola(3), falso.fetch)
    expect(r.interrumpido).toBe(true)
    expect(r.restantes.map((e) => e.edificacionId)).toEqual(['E-2', 'E-3'])
  })

  it('un 500 del servidor también se reintenta después', async () => {
    const falso = fetchQue([new Response('boom', { status: 500 })])
    const r = await enviarCola(URL_FALSA, cola(2), falso.fetch)
    expect(r.interrumpido).toBe(true)
    expect(r.restantes).toHaveLength(2)
  })

  it('un rechazo con motivo sale de la cola y se reporta', async () => {
    const falso = fetchQue([rechazo('reclamada_por_C-03'), ok()])
    const r = await enviarCola(URL_FALSA, cola(2), falso.fetch)
    expect(r.restantes).toEqual([])
    expect(r.rechazos).toEqual([
      { uuid: expect.any(String), edificacionId: 'E-1', motivo: 'reclamada_por_C-03' },
    ])
  })

  it('«ocupado_reintente» no es un rechazo: se vuelve a intentar', async () => {
    const falso = fetchQue([rechazo('ocupado_reintente')])
    const r = await enviarCola(URL_FALSA, cola(2), falso.fetch)
    expect(r.interrumpido).toBe(true)
    expect(r.rechazos).toEqual([])
    expect(r.restantes).toHaveLength(2)
  })

  it('una respuesta que no es JSON se trata como falla temporal, no como rechazo', async () => {
    const falso = fetchQue([new Response('<html>error de Google</html>', { status: 200 })])
    const r = await enviarCola(URL_FALSA, cola(1), falso.fetch)
    expect(r).toMatchObject({ interrumpido: true, rechazos: [] })
    expect(r.restantes).toHaveLength(1)
  })
})
