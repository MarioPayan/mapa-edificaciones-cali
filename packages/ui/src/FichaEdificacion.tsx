import { Dialog } from '@base-ui/react/dialog'
import {
  estaUbicada,
  fechaLegible,
  necesitaUbicacion,
  reclamoVigente,
  type DatosCaracterizar,
  type DatosColapsar,
  type Edificacion,
} from '@dania/data'
import { useEffect, useState } from 'react'
import { EstadoBadge } from './EstadoBadge.tsx'
import { FormularioCaracterizar, FormularioColapso } from './FormularioVisita.tsx'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number | null }) {
  if (valor === null || valor === '' || valor === undefined) return null
  return (
    <>
      <dt>{etiqueta}</dt>
      <dd>{valor}</dd>
    </>
  )
}

/** Composición legible de un conjunto: «5 torres · 36 apts por torre» (R-05). */
function descripcionUnidades(e: Edificacion): string {
  const partes: string[] = []
  if (e.numTorres !== null) partes.push(`${e.numTorres} torre${e.numTorres === 1 ? '' : 's'}`)
  if (e.aptsPorTorre !== null) partes.push(`${e.aptsPorTorre} apts por torre`)
  if (e.ocupacion) partes.push(`ocupación: ${e.ocupacion}`)
  return partes.join(' · ')
}

export interface AccionesFicha {
  /** Código de la cuadrilla que está usando el teléfono. */
  cuadrilla: string
  onReclamar: () => void
  onLiberar: () => void
  /** Toma el GPS del teléfono en sitio; la referencia es opcional (CU-05.4). */
  onUbicar: (referencia: string) => void
  onCaracterizar: (datos: DatosCaracterizar) => void
  onColapsar: (datos: DatosColapsar) => void
  /** El GPS está respondiendo. */
  ubicando?: boolean
  errorUbicacion?: string | null
  /** Solo coordinación: fusionar este reporte con otro (CU-11). */
  coordinacion?: {
    candidatos: Edificacion[]
    onDuplicar: (duplicadoDe: string) => void
  }
}

export interface FichaEdificacionProps {
  edificacion: Edificacion | null
  onCerrar: () => void
  /** Sin acciones la ficha es de solo lectura (así funcionó la fase 1). */
  acciones?: AccionesFicha
}

/**
 * La ficha que pidió Dania: «que cuando se toque ese cosito aparezca qué se
 * hizo, la caracterización y la información que uno recolectó» (4.ogg 01:49).
 * Nunca muestra datos de contacto: no existen en el modelo.
 */
