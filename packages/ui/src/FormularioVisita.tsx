import { Field } from '@base-ui/react/field'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import type { DatosCaracterizar, DatosColapsar, Edificacion } from '@dania/data'
import { useId, useState, type ReactNode } from 'react'

const TIPOS_EDIFICACION = ['casa', 'edificio', 'conjunto de torres', 'parroquia', 'colegio', 'otro']
const FALLECIDOS = ['No', 'Sí', 'Desconocido']

interface AtributosCampo {
  id: string
  'aria-describedby'?: string
}

/**
 * Etiqueta, control y ayuda, correctamente enlazados.
 *
 * El control se recibe como función para poder pasarle el `id` y el
 * `aria-describedby`: una etiqueta que no apunta a su campo no existe para un
 * lector de pantalla, y aquí se llenan formularios con una mano y de afán.
 */
function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string
  ayuda?: string
  children: (atributos: AtributosCampo) => ReactNode
}) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  return (
    <Field.Root className="d-campo">
      <Field.Label className="d-campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </Field.Label>
      {children({ id, ...(ayuda ? { 'aria-describedby': idAyuda } : {}) })}
      {ayuda && (
        <Field.Description className="d-campo__ayuda" id={idAyuda}>
          {ayuda}
        </Field.Description>
      )}
    </Field.Root>
  )
}

/** Sí / No / Desconocido. «Desconocido» es una respuesta legítima en campo. */
function TriEstado({ valor, onCambiar }: { valor: string; onCambiar: (v: string) => void }) {
  return (
    <RadioGroup
      className="d-radios"
      value={valor}
      onValueChange={(v) => onCambiar(String(v))}
      aria-label="Fallecidos o atrapados"
    >
      {FALLECIDOS.map((opcion) => (
        <label key={opcion} className="d-radio">
          <Radio.Root value={opcion} className="d-radio__control">
            <Radio.Indicator className="d-radio__punto" />
          </Radio.Root>
          {opcion}
        </label>
      ))}
    </RadioGroup>
  )
}

export interface FormularioCaracterizarProps {
  edificacion: Edificacion
  onEnviar: (datos: DatosCaracterizar) => void
  onCancelar: () => void
}

/**
 * La captura que el formulario oficial no permite (R-05, 3.mp4 00:30):
 * torres y apartamentos por torre en vez de un número exacto de personas, y
 * ocupación como texto libre donde «varía» es una respuesta válida.
 */
