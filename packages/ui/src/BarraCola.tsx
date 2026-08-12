export interface RechazoVisible {
  uuid: string
  edificacionId: string
  motivo: string
}

export interface BarraColaProps {
  pendientes: number
  enviando: boolean
  hayRed: boolean
  rechazos: RechazoVisible[]
  onEnviar: () => void
  onDescartarRechazos: () => void
}

/** Traduce los códigos del script a algo que se pueda leer con prisa. */
function motivoLegible(motivo: string): string {
  if (motivo.startsWith('reclamada_por_')) {
    return `ya la tenía la cuadrilla ${motivo.replace('reclamada_por_', '')}`
  }
  const conocidos: Record<string, string> = {
    ya_visitada: 'otra cuadrilla ya la visitó',
    edificacion_desconocida: 'esa edificación no está en la hoja',
    cuadrilla_no_reconocida: 'el código de cuadrilla no está autorizado',
    coordenada_fuera_de_rango: 'la coordenada no cae en Colombia',
    coordenada_invalida: 'el GPS no entregó una coordenada válida',
    reclamada_por_otra: 'el reclamo era de otra cuadrilla',
  }
  return conocidos[motivo] ?? motivo
}

/**
 * Contador de la cola siempre visible mientras haya algo sin enviar.
 *
 * Es la única señal de que el trabajo hecho sin señal todavía no está a salvo;
 * sin ella, una cuadrilla cierra el teléfono creyendo que ya reportó.
 */
export function BarraCola({
  pendientes,
  enviando,
  hayRed,
  rechazos,
  onEnviar,
  onDescartarRechazos,
}: BarraColaProps) {
  if (pendientes === 0 && rechazos.length === 0) return null

  return (
    <div className="d-cola">
      {pendientes > 0 && (
        <div className="d-cola__fila">
          <span className="d-cola__texto">
            <strong>{pendientes}</strong> {pendientes === 1 ? 'cambio' : 'cambios'} sin enviar
            {hayRed ? '' : ' · sin señal'}
          </span>
          <button className="d-boton" onClick={onEnviar} disabled={enviando || !hayRed}>
            {enviando ? 'Enviando…' : 'Enviar ahora'}
          </button>
        </div>
      )}

      {rechazos.length > 0 && (
        <div className="d-cola__fila d-cola__fila--rechazo">
          <span className="d-cola__texto">
            {rechazos.length === 1 ? 'Un cambio no se pudo aplicar' : `${rechazos.length} cambios no se pudieron aplicar`}:{' '}
            {rechazos.map((r) => `${r.edificacionId} (${motivoLegible(r.motivo)})`).join('; ')}
          </span>
          <button className="d-boton" onClick={onDescartarRechazos}>
            Entendido
          </button>
        </div>
      )}
    </div>
  )
}
