import { ESTADOS, ETIQUETA_ESTADO, type Edificacion } from '@dania/data'
import { contarPorEstado, sinUbicar } from '@dania/data'
import { SIMBOLO_ESTADO } from './EstadoBadge.tsx'

/**
 * Lo que la coordinación mira primero: cuántas hay de cada color.
 * Incluye «sin ubicar» porque una edificación que no se puede pintar es
 * justamente la que se pierde sin que nadie lo note (CU-11).
 */
export function Contadores({ edificaciones }: { edificaciones: Edificacion[] }) {
  const conteo = contarPorEstado(edificaciones)
  const perdidas = sinUbicar(edificaciones).length

  return (
    <div className="d-contadores">
      {ESTADOS.map((estado) => (
        <div key={estado} className="d-contador" data-estado={estado}>
          <span className="d-contador__numero">{conteo[estado]}</span>
          <span className="d-contador__etiqueta">
            <span aria-hidden="true">{SIMBOLO_ESTADO[estado]} </span>
            {ETIQUETA_ESTADO[estado]}
          </span>
        </div>
      ))}
      {perdidas > 0 && (
        <div className="d-contador">
          <span className="d-contador__numero">{perdidas}</span>
          <span className="d-contador__etiqueta">sin ubicar</span>
        </div>
      )}
    </div>
  )
}
