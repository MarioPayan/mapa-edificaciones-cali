# @dania/apps-script — punto de escritura

Web app de Google Apps Script que recibe los envíos de las cuadrillas y los escribe en la hoja.
Es el **único** lugar donde algo se escribe: el mapa solo lee el CSV publicado.

| Archivo | Qué es |
|---------|--------|
| `src/logica.js` | Las reglas (validación, conflicto de reclamos, qué columna cambia). Sin dependencias y probado con vitest. |
| `src/Codigo.gs` | El pegamento con Google: `doPost`, candado, `log`, búsqueda de la fila. |
| `src/Ingesta.gs` | Trae los reportes del Form a `edificaciones` y los geocodifica (CU-01). |
| `src/Instalar.gs` | Deja la hoja lista de una ejecución: pestañas, encabezados y la fórmula de `publico`. |

`logica.js` termina con `if (typeof module !== 'undefined') module.exports = …`. En Node eso permite
probarlo; en Apps Script `module` no existe y la línea no hace nada. Los archivos de un proyecto de
Apps Script comparten ámbito global, así que `Codigo.gs` ve esas funciones sin importar nada.

## Pestañas que espera la hoja

| Pestaña | Para qué | ¿Obligatoria? |
|---------|----------|----------------|
| `edificaciones` | Maestra. Una fila por edificación, con la columna `id`. | Sí |
| `log` | Auditoría: cada envío crudo, antes de decidir nada. La crea sola si falta. | Se crea sola |
| `cuadrillas` | Códigos autorizados, uno por fila en la columna A. | No — sin ella no se exige código |
| `coordinacion` | Códigos que además pueden crear edificaciones y fusionar duplicados. Cuentan también como cuadrilla: no hay que repetirlos en `cuadrillas`. | No — sin ella no se permite coordinar |
| `reportes` | Respuestas del Form de residentes. La ingesta las normaliza hacia `edificaciones`. | Solo para CU-01 |
| `publico` | Fórmula que excluye contacto, fotos y duplicados. Es la que se publica como CSV. | Sí, para el mapa |

La fórmula de `publico` tiene que producir exactamente lo que
`simulacro/entorno.js` (`proyectarPublico`) produce en las pruebas: todas las
columnas menos `contacto_*`, `unidad_apto`, `fotos` y `uuid_envio`, y sin las
filas que tengan `duplicado_de`.

## Puesta en marcha (unos 20 minutos)

1. Crear una hoja de cálculo nueva en la cuenta de la operación.
2. **Extensiones → Apps Script**, y pegar los cuatro archivos de `src/` (los nombres dan igual; el
   orden tampoco, porque comparten ámbito global).
3. Elegir la función **`instalar`** y ejecutarla. Crea `edificaciones`, `log`, `cuadrillas`,
   `coordinacion` y `publico` con sus encabezados, y **genera la fórmula de `publico`**. Se puede
   volver a ejecutar cuantas veces se quiera: no pisa datos.
4. Escribir los códigos en `cuadrillas` (uno por fila) y en `coordinacion` los de quien puede crear
   y fusionar. Un código de coordinación cuenta también como cuadrilla.
5. **Archivo → Compartir → Publicar en la web**: la pestaña **`publico`**, formato **CSV**. Ese
   enlace es `VITE_CSV_URL`.
6. **Implementar → Nueva implementación → Aplicación web**:
   - *Ejecutar como*: **yo** (la cuenta de la operación).
   - *Quién tiene acceso*: **cualquier usuario**. Hace falta para que el teléfono de una cuadrilla
     escriba sin iniciar sesión; por eso el código de cuadrilla es atribución, no seguridad.
7. Copiar la URL `…/exec`: es `VITE_ENVIOS_URL` (variable del repositorio en GitHub, o
   `packages/app/.env.local` en local).
8. Para CU-01, enganchar el Form existente a la hoja y añadir un activador de `ingerirReportes` con
   «Al enviar el formulario».

La fórmula de `publico` se genera, no se teclea: es la que decide si los teléfonos de las familias
salen o no a una página web, y equivocarse escribiendo letras de columna a mano es demasiado fácil.
Hay una prueba que comprueba que esa fórmula no referencia ninguna columna de contacto.

Al cambiar el código hay que **volver a implementar** (una implementación nueva o «gestionar
implementaciones → editar → versión nueva»). Guardar no basta.

## Detalles que evitan sorpresas

- **`text/plain`, no `application/json`.** Un `Content-Type: application/json` dispara un preflight
  `OPTIONS` que Apps Script no responde. El cliente manda JSON como texto plano a propósito.
- **Idempotencia por `uuid`.** El reintento de la cola offline no duplica: si el uuid ya figura en
  `log` **como aplicado**, se responde `ok` sin volver a escribir. Se pregunta por lo aplicado y no
  por lo recibido a propósito: dos reintentos simultáneos se registran ambos antes de que ninguno
  tome el candado, y contando recibidos los dos se creerían repetidos — el cambio no se escribiría
  nunca y la cuadrilla lo daría por enviado.
- **Candado.** `LockService` serializa las escrituras; sin él, dos reclamos simultáneos se pisan.
- **El `log` se escribe siempre**, incluso si el envío se rechaza. Es la red de seguridad.
- **Nunca se crean columnas.** Si la hoja no tiene una columna, ese dato se ignora en silencio en
  vez de correr el resto de la fila.

## Pruebas

`simulacro/entorno.mjs` implementa la parte de la API de Apps Script que estos scripts usan
—hojas, rangos, candado, `ContentService` y el geocodificador— y los evalúa dentro de Node en un
único ámbito global, como hace Google. Con eso:

- `src/logica.test.js` cubre las reglas puras (conflictos de reclamo, vencimiento a 4 h, recorte de
  texto, «varía» donde el formulario oficial exige un número).
- `src/servidor.test.js` **ejecuta `Codigo.gs` e `Ingesta.gs` de verdad** contra una hoja simulada:
  escritura en la fila correcta, rechazos, candado ocupado, idempotencia, alta de edificaciones,
  fusión de duplicados y la ingesta del Form con su geocodificador falso.
- `pnpm bucle` (desde la raíz) cierra el círculo entero con un navegador real: la aplicación habla
  con este mismo código a través de HTTP, escribe en la hoja simulada y lo que muestra al refrescar
  sale del CSV que esa hoja produce.

Lo que el simulacro **no** cubre, y solo se ve desplegando de verdad: cuotas y límites de Apps
Script, permisos de la cuenta, el redirect 302 del web app y la latencia de publicación del CSV.
