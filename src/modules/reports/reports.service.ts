import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/errors/domain.error.js';
import type { TipoUnidad } from '../../shared/validation/content-validator.service.js';
import { type GrupoItem, GroupsService } from '../groups/groups.service.js';
import type { ConsultarReporteGrupoDto } from './dto/consultar-reporte-grupo.dto.js';

export interface CeldaReporteGrupo {
  unidad_id: number;
  version_id: number;
  version_numero: number;
  titulo: string;
  tipo: TipoUnidad;
  participantes: number;
  total_intentos_finalizados: number;
  participantes_con_dominio: number | null;
  promedio: number | 'No aplica' | null;
  celda_suprimida: boolean;
}

export interface RespuestaReporteGrupo {
  grupo: GrupoItem;
  periodo_consulta: {
    desde: Date;
    hasta: Date;
    unidad_id: number | null;
    ruta_id: number | null;
  };
  celdas: CeldaReporteGrupo[];
}

interface FilaReporteGrupo {
  unidad_id: number;
  version_id: string | number;
  version_numero: number;
  version_titulo: string;
  tipo_unidad: TipoUnidad;
  participantes: number;
  total_intentos_finalizados: number;
  participantes_con_dominio: number;
  promedio_puntuacion: string | null;
  celda_suprimida: boolean;
}

const UMBRAL_ANONIMATO_CELDA = 5;

