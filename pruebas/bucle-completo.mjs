/**
 * El recorrido entero, sin simulacros de respuesta: navegador → `doPost` real
 * → hoja → CSV publicado → mapa.
 *
 * Hasta ahora las pruebas de navegador hablaban con una ruta interceptada que
 * siempre contestaba «ok»: probaban la aplicación, no el servidor. Aquí corre
 * el mismo código que se pega en Apps Script, sobre una hoja simulada, y lo que
 * la cuadrilla ve al refrescar sale de esa hoja de verdad.
 *
 * Uso: pnpm bucle
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { levantarServidorSimulado } from './servidor-simulado.mjs'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const PUERTO_APP = 4183
const PUERTO_HOJA = 4182

const resultados = []
const comprobar = (titulo, condicion, detalle = '') => {
  resultados.push({ titulo, ok: Boolean(condicion), detalle })
  console.log(`  ${condicion ? '✓' : '✗'} ${titulo}${detalle ? ` — ${detalle}` : ''}`)
}

function ejecutar(orden, argumentos, entorno) {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(orden, argumentos, {
      cwd: RAIZ,
      stdio: 'ignore',
      env: { ...process.env, ...entorno },
    })
    proceso.on('exit', (codigo) => (codigo === 0 ? resolver() : rechazar(new Error(`${orden} falló`))))
  })
}

async function esperarServidor(url) {
  for (let intento = 0; intento < 60; intento++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* aún no */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No respondió ${url}`)
}

const hoja = await levantarServidorSimulado(PUERTO_HOJA)
console.log(`\nHoja simulada en ${hoja.url} — corriendo Codigo.gs de verdad`)

// La aplicación se construye apuntando a esa hoja: mismas variables que en producción.
console.log('Construyendo la aplicación contra la hoja simulada…')
await ejecutar('pnpm', ['--filter', '@dania/app', 'build'], {
  VITE_CSV_URL: hoja.urlCsv,
  VITE_ENVIOS_URL: hoja.urlEnvios,
})

const servidorApp = spawn('pnpm', ['--filter', '@dania/app', 'preview', '--port', String(PUERTO_APP)], {
  cwd: RAIZ,
  stdio: 'ignore',
})
await esperarServidor(`http://localhost:${PUERTO_APP}/`)

const navegador = await chromium.launch()
const contexto = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ['geolocation'],
  geolocation: { latitude: 3.4712, longitude: -76.5378, accuracy: 8 },
})
const pagina = await contexto.newPage()
const errores = []
pagina.on('pageerror', (e) => errores.push(e.message))

