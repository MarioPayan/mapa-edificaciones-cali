/**
 * Recorre los casos de uso del plan (CU-01…CU-11) contra la aplicación construida.
 *
 * Levanta `vite preview` sobre `packages/app/dist`, simula el `doPost` con una
 * ruta interceptada y ejecuta cada CU como lo haría una persona. Al final
 * imprime una tabla de resultados y sale con código ≠ 0 si algo falla.
 *
 * Uso:  pnpm e2e        (construye y ejecuta)
 *       node pruebas/casos-de-uso.mjs [url]   (contra una URL ya desplegada)
 *
 * Nota: `context.setOffline(true)` NO afecta a las rutas interceptadas — se
 * responden localmente. Por eso el manejador aborta explícitamente cuando la
 * prueba dice que no hay señal.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { filasComoObjetos } from '../packages/data/src/csv.ts'

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PUERTO = 4180
const urlExterna = process.argv[2]
const BASE = urlExterna ?? `http://localhost:${PUERTO}/`
/** Con URL externa se prueba lo desplegado: sin endpoint de escritura, en modo práctica. */
const CON_ENDPOINT = !urlExterna

const resultados = []
let servidor = null

function ok(cu, titulo, detalle = '') {
  resultados.push({ cu, titulo, estado: 'ok', detalle })
  console.log(`  ✓ ${cu} ${titulo}${detalle ? ` — ${detalle}` : ''}`)
}

function fallo(cu, titulo, detalle) {
  resultados.push({ cu, titulo, estado: 'FALLA', detalle })
  console.log(`  ✗ ${cu} ${titulo} — ${detalle}`)
}

function comprobar(cu, titulo, condicion, detalle = '') {
  if (condicion) ok(cu, titulo, detalle)
  else fallo(cu, titulo, detalle || 'no se cumplió')
}

