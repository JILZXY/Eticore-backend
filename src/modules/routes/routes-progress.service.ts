import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/errors/domain.error.js';
import type { TipoUnidad } from '../../shared/validation/content-validator.service.js';
import type { ConsultarProgresoRutaDto } from './dto/consultar-progreso-ruta.dto.js';

export type EstadoProgresoRuta =
  | 'Sin inscripcion'
  | 'Sin actividades'
  | 'En progreso'
  | 'Completada';

export interface UnidadProgresoItem {
  unidad_id: number;
  tipo: TipoUnidad;
  activa: boolean;
  orden: number;
  obligatoria: boolean;
  completada: boolean;
  puntos_acreditados: number | null;
  completada_en: Date | null;
}

export interface ResumenInscripcionProgreso {
  inscripcion_id: number;
  ruta_id: number;
  ruta_nombre: string;
  ruta_version_id: number;
  version_numero: number;
  inscrita_en: Date;
  migrada_de_id: number | null;
  total_obligatorias: number;
  completadas_obligatorias: number;
  porcentaje: number | null;
  estado: Exclude<EstadoProgresoRuta, 'Sin inscripcion'>;
  unidades: UnidadProgresoItem[];
}

export interface RespuestaProgresoRuta {
  inscripcion_id: number | null;
  ruta_id: number | null;
  ruta_nombre: string | null;
  ruta_version_id: number | null;
  version_numero: number | null;
  total_obligatorias: number;
  completadas_obligatorias: number;
  porcentaje: number | null;
  estado: EstadoProgresoRuta;
  unidades: UnidadProgresoItem[];
  creditos_totales_usuario: number;
  inscripciones: ResumenInscripcionProgreso[];
}

interface FilaInscripcionUsuario {
  inscripcion_id: string | number;
  ruta_id: number;
  ruta_nombre: string;
  ruta_version_id: string | number;
  version_numero: number;
  inscrita_en: Date;
  migrada_de_id: string | number | null;
}

interface FilaUnidadDeInscripcion {
  ruta_version_id: string | number;
  unidad_id: number;
  tipo: TipoUnidad;
  activa: boolean;
  orden: number;
  obligatoria: boolean;
  puntos_acreditados: number | null;
  completada_en: Date | null;
}

@Injectable()
export class RoutesProgressService {
  constructor(private readonly dataSource: DataSource) {}

  async obtenerProgreso(
    usuarioId: number,
    dto?: ConsultarProgresoRutaDto,
  ): Promise<RespuestaProgresoRuta> {
    const usuarios = (await this.dataSource.query(
      `SELECT ruta_preferida_id FROM usuario WHERE id = $1 LIMIT 1`,
      [usuarioId],
    )) as Array<{ ruta_preferida_id: number | null }>;
    const rutaPreferidaId = usuarios[0]?.ruta_preferida_id ?? null;

    const totales = (await this.dataSource.query(
      `SELECT COALESCE(SUM(puntos), 0)::int AS total_puntos
       FROM credito_unidad
       WHERE usuario_id = $1`,
      [usuarioId],
    )) as Array<{ total_puntos: number }>;
    const creditosTotalesUsuario = totales[0]?.total_puntos ?? 0;

    const filasInscripciones = (await this.dataSource.query(
      `SELECT
         ir.id AS inscripcion_id,
         r.id AS ruta_id,
         r.nombre AS ruta_nombre,
         ir.ruta_version_id,
         vr.numero AS version_numero,
         ir.inscrita_en,
         ir.migrada_de_id
       FROM inscripcion_ruta ir
       INNER JOIN version_ruta vr ON vr.id = ir.ruta_version_id
       INNER JOIN ruta r ON r.id = vr.ruta_id
       WHERE ir.usuario_id = $1
       ORDER BY ir.inscrita_en DESC, ir.id DESC`,
      [usuarioId],
    )) as FilaInscripcionUsuario[];

    if (filasInscripciones.length === 0) {
      if (dto?.ruta_id !== undefined || dto?.inscripcion_id !== undefined) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'INSCRIPCION_NO_ENCONTRADA',
          'Inscripción de ruta no encontrada',
        );
      }