try {
  await pagina.goto(`http://localhost:${PUERTO_APP}/`, { waitUntil: 'networkidle' })
  await pagina.waitForSelector('.d-marcador')

  const objetivo = hoja
    .bitacora()
    .length === 0
    ? hoja.entorno.libro
        .comoObjetos('edificaciones')
        .find((f) => f.estado === 'NARANJA' && !f.reclamada_por && f.lat_reporte)
    : null
  if (!objetivo) throw new Error('La hoja simulada no tiene una pendiente libre')

  console.log(`\nObjetivo: ${objetivo.id} — ${objetivo.direccion_texto}\n`)

  // ── El CSV que ve la aplicación sale de la hoja, sin datos de contacto
  const csv = await (await fetch(hoja.urlCsv)).text()
  comprobar('el CSV publicado no lleva columnas de contacto', !csv.includes('contacto_'))
  comprobar('y tampoco un teléfono suelto', !/\b30012345\d{2}\b/.test(csv))
  const cuerpo = (await pagina.locator('body').textContent()) ?? ''
  comprobar('la pantalla tampoco los muestra', !cuerpo.includes('Contacto 1'))

  // ── Reclamar: del navegador a la hoja
  const ponerCodigo = async (codigo) => {
    await pagina.locator('.d-cuadrilla').first().click()
    await pagina.getByLabel('Código de cuadrilla').fill(codigo)
    await pagina.getByRole('button', { name: 'Listo' }).click()
  }
  await ponerCodigo('C-07')

  const abrirPorId = async (id) => {
    await pagina.getByRole('button', { name: /^Filtros/ }).click()
    await pagina.getByLabel('Buscar dirección o id').fill(id)
    await pagina.getByRole('button', { name: /^Ver \d+ edificaci/ }).click()
    await pagina.getByRole('button', { name: 'Lista', exact: true }).click()
    await pagina.locator('.d-lista__principal').first().click()
    await pagina.waitForSelector('.d-ficha')
  }

  await abrirPorId(objetivo.id)
  await pagina.getByRole('button', { name: 'Reclamar', exact: true }).click()
  await pagina.waitForTimeout(1200)

  comprobar('el reclamo llegó a la hoja', hoja.fila(objetivo.id).reclamada_por === 'C-07',
    `reclamada_por = ${hoja.fila(objetivo.id).reclamada_por || '(vacío)'}`)
  comprobar('quedó registrado como aplicado en la bitácora',
    hoja.bitacora().some((f) => f.tipo === 'reclamar' && f.aplicado === 'si'))

  // ── Caracterizar y comprobar que el CSV lo refleja
  await pagina.getByRole('button', { name: 'Caracterizar' }).click()
  await pagina.getByLabel('Caracterización').fill('Grietas en juntas de dilatación, tres niveles.')
  await pagina.getByLabel('Torres').fill('4')
  await pagina.getByLabel('Apts por torre').fill('30')
  await pagina.getByLabel('Ocupación').fill('varía')
  await pagina.getByRole('button', { name: 'Guardar visita' }).click()
  await pagina.waitForTimeout(1500)

  const guardada = hoja.fila(objetivo.id)
  comprobar('la caracterización quedó escrita en la hoja', guardada.estado === 'VERDE',
    `estado = ${guardada.estado}`)
  comprobar('con torres, apartamentos y ocupación «varía»',
    String(guardada.num_torres) === '4' && String(guardada.apts_por_torre) === '30' && guardada.ocupacion === 'varía')
  comprobar('el reclamo se liberó al cerrar la visita', guardada.reclamada_por === '')
  comprobar('la ubicación se adjuntó sola desde el GPS',
    Math.abs(Number(guardada.lat_visita) - 3.4712) < 0.01, `lat_visita = ${guardada.lat_visita}`)

  const csvTrasVisita = await (await fetch(hoja.urlCsv)).text()
  comprobar('el CSV publicado ya la trae como visitada',
    csvTrasVisita.split('\n').some((l) => l.startsWith(objetivo.id) && l.includes('VERDE')))

  // ── Refrescar: lo que ve la cuadrilla viene de la hoja, no de la cola
  await pagina.getByRole('button', { name: 'Cerrar' }).last().click()
  await pagina.getByRole('button', { name: /Datos de las|Actualizar/ }).click()
  await pagina.waitForTimeout(1500)
  await abrirPorId(objetivo.id)
  const fichaTrasRefresco = (await pagina.locator('.d-ficha').textContent()) ?? ''
  comprobar('tras refrescar, la ficha muestra lo que está en la hoja',
    fichaTrasRefresco.includes('Visitada') && fichaTrasRefresco.includes('juntas de dilatación'))
  await pagina.getByRole('button', { name: 'Cerrar' }).last().click()

  // ── Sin señal y reintento: nada se pierde, nada se duplica
  const enviosAntes = hoja.peticiones.length
  await contexto.setOffline(true)
  const segunda = hoja.entorno.libro
    .comoObjetos('edificaciones')
    .find((f) => f.estado === 'NARANJA' && !f.reclamada_por && f.lat_reporte)
  await abrirPorId(segunda.id)
  await pagina.getByRole('button', { name: 'Reclamar', exact: true }).click()
  await pagina.waitForTimeout(500)
  comprobar('sin señal no salió nada', hoja.peticiones.length === enviosAntes)
  await pagina.getByRole('button', { name: 'Cerrar' }).last().click()

  await contexto.setOffline(false)
  await pagina.waitForSelector('.d-cola', { state: 'detached', timeout: 20000 })
  comprobar('al volver la red el reclamo llegó a la hoja',
    hoja.fila(segunda.id).reclamada_por === 'C-07')

  const uuids = hoja.peticiones.map((e) => e.uuid)
  comprobar('ningún envío se mandó dos veces', new Set(uuids).size === uuids.length,
    `${uuids.length} envíos, ${new Set(uuids).size} uuids`)
  const aplicados = hoja.bitacora().filter((f) => f.aplicado === 'si')
  comprobar('la hoja aplicó cada envío una sola vez',
    aplicados.length === new Set(aplicados.map((f) => f.uuid)).size)

  comprobar('sin errores de consola', errores.length === 0, errores.slice(0, 2).join(' | '))
} finally {
  await navegador.close()
  servidorApp.kill()
  await hoja.cerrar()
}

const fallos = resultados.filter((r) => !r.ok)
console.log(`\n${'─'.repeat(60)}`)
console.log(`${resultados.length - fallos.length}/${resultados.length} comprobaciones pasaron`)
console.log('Recorrido: navegador → doPost (código real) → hoja → CSV publicado → mapa')
process.exit(fallos.length === 0 ? 0 : 1)
