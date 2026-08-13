import { barriosDeComuna, buscarBarrio, COMUNAS, type DatosReportar } from '@dania/data'
import { useEffect, useState } from 'react'

export interface FormularioReporteProps {
  /** Toma el GPS del teléfono. Devuelve la coordenada o lanza si no se pudo. */
  obtenerGPS: () => Promise<{ lat: number; lon: number }>
  /** Encola el reporte. La cola offline se encarga si no hay señal. */
  onReportar: (datos: DatosReportar) => void
  onCerrar: () => void
}

/**
 * CU-13, la primera puerta de Dania: «vengan, revisen mi casa». Lo mínimo que
 * pidió: nombre, celular, correo, y que el punto se ubique solo con el GPS.
 * Sin código, sin cuenta. El GPS se intenta al abrir; si no da, la dirección
 * escrita basta y coordinación ubica después (CU-11).
 */
export function FormularioReporte({ obtenerGPS, onReportar, onCerrar }: FormularioReporteProps) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo] = useState('')
  const [direccionTexto, setDireccion] = useState('')
  const [unidadApto, setUnidadApto] = useState('')
  const [comuna, setComuna] = useState('')
  const [barrio, setBarrio] = useState('')
  const [gps, setGps] = useState<{ lat: number; lon: number } | null>(null)
  const [gpsEstado, setGpsEstado] = useState<'tomando' | 'ok' | 'fallo'>('tomando')
  const [enviado, setEnviado] = useState(false)

  const tomarGPS = () => {
    setGpsEstado('tomando')
    obtenerGPS()
      .then((punto) => {
        setGps(punto)
        setGpsEstado('ok')
      })
      .catch(() => setGpsEstado('fallo'))
  }

  // Dania: «le doy click y ya ubica el punto según el GPS» — se toma solo al
  // abrir, parado frente al inmueble no hay nada más que hacer.
  useEffect(tomarGPS, [])

  if (enviado) {
    return (
      <div className="d-formulario">
        <p>
          <strong>Reporte enviado.</strong> Su edificación ya aparece en el mapa como «por
          visitar» y una cuadrilla de evaluación la tomará de ahí. Si no hay señal en este
          momento, el reporte queda guardado en el teléfono y sale solo cuando vuelva.
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
        onReportar({
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          correo: correo.trim(),
          direccionTexto: direccionTexto.trim(),
          barrio,
          comuna,
          unidadApto: unidadApto.trim(),
          lat: gps?.lat ?? null,
          lon: gps?.lon ?? null,
        })
        setEnviado(true)
      }}
    >
      <p className="d-campo__ayuda">
        Para pedir que una cuadrilla evalúe su edificación. Su contacto solo lo ve el equipo de
        coordinación; nunca sale al mapa público.
      </p>

      <p className="d-campo__ayuda" aria-live="polite">
        {gpsEstado === 'tomando' && 'Tomando la ubicación del teléfono…'}
        {gpsEstado === 'ok' && 'Ubicación tomada: el punto queda donde está usted ahora.'}
        {gpsEstado === 'fallo' && (
          <>
            No se pudo tomar el GPS — el reporte vale igual con la dirección.{' '}
            <button type="button" className="d-boton" onClick={tomarGPS}>
              Reintentar GPS
            </button>
          </>
        )}
      </p>

      <label className="d-campo">
        <span className="d-campo__etiqueta">Nombre</span>
        <input className="d-input" required value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
      </label>

      <label className="d-campo">
        <span className="d-campo__etiqueta">Celular</span>
        <input className="d-input" required type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="tel" />
      </label>

      <label className="d-campo">
        <span className="d-campo__etiqueta">Correo (opcional)</span>
        <input className="d-input" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="email" />
      </label>

      <label className="d-campo">
        <span className="d-campo__etiqueta">Dirección</span>
        <input className="d-input" required value={direccionTexto} onChange={(e) => setDireccion(e.target.value)} autoComplete="street-address" />
      </label>

      <div className="d-formulario__fila">
        <label className="d-campo">
          <span className="d-campo__etiqueta">Torre / apto (opcional)</span>
          <input className="d-input" value={unidadApto} onChange={(e) => setUnidadApto(e.target.value)} />
        </label>
        <label className="d-campo">
          <span className="d-campo__etiqueta">Barrio (opcional)</span>
          <select
            className="d-input"
            value={barrio}
            onChange={(e) => {
              setBarrio(e.target.value)
              const encontrado = buscarBarrio(e.target.value)
              if (encontrado?.comuna) setComuna(encontrado.comuna)
            }}
          >
            <option value="">—</option>
            {(comuna ? barriosDeComuna(comuna) : COMUNAS.flatMap((c) => barriosDeComuna(c))).map(
              (b) => (
                <option key={b.nombre} value={b.nombre}>
                  {b.nombre}
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      <div className="d-ficha__acciones">
        <button type="submit" className="d-boton d-boton--principal">
          Enviar reporte
        </button>
        <button type="button" className="d-boton" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
