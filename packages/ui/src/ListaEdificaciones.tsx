import { ETIQUETA_ESTADO, reclamoVigente, type Edificacion } from '@dania/data'
import { SIMBOLO_ESTADO } from './EstadoBadge.tsx'

export interface ListaEdificacionesProps {
  edificaciones: Edificacion[]
  cuadrilla?: string
  onSeleccionar: (edificacion: Edificacion) => void
  /** Sin esto, la lista es solo de consulta. */
  onReclamar?: (edificacion: Edificacion) => void
}

/**
 * La misma información del mapa, en lista.
 *
 * CU-03: la cuadrilla arma su jornada eligiendo «4–8 edificaciones cercanas» y
 * reclamándolas antes de salir. En el mapa eso son ocho fichas abiertas y
 * cerradas; en lista es un botón por fila.
 */
export function ListaEdificaciones({
  edificaciones,
  cuadrilla,
  onSeleccionar,
  onReclamar,
}: ListaEdificacionesProps) {
  if (edificaciones.length === 0) {
    return (
      <p className="d-lista__vacia">
        No hay edificaciones con esos filtros. Prueben con otra comuna o quiten el estado.
      </p>
    )
  }

  return (
    <ul className="d-lista">
      {edificaciones.map((e) => {
        const reclamada = reclamoVigente(e)
        const esMia = reclamada && e.reclamadaPor === cuadrilla
        return (
          <li key={e.id} className="d-lista__fila">
            <button className="d-lista__principal" onClick={() => onSeleccionar(e)}>
              <span className="d-marcador" data-estado={e.estado} aria-hidden="true">
                {SIMBOLO_ESTADO[e.estado]}
              </span>
              <span className="d-lista__texto">
                <span className="d-lista__direccion">{e.direccionTexto || `Sin dirección · ${e.id}`}</span>
                <span className="d-lista__sub">
                  {[e.barrio, e.comuna && `comuna ${e.comuna}`, ETIQUETA_ESTADO[e.estado]]
                    .filter(Boolean)
                    .join(' · ')}
                  {reclamada && ` · reclamada por ${e.reclamadaPor}`}
                </span>
              </span>
            </button>

            {onReclamar && e.estado !== 'VERDE' && !esMia && (
              <button
                className="d-boton"
                disabled={reclamada}
                onClick={() => onReclamar(e)}
                // El nombre accesible sigue al estado: con lector de pantalla,
                // «Reclamar» sobre un botón que dice «Ocupada» es una mentira.
                aria-label={
                  reclamada
                    ? `Ocupada, la tiene la cuadrilla ${e.reclamadaPor}: ${e.direccionTexto || e.id}`
                    : `Reclamar ${e.direccionTexto || e.id}`
                }
              >
                {reclamada ? 'Ocupada' : 'Reclamar'}
              </button>
            )}
            {esMia && <span className="d-lista__mia">Suya</span>}
          </li>
        )
      })}
    </ul>
  )
}
