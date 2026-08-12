import { ESTADOS, ETIQUETA_ESTADO, type Edificacion, type Estado } from '@dania/data'
import { contarPorEstado, sinUbicar } from '@dania/data'
import { SIMBOLO_ESTADO } from './EstadoBadge.tsx'

export interface ContadoresProps {
  /**
   * Edificaciones que pasan los filtros de zona pero NO el de estado: así el
   * número de cada color no se vuelve cero al usarlo como filtro.
   */
  edificaciones: Edificacion[]
  estadosActivos?: Estado[]
  onAlternar?: (estado: Estado) => void
}

/**
 * Lo que la coordinación mira primero: cuántas hay de cada color. Y como en un
 * teléfono cada franja cuesta mapa, los contadores son además el filtro de
 * estado — tocar «Por visitar» deja solo esas.
 */
export function Contadores({ edificaciones, estadosActivos = [], onAlternar }: ContadoresProps) {
  const conteo = contarPorEstado(edificaciones)
  const perdidas = sinUbicar(edificaciones).length

  return (
    <div className="d-contadores">
      {ESTADOS.map((estado) => {
        const activo = estadosActivos.includes(estado)
        const contenido = (
          <>
            <span className="d-contador__numero">{conteo[estado]}</span>
            <span className="d-contador__etiqueta">
              <span aria-hidden="true">{SIMBOLO_ESTADO[estado]} </span>
              {ETIQUETA_ESTADO[estado]}
            </span>
          </>
        )

        if (!onAlternar) {
          return (
            <div key={estado} className="d-contador" data-estado={estado}>
              {contenido}
            </div>
          )
        }

        return (
          <button
            key={estado}
            type="button"
            className="d-contador"
            data-estado={estado}
            aria-pressed={activo}
            aria-label={`${conteo[estado]} ${ETIQUETA_ESTADO[estado]}${activo ? ', filtro activo' : ''}`}
            onClick={() => onAlternar(estado)}
          >
            {contenido}
          </button>
        )
      })}

      {/* Una edificación que no se puede pintar es justo la que se pierde sin
          que nadie lo note: el número va al lado de los demás. */}
      {perdidas > 0 && (
        <span className="d-contador d-contador--nota">
          <span className="d-contador__numero">{perdidas}</span>
          <span className="d-contador__etiqueta">sin ubicar</span>
        </span>
      )}
    </div>
  )
}
