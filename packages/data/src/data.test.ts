import { describe, expect, it } from 'vitest'
import { parsearCSV } from './csv.ts'
import { parsearEdificaciones } from './edificaciones.ts'
import {
  contarPorEstado,
  fechaLegible,
  filtrar,
  FILTRO_VACIO,
  opcionesDe,
  reclamoVigente,
} from './filtros.ts'

const ENCABEZADO =
  'id,creado_en,origen,direccion_texto,barrio,comuna,lat_reporte,lon_reporte,precision_reporte,lat_visita,lon_visita,estado,reclamada_por,reclamada_en,tipo_edificacion,num_torres,apts_por_torre,ocupacion,caracterizacion,fallecidos_atrapados,rescatadas_en_sitio,rescatadas_fuente,visitada_por,visitada_en,observaciones'

function csv(...filas: string[]): string {
  return [ENCABEZADO, ...filas].join('\n') + '\n'
}

describe('parsearCSV', () => {
  it('respeta comas, comillas y saltos de línea dentro de un campo entrecomillado', () => {
    const filas = parsearCSV('a,b\n"grieta, diagonal","dijo ""paila""\nsegunda línea"\n')
    expect(filas).toEqual([
      ['a', 'b'],
      ['grieta, diagonal', 'dijo "paila"\nsegunda línea'],
    ])
  })

  it('acepta CRLF y BOM, y descarta la fila vacía final', () => {
    expect(parsearCSV('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('parsearEdificaciones', () => {
  it('la coordenada de la visita manda sobre la del reporte', () => {
    const { edificaciones } = parsearEdificaciones(
      csv(
        'E-1,,,Calle 100 Norte 11-11,Los Cristales,2,3.1,-76.1,geocodificada,3.47122,-76.53781,VERDE,,,,,,,,,,,,,',
      ),
    )
    expect(edificaciones[0]).toMatchObject({ lat: 3.47122, lon: -76.53781, precision: 'visita' })
  })

  it('usa la del reporte cuando no hubo visita, y deja null si no hay ninguna', () => {
    const { edificaciones } = parsearEdificaciones(
      csv(
        'E-1,,,dir,B,2,3.1,-76.1,geocodificada,,,NARANJA,,,,,,,,,,,,,',
        'E-2,,,dir sin numero,B,2,,,sin_ubicar,,,NARANJA,,,,,,,,,,,,,',
      ),
    )
    expect(edificaciones[0]).toMatchObject({ lat: 3.1, precision: 'geocodificada' })
    expect(edificaciones[1]).toMatchObject({ lat: null, lon: null, precision: 'sin_ubicar' })
  })

  it('normaliza la comuna a dos dígitos para que 2 y 02 agrupen igual', () => {
    const { edificaciones } = parsearEdificaciones(
      csv('E-1,,,dir,B,2,,,,,,,,,,,,,,,,,,,', 'E-2,,,dir,B,02,,,,,,,,,,,,,,,,,,,'),
    )
    expect(opcionesDe(edificaciones, 'comuna')).toEqual(['02'])
  })

  it('un estado ilegible cae en NARANJA: esconder una pendiente es el error caro', () => {
    const { edificaciones } = parsearEdificaciones(
      csv(
        'E-1,,,dir,B,2,,,,,,cualquier cosa,,,,,,,,,,,,,',
        'E-2,,,dir,B,2,,,,,,Colapsada,,,,,,,,,,,,,',
        'E-3,,,dir,B,2,,,,,,visitada,,,,,,,,,,,,,',
      ),
    )
    expect(edificaciones.map((e) => e.estado)).toEqual(['NARANJA', 'ROJO', 'VERDE'])
  })

  it('detecta columnas de datos personales en el CSV publicado', () => {
    const conContacto = parsearEdificaciones(
      'id,direccion_texto,contacto_telefono,Contacto Nombre\nE-1,dir,3001234567,Ana\n',
    )
    expect(conContacto.columnasProhibidas).toEqual(['contacto_telefono', 'contacto_nombre'])
    // Y aunque estén en el CSV, no llegan al modelo.
    expect(JSON.stringify(conContacto.edificaciones)).not.toContain('3001234567')
    expect(JSON.stringify(conContacto.edificaciones)).not.toContain('Ana')
  })

  it('no reporta nada cuando el CSV publicado está limpio', () => {
    expect(parsearEdificaciones(csv('E-1,,,dir,B,2,,,,,,VERDE,,,,,,,,,,,,,')).columnasProhibidas).toEqual([])
  })
})

describe('filtros', () => {
  const { edificaciones } = parsearEdificaciones(
    csv(
      'E-1,,,Calle 100 Norte,Flora Industrial,2,3.1,-76.1,,,,NARANJA,,,,,,,,,,,,,',
      'E-2,,,Calle 44,Chipichape,4,3.2,-76.2,,,,VERDE,,,,,,,,,,,,,',
      'E-3,,,Carrera 1,La Flora,2,3.3,-76.3,,,,ROJO,,,,,,,,,,,,,',
    ),
  )

  it('cuenta por estado', () => {
    expect(contarPorEstado(edificaciones)).toEqual({ ROJO: 1, NARANJA: 1, VERDE: 1 })
  })

  it('filtra por comuna y por estado', () => {
    const r = filtrar(edificaciones, { ...FILTRO_VACIO, comuna: '02', estados: ['ROJO'] })
    expect(r.map((e) => e.id)).toEqual(['E-3'])
  })

  it('busca texto sin importar tildes ni mayúsculas', () => {
    expect(filtrar(edificaciones, { ...FILTRO_VACIO, texto: 'FLORA' }).map((e) => e.id)).toEqual([
      'E-1',
      'E-3',
    ])
  })
})

describe('reclamoVigente', () => {
  const ahora = new Date('2026-08-12T14:00:00Z')
  const base = parsearEdificaciones(csv('E-1,,,dir,B,2,,,,,,NARANJA,C-07,2026-08-12T12:00:00Z,,,,,,,,,,,'))
    .edificaciones[0]!

  it('vigente antes de 4 h, vencido después', () => {
    expect(reclamoVigente(base, ahora)).toBe(true)
    expect(reclamoVigente(base, new Date('2026-08-12T16:30:00Z'))).toBe(false)
  })

  it('sin reclamo o con fecha ilegible, no está reclamada', () => {
    expect(reclamoVigente({ ...base, reclamadaPor: '' }, ahora)).toBe(false)
    expect(reclamoVigente({ ...base, reclamadaEn: 'ayer' }, ahora)).toBe(false)
  })
})

describe('fechaLegible', () => {
  it('no corre la fecha un día por la zona horaria', () => {
    // new Date('2026-08-10') es medianoche UTC; en Colombia sería el 09.
    expect(fechaLegible('2026-08-10')).toBe('10/08/2026')
  })

  it('formatea una marca de tiempo completa y deja pasar lo ilegible', () => {
    // 05:56 UTC son las 00:56 en Colombia.
    expect(fechaLegible('2026-08-12T05:56:57.467Z')).toBe('12/08 00:56')
    expect(fechaLegible('ayer por la tarde')).toBe('ayer por la tarde')
    expect(fechaLegible('  ')).toBe('')
  })
})
