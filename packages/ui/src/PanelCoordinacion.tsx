import type { DatosCrear, Edificacion, Estado } from '@dania/data'
import { barriosDeComuna, buscarBarrio, COMUNAS, sinUbicar } from '@dania/data'
import { useState } from 'react'

export interface PanelCoordinacionProps {
  edificaciones: Edificacion[]
  /** Reporte que se está ubicando en el mapa, si hay uno. */
  ubicando: Edificacion | null
  onUbicar: (edificacion: Edificacion) => void
  onCrear: () => void
  onSeleccionar: (edificacion: Edificacion) => void
  /** Apagar el modo. Vive aquí porque es donde se viene a coordinar. */
  onSalir: () => void
}

/**
 * Herramientas de coordinación (CU-11): poner en el mapa los reportes que la
 * geocodificación no pudo ubicar, y crear una edificación que nadie reportó.
 *
 * Las acciones se ven aquí, pero quien manda es el script: si el código no está
 * en la pestaña `coordinacion`, el envío se rechaza y se avisa. Mostrar el botón
 * no da permiso.
 */
export function PanelCoordinacion({
  edificaciones,
  ubicando,
  onUbicar,
  onCrear,
  onSeleccionar,
  onSalir,
}: PanelCoordinacionProps) {
  const perdidas = sinUbicar(edificaciones)

  return (
    <section className="d-coordinacion">
      <div className="d-coordinacion__cabecera">
        <button className="d-boton d-boton--principal" onClick={onCrear}>
          Crear edificación
        </button>
        <button className="d-boton" onClick={onSalir}>
          Salir de coordinación
        </button>
      </div>

      {perdidas.length === 0 ? (
        <p className="d-coordinacion__vacio">Ningún reporte quedó sin ubicar.</p>
      ) : (
        <>
          <p className="d-coordinacion__vacio">
            {perdidas.length} {perdidas.length === 1 ? 'reporte' : 'reportes'} sin ubicar: la
            dirección no se pudo geocodificar. Ubíquenlos tocando el mapa.
          </p>
          <ul className="d-lista">
            {perdidas.map((e) => (
              <li key={e.id} className="d-lista__fila">
                <button className="d-lista__principal" onClick={() => onSeleccionar(e)}>
                  <span className="d-lista__texto">
                    <span className="d-lista__direccion">{e.direccionTexto || `Sin dirección · ${e.id}`}</span>
                    <span className="d-lista__sub">
                      {[e.barrio, e.comuna && `comuna ${e.comuna}`, e.id].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
                <button
                  className="d-boton"
                  onClick={() => onUbicar(e)}
                  disabled={ubicando?.id === e.id}
                >
                  {ubicando?.id === e.id ? 'Toque el mapa' : 'Ubicar'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export interface FormularioCrearProps {
  lat: number
  lon: number
  onEnviar: (datos: DatosCrear) => void
  onCancelar: () => void
}

const ESTADOS_CREAR: { valor: Estado; etiqueta: string }[] = [
  { valor: 'ROJO', etiqueta: 'Colapsada' },
  { valor: 'NARANJA', etiqueta: 'Por visitar' },
]

/** Alta manual de una edificación que nadie reportó (CU-09, flujo principal 1). */
export function FormularioCrear({ lat, lon, onEnviar, onCancelar }: FormularioCrearProps) {
  const [direccionTexto, setDireccion] = useState('')
  const [barrio, setBarrio] = useState('')
  const [comuna, setComuna] = useState('')
  const [estado, setEstado] = useState<Estado>('ROJO')

  return (
    <form
      className="d-formulario"
      onSubmit={(evento) => {
        evento.preventDefault()
        onEnviar({ direccionTexto: direccionTexto.trim(), barrio: barrio.trim(), comuna, lat, lon, estado })
      }}
    >
      <p className="d-campo__ayuda">
        Punto marcado en {lat.toFixed(5)}, {lon.toFixed(5)}.
      </p>

      <label className="d-campo">
        <span className="d-campo__etiqueta">Dirección</span>
        <input
          className="d-input"
          required
          value={direccionTexto}
          onChange={(e) => setDireccion(e.target.value)}
        />
      </label>

      <div className="d-formulario__fila">
        <label className="d-campo">
          <span className="d-campo__etiqueta">Comuna</span>
          {/* Cali tiene 22 comunas. Nada de «un número entre 1 y 23» (R-14). */}
          <select
            className="d-input"
            value={comuna}
            onChange={(e) => {
              setComuna(e.target.value)
              setBarrio('')
            }}
          >
            <option value="">—</option>
            {COMUNAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="d-campo">
          <span className="d-campo__etiqueta">Barrio</span>
          {/* Del catálogo de barrios de Cali: escribir a mano el mismo barrio de
              tres maneras distintas rompe después el filtro. */}
          <select
            className="d-input"
            value={barrio}
            onChange={(e) => {
              setBarrio(e.target.value)
              // Elegir el barrio primero también sirve: completa la comuna.
              const encontrado = buscarBarrio(e.target.value)
              if (encontrado?.comuna && !comuna) setComuna(encontrado.comuna)
            }}
          >
            <option value="">—</option>
            {barriosDeComuna(comuna).map((b) => (
              <option key={b.nombre} value={b.nombre}>
                {b.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="d-campo">
        <span className="d-campo__etiqueta">Estado</span>
        <select
          className="d-input"
          value={estado}
          onChange={(e) => setEstado(e.target.value as Estado)}
        >
          {ESTADOS_CREAR.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </label>

      <div className="d-ficha__acciones">
        <button type="submit" className="d-boton d-boton--principal">
          Crear
        </button>
        <button type="button" className="d-boton" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
