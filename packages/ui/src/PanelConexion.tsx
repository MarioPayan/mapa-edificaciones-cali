import { useState } from 'react'

export interface DatosConexion {
  csv: string
  envios: string
}

export interface PanelConexionProps {
  /** Lo que hay ahora, para poder editarlo. */
  actual: DatosConexion
  /** De dónde salió: cambia lo que conviene contarle a quien mira. */
  origen: 'guardada' | 'compilada' | 'demo'
  /** Enlace listo para repartir por chat, si hay hoja conectada. */
  enlace: string
  onConectar: (datos: DatosConexion) => void
  onOlvidar: () => void
  dominioDe: (url: string) => string
}

/**
 * Conectar la aplicación a una hoja sin tocar el repositorio ni reconstruir.
 *
 * Coordinación pega aquí las dos URLs una vez, copia el enlace que sale y lo
 * reparte; cada cuadrilla lo abre y confirma. Antes esto exigía ser quien
 * despliega, que es tanto como decir que nadie más podía probarlo.
 */
export function PanelConexion({
  actual,
  origen,
  enlace,
  onConectar,
  onOlvidar,
  dominioDe,
}: PanelConexionProps) {
  const [csv, setCsv] = useState(actual.csv)
  const [envios, setEnvios] = useState(actual.envios)
  const [copiado, setCopiado] = useState(false)

  return (
    <div className="d-formulario">
      <p className="d-campo__ayuda">
        {origen === 'demo'
          ? 'Ahora mismo muestra datos de ejemplo. Para trabajar con la hoja de la operación, peguen aquí sus dos enlaces.'
          : `Conectada a ${dominioDe(actual.csv)}${
              actual.envios ? '' : ' · solo lectura, sin enlace de escritura'
            }.`}
      </p>

      <label className="d-campo">
        <span className="d-campo__etiqueta">CSV publicado (pestaña «publico»)</span>
        <input
          className="d-input"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="https://docs.google.com/…/pub?output=csv"
          inputMode="url"
          autoComplete="off"
        />
      </label>

      <label className="d-campo">
        <span className="d-campo__etiqueta">Enlace de escritura (Apps Script)</span>
        <input
          className="d-input"
          value={envios}
          onChange={(e) => setEnvios(e.target.value)}
          placeholder="https://script.google.com/macros/s/…/exec"
          inputMode="url"
          autoComplete="off"
        />
        <span className="d-campo__ayuda">
          Sin esto el mapa funciona, pero solo se puede consultar.
        </span>
      </label>

      <div className="d-ficha__acciones">
        <button
          className="d-boton d-boton--principal"
          onClick={() => onConectar({ csv: csv.trim(), envios: envios.trim() })}
          disabled={!csv.trim()}
        >
          Conectar
        </button>
        {origen !== 'demo' && (
          <button className="d-boton" onClick={onOlvidar}>
            Volver a los datos de ejemplo
          </button>
        )}
      </div>

      {origen !== 'demo' && enlace && (
        <div className="d-ficha__bloque">
          <h3>Enlace para las cuadrillas</h3>
          <p className="d-campo__ayuda">
            Quien lo abra queda conectado a esta misma hoja después de confirmar.
          </p>
          <div className="d-ficha__acciones">
            <button
              className="d-boton"
              onClick={() => {
                void navigator.clipboard?.writeText(enlace).then(
                  () => setCopiado(true),
                  () => setCopiado(false),
                )
              }}
            >
              {copiado ? 'Copiado' : 'Copiar enlace'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export interface ConfirmarConexionProps {
  csv: string
  envios: string
  dominioDe: (url: string) => string
  onAceptar: () => void
  onRechazar: () => void
}

/**
 * Un enlace no conecta solo.
 *
 * El enlace trae a dónde se manda lo que capturan las cuadrillas; aceptarlo sin
 * mirar sería entregarle el trabajo de campo a quien mandó el mensaje. Se
 * enseña el dominio y se pide un sí.
 */
export function ConfirmarConexion({
  csv,
  envios,
  dominioDe,
  onAceptar,
  onRechazar,
}: ConfirmarConexionProps) {
  return (
    <div className="d-formulario">
      <p>Este enlace quiere conectar la aplicación a otra hoja:</p>
      <dl className="d-datos">
        <dt>Datos desde</dt>
        <dd>{dominioDe(csv)}</dd>
        {envios && (
          <>
            <dt>Lo que capturen se manda a</dt>
            <dd>{dominioDe(envios)}</dd>
          </>
        )}
      </dl>
      <p className="d-campo__ayuda">
        Conecten solo si el enlace lo mandó la coordinación de la operación.
      </p>
      <div className="d-ficha__acciones">
        <button className="d-boton d-boton--principal" onClick={onAceptar}>
          Conectar
        </button>
        <button className="d-boton" onClick={onRechazar}>
          No, seguir como estaba
        </button>
      </div>
    </div>
  )
}