export function FichaEdificacion({ edificacion, onCerrar, acciones }: FichaEdificacionProps) {
  const e = edificacion
  const [modo, setModo] = useState<'ficha' | 'caracterizar' | 'colapsar' | 'ubicar' | 'duplicar'>(
    'ficha',
  )
  const [referencia, setReferencia] = useState('')
  const [principal, setPrincipal] = useState('')

  // Al cambiar de edificación se vuelve a la ficha: nadie quiere abrir un punto
  // nuevo y encontrarse el formulario del anterior a medio llenar.
  useEffect(() => {
    setModo('ficha')
    setReferencia('')
    setPrincipal('')
  }, [e?.id])

  const unidades = e ? descripcionUnidades(e) : ''
  const reclamada = e ? reclamoVigente(e) : false
  const esMia = reclamada && e?.reclamadaPor === acciones?.cuadrilla

  return (
    <Dialog.Root open={e !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="d-ficha-fondo" />
        <Dialog.Popup className="d-ficha">
          {e && (
            <>
              <div className="d-ficha__encabezado">
                <div>
                  <Dialog.Title className="d-ficha__direccion">
                    {e.direccionTexto || 'Sin dirección registrada'}
                  </Dialog.Title>
                  <p className="d-ficha__sub">
                    {[e.barrio, e.comuna && `comuna ${e.comuna}`, e.id].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Dialog.Close className="d-ficha__cerrar" aria-label="Cerrar">
                  ✕
                </Dialog.Close>
              </div>

              {modo === 'caracterizar' && acciones && (
                <FormularioCaracterizar
                  edificacion={e}
                  onEnviar={(datos) => {
                    acciones.onCaracterizar(datos)
                    setModo('ficha')
                  }}
                  onCancelar={() => setModo('ficha')}
                />
              )}

              {modo === 'colapsar' && acciones && (
                <FormularioColapso
                  edificacion={e}
                  onEnviar={(datos) => {
                    acciones.onColapsar(datos)
                    setModo('ficha')
                  }}
                  onCancelar={() => setModo('ficha')}
                />
              )}

              {modo === 'ubicar' && acciones && (
                <div className="d-formulario">
                  <p className="d-campo__ayuda">
                    Párense frente al inmueble y tomen el punto. El GPS funciona sin señal; la
                    ubicación que tomen manda sobre la dirección escrita.
                  </p>
                  <label className="d-campo">
                    <span className="d-campo__etiqueta">Referencia (opcional)</span>
                    <input
                      className="d-input"
                      placeholder="Torre B, entrada por la 58N"
                      value={referencia}
                      onChange={(evento) => setReferencia(evento.target.value)}
                    />
                  </label>
                  <div className="d-ficha__acciones">
                    <button
                      className="d-boton d-boton--principal"
                      disabled={acciones.ubicando}
                      onClick={() => {
                        acciones.onUbicar(referencia.trim())
                        setModo('ficha')
                      }}
                    >
                      {acciones.ubicando ? 'Tomando GPS…' : 'Tomar el punto aquí'}
                    </button>
                    <button className="d-boton" onClick={() => setModo('ficha')}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {modo === 'duplicar' && acciones?.coordinacion && (
                <div className="d-formulario">
                  <p className="d-campo__ayuda">
                    Fusionar marca este reporte como duplicado de otro: sale del mapa, pero no se
                    borra nada y se puede deshacer en la hoja.
                  </p>
                  <label className="d-campo">
                    <span className="d-campo__etiqueta">Es la misma edificación que…</span>
                    <select
                      className="d-input"
                      value={principal}
                      onChange={(evento) => setPrincipal(evento.target.value)}
                    >
                      <option value="">Elegir edificación</option>
                      {acciones.coordinacion.candidatos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.direccionTexto || c.id} {c.barrio ? `· ${c.barrio}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="d-ficha__acciones">
                    <button
                      className="d-boton d-boton--principal"
                      disabled={!principal}
                      onClick={() => {
                        acciones.coordinacion?.onDuplicar(principal)
                        setModo('ficha')
                      }}
                    >
                      Fusionar
                    </button>
                    <button className="d-boton" onClick={() => setModo('ficha')}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {modo === 'ficha' && (
                <>
                  <p style={{ margin: '0 0 12px' }}>
                    <EstadoBadge estado={e.estado} />
                  </p>

                  {necesitaUbicacion(e) && (
                    <p className="d-aviso" style={{ marginBottom: 12 }}>
                      Ubicación aproximada: sale del reporte, no de una visita. Puede caer en otra
                      casa de la manzana — confírmenla en sitio.
                    </p>
                  )}

                  {reclamada && (
                    <p className="d-aviso" data-tono="info" style={{ marginBottom: 12 }}>
                      {esMia
                        ? 'La reclamó su cuadrilla. Si no van, se libera sola en 4 horas.'
                        : `Reclamada por la cuadrilla ${e.reclamadaPor}. Si no van, se libera sola.`}
                    </p>
                  )}

                  {acciones?.errorUbicacion && (
                    <p className="d-aviso" data-tono="error" style={{ marginBottom: 12 }}>
                      {acciones.errorUbicacion}
                    </p>
                  )}

                  <dl className="d-datos">
                    <Dato etiqueta="Tipo" valor={e.tipoEdificacion} />
                    <Dato etiqueta="Unidades" valor={unidades} />
                    <Dato etiqueta="Fallecidos o atrapados" valor={e.fallecidosAtrapados} />
                    <Dato
                      etiqueta="Rescatadas en sitio"
                      valor={
                        e.rescatadasEnSitio === null
                          ? e.estado === 'ROJO'
                            ? 'sin dato'
                            : null
                          : `${e.rescatadasEnSitio}${e.rescatadasFuente ? ` (${e.rescatadasFuente})` : ''}`
                      }
                    />
                    <Dato
                      etiqueta="Visitada"
                      valor={[fechaLegible(e.visitadaEn), e.visitadaPor && `por ${e.visitadaPor}`]
                        .filter(Boolean)
                        .join(' ')}
                    />
                    <Dato etiqueta="Reportada" valor={fechaLegible(e.creadoEn)} />
                  </dl>

                  {e.caracterizacion && (
                    <div className="d-ficha__bloque">
                      <h3>Caracterización</h3>
                      <p className="d-ficha__texto">{e.caracterizacion}</p>
                    </div>
                  )}

                  {e.observaciones && (
                    <div className="d-ficha__bloque">
                      <h3>Observaciones</h3>
                      <p className="d-ficha__texto">{e.observaciones}</p>
                    </div>
                  )}

                  <div className="d-ficha__acciones">
                    {estaUbicada(e) && (
                      <a
                        className="d-boton"
                        href={`https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lon}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Cómo llegar
                      </a>
                    )}

                    {acciones && (
                      <>
                        {e.estado !== 'VERDE' &&
                          (esMia ? (
                            <button className="d-boton" onClick={acciones.onLiberar}>
                              Liberar
                            </button>
                          ) : (
                            <button
                              className="d-boton d-boton--principal"
                              onClick={acciones.onReclamar}
                              disabled={reclamada}
                            >
                              {reclamada ? 'Reclamada por otra' : 'Reclamar'}
                            </button>
                          ))}

                        <button className="d-boton" onClick={() => setModo('ubicar')}>
                          Estoy aquí
                        </button>

                        <button
                          className="d-boton d-boton--principal"
                          onClick={() => setModo('caracterizar')}
                        >
                          Caracterizar
                        </button>

                        {e.estado !== 'ROJO' && (
                          <button className="d-boton" onClick={() => setModo('colapsar')}>
                            Marcar colapsada
                          </button>
                        )}

                        {acciones.coordinacion && (
                          <button className="d-boton" onClick={() => setModo('duplicar')}>
                            Es duplicada
                          </button>
                        )}
                      </>
                    )}

                    <Dialog.Close className="d-boton">Cerrar</Dialog.Close>
                  </div>
                </>
              )}
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