      return {
        inscripcion_id: null,
        ruta_id: null,
        ruta_nombre: null,
        ruta_version_id: null,
        version_numero: null,
        total_obligatorias: 0,
        completadas_obligatorias: 0,
        porcentaje: null,
        estado: 'Sin inscripcion',
        unidades: [],
        creditos_totales_usuario: creditosTotalesUsuario,
        inscripciones: [],
      };
    }

    const versionIds = [
      ...new Set(filasInscripciones.map((i) => String(i.ruta_version_id))),
    ];

    const filasUnidades = (await this.dataSource.query(
      `SELECT
         ru.ruta_version_id,
         ru.unidad_id,
         u.tipo,
         u.activa,
         ru.orden,
         ru.obligatoria,
         cu.puntos AS puntos_acreditados,
         cu.completada_en
       FROM ruta_unidad ru
       INNER JOIN unidad u ON u.id = ru.unidad_id
       LEFT JOIN credito_unidad cu
         ON cu.unidad_id = ru.unidad_id
        AND cu.usuario_id = $1
       WHERE ru.ruta_version_id = ANY($2::bigint[])
       ORDER BY ru.ruta_version_id ASC, ru.orden ASC`,
      [usuarioId, versionIds],
    )) as FilaUnidadDeInscripcion[];

    const unidadesPorVersion = new Map<string, UnidadProgresoItem[]>();
    for (const fila of filasUnidades) {
      const claveVersion = String(fila.ruta_version_id);
      const lista = unidadesPorVersion.get(claveVersion) ?? [];
      lista.push({
        unidad_id: fila.unidad_id,
        tipo: fila.tipo,
        activa: fila.activa,
        orden: fila.orden,
        obligatoria: fila.obligatoria,
        completada: fila.puntos_acreditados !== null,
        puntos_acreditados: fila.puntos_acreditados,
        completada_en: fila.completada_en,
      });
      unidadesPorVersion.set(claveVersion, lista);
    }

    const inscripciones: ResumenInscripcionProgreso[] = filasInscripciones.map(
      (ins) => {
        const unidades =
          unidadesPorVersion.get(String(ins.ruta_version_id)) ?? [];
        const obligatorias = unidades.filter((u) => u.obligatoria);
        const totalObligatorias = obligatorias.length;
        const completadasObligatorias = obligatorias.filter(
          (u) => u.completada,
        ).length;

        const estado: ResumenInscripcionProgreso['estado'] =
          totalObligatorias === 0
            ? 'Sin actividades'
            : completadasObligatorias === totalObligatorias
              ? 'Completada'
              : 'En progreso';

        const porcentaje =
          totalObligatorias === 0
            ? null
            : Number(
                ((100 * completadasObligatorias) / totalObligatorias).toFixed(
                  2,
                ),
              );

        return {
          inscripcion_id: Number(ins.inscripcion_id),
          ruta_id: ins.ruta_id,
          ruta_nombre: ins.ruta_nombre,
          ruta_version_id: Number(ins.ruta_version_id),
          version_numero: ins.version_numero,
          inscrita_en: ins.inscrita_en,
          migrada_de_id:
            ins.migrada_de_id !== null ? Number(ins.migrada_de_id) : null,
          total_obligatorias: totalObligatorias,
          completadas_obligatorias: completadasObligatorias,
          porcentaje,
          estado,
          unidades,
        };
      },
    );

    const seleccionada = this.seleccionarInscripcion(
      inscripciones,
      rutaPreferidaId,
      dto,
    );

    return {
      inscripcion_id: seleccionada.inscripcion_id,
      ruta_id: seleccionada.ruta_id,
      ruta_nombre: seleccionada.ruta_nombre,
      ruta_version_id: seleccionada.ruta_version_id,
      version_numero: seleccionada.version_numero,
      total_obligatorias: seleccionada.total_obligatorias,
      completadas_obligatorias: seleccionada.completadas_obligatorias,
      porcentaje: seleccionada.porcentaje,
      estado: seleccionada.estado,
      unidades: seleccionada.unidades,
      creditos_totales_usuario: creditosTotalesUsuario,
      inscripciones,
    };
  }

  private seleccionarInscripcion(
    inscripciones: ResumenInscripcionProgreso[],
    rutaPreferidaId: number | null,
    dto?: ConsultarProgresoRutaDto,
  ): ResumenInscripcionProgreso {
    if (dto?.inscripcion_id !== undefined) {
      const encontrada = inscripciones.find(
        (i) => i.inscripcion_id === dto.inscripcion_id,
      );
      if (!encontrada) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'INSCRIPCION_NO_ENCONTRADA',
          'Inscripción de ruta no encontrada',
        );
      }
      return encontrada;
    }

    if (dto?.ruta_id !== undefined) {
      const encontrada = inscripciones.find((i) => i.ruta_id === dto.ruta_id);
      if (!encontrada) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'INSCRIPCION_NO_ENCONTRADA',
          'No estás inscrito en la ruta solicitada',
        );
      }
      return encontrada;
    }

    if (rutaPreferidaId !== null) {
      const preferida = inscripciones.find(
        (i) => i.ruta_id === rutaPreferidaId,
      );
      if (preferida) {
        return preferida;
      }
    }

    return inscripciones[0];
  }
}
