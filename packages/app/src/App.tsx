import {
  aplicarEnvios,
  crearEnvio,
  filtrar,
  FILTRO_VACIO,
  necesitaUbicacion,
  sinDuplicados,
  type DatosCaracterizar,
  type DatosColapsar,
  type DatosCrear,
  type Edificacion,
  type Filtro,
} from '@dania/data'
import {
  Aviso,
  BarraCola,
  CodigoCuadrilla,
  Contadores,
  FichaEdificacion,
  FiltroBarra,
  FormularioCrear,
  ListaEdificaciones,
  MapaEdificaciones,
  Modal,
  PanelCoordinacion,
  type AccionesFicha,
} from '@dania/ui'
import { useCallback, useMemo, useState } from 'react'
import { useCola } from './useCola.ts'
import { useEdificaciones } from './useEdificaciones.ts'

/**
 * Sin `VITE_CSV_URL` la aplicación arranca con datos de demostración: se puede
 * mostrar a una cuadrilla o a la coordinación sin tocar la hoja real.
 */
const URL_DEMO = `${import.meta.env.BASE_URL}demo/edificaciones.csv`
const URL_CSV = import.meta.env['VITE_CSV_URL'] || URL_DEMO
const ES_DEMO = URL_CSV === URL_DEMO

/**
 * Sin endpoint de escritura, la aplicación queda de solo lectura… salvo sobre
 * los datos de demostración, donde se habilita un modo de práctica: los cambios
 * se guardan en este teléfono y nunca se mandan a ninguna parte. Sirve para
 * enseñar el flujo completo a una cuadrilla sin tocar la hoja real.
 */
const URL_ENVIOS = import.meta.env['VITE_ENVIOS_URL'] || ''
const ES_PRACTICA = !URL_ENVIOS && ES_DEMO

const CLAVE_CUADRILLA = 'dania:cuadrilla'
const CLAVE_COORDINACION = 'dania:coordinacion'

type Vista = 'mapa' | 'lista'
type ModoPunto = { tipo: 'ubicar'; edificacion: Edificacion } | { tipo: 'crear' } | null

