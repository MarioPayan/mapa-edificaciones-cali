import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // La herramienta se usa en Cali. Fijar la zona evita que una prueba de
    // fechas pase aquí y falle en el portátil de otra persona.
    env: { TZ: 'America/Bogota' },
  },
})
