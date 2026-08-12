/**
 * De dónde saca la aplicación su hoja.
 *
 * Las variables de compilación (`VITE_CSV_URL`, `VITE_ENVIOS_URL`) siguen
 * sirviendo como valor por omisión del despliegue, pero no pueden ser la única
 * vía: obligarían a tener acceso al repositorio y a reconstruir para conectar
 * una hoja. Con esto, coordinación arma un enlace, lo manda por chat, y cada
 * teléfono queda conectado al abrirlo y confirmar.
 */

export type OrigenConfiguracion = 'guardada' | 'compilada' | 'demo'

export interface Configuracion {
  csv: string
  envios: string
  origen: OrigenConfiguracion
}

const CLAVE = 'dania:configuracion'

const CSV_COMPILADA = import.meta.env['VITE_CSV_URL'] ?? ''
const ENVIOS_COMPILADA = import.meta.env['VITE_ENVIOS_URL'] ?? ''

/**
 * Solo https, salvo localhost para poder probar.
 * No es una defensa seria — quien abre el enlace decide — pero descarta
 * esquemas raros y avisa de un http en abierto.
 */
export function urlAceptable(valor: string): boolean {
  if (!valor) return false
  try {
    const url = new URL(valor)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  } catch {
    return false
  }
}

/** Para enseñar a qué se está conectando sin soltar un URL de 200 caracteres. */
export function dominioDe(valor: string): string {
  try {
    return new URL(valor).hostname
  } catch {
    return valor
  }
}

export interface Propuesta {
  csv: string
  envios: string
}

/**
 * Configuración propuesta por el enlace (`?csv=…&envios=…`), si trae algo
 * distinto de lo ya guardado. No se aplica sola: la confirma quien la abre.
 */
export function propuestaDelEnlace(
  busqueda = window.location.search,
  actual = leerConfiguracion(),
): Propuesta | null {
  const parametros = new URLSearchParams(busqueda)
  const csv = parametros.get('csv')?.trim() ?? ''
  const envios = parametros.get('envios')?.trim() ?? ''
  if (!csv && !envios) return null
  if (csv && !urlAceptable(csv)) return null
  if (envios && !urlAceptable(envios)) return null

  const propuesta = { csv: csv || actual.csv, envios: envios || actual.envios }
  if (propuesta.csv === actual.csv && propuesta.envios === actual.envios) return null
  return propuesta
}

export function leerConfiguracion(): Configuracion {
  try {
    const guardada = localStorage.getItem(CLAVE)
    if (guardada) {
      const { csv, envios } = JSON.parse(guardada) as Propuesta
      if (urlAceptable(csv)) return { csv, envios: envios ?? '', origen: 'guardada' }
    }
  } catch {
    // Un localStorage corrupto no puede dejar la aplicación sin abrir.
  }

  if (CSV_COMPILADA) {
    return { csv: CSV_COMPILADA, envios: ENVIOS_COMPILADA, origen: 'compilada' }
  }
  return { csv: '', envios: '', origen: 'demo' }
}

export function guardarConfiguracion(propuesta: Propuesta): void {
  localStorage.setItem(CLAVE, JSON.stringify({ csv: propuesta.csv, envios: propuesta.envios }))
}

/** Vuelve a los datos de ejemplo. */
export function olvidarConfiguracion(): void {
  localStorage.removeItem(CLAVE)
}

/** Quita `csv`/`envios` de la barra de direcciones una vez decididos. */
export function limpiarEnlace(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('csv') && !url.searchParams.has('envios')) return
  url.searchParams.delete('csv')
  url.searchParams.delete('envios')
  window.history.replaceState({}, '', url.toString())
}

/** El enlace que coordinación reparte por chat. */
export function enlaceParaCompartir(configuracion: Configuracion, base = window.location.href): string {
  const url = new URL(base)
  url.search = ''
  if (configuracion.csv) url.searchParams.set('csv', configuracion.csv)
  if (configuracion.envios) url.searchParams.set('envios', configuracion.envios)
  return url.toString()
}
