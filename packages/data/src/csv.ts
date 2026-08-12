/**
 * Parser CSV mínimo pero correcto (RFC 4180).
 *
 * No es un `split(',')`: los campos `caracterizacion` y `observaciones` son texto
 * libre escrito por cuadrillas en campo y traen comas, comillas y saltos de línea.
 * Un parser ingenuo corre las columnas y publica la caracterización de una
 * edificación en la fila de otra.
 */

/** Divide el texto CSV en filas de campos crudos. */
export function parsearCSV(texto: string): string[][] {
  const src = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let enComillas = false

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!

    if (enComillas) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          enComillas = false
        }
      } else {
        campo += c
      }
      continue
    }

    if (c === '"') {
      enComillas = true
    } else if (c === ',') {
      fila.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else {
      campo += c
    }
  }

  if (campo !== '' || fila.length > 0) {
    fila.push(campo)
    filas.push(fila)
  }

  // Una hoja de cálculo termina en salto de línea: descarta la fila vacía final.
  return filas.filter((f) => !(f.length === 1 && f[0] === ''))
}

/**
 * Normaliza un encabezado a una clave estable: sin tildes, sin espacios, minúsculas.
 * `Dirección Texto`, `direccion_texto` y `DIRECCION TEXTO` son la misma columna;
 * la hoja la edita gente, no un programa.
 */
export function normalizarClave(encabezado: string): string {
  return encabezado
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Convierte el CSV en objetos con claves normalizadas. La primera fila es el encabezado. */
export function filasComoObjetos(texto: string): Record<string, string>[] {
  const filas = parsearCSV(texto)
  const encabezado = filas[0]
  if (!encabezado) return []
  const claves = encabezado.map(normalizarClave)
  return filas.slice(1).map((fila) => {
    const obj: Record<string, string> = {}
    claves.forEach((clave, i) => {
      if (clave) obj[clave] = (fila[i] ?? '').trim()
    })
    return obj
  })
}
