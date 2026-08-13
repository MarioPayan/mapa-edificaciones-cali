import { useState } from 'react'

export interface CodigoCuadrillaProps {
  cuadrilla: string
  onCambiar: (codigo: string) => void
  /** Abre el registro en autoservicio (CU-12) para quien no tiene código. */
  onRegistrar?: () => void
}

/**
 * Identificación mínima: un código de cuadrilla, escrito una vez y recordado en
 * el teléfono. Quien no tiene código se registra en autoservicio y recibe uno
 * al instante — sin colas ni nadie que reparta (R-12). Atribuye, no autentica,
 * y así está declarado.
 */
export function CodigoCuadrilla({ cuadrilla, onCambiar, onRegistrar }: CodigoCuadrillaProps) {
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
      {onRegistrar && (
        <button
          type="button"
          className="d-boton"
          onClick={() => {
            setEditando(false)
            onRegistrar()
          }}
        >
          ¿Sin código? Regístrese
        </button>
      )}
    </form>
  )
}