async function levantarServidor() {
  if (urlExterna) return
  servidor = spawn('pnpm', ['--filter', '@dania/app', 'preview', '--port', String(PUERTO)], {
    cwd: RAIZ,
    stdio: 'ignore',
  })
  for (let intento = 0; intento < 40; intento++) {
    try {
      const r = await fetch(BASE)
      if (r.ok) return
    } catch {
      /* todavía no levanta */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('El servidor de vista previa no respondió')
}

const main = async () => {
  await levantarServidor()

  const navegador = await chromium.launch()
  const contexto = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['geolocation'],
    // Un punto cualquiera de Cali: el GPS del teléfono de la cuadrilla.
    geolocation: { latitude: 3.4712, longitude: -76.5378, accuracy: 8 },
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
  })

  let sinSenal = false
  let respuestaFalsa = { ok: true }
  const recibidos = []
  if (CON_ENDPOINT) {
    await contexto.route('**/envios-prueba', async (ruta) => {
      if (sinSenal) return ruta.abort('internetdisconnected')
      recibidos.push(JSON.parse(ruta.request().postData() ?? '{}'))
      await ruta.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(respuestaFalsa),
      })
    })
  }

  const pagina = await contexto.newPage()
  const erroresConsola = []
  pagina.on('pageerror', (e) => erroresConsola.push(`pageerror: ${e.message}`))
  pagina.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) {
      erroresConsola.push(m.text())
    }
  })

  const irAlInicio = async () => {
    await pagina.goto(BASE, { waitUntil: 'networkidle' })
    await pagina.waitForSelector('.d-marcador')
  }

  const ponerCodigo = async (codigo) => {
    // En modo práctica ya viene una cuadrilla puesta; el botón la cambia igual.
    await pagina.locator('.d-cuadrilla').first().click()
    await pagina.getByLabel('Código de cuadrilla').fill(codigo)
    await pagina.getByRole('button', { name: 'Listo' }).click()
    await pagina.waitForTimeout(200)
  }

  const verMapa = async () => {
    await pagina.getByRole('button', { name: 'Mapa', exact: true }).click()
    await pagina.waitForTimeout(300)
  }

  /**
   * Abre la ficha desde la lista, no desde el mapa: un marcador puede quedar
   * debajo del panel de coordinación y el click no llega. La lista siempre está.
   */
  const abrirPorBusqueda = async (texto) => {
    await buscar(texto)
    await pagina.getByRole('button', { name: 'Lista', exact: true }).click()
    await pagina.waitForSelector('.d-lista__fila')
    await pagina.locator('.d-lista__principal').first().click()
    await pagina.waitForSelector('.d-ficha')
  }

  /** Los filtros de zona viven en un diálogo para no comerse el mapa. */
  const abrirFiltros = async () => {
    await pagina.getByRole('button', { name: /^Filtros/ }).click()
    await pagina.waitForSelector('.d-filtros')
  }

  const cerrarFiltros = async () => {
    await pagina.getByRole('button', { name: /^Ver \d+ edificaci/ }).click()
    await pagina.waitForSelector('.d-filtros', { state: 'detached' })
  }

  const buscar = async (texto) => {
    await abrirFiltros()
    await pagina.getByLabel('Buscar dirección o id').fill(texto)
    await cerrarFiltros()
    await pagina.waitForTimeout(300)
  }

  /** El filtro de estado son los propios contadores. */
  const contador = (etiqueta) => pagina.locator('.d-contadores button', { hasText: etiqueta })

  const filtrarPorEstado = async (etiqueta, queremosActivo) => {
    const boton = contador(etiqueta)
    const activo = (await boton.getAttribute('aria-pressed')) === 'true'
    if (activo !== queremosActivo) {
      await boton.click()
      await pagina.waitForTimeout(300)
    }
  }

  /** Deja los filtros como al abrir: los CU siguientes no heredan el estado. */
  const limpiarFiltros = async () => {
    for (const etiqueta of ['Colapsada', 'Por visitar', 'Visitada']) {
      await filtrarPorEstado(etiqueta, false)
    }
    await abrirFiltros()
    await pagina.getByRole('button', { name: 'Quitar filtros' }).click()
    await cerrarFiltros()
    await pagina.waitForTimeout(300)
  }

  /**
   * Toca el mapa por coordenadas reales del recuadro: el aviso «toque el mapa»
   * y el panel de coordinación se superponen al contenedor y bloquean un click
   * ciego en el centro.
   */
  const tocarMapa = async (fx = 0.3, fy = 0.5) => {
    // El fondo del diálogo que se acaba de cerrar puede seguir un instante en
    // pantalla; en un servidor remoto se nota más que en local.
    await pagina.waitForSelector('.d-ficha-fondo', { state: 'detached' }).catch(() => {})

    // Se busca un punto donde el mapa esté realmente encima: el aviso de «toque
    // el mapa» se le superpone y un click ciego aterriza en él.
    const buscarPunto = () =>
      pagina.evaluate(
        ([fx, fy]) => {
          const caja = document.querySelector('.d-mapa').getBoundingClientRect()
          const candidatos = [[fx, fy], [fx, 0.75], [0.15, 0.7], [0.8, 0.65], [0.5, 0.85]]
          for (const [cx, cy] of candidatos) {
            const x = caja.x + caja.width * cx
            const y = caja.y + caja.height * cy
            const encima = document.elementFromPoint(x, y)
            if (encima?.closest('.leaflet-container')) return { x, y }
          }
          return null
        },
        [fx, fy],
      )

    let punto = null
    for (let intento = 0; intento < 10 && !punto; intento++) {
      punto = await buscarPunto()
      if (!punto) await pagina.waitForTimeout(200)
    }
    if (!punto) throw new Error('No hay ningún punto del mapa libre para tocar')
    await pagina.mouse.click(punto.x, punto.y)
  }

  /** El panel de coordinación puede venir abierto (modo práctica) o cerrado. */
  /** Abre el diálogo de coordinación (y enciende el modo si estaba apagado). */
  const abrirCoordinacion = async () => {
    await pagina.getByRole('button', { name: 'Coordinación', exact: true }).click()
    await pagina.waitForSelector('.d-coordinacion')
  }

  const cerrarFicha = async () => {
    const cerrar = pagina.getByRole('button', { name: 'Cerrar' }).last()
    if (await cerrar.isVisible().catch(() => false)) await cerrar.click()
    await pagina.waitForSelector('.d-ficha', { state: 'detached' }).catch(() => {})
  }

  // Los objetivos salen del CSV que sirve la aplicación, no de direcciones
  // escritas a mano: así los datos de ejemplo pueden cambiar sin romper esto.
  const filas = filasComoObjetos(await (await fetch(new URL('demo/edificaciones.csv', BASE))).text())
  const exigir = (predicado, queEs) => {
    const fila = filas.find(predicado)
    if (!fila) throw new Error(`Los datos de ejemplo no traen ${queEs}`)
    return fila
  }
  const objetivo = {
    visitada: exigir((f) => f.estado === 'VERDE' && f.caracterizacion, 'una visitada con caracterización'),
    libre: exigir(
      (f) => f.estado === 'NARANJA' && !f.reclamada_por && f.lat_reporte && !f.observaciones,
      'una pendiente libre y ubicada',
    ),
    colapsada: exigir((f) => f.estado === 'ROJO' && f.rescatadas_en_sitio, 'una colapsada con rescatadas'),
    duplicada: exigir((f) => /fusionar/i.test(f.observaciones ?? ''), 'un reporte duplicado'),
  }
  // Otra pendiente libre distinta de la primera, para no pisar los pasos.
  const libres = filas.filter(
    (f) => f.estado === 'NARANJA' && !f.reclamada_por && f.lat_reporte && !f.observaciones,
  )
  objetivo.libre2 = libres[1] ?? objetivo.libre
  objetivo.libre3 = libres[2] ?? objetivo.libre
  objetivo.libre4 = libres[3] ?? objetivo.libre
  objetivo.paraOtraCuadrilla = libres[4] ?? objetivo.libre

  console.log(`\nProbando ${BASE}${CON_ENDPOINT ? '' : ' (desplegado, modo práctica)'}`)
  console.log(`Datos: ${filas.length} edificaciones · objetivos ${Object.entries(objetivo).map(([k, v]) => `${k}=${v.id}`).join(' ')}\n`)

  // ─────────────────────────────────────────────────────────────── CU-02
  console.log('CU-02 — Coordinación consulta el panorama general')
  await irAlInicio()
  const totalMarcadores = await pagina.locator('.leaflet-marker-icon .d-marcador').count()
  const contadores = await pagina.locator('.d-contador__numero').allTextContents()
  comprobar('CU-02', 'el mapa pinta los puntos del CSV', totalMarcadores >= 10, `${totalMarcadores} marcadores`)
  comprobar('CU-02', 'hay contadores por estado', contadores.length >= 3, contadores.join('/'))

  await abrirFiltros()
  await pagina.getByRole('combobox', { name: 'Todas las comunas' }).click()
  await pagina.waitForTimeout(250)
  const opcionesComuna = await pagina.locator('.d-select-item').allTextContents()
  await pagina.keyboard.press('Escape')
  await cerrarFiltros()
  comprobar('CU-02', 'se puede filtrar por las 22 comunas', opcionesComuna.length === 23,
    `${opcionesComuna.length - 1} comunas`)

  const alturaMapa = (await pagina.locator('.d-mapa').boundingBox())?.height ?? 0
  const alto = pagina.viewportSize()?.height ?? 1
  comprobar('CU-02', 'el mapa se queda con la mayor parte de la pantalla',
    alturaMapa / alto > 0.6, `${Math.round((100 * alturaMapa) / alto)}% del alto`)

  // ─────────────────────────────────────────────────────────────── CU-10
  console.log('CU-10 — Consultar la ficha de un punto')
  await abrirPorBusqueda(objetivo.visitada.id)
  const textoFicha = (await pagina.locator('.d-ficha').textContent()) ?? ''
  comprobar('CU-10', 'la ficha muestra estado y caracterización',
    textoFicha.includes('Visitada') && textoFicha.includes(objetivo.visitada.caracterizacion.slice(0, 30)))
  comprobar('CU-10', 'muestra el barrio y la comuna del punto',
    textoFicha.includes(objetivo.visitada.barrio) && textoFicha.includes(objetivo.visitada.comuna))
  comprobar('CU-10', 'no muestra datos de contacto',
    !/tel[ée]fono|contacto|@/i.test(textoFicha))
  await cerrarFicha()

  // ─────────────────────────────────────────────── CU-10 (privacidad dura)
  // Se sirve un CSV con columnas de contacto: no deben llegar a la pantalla.
  await contexto.route('**/demo/edificaciones.csv', (ruta) =>
    ruta.fulfill({
      status: 200,
      contentType: 'text/csv',
      body:
        'id,direccion_texto,barrio,comuna,lat_reporte,lon_reporte,estado,contacto_nombre,contacto_telefono\n' +
        'D-9001,Calle de prueba 1,Los Cristales,02,3.4712,-76.5378,NARANJA,Ana Pérez,3001234567\n',
    }),
  )
  await irAlInicio()
  const cuerpo = (await pagina.locator('body').textContent()) ?? ''
  comprobar('CU-10', 'un CSV con datos personales no los muestra',
    !cuerpo.includes('3001234567') && !cuerpo.includes('Ana Pérez'))
  comprobar('CU-10', 'y avisa que la publicación está mal hecha',
    cuerpo.includes('datos personales'))
  await contexto.unroute('**/demo/edificaciones.csv')
  await irAlInicio()

  // ─────────────────────────────────────────────────────────────── CU-03
  console.log('CU-03 — La cuadrilla arma su jornada por sector')
  await ponerCodigo('C-07')
  await filtrarPorEstado('Por visitar', true)
  await pagina.getByRole('button', { name: 'Lista', exact: true }).click()
  await pagina.waitForSelector('.d-lista')
  const filasVisibles = await pagina.locator('.d-lista__fila').count()
  comprobar('CU-03', 'la lista muestra las pendientes del filtro', filasVisibles >= 4,
    `${filasVisibles} filas`)

  const botonesReclamar = pagina.locator('.d-lista__fila button:not([disabled])', { hasText: 'Reclamar' })
  const reclamables = await botonesReclamar.count()
  comprobar('CU-03', 'se puede reclamar desde la lista, sin abrir cada ficha', reclamables >= 2,
    `${reclamables} disponibles`)
  // Reclamar dos concretas antes de salir, como en el flujo del CU.
  for (const fila of [objetivo.libre3, objetivo.libre4]) {
    await pagina.getByRole('button', { name: `Reclamar ${fila.direccion_texto}` }).click()
    await pagina.waitForTimeout(400)
  }
  const mias = await pagina.locator('.d-lista__mia').count()
  comprobar('CU-03', 'las reclamadas quedan marcadas como suyas', mias >= 2, `${mias} marcadas`)

  // ─────────────────────────────────────────────────────────────── CU-04
  console.log('CU-04 — Reclamar una edificación')
  await verMapa()
  const conAnillo = await pagina.locator('.d-marcador[data-reclamada="true"]').count()
  comprobar('CU-04', 'la reclamada se distingue en el mapa sin ser un cuarto color', conAnillo >= 1,
    `${conAnillo} con anillo`)

  // La situación se crea aquí en vez de leerla de los datos de ejemplo: un
  // reclamo del CSV envejece y a las 4 h la aplicación lo muestra libre, que es
  // justo lo que debe hacer.
  await ponerCodigo('C-03')
  await abrirPorBusqueda(objetivo.paraOtraCuadrilla.id)
  await pagina.getByRole('button', { name: 'Reclamar', exact: true }).click()
  await pagina.waitForTimeout(500)
  await cerrarFicha()

  await ponerCodigo('C-07')
  await abrirPorBusqueda(objetivo.paraOtraCuadrilla.id)
  const ajena = (await pagina.locator('.d-ficha').textContent()) ?? ''
  comprobar('CU-04', 'una reclamada por otra cuadrilla no se puede tomar',
    ajena.includes('Reclamada por otra') && ajena.includes('C-03'))
  await cerrarFicha()

  if (CON_ENDPOINT) {
    // CU-04 alt.: el servidor tiene la última palabra aunque el CSV esté viejo.
    respuestaFalsa = { ok: false, error: 'reclamada_por_C-03' }
    await abrirPorBusqueda(objetivo.libre2.id)
    await pagina.getByRole('button', { name: 'Reclamar', exact: true }).click()
    await cerrarFicha()
    await pagina.waitForSelector('.d-cola__fila--rechazo', { timeout: 10000 })
    const rechazo = (await pagina.locator('.d-cola__fila--rechazo').textContent()) ?? ''
    comprobar('CU-08', 'el servidor rechaza el reclamo y lo explica en castellano',
      rechazo.includes('ya la tenía la cuadrilla C-03'))
    await pagina.getByRole('button', { name: 'Entendido' }).click()
    respuestaFalsa = { ok: true }
  }

  // ─────────────────────────────────────────────────────────────── CU-05
  console.log('CU-05 — Corregir en campo una dirección errada')
  await abrirPorBusqueda(objetivo.libre.id)
  const antesDeUbicar = (await pagina.locator('.d-ficha').textContent()) ?? ''
  comprobar('CU-05', 'avisa que la ubicación es aproximada', antesDeUbicar.includes('aproximada'))
  await pagina.getByRole('button', { name: 'Estoy aquí' }).click()
  await pagina.getByLabel('Referencia (opcional)').fill('Torre B, entrada por la 58N')
  await pagina.getByRole('button', { name: 'Tomar el punto aquí' }).click()
  await pagina.waitForTimeout(800)
  const trasUbicar = (await pagina.locator('.d-ficha').textContent()) ?? ''
  comprobar('CU-05', 'tras tomar el GPS ya no dice «aproximada»', !trasUbicar.includes('aproximada'))
  comprobar('CU-05', 'la referencia queda en las observaciones', trasUbicar.includes('Torre B'))
  if (CON_ENDPOINT) {
    const ubicar = recibidos.find((e) => e.tipo === 'ubicar')
    comprobar('CU-05', 'el envío lleva la coordenada del teléfono',
      Math.abs((ubicar?.datos?.lat ?? 0) - 3.4712) < 0.01, JSON.stringify(ubicar?.datos))
  }
  await cerrarFicha()

  // ─────────────────────────────────────────────────────────────── CU-06
  console.log('CU-06 — Caracterizar en sitio y cerrar la visita')
  await abrirPorBusqueda(objetivo.libre3.id)
  await pagina.getByRole('button', { name: 'Caracterizar' }).click()
  await pagina.getByLabel('Caracterización').fill('Grietas diagonales en la caja de escaleras.')
  await pagina.getByLabel('Torres').fill('2')
  await pagina.getByLabel('Apts por torre').fill('18')
  await pagina.getByLabel('Ocupación').fill('varía')
  await pagina.getByRole('button', { name: 'Guardar visita' }).click()
  await pagina.waitForTimeout(900)
  const trasCaracterizar = (await pagina.locator('.d-ficha').textContent()) ?? ''
  comprobar('CU-06', 'la edificación queda VISITADA', trasCaracterizar.includes('Visitada'))
  comprobar('CU-06', '«varía» es un valor aceptado', trasCaracterizar.includes('varía'))
  comprobar('CU-06', 'guarda torres × apartamentos', /2 torres/.test(trasCaracterizar))
  if (CON_ENDPOINT) {
    const caracterizar = recibidos.filter((e) => e.tipo === 'caracterizar').pop()
    comprobar('CU-06', 'el envío lleva la caracterización y la cuadrilla',
      caracterizar?.datos?.ocupacion === 'varía' && caracterizar?.cuadrilla === 'C-07',
      JSON.stringify({ cuadrilla: caracterizar?.cuadrilla, datos: caracterizar?.datos }))
    // CU-06.4: si nadie corrigió la ubicación antes, se captura al caracterizar.
    const ubicaciones = recibidos.filter((e) => e.tipo === 'ubicar')
    comprobar('CU-06', 'adjunta la ubicación automáticamente si faltaba',
      ubicaciones.length >= 2, `${ubicaciones.length} envíos de ubicación`)
  }
  await cerrarFicha()

  // ─────────────────────────────────────────────────────────────── CU-09
  console.log('CU-09 — Marcar una edificación colapsada')
  await limpiarFiltros()
  await abrirPorBusqueda(objetivo.libre4.id)
  await pagina.getByRole('button', { name: 'Marcar colapsada' }).click()
  await pagina.getByLabel('Personas rescatadas en sitio').fill('6')
  await pagina.getByLabel('¿Quién lo informó?').fill('cuadrilla C-07 en sitio')
  await pagina.getByRole('button', { name: 'Marcar como colapsada' }).click()
  await pagina.waitForTimeout(700)
  const trasColapsar = (await pagina.locator('.d-ficha').textContent()) ?? ''
  comprobar('CU-09', 'queda COLAPSADA', trasColapsar.includes('Colapsada'))
  comprobar('CU-09', 'muestra rescatadas con su fuente',
    trasColapsar.includes('6') && trasColapsar.includes('cuadrilla C-07 en sitio'))
  await cerrarFicha()

  // Una colapsada sin dato dice «sin dato», no cero.
  await abrirPorBusqueda(objetivo.colapsada.id)
  const colapsadaConDato = (await pagina.locator('.d-ficha').textContent()) ?? ''
  comprobar('CU-09', 'las colapsadas previas conservan su dato de rescatadas',
    colapsadaConDato.includes(objetivo.colapsada.rescatadas_en_sitio))
  await cerrarFicha()

  // ─────────────────────────────────────────────────────────────── CU-11
  console.log('CU-11 — Coordinación ubica reportes y fusiona duplicados')
  await buscar('')
  await verMapa()
  const antesDeUbicarMapa = await pagina.locator('.leaflet-marker-icon').count()

  await abrirCoordinacion()
  const panel = (await pagina.locator('.d-coordinacion').textContent()) ?? ''
  comprobar('CU-11', 'lista los reportes sin ubicar', /sin ubicar/.test(panel))

  // Elegir «Ubicar» cierra el diálogo y deja el mapa esperando el toque.
  await pagina.locator('.d-coordinacion').getByRole('button', { name: 'Ubicar' }).first().click()
  await pagina.waitForSelector('.d-coordinacion', { state: 'detached' })
  await pagina.waitForSelector('.d-modo-punto')
  comprobar('CU-11', 'pide tocar el mapa para ubicar',
    ((await pagina.locator('.d-modo-punto').textContent()) ?? '').includes('Toque dónde está'))
  await tocarMapa(0.3, 0.55)
  await pagina.waitForTimeout(700)
  const despuesDeUbicarMapa = await pagina.locator('.leaflet-marker-icon').count()
  comprobar('CU-11', 'el reporte sin ubicar entra al mapa',
    despuesDeUbicarMapa === antesDeUbicarMapa + 1,
    `${antesDeUbicarMapa} → ${despuesDeUbicarMapa}`)

  // Fusionar el segundo reporte de la misma torre con el principal.
  await abrirPorBusqueda(objetivo.duplicada.id)
  await pagina.getByRole('button', { name: 'Es duplicada' }).click()
  const opciones = pagina.locator('.d-formulario select.d-input')
  await opciones.selectOption({ index: 1 })
  const antesDeFusionar = await pagina.locator('.leaflet-marker-icon').count()
  await pagina.getByRole('button', { name: 'Fusionar' }).click()
  await pagina.waitForTimeout(700)
  await cerrarFicha()
  await buscar('')
  await verMapa()
  const duplicadoFuera = await pagina
    .locator(`.leaflet-marker-icon[title*="${objetivo.duplicada.direccion_texto}"]`)
    .count()
  comprobar('CU-11', 'el duplicado sale del mapa', duplicadoFuera === 0,
    `${antesDeFusionar} marcadores antes de fusionar`)

  // Crear una edificación que nadie reportó (CU-09, flujo principal 1).
  await abrirCoordinacion()
  await pagina.locator('.d-coordinacion').getByRole('button', { name: 'Crear edificación' }).click()
  await pagina.waitForSelector('.d-modo-punto')
  await tocarMapa(0.65, 0.45)
  await pagina.waitForSelector('.d-ficha')
  await pagina.getByLabel('Dirección', { exact: true }).fill('Calle nueva 1-23 (ejemplo)')
  await pagina.getByRole('button', { name: 'Crear', exact: true }).click()
  await pagina.waitForTimeout(700)
  const trasCrear = await pagina.locator('.leaflet-marker-icon').count()
  comprobar('CU-09', 'coordinación puede crear una edificación sin reporte previo',
    trasCrear >= despuesDeUbicarMapa, `${trasCrear} marcadores`)
  if (CON_ENDPOINT) {
    const crear = recibidos.find((e) => e.tipo === 'crear')
    comprobar('CU-11', 'el envío de creación lleva coordenada y dirección',
      Boolean(crear?.datos?.direccionTexto && crear?.datos?.lat))
  }

  // ─────────────────────────────────────────────────────────────── CU-07
  if (CON_ENDPOINT) {
    console.log('CU-07 — Enviar sin señal (cola offline)')
    const enviadosAntes = recibidos.length
    sinSenal = true
    await contexto.setOffline(true)

    await abrirPorBusqueda(objetivo.libre2.id)
    await pagina.getByRole('button', { name: 'Reclamar', exact: true }).click()
    await pagina.waitForTimeout(300)
    await pagina.getByRole('button', { name: 'Caracterizar' }).click()
    await pagina.getByLabel('Caracterización').fill('Fisuras en el muro de la escalera.')
    await pagina.getByRole('button', { name: 'Guardar visita' }).click()
    await pagina.waitForTimeout(500)

    const barraCola = (await pagina.locator('.d-cola__texto').first().textContent()) ?? ''
    comprobar('CU-07', 'la cola muestra lo pendiente y que no hay señal',
      barraCola.includes('sin enviar') && barraCola.includes('sin señal'), barraCola.trim())
    comprobar('CU-07', 'nada sale del teléfono mientras no hay red',
      recibidos.length === enviadosAntes)
    const fichaSinSenal = (await pagina.locator('.d-ficha').textContent()) ?? ''
    comprobar('CU-07', 'el cambio se ve igual, sin esperar al servidor',
      fichaSinSenal.includes('Visitada'))
    await cerrarFicha()

    sinSenal = false
    await contexto.setOffline(false)
    await pagina.waitForSelector('.d-cola', { state: 'detached', timeout: 20000 })
    const nuevos = recibidos.slice(enviadosAntes)
    comprobar('CU-07', 'al volver la red se envía todo lo pendiente', nuevos.length >= 2,
      nuevos.map((e) => e.tipo).join(', '))
    const uuids = new Set(recibidos.map((e) => e.uuid))
    comprobar('CU-07', 'ningún envío se duplica (uuid único)', uuids.size === recibidos.length,
      `${recibidos.length} envíos, ${uuids.size} uuids`)
  }

  // ─────────────────────────────────────────────────────────────── CU-08
  console.log('CU-08 — Evitar una visita duplicada')
  await abrirPorBusqueda(objetivo.visitada.id)
  const yaVisitada = (await pagina.locator('.d-ficha').textContent()) ?? ''
  const puedeReclamarVisitada = await pagina
    .getByRole('button', { name: 'Reclamar', exact: true })
    .count()
  comprobar('CU-08', 'una edificación ya visitada no ofrece reclamar',
    puedeReclamarVisitada === 0 && yaVisitada.includes('Visitada'))
  await cerrarFicha()

  // ─────────────────────────────────────────────────────────────── CU-12
  console.log('CU-12 — Registrarse y recibir un código en autoservicio')
  // Contra lo desplegado (modo práctica) el código se asigna localmente: R-01.
  if (CON_ENDPOINT) respuestaFalsa = { ok: true, codigo: 'R-09' }
  const codigoEsperado = CON_ENDPOINT ? 'R-09' : 'R-01'
  await pagina.locator('.d-cuadrilla').first().click()
  await pagina.getByRole('button', { name: '¿Sin código? Regístrese' }).click()
  await pagina.getByLabel('Nombre').fill('Dania Prueba')
  await pagina.getByLabel('Teléfono').fill('3001112233')
  await pagina.getByRole('button', { name: 'Registrarme' }).click()
  const confirmacionRegistro = await pagina
    .waitForSelector(`text=${codigoEsperado}`, { timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  comprobar('CU-12', 'el registro devuelve un código al instante', confirmacionRegistro,
    codigoEsperado)
  await pagina.getByRole('button', { name: 'Listo', exact: true }).click()
  const encabezadoCuadrilla = (await pagina.locator('.d-cuadrilla').first().textContent()) ?? ''
  comprobar('CU-12', 'el código queda puesto como cuadrilla',
    encabezadoCuadrilla.includes(codigoEsperado), encabezadoCuadrilla.trim())
  if (CON_ENDPOINT) {
    const registroEnviado = recibidos[recibidos.length - 1]
    comprobar('CU-12', 'el envío lleva tipo registrar y el contacto',
      registroEnviado?.tipo === 'registrar' && registroEnviado?.datos?.telefono === '3001112233')
    respuestaFalsa = { ok: true }
  }
  // Los CU siguientes no heredan el código registrado.
  await ponerCodigo('C-07')

  // ─────────────────────────────────────────────────────────────── CU-13
  console.log('CU-13 — Un residente reporta su edificación, sin código')
  // CU-08 dejó la vista en Lista y una búsqueda activa: el conteo va sobre el mapa.
  await limpiarFiltros()
  await verMapa()
  const antesDeReportar = await pagina.locator('.leaflet-marker-icon .d-marcador').count()
  await pagina.getByRole('button', { name: 'Qué es esto y cómo se usa' }).click()
  await pagina.getByRole('button', { name: 'Reportar mi edificación' }).click()
  const gpsTomado = await pagina
    .waitForSelector('text=Ubicación tomada', { timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  comprobar('CU-13', 'el GPS se toma solo al abrir el formulario', gpsTomado)
  await pagina.getByLabel('Nombre').fill('Vecina Prueba')
  await pagina.getByLabel('Celular').fill('3025554433')
  await pagina.getByLabel('Dirección').fill('Calle 5 44-21')
  await pagina.getByRole('button', { name: 'Enviar reporte' }).click()
  const confirmado = await pagina
    .waitForSelector('text=Reporte enviado', { timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  comprobar('CU-13', 'el reporte se confirma sin pedir código ni cuenta', confirmado)
  await pagina.getByRole('button', { name: 'Listo', exact: true }).click()
  await pagina.waitForTimeout(400)
  const trasReportar = await pagina.locator('.leaflet-marker-icon .d-marcador').count()
  comprobar('CU-13', 'el punto del residente entra al mapa de inmediato',
    trasReportar === antesDeReportar + 1, `${antesDeReportar} → ${trasReportar}`)
  if (CON_ENDPOINT) {
    const reporteEnviado = recibidos[recibidos.length - 1]
    comprobar('CU-13', 'el envío lleva contacto y el GPS del teléfono',
      reporteEnviado?.tipo === 'reportar' &&
        reporteEnviado?.datos?.telefono === '3025554433' &&
        Math.abs(Number(reporteEnviado?.datos?.lat) - 3.4712) < 0.01)
  }

  // ────────────────────────────────────────── Conexión con la hoja (sin repo)
  console.log('Conexión — apuntar la aplicación a una hoja desde el teléfono')
  await pagina.goto(`${BASE}?csv=${encodeURIComponent('https://hoja-de-prueba.test/publico.csv')}`, {
    waitUntil: 'domcontentloaded',
  })
  const confirmacion = await pagina
    .waitForSelector('.d-ficha', { timeout: 10000 })
    .then(async () => (await pagina.locator('.d-ficha').textContent()) ?? '')
    .catch(() => '')
  comprobar('Conexión', 'un enlace con hoja pide confirmación antes de conectar',
    confirmacion.includes('¿Conectar esta hoja?') || confirmacion.includes('Conectar esta hoja'))
  comprobar('Conexión', 'y enseña a qué dominio se mandaría el trabajo de campo',
    confirmacion.includes('hoja-de-prueba.test'))
  await pagina.getByRole('button', { name: 'No, seguir como estaba' }).click()
  await pagina.waitForTimeout(400)
  comprobar('Conexión', 'al rechazarlo, el enlace se limpia de la barra de direcciones',
    !pagina.url().includes('csv='), pagina.url().slice(0, 60))

  const enlaceMalicioso = `${BASE}?csv=${encodeURIComponent('javascript:alert(1)')}`
  await pagina.goto(enlaceMalicioso, { waitUntil: 'domcontentloaded' })
  await pagina.waitForSelector('.d-marcador')
  comprobar('Conexión', 'una URL que no es https ni localhost no llega a proponerse',
    (await pagina.locator('.d-ficha').count()) === 0)

  await pagina.goto(BASE, { waitUntil: 'networkidle' })
  await pagina.waitForSelector('.d-marcador')

  // ────────────────────────────── Volver al ejemplo limpio tras la práctica
  if (!CON_ENDPOINT) {
    console.log('Práctica — poder deshacer lo que uno probó')
    await pagina.getByRole('button', { name: 'Qué es esto y cómo se usa' }).click()
    await pagina.waitForSelector('.d-ficha')
    const borrar = pagina.getByRole('button', { name: /^Borrar mis cambios/ })
    comprobar('Práctica', 'ofrece borrar lo que uno hizo probando', (await borrar.count()) > 0)
    if (await borrar.count()) {
      const antes = await pagina.locator('.d-contador__numero').first().textContent()
      await borrar.click()
      await pagina.waitForTimeout(600)
      const despues = await pagina.locator('.d-contador__numero').first().textContent()
      comprobar('Práctica', 'y al borrarlos el mapa vuelve al ejemplo', antes !== despues,
        `${antes} → ${despues}`)
    }
  }

  // ─────────────────────────────────────────────── PWA / sin señal al abrir
  console.log('PWA — abrir sin señal')
  const manifiesto = await pagina.evaluate(async (base) => {
    const r = await fetch(new URL('manifest.webmanifest', base))
    return r.ok ? (await r.json()).name : null
  }, BASE)
  comprobar('PWA', 'publica un manifiesto instalable', Boolean(manifiesto), manifiesto ?? 'sin manifiesto')

  const swListo = await pagina.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false
    const registro = await navigator.serviceWorker.ready
    return Boolean(registro.active)
  })
  comprobar('PWA', 'el service worker queda activo', swListo)

  await contexto.setOffline(true)
  await pagina.reload({ waitUntil: 'domcontentloaded' })
  const abreSinSenal = await pagina
    .waitForSelector('.d-marcador', { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
  comprobar('CU-07', 'la aplicación abre sin señal con el último mapa conocido', abreSinSenal)
  await contexto.setOffline(false)

  comprobar('—', 'sin errores de consola en todo el recorrido', erroresConsola.length === 0,
    erroresConsola.slice(0, 3).join(' | '))

  await pagina.screenshot({ path: path.join(RAIZ, 'pruebas', 'ultima-pantalla.png') })
  await navegador.close()

  // ───────────────────────────────────────────────────────────── Resumen
  const fallos = resultados.filter((r) => r.estado !== 'ok')
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`${resultados.length - fallos.length}/${resultados.length} comprobaciones pasaron`)
  if (fallos.length > 0) {
    console.log('\nFallas:')
    for (const f of fallos) console.log(`  ✗ ${f.cu} ${f.titulo} — ${f.detalle}`)
  }
  const cubiertos = [...new Set(resultados.map((r) => r.cu))].filter((c) => c.startsWith('CU'))
  console.log(`\nCasos de uso ejercitados: ${cubiertos.sort().join(', ')}`)
  console.log('CU-01 (ingesta del Form) se prueba en packages/apps-script — vive en Google.')
  return fallos.length
}

let salida = 1
try {
  salida = await main()
} catch (error) {
  console.error('\nLa prueba se cayó:', error.message)
} finally {
  if (servidor) servidor.kill()
}
process.exit(salida)
