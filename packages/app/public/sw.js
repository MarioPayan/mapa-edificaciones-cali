/*
 * Service worker de campo.
 *
 * Objetivo único: que la aplicación abra y muestre el último mapa conocido sin
 * señal. La captura no depende de esto (vive en la cola de IndexedDB), pero de
 * nada sirve una cola si la página no abre.
 *
 * ponytail: caché en tiempo de ejecución, sin manifiesto de precarga. Implica
 * que la PRIMERA apertura debe ser con señal — exactamente lo que ya recomienda
 * el plan (cargar el sector con wifi antes de salir). Si algún día hace falta
 * que instale sin abrir, la salida es vite-plugin-pwa con Workbox.
 */

var CACHE = 'dania-v1'

self.addEventListener('install', function (evento) {
  self.skipWaiting()
  // Se guarda la raíz para poder responder navegaciones sin red.
  evento.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.add(new Request('./', { cache: 'reload' })).catch(function () {})
    }),
  )
})

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches
      .keys()
      .then(function (nombres) {
        return Promise.all(
          nombres.map(function (n) {
            return n === CACHE ? null : caches.delete(n)
          }),
        )
      })
      .then(function () {
        return self.clients.claim()
      }),
  )
})

self.addEventListener('fetch', function (evento) {
  var peticion = evento.request
  if (peticion.method !== 'GET') return

  // Navegación: red primero (para tomar despliegues nuevos), caché si no hay.
  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion)
        .then(function (respuesta) {
          guardar(peticion, respuesta.clone())
          return respuesta
        })
        .catch(function () {
          return caches.match(peticion).then(function (r) {
            return r || caches.match('./')
          })
        }),
    )
    return
  }

  var url = new URL(peticion.url)
  var esCSV = url.pathname.endsWith('.csv') || url.searchParams.get('output') === 'csv'

  // El CSV: red primero, y si no hay, el último que se descargó. Un mapa de
  // hace una hora sirve; una pantalla en blanco a mitad de la calle, no.
  if (esCSV) {
    evento.respondWith(
      fetch(peticion)
        .then(function (respuesta) {
          guardar(peticion, respuesta.clone())
          return respuesta
        })
        .catch(function () {
          return caches.match(peticion)
        }),
    )
    return
  }

  // Todo lo demás (app, teselas del mapa): caché primero, y se refresca detrás.
  evento.respondWith(
    caches.match(peticion).then(function (enCache) {
      var red = fetch(peticion)
        .then(function (respuesta) {
          guardar(peticion, respuesta.clone())
          return respuesta
        })
        .catch(function () {
          return enCache
        })
      return enCache || red
    }),
  )
})

function guardar(peticion, respuesta) {
  // Las respuestas opacas ocupan cuota y no se pueden leer: no se guardan.
  if (!respuesta || respuesta.status !== 200 || respuesta.type === 'opaque') return
  caches.open(CACHE).then(function (cache) {
    cache.put(peticion, respuesta)
  })
}
