import { beforeEach, describe, expect, it, vi } from 'vitest'

/** localStorage de mentira: las pruebas corren en Node. */
const almacen = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => almacen.get(k) ?? null,
  setItem: (k: string, v: string) => almacen.set(k, v),
  removeItem: (k: string) => almacen.delete(k),
})
vi.stubGlobal('window', { location: { search: '', href: 'https://ejemplo.test/mapa/' } })

const {
  dominioDe,
  enlaceParaCompartir,
  guardarConfiguracion,
  leerConfiguracion,
  olvidarConfiguracion,
  propuestaDelEnlace,
  urlAceptable,
} = await import('./configuracion.ts')

beforeEach(() => almacen.clear())

describe('urlAceptable', () => {
  it('acepta https y localhost, rechaza lo demás', () => {
    expect(urlAceptable('https://docs.google.com/x/pub?output=csv')).toBe(true)
    expect(urlAceptable('http://localhost:4182/publico.csv')).toBe(true)
    expect(urlAceptable('http://ejemplo.com/datos.csv')).toBe(false)
    expect(urlAceptable('javascript:alert(1)')).toBe(false)
    expect(urlAceptable('no es una url')).toBe(false)
    expect(urlAceptable('')).toBe(false)
  })
})

describe('leerConfiguracion', () => {
  it('sin nada guardado ni compilado, arranca en demostración', () => {
    expect(leerConfiguracion().origen).toBe('demo')
  })

  it('lo guardado en el teléfono manda', () => {
    guardarConfiguracion({ csv: 'https://hoja.test/a.csv', envios: 'https://script.test/exec' })
    expect(leerConfiguracion()).toEqual({
      csv: 'https://hoja.test/a.csv',
      envios: 'https://script.test/exec',
      origen: 'guardada',
    })
  })

  it('un localStorage corrupto no deja la aplicación sin abrir', () => {
    almacen.set('dania:configuracion', '{ esto no es json')
    expect(() => leerConfiguracion()).not.toThrow()
    expect(leerConfiguracion().origen).toBe('demo')
  })

  it('olvidar vuelve a los datos de ejemplo', () => {
    guardarConfiguracion({ csv: 'https://hoja.test/a.csv', envios: '' })
    olvidarConfiguracion()
    expect(leerConfiguracion().origen).toBe('demo')
  })
})

describe('propuestaDelEnlace', () => {
  const actual = { csv: '', envios: '', origen: 'demo' as const }

  it('lee csv y envios del enlace', () => {
    const propuesta = propuestaDelEnlace(
      '?csv=https%3A%2F%2Fhoja.test%2Fa.csv&envios=https%3A%2F%2Fscript.test%2Fexec',
      actual,
    )
    expect(propuesta).toEqual({ csv: 'https://hoja.test/a.csv', envios: 'https://script.test/exec' })
  })

  it('no propone nada si el enlace no trae parámetros', () => {
    expect(propuestaDelEnlace('', actual)).toBeNull()
    expect(propuestaDelEnlace('?otra=cosa', actual)).toBeNull()
  })

  it('no propone nada si ya está conectada a lo mismo', () => {
    const ya = { csv: 'https://hoja.test/a.csv', envios: '', origen: 'guardada' as const }
    expect(propuestaDelEnlace('?csv=https%3A%2F%2Fhoja.test%2Fa.csv', ya)).toBeNull()
  })

  it('descarta un enlace con una URL que no es aceptable', () => {
    expect(propuestaDelEnlace('?csv=javascript:alert(1)', actual)).toBeNull()
    // Un endpoint de escritura en http abierto tampoco pasa.
    expect(propuestaDelEnlace('?csv=https://hoja.test/a.csv&envios=http://malo.test/x', actual)).toBeNull()
  })
})

describe('enlaceParaCompartir', () => {
  it('arma el enlace que coordinación reparte', () => {
    const enlace = enlaceParaCompartir(
      { csv: 'https://hoja.test/a.csv', envios: 'https://script.test/exec', origen: 'guardada' },
      'https://ejemplo.test/mapa/?csv=viejo',
    )
    expect(enlace).toBe(
      'https://ejemplo.test/mapa/?csv=https%3A%2F%2Fhoja.test%2Fa.csv&envios=https%3A%2F%2Fscript.test%2Fexec',
    )
  })
})

describe('dominioDe', () => {
  it('resume la URL para poder enseñarla', () => {
    expect(dominioDe('https://docs.google.com/spreadsheets/d/e/2PACX/pub?output=csv')).toBe(
      'docs.google.com',
    )
    expect(dominioDe('no es una url')).toBe('no es una url')
  })
})
