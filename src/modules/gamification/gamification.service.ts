import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import {
  UMBRAL_RANGO_AVANZADO,
  UMBRAL_RANGO_INTERMEDIO,
} from '../../shared/validation/scoring.service.js';

export interface CreditoUnidadResumen {
  unidad_id: number;
  puntos: number;
  intento_origen_id: string;
  completada_en: Date;
}

export interface ResumenPuntos {
  puntos_totales: number;
  unidades_acreditadas: number;
  creditos: CreditoUnidadResumen[];
}

export interface ResumenRango {
  rango: 'Inicial' | 'Intermedio' | 'Avanzado';
  nivel: 1 | 2 | 3;
  puntos_totales: number;
  umbral_actual: number;
  siguiente_umbral: number | null;
  puntos_faltantes: number;
}

export interface InsigniaUsuarioItem {
  insignia_id: number;
  codigo: string;
  nombre: string;
  criterio: string;
  obtenida_en: Date;
  intento_origen_id: string | null;
  inscripcion_origen_id: number | null;
}

export interface InsigniaConcedida {
  insignia_id: number;
  codigo: string;
  nombre: string;
  obtenida_en: Date;
  intento_origen_id: string;
}

interface FilaInsigniaCatalogo {
  id: number;
  codigo: string;
  nombre: string;
  criterio: string;
}

@Injectable()
export class GamificationService {
  constructor(private readonly dataSource: DataSource) {}

  async obtenerPuntos(usuarioId: number): Promise<ResumenPuntos> {
    const totales = (await this.dataSource.query(
      `SELECT
         COALESCE(SUM(puntos), 0)::int AS puntos_totales,
         COUNT(*)::int AS unidades_acreditadas
       FROM credito_unidad
       WHERE usuario_id = $1`,
      [usuarioId],
    )) as Array<{ puntos_totales: number; unidades_acreditadas: number }>;

    const creditos = (await this.dataSource.query(
      `SELECT
         unidad_id,
         puntos,
         intento_origen_id,
         completada_en
       FROM credito_unidad
       WHERE usuario_id = $1
       ORDER BY completada_en DESC, unidad_id ASC`,
      [usuarioId],
    )) as CreditoUnidadResumen[];

    return {
      puntos_totales: totales[0]?.puntos_totales ?? 0,
      unidades_acreditadas: totales[0]?.unidades_acreditadas ?? 0,
      creditos,
    };
  }

  async obtenerRango(usuarioId: number): Promise<ResumenRango> {
    const totales = (await this.dataSource.query(
      `SELECT COALESCE(SUM(puntos), 0)::int AS puntos_totales
       FROM credito_unidad
       WHERE usuario_id = $1`,
      [usuarioId],
    )) as Array<{ puntos_totales: number }>;

    const puntosTotales = totales[0]?.puntos_totales ?? 0;

    if (puntosTotales >= UMBRAL_RANGO_AVANZADO) {
      return {
        rango: 'Avanzado',
        nivel: 3,
        puntos_totales: puntosTotales,
        umbral_actual: UMBRAL_RANGO_AVANZADO,
        siguiente_umbral: null,
        puntos_faltantes: 0,
      };
    }

    if (puntosTotales >= UMBRAL_RANGO_INTERMEDIO) {
      return {
        rango: 'Intermedio',
        nivel: 2,
        puntos_totales: puntosTotales,
        umbral_actual: UMBRAL_RANGO_INTERMEDIO,
        siguiente_umbral: UMBRAL_RANGO_AVANZADO,
        puntos_faltantes: UMBRAL_RANGO_AVANZADO - puntosTotales,
      };
    }

    return {
      rango: 'Inicial',
      nivel: 1,
      puntos_totales: puntosTotales,
      umbral_actual: 0,
      siguiente_umbral: UMBRAL_RANGO_INTERMEDIO,
      puntos_faltantes: UMBRAL_RANGO_INTERMEDIO - puntosTotales,
    };
  }

  async obtenerInsignias(usuarioId: number): Promise<InsigniaUsuarioItem[]> {
    const filas = (await this.dataSource.query(
      `SELECT
         ui.insignia_id,
         i.codigo,
         i.nombre,
         i.criterio,
         ui.obtenida_en,
         ui.intento_origen_id,
         ui.inscripcion_origen_id
       FROM usuario_insignia ui
       INNER JOIN insignia i ON i.id = ui.insignia_id
       WHERE ui.usuario_id = $1
       ORDER BY ui.obtenida_en ASC, ui.insignia_id ASC`,
      [usuarioId],
    )) as Array<{
      insignia_id: number;
      codigo: string;
      nombre: string;
      criterio: string;
      obtenida_en: Date;
      intento_origen_id: string | null;
      inscripcion_origen_id: string | number | null;
    }>;

    return filas.map((f) => ({
      insignia_id: f.insignia_id,
      codigo: f.codigo,
      nombre: f.nombre,
      criterio: f.criterio,
      obtenida_en: f.obtenida_en,
      intento_origen_id: f.intento_origen_id,
      inscripcion_origen_id:
        f.inscripcion_origen_id !== null
          ? Number(f.inscripcion_origen_id)
          : null,
    }));
  }

  async evaluarYConcederInsigniasEnTx(
    manager: EntityManager,
    params: { usuarioId: number; intentoId: string },
  ): Promise<InsigniaConcedida[]> {
    const catalogo = (await manager.query(
      `SELECT id, codigo, nombre, criterio
       FROM insignia
       ORDER BY id ASC`,
    )) as FilaInsigniaCatalogo[];

    if (catalogo.length === 0) {
      // TODO(00 §10, RN-25): Definir con el equipo los códigos y criterios exactos
      // de las 4 insignias iniciales antes de sembrar la tabla `insignia`.
      // Mientras la tabla `insignia` esté vacía, se omite la concesión sin inventar códigos.
      return [];
    }

    const creditos = (await manager.query(
      `SELECT COUNT(*)::int AS total
       FROM credito_unidad
       WHERE usuario_id = $1`,
      [params.usuarioId],
    )) as Array<{ total: number }>;

    if ((creditos[0]?.total ?? 0) < 1) {
      return [];
    }

    const concedidas: InsigniaConcedida[] = [];
    for (const insignia of catalogo) {
      // Las insignias exclusivas de ruta completa se evalúan por inscripción, no por intento.
      if (insignia.criterio.toLowerCase().includes('ruta')) {
        continue;
      }

      const insertadas = (await manager.query(
        `INSERT INTO usuario_insignia (usuario_id, insignia_id, intento_origen_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (usuario_id, insignia_id) DO NOTHING
         RETURNING insignia_id, obtenida_en, intento_origen_id`,
        [params.usuarioId, insignia.id, params.intentoId],
      )) as Array<{
        insignia_id: number;
        obtenida_en: Date;
        intento_origen_id: string;
      }>;

      const fila = insertadas[0];
      if (fila) {
        concedidas.push({
          insignia_id: fila.insignia_id,
          codigo: insignia.codigo,
          nombre: insignia.nombre,
          obtenida_en: fila.obtenida_en,
          intento_origen_id: fila.intento_origen_id,
        });
      }
    }

    return concedidas;
  }
}