export function FormularioCaracterizar({
  edificacion,
  onEnviar,
  onCancelar,
}: FormularioCaracterizarProps) {
  const [tipoEdificacion, setTipo] = useState(edificacion.tipoEdificacion || '')
  const [numTorres, setTorres] = useState(edificacion.numTorres?.toString() ?? '')
  const [aptsPorTorre, setApts] = useState(edificacion.aptsPorTorre?.toString() ?? '')
  const [ocupacion, setOcupacion] = useState(edificacion.ocupacion)
  const [fallecidosAtrapados, setFallecidos] = useState(edificacion.fallecidosAtrapados || 'No')
  const [caracterizacion, setCaracterizacion] = useState(edificacion.caracterizacion)
  const [observaciones, setObservaciones] = useState(edificacion.observaciones)

  const aNumero = (v: string) => (v.trim() === '' ? null : Number(v))

  return (
    <form
      className="d-formulario"
      onSubmit={(evento) => {
        evento.preventDefault()
        onEnviar({
          caracterizacion: caracterizacion.trim(),
          tipoEdificacion,
          numTorres: aNumero(numTorres),
          aptsPorTorre: aNumero(aptsPorTorre),
          ocupacion: ocupacion.trim(),
          fallecidosAtrapados,
          observaciones: observaciones.trim(),
        })
      }}
    >
      <Campo etiqueta="Tipo de edificación">
        {(atributos) => (
          <select
            {...atributos}
            className="d-input"
            value={tipoEdificacion}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="">Sin especificar</option>
            {TIPOS_EDIFICACION.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </Campo>

      <div className="d-formulario__fila">
        <Campo etiqueta="Torres">
          {(atributos) => (
            <input
              {...atributos}
              className="d-input"
              type="number"
              inputMode="numeric"
              min="0"
              value={numTorres}
              onChange={(e) => setTorres(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Apts por torre">
          {(atributos) => (
            <input
              {...atributos}
              className="d-input"
              type="number"
              inputMode="numeric"
              min="0"
              value={aptsPorTorre}
              onChange={(e) => setApts(e.target.value)}
            />
          )}
        </Campo>
      </div>

      <Campo
        etiqueta="Ocupación"
        ayuda="Escriban lo que sepan: «varía», «2 pisos ocupados», «evacuado»."
      >
        {(atributos) => (
          <input
            {...atributos}
            className="d-input"
            value={ocupacion}
            onChange={(e) => setOcupacion(e.target.value)}
          />
        )}
      </Campo>

      <Campo etiqueta="¿Fallecidos o atrapados?">
        {() => <TriEstado valor={fallecidosAtrapados} onCambiar={setFallecidos} />}
      </Campo>

      <Campo
        etiqueta="Caracterización"
        ayuda="Qué se ve: grietas, juntas de dilatación, escaleras, fachadas. Sin nombres ni teléfonos."
      >
        {(atributos) => (
          <textarea
            {...atributos}
            className="d-textarea"
            rows={5}
            required
            value={caracterizacion}
            onChange={(e) => setCaracterizacion(e.target.value)}
          />
        )}
      </Campo>

      <Campo etiqueta="Observaciones" ayuda="Cómo entrar, con quién hablaron, qué sigue.">
        {(atributos) => (
          <textarea
            {...atributos}
            className="d-textarea"
            rows={2}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        )}
      </Campo>

      <div className="d-ficha__acciones">
        <button type="submit" className="d-boton d-boton--principal">
          Guardar visita
        </button>
        <button type="button" className="d-boton" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

export interface FormularioColapsoProps {
  edificacion: Edificacion
  onEnviar: (datos: DatosColapsar) => void
  onCancelar: () => void
}

/**
 * Lo observable en sitio de una edificación colapsada (R-04a). Rescatadas puede
 * quedar vacío: «sin dato» es más honesto que un cero inventado, y el cruce con
 * hospitales no lo puede hacer esta herramienta (PLAN.md §10.6).
 */
export function FormularioColapso({ edificacion, onEnviar, onCancelar }: FormularioColapsoProps) {
  const [rescatadas, setRescatadas] = useState(edificacion.rescatadasEnSitio?.toString() ?? '')
  const [fuente, setFuente] = useState(edificacion.rescatadasFuente)
  const [fallecidosAtrapados, setFallecidos] = useState(edificacion.fallecidosAtrapados || 'Desconocido')

  return (
    <form
      className="d-formulario"
      onSubmit={(evento) => {
        evento.preventDefault()
        onEnviar({
          rescatadasEnSitio: rescatadas.trim() === '' ? null : Number(rescatadas),
          rescatadasFuente: fuente.trim(),
          fallecidosAtrapados,
        })
      }}
    >
      <Campo
        etiqueta="Personas rescatadas en sitio"
        ayuda="Déjenlo vacío si no hay dato confirmado. Nadie va a inventar un número."
      >
        {(atributos) => (
          <input
            {...atributos}
            className="d-input"
            type="number"
            inputMode="numeric"
            min="0"
            value={rescatadas}
            onChange={(e) => setRescatadas(e.target.value)}
          />
        )}
      </Campo>

      <Campo etiqueta="¿Quién lo informó?" ayuda="Ej.: «cuadrilla C-03 en sitio», «Bomberos».">
        {(atributos) => (
          <input
            {...atributos}
            className="d-input"
            value={fuente}
            onChange={(e) => setFuente(e.target.value)}
          />
        )}
      </Campo>

      <Campo etiqueta="¿Fallecidos o atrapados?">
        {() => <TriEstado valor={fallecidosAtrapados} onCambiar={setFallecidos} />}
      </Campo>

      <div className="d-ficha__acciones">
        <button type="submit" className="d-boton d-boton--peligro">
          Marcar como colapsada
        </button>
        <button type="button" className="d-boton" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
