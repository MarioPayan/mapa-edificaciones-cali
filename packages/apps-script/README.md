# @dania/apps-script — punto de escritura

Web app de Google Apps Script que recibe los envíos de las cuadrillas y los escribe en la hoja.
Es el **único** lugar donde algo se escribe: el mapa solo lee el CSV publicado.

| Archivo | Qué es |
|---------|--------|
| `src/logica.js` | Las reglas (validación, conflicto de reclamos, qué columna cambia). Sin dependencias y probado con vitest. |
| `src/Codigo.gs` | El pegamento con Google: `doPost`, candado, `log`, búsqueda de la fila. |

`logica.js` termina con `if (typeof module !== 'undefined') module.exports = …`. En Node eso permite
probarlo; en Apps Script `module` no existe y la línea no hace nada. Los archivos de un proyecto de
Apps Script comparten ámbito global, así que `Codigo.gs` ve esas funciones sin importar nada.

## Pestañas que espera la hoja

| Pestaña | Para qué | ¿Obligatoria? |
|---------|----------|----------------|
| `edificaciones` | Maestra. Una fila por edificación, con la columna `id`. | Sí |
| `log` | Auditoría: cada envío crudo, antes de decidir nada. La crea sola si falta. | Se crea sola |
| `cuadrillas` | Códigos autorizados, uno por fila en la columna A. | No — sin ella no se exige código |
| `publico` | Fórmula que excluye contacto, fotos y duplicados. Es la que se publica como CSV. | Sí, para el mapa |

## Despliegue

1. En la hoja: **Extensiones → Apps Script**.
2. Crear dos archivos con el contenido de `src/logica.js` y `src/Codigo.gs` (los nombres dan igual;
   el orden tampoco importa).
3. **Implementar → Nueva implementación → Aplicación web**:
   - *Ejecutar como*: **yo** (la cuenta de la operación).
   - *Quién tiene acceso*: **cualquier usuario**. Hace falta para que el teléfono de una cuadrilla
     escriba sin iniciar sesión; por eso el código de cuadrilla es atribución, no seguridad.
4. Copiar la URL `…/exec` y ponerla como `VITE_ENVIOS_URL` (variable del repositorio en GitHub, o
   `packages/app/.env.local` en local).

Al cambiar el código hay que **volver a implementar** (una implementación nueva o «gestionar
implementaciones → editar → versión nueva»). Guardar no basta.

## Detalles que evitan sorpresas

- **`text/plain`, no `application/json`.** Un `Content-Type: application/json` dispara un preflight
  `OPTIONS` que Apps Script no responde. El cliente manda JSON como texto plano a propósito.
- **Idempotencia por `uuid`.** El reintento de la cola offline no duplica: si el uuid ya está en
  `log`, se responde `ok` sin volver a escribir.
- **Candado.** `LockService` serializa las escrituras; sin él, dos reclamos simultáneos se pisan.
- **El `log` se escribe siempre**, incluso si el envío se rechaza. Es la red de seguridad.
- **Nunca se crean columnas.** Si la hoja no tiene una columna, ese dato se ignora en silencio en
  vez de correr el resto de la fila.

## Pruebas

`pnpm test` desde la raíz cubre `logica.js` (conflictos de reclamo, vencimiento a 4 h, recorte de
texto, «varía» donde el formulario oficial exige un número). `Codigo.gs` no se prueba: es I/O contra
Google y no hay forma honesta de simularlo sin montar un doble de toda la API.
