import {
  ESTADOS,
  ETIQUETA_ESTADO,
  estaUbicada,
  reclamoVigente,
  type Edificacion,
} from '@dania/data'
import L from 'leaflet'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { SIMBOLO_ESTADO } from './EstadoBadge.tsx'

/** Centro de Cali: lo que se ve mientras no haya datos ubicados. */
const CENTRO_CALI: L.LatLngTuple = [3.4516, -76.532]
const ZOOM_CIUDAD = 12

export interface MapaEdificacionesProps {
  edificaciones: Edificacion[]
  seleccionada?: Edificacion | null
  onSeleccionar: (edificacion: Edificacion) => void
  /**
   * Modo «toque el mapa»: coordinación ubicando un reporte sin coordenada o
   * creando una edificación (CU-11, CU-09). Con esto activo, tocar el mapa no
   * abre fichas: entrega el punto.
   */
  modoPunto?: { mensaje: string; onPunto: (lat: number, lon: number) => void; onCancelar: () => void }
}

/**
 * Mapa Leaflet sobre teselas de OpenStreetMap.
 *
 * Los marcadores no llevan popup de Leaflet: al tocar uno se avisa a React y la
 * ficha la pinta `FichaEdificacion`. Así el texto libre que escriben las
 * cuadrillas nunca se inserta como HTML — y la ficha se puede leer con lector
 * de pantalla.
 */
export function MapaEdificaciones({
  edificaciones,
  seleccionada,
  onSeleccionar,
  modoPunto,
}: MapaEdificacionesProps) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const capa = useRef<L.LayerGroup | null>(null)
  const marcadores = useRef(new Map<string, L.Marker>())
  const onSeleccionarRef = useRef(onSeleccionar)
  onSeleccionarRef.current = onSeleccionar
  const modoPuntoRef = useRef(modoPunto)
  modoPuntoRef.current = modoPunto

  // 1. Crear el mapa una sola vez.
  useEffect(() => {
    if (!contenedor.current || mapa.current) return

    const m = L.map(contenedor.current, {
      center: CENTRO_CALI,
      zoom: ZOOM_CIUDAD,
      // El zoom se hace con los dedos; los botones estorban en una pantalla pequeña.
      zoomControl: false,
    })
    // Positron (Carto): fondo gris pensado para datos — el semáforo se lee de
    // un vistazo y no compite con vías de colores. Sin llave; {r} sirve @2x en
    // pantallas retina.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; colaboradores de OpenStreetMap &copy; CARTO',
    }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    capa.current = L.layerGroup().addTo(m)
    mapa.current = m

    m.on('click', (evento: L.LeafletMouseEvent) => {
      const modo = modoPuntoRef.current
      if (modo) modo.onPunto(evento.latlng.lat, evento.latlng.lng)
    })

    // Sin esto el mapa queda gris cuando el contenedor cambia de tamaño
    // (rotar el teléfono, abrir el teclado, mostrar un aviso).
    const observador = new ResizeObserver(() => m.invalidateSize())
    observador.observe(contenedor.current)

    return () => {
      observador.disconnect()
      m.remove()
      mapa.current = null
      capa.current = null
      marcadores.current.clear()
    }
  }, [])

  // 2. Redibujar marcadores cuando cambian los datos o el filtro.
  const firma = edificaciones
    .map((e) => `${e.id}:${e.estado}:${e.lat},${e.lon}:${e.reclamadaPor}${e.reclamadaEn}`)
    .join('|')
  useEffect(() => {
    const m = mapa.current
    const grupo = capa.current
    if (!m || !grupo) return

    grupo.clearLayers()
    marcadores.current.clear()

    const ubicadas = edificaciones.filter(estaUbicada)
    for (const e of ubicadas) {
      // El reclamo es metadato, no un cuarto color: el semáforo sigue teniendo
      // tres estados y la edificación reclamada se marca con un anillo (CU-04.3).
      const reclamada = reclamoVigente(e)
      const etiqueta = `${ETIQUETA_ESTADO[e.estado]}${reclamada ? ` · reclamada por ${e.reclamadaPor}` : ''}: ${e.direccionTexto || e.id}`
      const marcador = L.marker([e.lat, e.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div class="d-marcador" data-estado="${e.estado}" data-reclamada="${reclamada}">${SIMBOLO_ESTADO[e.estado]}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        alt: etiqueta,
        title: etiqueta,
      })
      marcador.on('click keypress', () => onSeleccionarRef.current(e))
      marcador.addTo(grupo)
      marcadores.current.set(e.id, marcador)
    }

    // Encuadrar lo que el usuario acaba de pedir. Si no hay nada ubicado, se
    // queda mirando Cali: mejor un mapa vacío que un salto a mitad del océano.
    if (ubicadas.length > 0) {
      m.fitBounds(L.latLngBounds(ubicadas.map((e) => [e.lat, e.lon] as L.LatLngTuple)), {
        padding: [40, 40],
        maxZoom: 17,
      })
    }
    // `firma` resume los datos pintados; `edificaciones` cambia de identidad en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma])

  // 3. Resaltar la seleccionada sin volver a crear mil marcadores.
  useEffect(() => {
    for (const [id, marcador] of marcadores.current) {
      const el = marcador.getElement()?.querySelector<HTMLElement>('.d-marcador')
      if (el) el.dataset['seleccionada'] = String(id === seleccionada?.id)
    }
    if (seleccionada && estaUbicada(seleccionada)) {
      mapa.current?.panTo([seleccionada.lat, seleccionada.lon])
    }
  }, [seleccionada])

  return (
    <div style={{ position: 'relative', height: '100%' }} data-modo-punto={Boolean(modoPunto)}>
      <div ref={contenedor} className="d-mapa" role="application" aria-label="Mapa de edificaciones" />

      {modoPunto && (
        <div className="d-modo-punto">
          <span>{modoPunto.mensaje}</span>
          <button className="d-boton" onClick={modoPunto.onCancelar}>
            Cancelar
          </button>
        </div>
      )}

      {/* Arriba a la izquierda: abajo taparía la atribución de OpenStreetMap,
          que su licencia obliga a mantener visible. */}
      <div className="d-leyenda" style={{ position: 'absolute', left: 10, top: 10, zIndex: 500 }}>
        {ESTADOS.map((estado) => (
          <span key={estado}>
            <span className="d-marcador" data-estado={estado} style={{ display: 'inline-grid', verticalAlign: 'middle', width: 16, height: 16, fontSize: 10 }} aria-hidden="true">
              {SIMBOLO_ESTADO[estado]}
            </span>{' '}
            {ETIQUETA_ESTADO[estado]}
          </span>
        ))}
      </div>
    </div>
  )
}
