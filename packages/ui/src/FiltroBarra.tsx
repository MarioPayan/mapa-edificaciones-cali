import { Input } from '@base-ui/react/input'
import { Select } from '@base-ui/react/select'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import {
  barriosParaFiltro,
  COMUNAS,
  ESTADOS,
  ETIQUETA_ESTADO,
  type Edificacion,
  type Estado,
  type Filtro,
} from '@dania/data'
import { SIMBOLO_ESTADO } from './EstadoBadge.tsx'

interface SelectorProps {
  etiqueta: string
  valor: string
  opciones: string[]
  onCambiar: (valor: string) => void
}

/** Selector de una columna con opción «todas» (valor vacío). */
function Selector({ etiqueta, valor, opciones, onCambiar }: SelectorProps) {
  const items: Record<string, string> = { '': etiqueta }
  for (const o of opciones) items[o] = o

  return (
    <Select.Root items={items} value={valor} onValueChange={(v) => onCambiar(v ?? '')}>
      <Select.Trigger className="d-select-trigger" aria-label={etiqueta}>
        <Select.Value />
        <Select.Icon aria-hidden="true">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        {/* Sin `alignItemWithTrigger` el desplegable no intenta encimarse al botón:
            en un teléfono eso deja la lista medio fuera de pantalla. */}
        <Select.Positioner
          className="d-select-positioner"
          sideOffset={4}
          alignItemWithTrigger={false}
        >
          <Select.Popup className="d-select-popup">
            <Select.List>
              {Object.entries(items).map(([valorItem, texto]) => (
                <Select.Item key={valorItem} value={valorItem} className="d-select-item">
                  <Select.ItemIndicator className="d-select-item__indicador">✓</Select.ItemIndicator>
                  <Select.ItemText>{texto}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

export interface FiltroBarraProps {
  /** Universo completo: de aquí salen las opciones de comuna y barrio. */
  edificaciones: Edificacion[]
  filtro: Filtro
  onCambiar: (filtro: Filtro) => void
}

/**
 * Filtrar por estado, comuna y barrio es lo que reemplaza la espera de 1–2 h
 * por una lista de direcciones (R-08, R-10): la cuadrilla se sirve sola.
 */
export function FiltroBarra({ edificaciones, filtro, onCambiar }: FiltroBarraProps) {
  // Las 22 comunas de Cali, tengan o no reportes: una cuadrilla filtra por
  // donde está, no por donde ya reportaron.
  const comunas = [...COMUNAS]
  // Los barrios se acotan a la comuna elegida: en Cali hay más de 360.
  const barrios = barriosParaFiltro(edificaciones, filtro.comuna)

  return (
    <div className="d-filtros">
      <div className="d-filtros__fila">
        <ToggleGroup
          multiple
          className="d-toggle-grupo"
          value={filtro.estados}
          onValueChange={(estados) => onCambiar({ ...filtro, estados: estados as Estado[] })}
          aria-label="Filtrar por estado"
        >
          {ESTADOS.map((estado) => (
            <Toggle key={estado} value={estado} className="d-toggle" data-estado={estado}>
              <span aria-hidden="true">{SIMBOLO_ESTADO[estado]}</span>
              {ETIQUETA_ESTADO[estado]}
            </Toggle>
          ))}
        </ToggleGroup>
      </div>

      <div className="d-filtros__fila">
        <Selector
          etiqueta="Todas las comunas"
          valor={filtro.comuna}
          opciones={comunas}
          onCambiar={(comuna) => onCambiar({ ...filtro, comuna, barrio: '' })}
        />
        <Selector
          etiqueta="Todos los barrios"
          valor={filtro.barrio}
          opciones={barrios}
          onCambiar={(barrio) => onCambiar({ ...filtro, barrio })}
        />
        <Input
          className="d-input"
          placeholder="Buscar dirección o id"
          value={filtro.texto}
          onValueChange={(texto) => onCambiar({ ...filtro, texto })}
          aria-label="Buscar dirección o id"
        />
      </div>
    </div>
  )
}
