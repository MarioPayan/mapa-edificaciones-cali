import type { DatosRegistro } from '@dania/data'
import { useState } from 'react'

export interface FormularioRegistroProps {
  /** Manda el registro y devuelve el código asignado. Lanza si no se pudo. */
  onRegistrar: (datos: DatosRegistro) => Promise<string>
  onCerrar: () => void
}

/**
 * CU-12: registro de cuadrilla en autoservicio. Lo pidió campo (feedback de
 * Dania): arquitectos e ingenieros que salen desde cualquier punto, sin pasar
 * por quien reparte códigos. Nombre y teléfono para ser contactables; el código
 * vuelve al instante y queda guardado en el teléfono.
 */
export function FormularioRegistro({ onRegistrar, onCerrar }: FormularioRegistroProps) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo] = useState('')
  const [entidad, setEntidad] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)

  if (codigo) {
    return (
      <div className="d-formulario">
        <p>
          Su código de cuadrilla es <strong>{codigo}</strong>. Ya quedó guardado en este teléfono:
          desde ahora puede reclamar y caracterizar. Anótelo por si cambia de teléfono.
        </p>
        <div className="d-ficha__acciones">
          <button className="d-boton d-boton--principal" onClick={onCerrar}>
            Listo
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="d-formulario"
      onSubmit={(evento) => {
        evento.preventDefault()
        setEnviando(true)
        setError(null)
        onRegistrar({
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          correo: correo.trim(),
          entidad: entidad.trim(),
        })
          .then(setCodigo)
          .catch((fallo: unknown) => {
            // Registrarse es el único paso que exige señal; el mensaje lo dice
            // para que nadie lo reintente desde un sótano sin cobertura.
            setError(
              fallo instanceof Error && fallo.message !== 'Failed to fetch'
                ? `No se pudo registrar (${fallo.message}). Intente de nuevo.`
                : 'No se pudo registrar. Este paso necesita señal; intente donde haya cobertura.',
            )
          })
          .finally(() => setEnviando(false))
      }}
    >
      <p className="d-campo__ayuda">
        Con esto queda autorizado para reclamar y caracterizar. El contacto solo lo ve coordinación;
        nunca sale al mapa público. ¿Ya le dieron un código? Cierre esto y póngalo arriba, en
        «Cuadrilla».
      </p>

      <label className="d-campo">
        <span className="d-campo__etiqueta">Nombre</span>
        <input
          className="d-input"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoComplete="name"
        />
      </label>

      <label className="d-campo">
        <span className="d-campo__etiqueta">Teléfono</span>
        <input
          className="d-input"
          required
          type="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          autoComplete="tel"
        />
      </label>

      <label className="d-campo">
        <span className="d-campo__etiqueta">Correo (opcional)</span>
        <input
          className="d-input"
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          autoComplete="email"
        />
      </label>

      <label className="d-campo">
        <span className="d-campo__etiqueta">Entidad o grupo (opcional)</span>
        <input
          className="d-input"
          value={entidad}
          onChange={(e) => setEntidad(e.target.value)}
          placeholder="Cruz Roja, independiente…"
        />
      </label>

      {error && <p className="d-campo__ayuda">{error}</p>}

      <div className="d-ficha__acciones">
        <button type="submit" className="d-boton d-boton--principal" disabled={enviando}>
          {enviando ? 'Registrando…' : 'Registrarme'}
        </button>
        <button type="button" className="d-boton" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
