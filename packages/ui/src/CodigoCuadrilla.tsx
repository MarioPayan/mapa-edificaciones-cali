import { useState } from 'react'

export interface CodigoCuadrillaProps {
  cuadrilla: string
  onCambiar: (codigo: string) => void
}

/**
 * Identificación mínima: un código de cuadrilla, escrito una vez y recordado
 * en el teléfono. Es lo que evita «colas larguísimas para tomar un nombre y un
 * correo» (1.ogg 01:20). Atribuye, no autentica — y así se dice en PLAN.md §9.
 */
export function CodigoCuadrilla({ cuadrilla, onCambiar }: CodigoCuadrillaProps) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState(cuadrilla)

  if (!editando) {
    return (
      <button
        className="d-cuadrilla"
        // El texto es corto porque comparte fila con el título en 360 px; el
        // nombre accesible sí dice qué hace.
        aria-label={cuadrilla ? `Cuadrilla ${cuadrilla}, cambiar código` : 'Poner código de cuadrilla'}
        onClick={() => {
          setBorrador(cuadrilla)
          setEditando(true)
        }}
      >
        {cuadrilla ? `Cuadrilla ${cuadrilla}` : 'Cuadrilla'}
      </button>
    )
  }

  return (
    <form
      className="d-cuadrilla__forma"
      onSubmit={(evento) => {
        evento.preventDefault()
        onCambiar(borrador.trim().toUpperCase())
        setEditando(false)
      }}
    >
      <input
        className="d-input"
        value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        placeholder="C-07"
        aria-label="Código de cuadrilla"
        autoFocus
      />
      <button type="submit" className="d-boton d-boton--principal">
        Listo
      </button>
    </form>
  )
}
