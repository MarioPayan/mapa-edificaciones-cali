# Mapa de edificaciones afectadas — Cali

Mapa semáforo de las edificaciones reportadas tras una emergencia estructural: **rojo** colapsada,
**naranja** por visitar, **verde** visitada. Al tocar un punto aparece la caracterización recogida
en la visita.

Está hecho para una cuadrilla con un teléfono en la calle: sirve sin señal, se instala como
aplicación desde el navegador y no exige cuenta de nadie.

**Publicado en <https://mariopayan.github.io/mapa-edificaciones-cali/>** — con datos de ejemplo y
en modo práctica: se entra con una cuadrilla ya puesta, así que desde el primer toque se puede
reclamar, ubicar con GPS, caracterizar, marcar colapsada, fusionar duplicados y crear puntos nuevos.
Nada sale del teléfono. Para operar de verdad hay que conectarlo a la hoja de la operación (ver más
abajo).

En un teléfono el encabezado ocupa tres franjas cortas y el resto es mapa (~78 % del alto). Los
contadores de arriba son además el filtro de estado; comuna, barrio y búsqueda están detrás de
«Filtros»; la explicación de qué es esto, detrás del ícono ⓘ; y las herramientas de coordinación,
detrás de su botón. Nada de eso ocupa alto mientras no se use.

## Qué problema resuelve

En una emergencia, las visitas de evaluación se reparten a mano: alguien arma listas de direcciones
y las entrega por chat. De ahí salen cuatro problemas que esta herramienta ataca de frente:

| Problema | Qué hace la herramienta |
|----------|-------------------------|
| Horas esperando a que repartan direcciones | La lista de pendientes es pública y permanente: la cuadrilla filtra su comuna y elige. No hay a quién esperar. |
| Direcciones que «no dan»: el GPS cae en otra manzana, falta el número | La ubicación que vale es la que toma el teléfono parado frente al inmueble. La dirección escrita pasa a ser una pista, no la verdad. |
| Cinco equipos visitando la misma edificación mientras otras no reciben ninguna | Estado visible para todos y reclamo con vencimiento a 4 h. Antes de subirse al carro se sabe si ya está tomada. |
| Formularios que no cargan en campo y no admiten «36 apartamentos por torre» | Captura que funciona sin señal, con campos que sí describen un conjunto residencial: torres, apartamentos por torre y ocupación como texto libre («varía» es una respuesta válida). |

Lo que **no** resuelve, y conviene decirlo: no sigue a las personas rescatadas hasta el hospital
(ese dato se pierde en la admisión hospitalaria, no en el mapa), no consigue carros ni cuadrillas,
y no elimina la duplicidad con instituciones que no la usen.

## Arranque

```bash
pnpm install
pnpm dev          # http://localhost:5173 con datos de ejemplo
pnpm check        # typecheck + 56 pruebas unitarias
pnpm e2e          # construye y recorre los casos de uso en un navegador real
pnpm build        # genera packages/app/dist
```

Sin configuración arranca con `packages/app/public/demo/edificaciones.csv` y habilita el **modo
práctica**: se puede reclamar, ubicar y caracterizar para aprender el flujo, y los cambios se
quedan en ese teléfono sin salir a ninguna parte.

Para usar la hoja real:

```bash
cat >> packages/app/.env.local <<'FIN'
VITE_CSV_URL=https://docs.google.com/spreadsheets/d/e/…/pub?gid=…&single=true&output=csv
VITE_ENVIOS_URL=https://script.google.com/macros/s/…/exec
FIN
```

El primero sale de **Archivo → Compartir → Publicar en la web**, eligiendo **la pestaña `publico`**
y formato CSV; nunca el libro completo. El segundo es la web app de Apps Script
(ver [`packages/apps-script/README.md`](./packages/apps-script/README.md)). Sin `VITE_ENVIOS_URL`
sobre datos reales, el mapa es de solo lectura.

## Paquetes

| Paquete | Qué hace | De qué depende |
|---------|----------|----------------|
| `@dania/data` | Modelo, parseo del CSV, filtros, envíos, vencimiento de reclamos y el catálogo de barrios | nada |
| `@dania/ui` | Semáforo, filtros (Base UI), ficha, lista, formularios y mapa (Leaflet) | `@dania/data`, React |
| `@dania/app` | Composición, carga y refresco, cola offline, PWA, despliegue | los dos anteriores |
| `@dania/apps-script` | Único punto de escritura: `doPost` e ingesta sobre la hoja | nada (corre en Google) |