function parsearFechaReporte(valor: string, campo: string): Date {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    throw new DomainError(
      HttpStatus.BAD_REQUEST,
      'PERIODO_REPORTE_INVALIDO',
      `El parámetro ${campo} no es una fecha ISO 8601 válida`,
    );
  }
  return fecha;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly groupsService: GroupsService,
  ) {}

  async obtenerReporteGrupo(
    grupoId: number,
    dto: ConsultarReporteGrupoDto,
  ): Promise<RespuestaReporteGrupo> {
    const desde = parsearFechaReporte(dto.desde, 'desde');
    const hasta = parsearFechaReporte(dto.hasta, 'hasta');

    if (desde.getTime() >= hasta.getTime()) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'PERIODO_REPORTE_INVALIDO',
        'El parámetro hasta debe ser estrictamente posterior a desde',
      );
    }

    const grupo = await this.groupsService.obtenerGrupoPorId(grupoId);

    // Una sola consulta SQL con CTEs (elegibles -> mejores -> promedios -> conteos)
    const filas = (await this.dataSource.query(
      `WITH elegibles AS (
         SELECT
           i.usuario_id,
           i.unidad_id,
           i.version_id,
           vu.numero AS version_numero,
           vu.titulo AS version_titulo,
           u.tipo AS tipo_unidad,
           i.puntuacion
         FROM intento i
         INNER JOIN unidad u
           ON u.id = i.unidad_id
         INNER JOIN version_unidad vu
           ON vu.id = i.version_id
          AND vu.unidad_id = i.unidad_id
         WHERE i.estado = 'finalizado'
           AND i.finalizacion >= $2::timestamptz
           AND i.finalizacion < $3::timestamptz
           AND ($4::int IS NULL OR i.unidad_id = $4::int)
           AND ($5::int IS NULL OR EXISTS (
             SELECT 1
             FROM ruta r
             INNER JOIN ruta_unidad ru
               ON ru.ruta_version_id = COALESCE(
                 (
                   SELECT ir.ruta_version_id
                   FROM inscripcion_ruta ir
                   INNER JOIN version_ruta vr
                     ON vr.id = ir.ruta_version_id
                   WHERE ir.usuario_id = i.usuario_id
                     AND vr.ruta_id = r.id
                   ORDER BY ir.inscrita_en DESC, ir.id DESC
                   LIMIT 1
                 ),
                 r.version_actual_id
               )
             WHERE r.id = $5::int
               AND ru.unidad_id = i.unidad_id
           ))
           AND EXISTS (
             SELECT 1
             FROM membresia_grupo mg
             WHERE mg.grupo_id = $1::int
               AND mg.usuario_id = i.usuario_id
               AND mg.ingreso <= i.finalizacion
               AND (mg.salida IS NULL OR i.finalizacion < mg.salida)
           )
       ),
       mejores AS (
         SELECT
           usuario_id,
           unidad_id,
           version_id,
           version_numero,
           version_titulo,
           tipo_unidad,
           MAX(puntuacion) AS mejor_puntuacion,
           COUNT(*)::int AS intentos_usuario
         FROM elegibles
         GROUP BY usuario_id, unidad_id, version_id, version_numero, version_titulo, tipo_unidad
       ),
       promedios AS (
         SELECT
           version_id,
           CASE
             WHEN tipo_unidad = 'aprende' THEN NULL
             WHEN COUNT(*) >= ${UMBRAL_ANONIMATO_CELDA} THEN ROUND(AVG(mejor_puntuacion), 2)
             ELSE NULL
           END AS promedio_puntuacion,
           (tipo_unidad <> 'aprende' AND COUNT(*) < ${UMBRAL_ANONIMATO_CELDA}) AS celda_suprimida
         FROM mejores
         GROUP BY version_id, tipo_unidad
       ),
       conteos AS (
         SELECT
           unidad_id,
           version_id,
           version_numero,
           version_titulo,
           tipo_unidad,
           COUNT(*)::int AS participantes,
           SUM(intentos_usuario)::int AS total_intentos_finalizados,
           COUNT(*) FILTER (WHERE tipo_unidad <> 'aprende' AND mejor_puntuacion >= 80)::int AS participantes_con_dominio
         FROM mejores
         GROUP BY unidad_id, version_id, version_numero, version_titulo, tipo_unidad
       )
       SELECT
         c.unidad_id,
         c.version_id,
         c.version_numero,
         c.version_titulo,
         c.tipo_unidad,
         c.participantes,
         c.total_intentos_finalizados,
         c.participantes_con_dominio,
         p.promedio_puntuacion,
         p.celda_suprimida
       FROM conteos c
       INNER JOIN promedios p
         ON p.version_id = c.version_id
       ORDER BY c.unidad_id ASC, c.version_numero ASC, c.version_id ASC`,
      [
        grupoId,
        desde.toISOString(),
        hasta.toISOString(),
        dto.unidad_id ?? null,
        dto.ruta_id ?? null,
      ],
    )) as FilaReporteGrupo[];

    const celdas: CeldaReporteGrupo[] = filas.map((fila) => {
      if (fila.tipo_unidad === 'aprende') {
        return {
          unidad_id: fila.unidad_id,
          version_id: Number(fila.version_id),
          version_numero: fila.version_numero,
          titulo: fila.version_titulo,
          tipo: fila.tipo_unidad,
          participantes: fila.participantes,
          total_intentos_finalizados: fila.total_intentos_finalizados,
          participantes_con_dominio: null,
          promedio: 'No aplica',
          celda_suprimida: false,
        };
      }

      const suprimida =
        Boolean(fila.celda_suprimida) ||
        fila.participantes < UMBRAL_ANONIMATO_CELDA;

      return {
        unidad_id: fila.unidad_id,
        version_id: Number(fila.version_id),
        version_numero: fila.version_numero,
        titulo: fila.version_titulo,
        tipo: fila.tipo_unidad,
        participantes: fila.participantes,
        total_intentos_finalizados: fila.total_intentos_finalizados,
        participantes_con_dominio: suprimida
          ? null
          : fila.participantes_con_dominio,
        promedio:
          suprimida || fila.promedio_puntuacion === null
            ? null
            : Number(fila.promedio_puntuacion),
        celda_suprimida: suprimida,
      };
    });

    return {
      grupo,
      periodo_consulta: {
        desde,
        hasta,
        unidad_id: dto.unidad_id ?? null,
        ruta_id: dto.ruta_id ?? null,
      },
      celdas,
    };
  }
}
