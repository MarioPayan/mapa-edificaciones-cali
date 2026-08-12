/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** CSV publicado de la pestaña `publico`. Sin él, la app usa datos de demostración. */
  readonly VITE_CSV_URL?: string
  /** Web app de Apps Script que recibe los envíos. Sin ella, la app es de solo lectura. */
  readonly VITE_ENVIOS_URL?: string
}
