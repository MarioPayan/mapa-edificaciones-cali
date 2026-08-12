/**
 * Levanta la mitad de Google en local: el `doPost` de verdad sobre una hoja
 * simulada, y el CSV publicado que sale de esa misma hoja.
 *
 * Con esto la aplicación se puede probar contra el servidor real —el mismo
 * código que se pega en Apps Script— en vez de contra un simulacro que siempre
 * dice «ok». Lo que sigue sin cubrir: cuotas, permisos y el redirect del web
 * app de Google. Eso solo se ve desplegando.
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { filasComoObjetos } from '../packages/data/src/csv.ts'
import {
  COLUMNAS_EDIFICACIONES,
  crearEntorno,
  filaEdificacion,
  proyectarPublico,
} from '../packages/apps-script/simulacro/entorno.mjs'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))

/** Siembra la hoja con los datos de ejemplo, más contacto para probar privacidad. */
function hojasIniciales() {
  const csv = readFileSync(join(RAIZ, 'packages/app/public/demo/edificaciones.csv'), 'utf8')
  const filas = filasComoObjetos(csv).map((f, i) =>
    filaEdificacion({
      ...f,
      // La hoja maestra sí tiene contacto; la pestaña `publico` es la que no.
      contacto_nombre: `Contacto ${i + 1}`,
      contacto_telefono: `30012345${String(i).padStart(2, '0')}`,
    }),
  )
  return {
    edificaciones: [COLUMNAS_EDIFICACIONES, ...filas],
    cuadrillas: [['codigo'], ['C-01'], ['C-03'], ['C-07'], ['C-11']],
    coordinacion: [['codigo'], ['C-01']],
  }
}

export function levantarServidorSimulado(puerto = 4182) {
  const entorno = crearEntorno({ hojas: hojasIniciales() })
  const peticiones = []

  const servidor = createServer((peticion, respuesta) => {
    const cabeceras = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    }

    if (peticion.url?.startsWith('/publico.csv')) {
      respuesta.writeHead(200, { ...cabeceras, 'Content-Type': 'text/csv; charset=utf-8' })
      respuesta.end(proyectarPublico(entorno.libro))
      return
    }

    if (peticion.method === 'POST' && peticion.url?.startsWith('/exec')) {
      let cuerpo = ''
      peticion.on('data', (trozo) => (cuerpo += trozo))
      peticion.on('end', () => {
        let salida
        try {
          const envio = JSON.parse(cuerpo)
          peticiones.push(envio)
          salida = entorno.doPost(envio)
        } catch (error) {
          salida = { ok: false, error: 'error_interno', detalle: String(error) }
        }
        respuesta.writeHead(200, { ...cabeceras, 'Content-Type': 'application/json' })
        respuesta.end(JSON.stringify(salida))
      })
      return
    }

    respuesta.writeHead(404, cabeceras)
    respuesta.end('')
  })

  return new Promise((resolver) => {
    servidor.listen(puerto, () => {
      resolver({
        entorno,
        peticiones,
        url: `http://localhost:${puerto}`,
        urlCsv: `http://localhost:${puerto}/publico.csv`,
        urlEnvios: `http://localhost:${puerto}/exec`,
        fila: (id) => entorno.libro.comoObjetos('edificaciones').find((f) => f.id === id),
        bitacora: () => entorno.libro.comoObjetos('log'),
        cerrar: () => new Promise((r) => servidor.close(r)),
      })
    })
  })
}
