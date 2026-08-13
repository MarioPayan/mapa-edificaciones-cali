import {
  aplicarEnvios,
  crearEnvio,
  filtrar,
  FILTRO_VACIO,
  necesitaUbicacion,
  registrarCuadrilla,
  sinDuplicados,
  type DatosCaracterizar,
  type DatosColapsar,
  type DatosCrear,
  type DatosRegistro,
  type DatosReportar,
  type Edificacion,
  type Filtro,
} from '@dania/data'
import {
  Aviso,
  BarraCola,
  CodigoCuadrilla,
  contarFiltrosDeZona,
  Contadores,
  FichaEdificacion,
  FiltroBarra,
  FormularioCrear,
  FormularioRegistro,
  FormularioReporte,
  ListaEdificaciones,
  MapaEdificaciones,
  ConfirmarConexion,
  Modal,
  PanelConexion,
  PanelCoordinacion,
  type AccionesFicha,
} from '@dania/ui'
import { useCallback, useMemo, useState } from 'react'
import {
  dominioDe,
  enlaceParaCompartir,
  guardarConfiguracion,
  leerConfiguracion,
  limpiarEnlace,
  olvidarConfiguracion,
  propuestaDelEnlace,
  type Propuesta,
} from './configuracion.ts'
import { useCola } from './useCola.ts'
import { useEdificaciones } from './useEdificaciones.ts'

/** Datos de ejemplo mientras no haya una hoja conectada. */
const URL_DEMO = `${import.meta.env.BASE_URL}demo/edificaciones.csv`

const CLAVE_CUADRILLA = 'dania:cuadrilla'
const CLAVE_COORDINACION = 'dania:coordinacion'

/**
 * En modo práctica se entra con una cuadrilla puesta y coordinación abierta:
 * quien abre el enlace para probar la idea quiere marcar puntos, no configurar
 * nada. Ambas cosas siguen siendo editables. Con datos reales no se presupone
 * ningún código: ahí el código identifica a una cuadrilla de verdad.
 */
const CUADRILLA_PRACTICA = 'C-01'

type Vista = 'mapa' | 'lista'
type ModoPunto = { tipo: 'ubicar'; edificacion: Edificacion } | { tipo: 'crear' } | null