function horaCorta(fecha: Date): string {
  return fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

/** GPS del teléfono. No necesita datos móviles: funciona sin señal (PLAN.md §6). */
function pedirUbicacion(): Promise<GeolocationPosition> {
  return new Promise((resolver, rechazar) => {
    if (!navigator.geolocation) {
      rechazar(new Error('Este teléfono no entrega ubicación'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolver, rechazar, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
    })
  })
}

export function App() {
  const { edificaciones, columnasProhibidas, cargando, error, actualizadoEn, recargar } =
    useEdificaciones(URL_CSV)
  const { cola, aplicados, rechazos, enviando, hayRed, agregar, enviar, descartarRechazos } =
    useCola(URL_ENVIOS, ES_PRACTICA)

  const [filtro, setFiltro] = useState<Filtro>(FILTRO_VACIO)
  const [vista, setVista] = useState<Vista>('mapa')
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null)
  const [cuadrilla, setCuadrilla] = useState(() => localStorage.getItem(CLAVE_CUADRILLA) ?? '')
  const [coordinacion, setCoordinacion] = useState(
    () => localStorage.getItem(CLAVE_COORDINACION) === 'si',
  )
  const [modoPunto, setModoPunto] = useState<ModoPunto>(null)
  const [puntoCreacion, setPuntoCreacion] = useState<{ lat: number; lon: number } | null>(null)
  const [ubicando, setUbicando] = useState(false)
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null)

  // Lo que está en la cola (y en modo práctica, lo ya «aplicado») se pinta ya:
  // sin señal, una cuadrilla que reclama y no ve pasar nada vuelve a reclamar.
  const conPendientes = useMemo(
    () => sinDuplicados(aplicarEnvios(edificaciones, [...aplicados, ...cola])),
    [edificaciones, aplicados, cola],
  )
  const visibles = useMemo(() => filtrar(conPendientes, filtro), [conPendientes, filtro])
  const seleccionada = useMemo(
    () => conPendientes.find((e) => e.id === seleccionadaId) ?? null,
    [conPendientes, seleccionadaId],
  )

  const puedeEscribir = Boolean((URL_ENVIOS || ES_PRACTICA) && cuadrilla)

  const guardarCuadrilla = useCallback((codigo: string) => {
    localStorage.setItem(CLAVE_CUADRILLA, codigo)
    setCuadrilla(codigo)
  }, [])

  const alternarCoordinacion = useCallback(() => {
    setCoordinacion((previo) => {
      localStorage.setItem(CLAVE_COORDINACION, previo ? 'no' : 'si')
      return !previo
    })
  }, [])

  const enviarSobre = useCallback(
    (
      edificacion: Edificacion,
      tipo: Parameters<typeof crearEnvio>[0],
      datos?: Parameters<typeof crearEnvio>[3],
    ) => {
      if (!cuadrilla) return
      void agregar(crearEnvio(tipo, edificacion.id, cuadrilla, datos))
    },
    [agregar, cuadrilla],
  )

  const enviarCambio = useCallback(
    (tipo: Parameters<typeof crearEnvio>[0], datos?: Parameters<typeof crearEnvio>[3]) => {
      if (seleccionada) enviarSobre(seleccionada, tipo, datos)
    },
    [enviarSobre, seleccionada],
  )

  /** Toma el GPS y encola la ubicación. Devuelve false si no se pudo. */
  const capturarUbicacion = useCallback(
    async (edificacion: Edificacion, referencia: string, manual = false): Promise<boolean> => {
      setUbicando(true)
      setErrorUbicacion(null)
      try {
        const posicion = await pedirUbicacion()
        enviarSobre(edificacion, 'ubicar', {
          lat: posicion.coords.latitude,
          lon: posicion.coords.longitude,
          exactitudM: posicion.coords.accuracy ?? null,
          ...(referencia ? { referencia } : {}),
          ...(manual ? { manual: true } : {}),
        })
        return true
      } catch (fallo) {
        setErrorUbicacion(
          fallo instanceof Error
            ? `No se pudo tomar el GPS: ${fallo.message}`
            : 'No se pudo tomar el GPS',
        )
        return false
      } finally {
        setUbicando(false)
      }
    },
    [enviarSobre],
  )

  const acciones: AccionesFicha | undefined =
    puedeEscribir && seleccionada
      ? {
          cuadrilla,
          ubicando,
          errorUbicacion,
          onReclamar: () => enviarCambio('reclamar'),
          onLiberar: () => enviarCambio('liberar'),
          onColapsar: (datos: DatosColapsar) => enviarCambio('colapsar', datos),
          onUbicar: (referencia: string) => void capturarUbicacion(seleccionada, referencia),
          onCaracterizar: async (datos: DatosCaracterizar) => {
            // CU-06.4: si nadie corrigió la ubicación antes, se captura ahora.
            // Si el GPS falla, la caracterización se manda igual — perderla
            // por no tener señal de satélite sería absurdo.
            if (necesitaUbicacion(seleccionada)) await capturarUbicacion(seleccionada, '')
            enviarSobre(seleccionada, 'caracterizar', datos)
          },
          ...(coordinacion
            ? {
                coordinacion: {
                  candidatos: conPendientes
                    .filter((c) => c.id !== seleccionada.id)
                    .filter((c) => !seleccionada.barrio || c.barrio === seleccionada.barrio)
                    .slice(0, 50),
                  onDuplicar: (duplicadoDe: string) => enviarCambio('duplicar', { duplicadoDe }),
                },
              }
            : {}),
        }
      : undefined

  const alTocarMapa = useCallback(
    (lat: number, lon: number) => {
      if (!modoPunto) return
      if (modoPunto.tipo === 'ubicar') {
        enviarSobre(modoPunto.edificacion, 'ubicar', { lat, lon, exactitudM: null, manual: true })
        setModoPunto(null)
      } else {
        setPuntoCreacion({ lat, lon })
        setModoPunto(null)
      }
    },
    [enviarSobre, modoPunto],
  )

  return (
    <div className="a-pantalla">
      <header className="a-encabezado">
        <div className="a-encabezado__titulo">
          <h1>Edificaciones afectadas</h1>
          <div className="a-encabezado__acciones">
            {(URL_ENVIOS || ES_PRACTICA) && (
              <CodigoCuadrilla cuadrilla={cuadrilla} onCambiar={guardarCuadrilla} />
            )}
            <button className="d-boton" onClick={() => void recargar()} disabled={cargando}>
              {cargando ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
        </div>
        <Contadores edificaciones={visibles} />
        <div className="a-encabezado__pie">
          <p className="a-marca-tiempo">
            {actualizadoEn
              ? `Datos de las ${horaCorta(actualizadoEn)} · ${visibles.length} de ${conPendientes.length} edificaciones`
              : 'Cargando información…'}
          </p>
          <div className="a-vistas">
            <button
              className="d-boton"
              aria-pressed={vista === 'mapa'}
              onClick={() => setVista('mapa')}
            >
              Mapa
            </button>
            <button
              className="d-boton"
              aria-pressed={vista === 'lista'}
              onClick={() => setVista('lista')}
            >
              Lista
            </button>
            {puedeEscribir && (
              <button className="d-boton" aria-pressed={coordinacion} onClick={alternarCoordinacion}>
                Coordinación
              </button>
            )}
          </div>
        </div>
      </header>

      <BarraCola
        pendientes={cola.length}
        enviando={enviando}
        hayRed={hayRed}
        rechazos={rechazos}
        onEnviar={() => void enviar()}
        onDescartarRechazos={() => void descartarRechazos()}
      />

      {columnasProhibidas.length > 0 && (
        <Aviso tono="error">
          El CSV publicado incluye columnas con datos personales (
          {columnasProhibidas.join(', ')}). Se están ignorando, pero cualquiera con el enlace puede
          descargarlas: publiquen <strong>solo la pestaña «publico»</strong> y revoquen la
          publicación actual.
        </Aviso>
      )}

      {error && (
        <Aviso tono="error">
          No se pudo actualizar ({error}).{' '}
          {edificaciones.length > 0
            ? 'Se está mostrando la última información descargada.'
            : 'Revisen la conexión o el enlace del CSV.'}
        </Aviso>
      )}

      {ES_PRACTICA && (
        <Aviso tono="info">
          <strong>Modo práctica con datos de ejemplo.</strong> Pueden reclamar, ubicar y
          caracterizar para aprender el flujo: los cambios se quedan en este teléfono y no se envían
          a ninguna parte.
          {!cuadrilla && ' Empiecen poniendo el código de su cuadrilla arriba.'}
        </Aviso>
      )}

      {ES_DEMO && !ES_PRACTICA && (
        <Aviso tono="info">
          Datos de demostración. Para usar la hoja real, definan <code>VITE_CSV_URL</code> con el
          CSV publicado de la pestaña «publico».
        </Aviso>
      )}

      {/* En práctica el aviso de arriba ya lo dice: dos franjas seguidas empujan
          el mapa fuera de la pantalla en un teléfono. */}
      {URL_ENVIOS && !cuadrilla && (
        <Aviso tono="info">
          Pongan el código de su cuadrilla arriba para poder reclamar y caracterizar. Sin código, el
          mapa es de solo lectura.
        </Aviso>
      )}

      <FiltroBarra edificaciones={conPendientes} filtro={filtro} onCambiar={setFiltro} />

      <main className="a-contenido">
        {vista === 'mapa' ? (
          <MapaEdificaciones
            edificaciones={visibles}
            seleccionada={seleccionada}
            onSeleccionar={(e: Edificacion) => setSeleccionadaId(e.id)}
            {...(modoPunto
              ? {
                  modoPunto: {
                    mensaje:
                      modoPunto.tipo === 'ubicar'
                        ? `Toque dónde está: ${modoPunto.edificacion.direccionTexto || modoPunto.edificacion.id}`
                        : 'Toque dónde está la edificación nueva',
                    onPunto: alTocarMapa,
                    onCancelar: () => setModoPunto(null),
                  },
                }
              : {})}
          />
        ) : (
          <ListaEdificaciones
            edificaciones={visibles}
            cuadrilla={cuadrilla}
            onSeleccionar={(e: Edificacion) => setSeleccionadaId(e.id)}
            {...(puedeEscribir
              ? { onReclamar: (e: Edificacion) => enviarSobre(e, 'reclamar') }
              : {})}
          />
        )}
      </main>

      {coordinacion && puedeEscribir && (
        <PanelCoordinacion
          edificaciones={conPendientes}
          ubicando={modoPunto?.tipo === 'ubicar' ? modoPunto.edificacion : null}
          onSeleccionar={(e: Edificacion) => setSeleccionadaId(e.id)}
          onUbicar={(e: Edificacion) => {
            setVista('mapa')
            setModoPunto({ tipo: 'ubicar', edificacion: e })
          }}
          onCrear={() => {
            setVista('mapa')
            setModoPunto({ tipo: 'crear' })
          }}
        />
      )}

      <FichaEdificacion
        edificacion={seleccionada}
        onCerrar={() => setSeleccionadaId(null)}
        {...(acciones ? { acciones } : {})}
      />

      <Modal
        abierto={puntoCreacion !== null}
        titulo="Nueva edificación"
        onCerrar={() => setPuntoCreacion(null)}
      >
        {puntoCreacion && (
          <FormularioCrear
            lat={puntoCreacion.lat}
            lon={puntoCreacion.lon}
            onCancelar={() => setPuntoCreacion(null)}
            onEnviar={(datos: DatosCrear) => {
              // El id lo pone el cliente para que el envío sea idempotente; el
              // script rechaza si ya existe.
              const id = `C-${Date.now().toString(36).toUpperCase()}`
              void agregar(crearEnvio('crear', id, cuadrilla, datos))
              setPuntoCreacion(null)
            }}
          />
        )}
      </Modal>
    </div>
  )
}