Los paquetes se consumen como código fuente (`exports` apunta a `src/index.ts`): Vite los compila y
no hay que construir nada antes de trabajar. Un solo `tsconfig.json` en la raíz tipa todo.

## Trabajo sin señal

Lo capturado en campo va a una cola en el teléfono (IndexedDB) y sale cuando vuelve la red — al
recibir el evento `online`, y de todas formas cada minuto, porque en Android ese evento a veces no
llega. Mientras tanto:

- El cambio se pinta **de inmediato** en el mapa y en la ficha. Una cuadrilla que reclama y no ve
  pasar nada vuelve a reclamar.
- Una barra permanente dice cuántos cambios faltan por enviar.
- Cada envío lleva un `uuid`; el script ignora los repetidos, así que reintentar no duplica.
- Lo ya aceptado se sigue pintando 20 minutos: el CSV publicado tarda minutos en reflejarlo y nadie
  puede ver desaparecer su propio reclamo.
- Un rechazo del servidor (otra cuadrilla se adelantó, ya está visitada) sale de la cola y se
  explica en castellano. *Limitación conocida:* ese aviso queda detrás de la ficha si está abierta;
  se ve al cerrarla.

El service worker guarda la aplicación y el último CSV, así que abre sin señal. La **primera**
apertura sí necesita red: conviene abrir el sector del día con wifi antes de salir.

## Privacidad

Dos barreras, no una:

1. La pestaña `publico` de la hoja **no contiene** las columnas de contacto (nombre, teléfono,
   correo, unidad) ni las fotos. Es lo único que se publica.
2. `@dania/data` solo mapea columnas conocidas, así que aunque se publique la pestaña equivocada
   esos datos no llegan a la pantalla — y la aplicación muestra un aviso rojo pidiendo corregir la
   publicación. Hay pruebas que lo verifican, unitarias y en navegador.

Los datos de ejemplo son inventados: direcciones con «(ejemplo)» repartidas por las 22 comunas,
generadas con `node herramientas/generar-demo.mjs`.

Los barrios sí son reales: `packages/data/src/barrios.ts` trae los 367 barrios de Cali con su
comuna, tomados de OpenStreetMap (ODbL), que a su vez los importó del POT. El filtro y el alta de
edificaciones los ofrecen aunque no haya ningún reporte en ellos — una cuadrilla busca por el
barrio donde está, no por donde alguien ya reportó. Salvedad anotada en el archivo: la comuna 1 no
viene en esa importación y se completó a mano.

**Advertencia que conviene repetir:** un mapa público de viviendas dañadas y evacuadas también le
sirve a quien quiera saquearlas. La página lleva `noindex`, pero una URL de GitHub Pages es pública
de hecho. Difúndanla entre cuadrillas e instituciones, no en abierto.

## Pruebas

- `pnpm check` — 56 pruebas unitarias: parseo de CSV con comas y comillas dentro de los campos,
  reglas de reclamo y vencimiento, privacidad, cola offline y sus carreras.
- `pnpm e2e` — recorre los casos de uso en Chromium sobre la aplicación construida: consulta,
  armado de jornada, reclamo, corrección de ubicación con GPS, caracterización, colapso, modo
  coordinación, trabajo sin señal y apertura sin red.
- `pnpm e2e:desplegado <url>` — el mismo recorrido contra una URL ya publicada.
- `pnpm bucle` — el recorrido completo **sin simulacros de respuesta**: la aplicación habla con el
  `doPost` de verdad (el mismo código que se pega en Apps Script) sobre una hoja simulada, y lo que
  muestra al refrescar sale del CSV que esa hoja produce. Es lo más cerca de la realidad que se
  puede llegar sin una cuenta de Google.

## Despliegue

`.github/workflows/deploy.yml` construye y publica en GitHub Pages con cada empujón a `main`. Para
apuntar a datos reales hay que crear las variables de repositorio `VITE_CSV_URL` y
`VITE_ENVIOS_URL` (Settings → Secrets and variables → Actions → Variables). Sin ellas se publica la
versión de práctica con datos de ejemplo.
