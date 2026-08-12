import { ETIQUETA_ESTADO, type Estado } from '@dania/data'

/**
 * Cada estado lleva símbolo además de color: rojo y verde son el par que peor
 * distingue una persona daltónica, y esto se lee al sol en la calle.
 */
export const SIMBOLO_ESTADO: Record<Estado, string> = {
  ROJO: '✕',
  NARANJA: '●',
  VERDE: '✓',
}

export function EstadoBadge({ estado }: { estado: Estado }) {
  return (
    <span className="d-estado" data-estado={estado}>
      <span className="d-estado__simbolo" aria-hidden="true">
        {SIMBOLO_ESTADO[estado]}
      </span>
      {ETIQUETA_ESTADO[estado]}
    </span>
  )
}