function horaCorta(fecha: Date): string {
  return fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

/** GPS del teléfono. No necesita datos móviles: funciona sin señal (documentado en el README). */
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
  // La hoja puede venir del teléfono, de la compilación o de ningún sitio; en
  // este último caso se muestran datos de ejemplo y se practica sobre ellos.
  const [configuracion, setConfiguracion] = useState(() => leerConfiguracion())
  const [propuesta, setPropuesta] = useState<Propuesta | null>(() => propuestaDelEnlace())
  const ES_DEMO = configuracion.origen === 'demo'
  const URL_CSV = ES_DEMO ? URL_DEMO : configuracion.csv
  const URL_ENVIOS = ES_DEMO ? '' : configuracion.envios
  const ES_PRACTICA = ES_DEMO

  const { edificaciones, columnasProhibidas, cargando, error, actualizadoEn, recargar } =
    useEdificaciones(URL_CSV)
  const {
    cola,
    aplicados,
    rechazos,
    enviando,
    hayRed,
    agregar,
    enviar,
    descartarRechazos,
    borrarLoLocal,
  } = useCola(URL_ENVIOS, ES_PRACTICA)

  const conectar = useCallback((datos: Propuesta) => {
    guardarConfiguracion(datos)
    limpiarEnlace()
    setPropuesta(null)
    setConfiguracion(leerConfiguracion())
  }, [])

  const olvidar = useCallback(() => {
    olvidarConfiguracion()
    limpiarEnlace()
    setPropuesta(null)
    setConfiguracion(leerConfiguracion())
  }, [])

  const [filtro, setFiltro] = useState<Filtro>(FILTRO_VACIO)
  const [vista, setVista] = useState<Vista>('mapa')
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null)
  const [cuadrilla, setCuadrilla] = useState(
    () => localStorage.getItem(CLAVE_CUADRILLA) ?? (ES_PRACTICA ? CUADRILLA_PRACTICA : ''),
  )
  const [coordinacion, setCoordinacion] = useState(() => {
    const guardado = localStorage.getItem(CLAVE_COORDINACION)
    return guardado === null ? ES_PRACTICA : guardado === 'si'
  })
  const [modoPunto, setModoPunto] = useState<ModoPunto>(null)
  const [panel, setPanel] = useState<
    'ninguno' | 'filtros' | 'ayuda' | 'coordinacion' | 'conexion' | 'registro' | 'reporte'
  >('ninguno')
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
  // Los contadores ignoran el filtro de estado: si no, tocar «Colapsada» dejaría
  // los otros dos en cero y ya no se sabría cuántas hay.
  const visiblesSinEstado = useMemo(
    () => filtrar(conPendientes, { ...filtro, estados: [] }),
    [conPendientes, filtro],
  )
  const alternarEstado = useCallback(
    (estado: (typeof filtro.estados)[number]) =>
      setFiltro((previo) => ({
        ...previo,
        estados: previo.estados.includes(estado)
          ? previo.estados.filter((e) => e !== estado)
          : [...previo.estados, estado],
      })),
    [],
  )
  const seleccionada = useMemo(
    () => conPendientes.find((e) => e.id === seleccionadaId) ?? null,
    [conPendientes, seleccionadaId],
  )

  const puedeEscribir = Boolean((URL_ENVIOS || ES_PRACTICA) && cuadrilla)
  const filtrosDeZona = contarFiltrosDeZona(filtro)

  const guardarCuadrilla = useCallback((codigo: string) => {
    localStorage.setItem(CLAVE_CUADRILLA, codigo)
    setCuadrilla(codigo)
  }, [])

  /**
   * CU-12: registro en autoservicio. En práctica no hay servidor: se asigna un
   * código local para poder ensayar el flujo completo — igual que el resto del
   * modo práctica, no sale del teléfono.
   */
  const registrar = useCallback(
    async (datos: DatosRegistro) => {
      const codigo = ES_PRACTICA ? 'R-01' : await registrarCuadrilla(URL_ENVIOS, datos)
      guardarCuadrilla(codigo)
      return codigo
    },
    [ES_PRACTICA, URL_ENVIOS, guardarCuadrilla],
  )

  /**
   * CU-13: la puerta del residente. No exige código — el reporte viaja con su
   * contacto. Va por la cola: sin señal queda guardado y sale solo.
   */
  const reportar = useCallback(
    (datos: DatosReportar) => {
      // El id lo pone el cliente para que el reintento sea idempotente (como en crear).
      const id = `V-${Date.now().toString(36).toUpperCase()}`
      void agregar(crearEnvio('reportar', id, cuadrilla, datos))
    },
    [agregar, cuadrilla],
  )

  const abrirCoordinacion = useCallback(() => {
    localStorage.setItem(CLAVE_COORDINACION, 'si')
    setCoordinacion(true)
    setPanel('coordinacion')
  }, [])

  const salirDeCoordinacion = useCallback(() => {
    localStorage.setItem(CLAVE_COORDINACION, 'no')
    setCoordinacion(false)
    setPanel('ninguno')
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
              <CodigoCuadrilla
                cuadrilla={cuadrilla}
                onCambiar={guardarCuadrilla}
                onRegistrar={() => setPanel('registro')}
              />
            )}
            <button
              className="d-boton d-boton--icono"
              onClick={() => void recargar()}
              disabled={cargando}
              aria-label={
                actualizadoEn
                  ? `Actualizar. Datos de las ${horaCorta(actualizadoEn)}`
                  : 'Actualizar'
              }
              title={actualizadoEn ? `Datos de las ${horaCorta(actualizadoEn)}` : 'Actualizar'}
            >
              {cargando ? '…' : '↻'}
            </button>
            {/* El aviso de práctica ocupaba seis líneas de mapa: ahora es un
                ícono que lo cuenta cuando alguien pregunta. */}
            <button
              className="d-boton d-boton--icono"
              onClick={() => setPanel('ayuda')}
              aria-label="Qué es esto y cómo se usa"
            >
              ⓘ
            </button>
          </div>
        </div>

        <Contadores
          edificaciones={visiblesSinEstado}
          estadosActivos={filtro.estados}
          onAlternar={alternarEstado}
        />

        <div className="a-controles">
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
          </div>
          <button
            className="d-boton"
            aria-pressed={filtrosDeZona > 0}
            onClick={() => setPanel('filtros')}
          >
            Filtros
            {filtrosDeZona > 0 && <span className="d-boton__insignia">{filtrosDeZona}</span>}
          </button>
          {puedeEscribir && (
            <button className="d-boton" aria-pressed={coordinacion} onClick={abrirCoordinacion}>
              Coordinación
            </button>
          )}
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

      {/* Solo lo que exige acción se queda ocupando pantalla; lo explicativo
          vive detrás del ícono ⓘ. */}
      {/* Las dos puertas (CU-12 y CU-13): residente que reporta, cuadrilla que revisa. */}
      {URL_ENVIOS && !cuadrilla && (
        <Aviso tono="info">
          ¿Su edificación está afectada?{' '}
          <button className="d-boton" onClick={() => setPanel('reporte')}>
            Reportar mi edificación
          </button>{' '}
          ¿Es de una cuadrilla de evaluación? Ponga su código arriba, o{' '}
          <button className="d-boton" onClick={() => setPanel('registro')}>
            regístrese
          </button>{' '}
          para recibir uno.
        </Aviso>
      )}

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

      <Modal
        abierto={panel === 'coordinacion'}
        titulo="Coordinación"
        onCerrar={() => setPanel('ninguno')}
      >
        <PanelCoordinacion
          edificaciones={conPendientes}
          ubicando={modoPunto?.tipo === 'ubicar' ? modoPunto.edificacion : null}
          onSeleccionar={(e: Edificacion) => {
            setPanel('ninguno')
            setSeleccionadaId(e.id)
          }}
          onUbicar={(e: Edificacion) => {
            // El diálogo se cierra solo: lo que sigue es tocar el mapa.
            setPanel('ninguno')
            setVista('mapa')
            setModoPunto({ tipo: 'ubicar', edificacion: e })
          }}
          onCrear={() => {
            setPanel('ninguno')
            setVista('mapa')
            setModoPunto({ tipo: 'crear' })
          }}
          onSalir={salirDeCoordinacion}
        />
      </Modal>

      <FichaEdificacion
        edificacion={seleccionada}
        onCerrar={() => setSeleccionadaId(null)}
        {...(acciones ? { acciones } : {})}
      />

      <Modal
        abierto={panel === 'filtros'}
        titulo="Filtros"
        onCerrar={() => setPanel('ninguno')}
      >
        <FiltroBarra edificaciones={conPendientes} filtro={filtro} onCambiar={setFiltro} />
        <div className="d-ficha__acciones" style={{ marginTop: 16 }}>
          <button
            className="d-boton"
            onClick={() => setFiltro({ ...FILTRO_VACIO, estados: filtro.estados })}
          >
            Quitar filtros
          </button>
          <button className="d-boton d-boton--principal" onClick={() => setPanel('ninguno')}>
            Ver {visibles.length} {visibles.length === 1 ? 'edificación' : 'edificaciones'}
          </button>
        </div>
      </Modal>

      <Modal abierto={panel === 'ayuda'} titulo="Cómo se usa" onCerrar={() => setPanel('ninguno')}>
        <div className="a-ayuda">
          {ES_PRACTICA ? (
            <p>
              <strong>Modo práctica con datos de ejemplo.</strong> Todo lo que hagan se queda en
              este teléfono y no se envía a ninguna parte. Para trabajar de verdad, conecten la hoja
              de la operación abajo.
            </p>
          ) : (
            <p>
              Conectada a <strong>{dominioDe(configuracion.csv)}</strong>
              {configuracion.envios ? '.' : ' · solo lectura, sin enlace de escritura.'}
            </p>
          )}

          <p>
            Los colores son el estado de cada edificación: <strong>rojo</strong> colapsada,{' '}
            <strong>naranja</strong> por visitar, <strong>verde</strong> ya visitada. Tocando los
            contadores de arriba se filtra por estado.
          </p>
          <p>
            Al tocar un punto se abre su ficha: ahí se reclama antes de salir, se toma el GPS
            estando en la puerta («Estoy aquí»), se caracteriza la visita o se marca como
            colapsada. Un reclamo se libera solo a las 4 horas.
          </p>
          <p>
            Sin señal la aplicación sigue funcionando: lo capturado queda en una cola y se envía
            cuando vuelve la red. Conviene abrir el sector del día con wifi antes de salir.
          </p>
          {puedeEscribir && (
            <p>
              Con <strong>Coordinación</strong> se ubican en el mapa los reportes sin dirección
              utilizable, se fusionan duplicados y se crean edificaciones que nadie reportó.
            </p>
          )}
          <p className="d-campo__ayuda">
            {actualizadoEn
              ? `Datos de las ${horaCorta(actualizadoEn)} · ${visibles.length} de ${conPendientes.length} edificaciones a la vista.`
              : 'Cargando información…'}
          </p>
          <div className="d-ficha__acciones">
            {(URL_ENVIOS || ES_PRACTICA) && (
              <button className="d-boton" onClick={() => setPanel('reporte')}>
                Reportar mi edificación
              </button>
            )}
            <button className="d-boton" onClick={() => setPanel('conexion')}>
              {ES_DEMO ? 'Conectar una hoja' : 'Hoja conectada'}
            </button>
            {ES_PRACTICA && aplicados.length > 0 && (
              <button
                className="d-boton"
                onClick={() => {
                  void borrarLoLocal()
                  setPanel('ninguno')
                }}
              >
                Borrar mis cambios ({aplicados.length})
              </button>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        abierto={panel === 'registro'}
        titulo="Registro de cuadrilla"
        onCerrar={() => setPanel('ninguno')}
      >
        <FormularioRegistro onRegistrar={registrar} onCerrar={() => setPanel('ninguno')} />
      </Modal>

      <Modal
        abierto={panel === 'reporte'}
        titulo="Reportar mi edificación"
        onCerrar={() => setPanel('ninguno')}
      >
        <FormularioReporte
          obtenerGPS={async () => {
            const posicion = await pedirUbicacion()
            return { lat: posicion.coords.latitude, lon: posicion.coords.longitude }
          }}
          onReportar={reportar}
          onCerrar={() => setPanel('ninguno')}
        />
      </Modal>

      <Modal
        abierto={panel === 'conexion'}
        titulo="Hoja de la operación"
        onCerrar={() => setPanel('ninguno')}
      >
        <PanelConexion
          actual={{ csv: ES_DEMO ? '' : configuracion.csv, envios: configuracion.envios }}
          origen={configuracion.origen}
          enlace={enlaceParaCompartir(configuracion)}
          dominioDe={dominioDe}
          onConectar={(datos) => {
            conectar(datos)
            setPanel('ninguno')
          }}
          onOlvidar={() => {
            olvidar()
            setPanel('ninguno')
          }}
        />
      </Modal>

      {/* Un enlace no conecta solo: trae a dónde se manda el trabajo de campo. */}
      <Modal
        abierto={propuesta !== null}
        titulo="¿Conectar esta hoja?"
        onCerrar={() => {
          limpiarEnlace()
          setPropuesta(null)
        }}
      >
        {propuesta && (
          <ConfirmarConexion
            csv={propuesta.csv}
            envios={propuesta.envios}
            dominioDe={dominioDe}
            onAceptar={() => conectar(propuesta)}
            onRechazar={() => {
              limpiarEnlace()
              setPropuesta(null)
            }}
          />
        )}
      </Modal>

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
