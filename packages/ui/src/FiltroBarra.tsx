import { Input } from '@base-ui/react/input'
import { Select } from '@base-ui/react/select'
import { barriosParaFiltro, COMUNAS, type Edificacion, type Filtro } from '@dania/data'

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
 * Zona y búsqueda. Vive dentro del panel de filtros, no en la pantalla
 * principal: en un teléfono cada franja fija es mapa que la cuadrilla no ve.
 * El filtro de estado está en los contadores, que se usan mucho más.
 */
export function FiltroBarra({ edificaciones, filtro, onCambiar }: FiltroBarraProps) {
  // Los barrios se acotan a la comuna elegida: en Cali hay más de 360.
  const barrios = barriosParaFiltro(edificaciones, filtro.comuna)

  return (
    <div className="d-filtros">
      <label className="d-campo">
        <span className="d-campo__etiqueta">Buscar</span>
        <Input
          className="d-input"
          placeholder="Dirección o id"
          value={filtro.texto}
          onValueChange={(texto) => onCambiar({ ...filtro, texto })}
          aria-label="Buscar dirección o id"
        />
      </label>

      <div className="d-campo">
        <span className="d-campo__etiqueta">Comuna</span>
        <Selector
          etiqueta="Todas las comunas"
          valor={filtro.comuna}
          opciones={[...COMUNAS]}
          onCambiar={(comuna) => onCambiar({ ...filtro, comuna, barrio: '' })}
        />
      </div>

      <div className="d-campo">
        <span className="d-campo__etiqueta">Barrio</span>
        <Selector
          etiqueta="Todos los barrios"
          valor={filtro.barrio}
          opciones={barrios}
          onCambiar={(barrio) => onCambiar({ ...filtro, barrio })}
        />
      </div>
    </div>
  )
}

/** ¿Cuántos filtros de zona hay puestos? Alimenta el contador del botón. */
export function contarFiltrosDeZona(filtro: Filtro): number {
  return [filtro.comuna, filtro.barrio, filtro.texto.trim()].filter(Boolean).length
}
