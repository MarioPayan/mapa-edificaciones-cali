import type { ReactNode } from 'react'

export type TonoAviso = 'aviso' | 'error' | 'info'

/** Franja de mensaje: errores de carga, CSV con datos personales, datos viejos. */
export function Aviso({ tono = 'aviso', children }: { tono?: TonoAviso; children: ReactNode }) {
  return (
    <p className="d-aviso" data-tono={tono} role={tono === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}
