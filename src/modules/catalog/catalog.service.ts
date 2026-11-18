import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/errors/domain.error.js';
import {
  codificarCursorId,
  decodificarCursorId,
} from '../../common/utils/paginacion-cursor.js';
import {
  ContentValidatorService,
  type TipoUnidad,
} from '../../shared/validation/content-validator.service.js';
import type {
  ConsultarCatalogoDto,
  DificultadUnidad,
} from './dto/consultar-catalogo.dto.js';

export interface ItemCatalogo {
  id: number;
  tipo: TipoUnidad;
  muestra_publica: boolean;
  version_id: number;
  version_numero: number;
  titulo: string;
  descripcion: string;
  dificultad: DificultadUnidad;
  publicada_en: Date;
  tema: {
    id: number;
    nombre: string;
  };
  completada?: boolean;
}

export interface RespuestaCatalogo {
  items: ItemCatalogo[];
  siguiente_cursor: string | null;
}

export interface FuenteUnidadPublica {
  clave_local: string;
  revisada_en: string;
  fuente_nombre: string;
  titulo: string;
  autor_organismo: string;
  url: string;
  fecha_o_version: string;
  licencia_o_condicion_uso: string | null;
}

export interface DetalleUnidadPublica {
  id: number;
  tipo: TipoUnidad;
  muestra_publica: boolean;
  version_id: number;
  version_numero: number;
  titulo: string;
  descripcion: string;
  dificultad: DificultadUnidad;
  esquema_version: number;
  publicada_en: Date;
  tema: {
    id: number;
    nombre: string;
  };
  contenido: Record<string, unknown>;
  fuentes: FuenteUnidadPublica[];
}

interface FilaCatalogo {
  id: number;
  tipo: TipoUnidad;
  muestra_publica: boolean;
  version_id: string | number;
  version_numero: number;
  titulo: string;
  descripcion: string;
  dificultad: DificultadUnidad;
  publicada_en: Date;
  tema_id: number;
  tema_nombre: string;
  completada?: boolean;
}

interface FilaDetalleUnidad extends Omit<FilaCatalogo, 'completada'> {
  esquema_version: number;
  contenido: Record<string, unknown>;
}

const ACENTOS_ORIGEN = 'áéíóúàèìòùäëïöüâêîôûãõñç';
const ACENTOS_DESTINO = 'aeiouaeiouaeiouaeiouaonc';

function normalizarPalabrasBusqueda(texto: string): string[] {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((palabra) => palabra.length > 0);
}

function escaparLike(palabra: string): string {
  return palabra.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly contentValidator: ContentValidatorService,
  ) {}

  async listarCatalogo(
    dto: ConsultarCatalogoDto,
    usuarioId?: number,
  ): Promise<RespuestaCatalogo> {
    if (dto.avance !== undefined && usuarioId === undefined) {
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'SESION_INVALIDA',
        'Debes iniciar sesión para filtrar por avance',
      );
    }

    const limite = dto.limit ?? 20;
    const condiciones: string[] = ['u.activa = TRUE'];
    const parametros: unknown[] = [];
    let indice = 1;

    let selectCompletada = '';
    if (usuarioId !== undefined) {
      parametros.push(usuarioId);
      const paramUsuario = `$${indice++}`;
      selectCompletada = `,
        EXISTS (
          SELECT 1
          FROM credito_unidad cu
          WHERE cu.usuario_id = ${paramUsuario}
            AND cu.unidad_id = u.id
        ) AS completada`;

      if (dto.avance === 'completada') {
        condiciones.push(`EXISTS (
          SELECT 1
          FROM credito_unidad cu
          WHERE cu.usuario_id = ${paramUsuario}
            AND cu.unidad_id = u.id
        )`);
      } else if (dto.avance === 'pendiente') {
        condiciones.push(`NOT EXISTS (
          SELECT 1
          FROM credito_unidad cu
          WHERE cu.usuario_id = ${paramUsuario}
            AND cu.unidad_id = u.id
        )`);
      }
    }

    if (dto.ruta_id !== undefined) {
      const rutaVersionId = await this.resolverRutaVersionParaFiltro(
        dto.ruta_id,
        usuarioId,
      );
      if (rutaVersionId === null) {
        return { items: [], siguiente_cursor: null };
      }
      parametros.push(rutaVersionId);
      condiciones.push(`EXISTS (
        SELECT 1
        FROM ruta_unidad ru
        WHERE ru.ruta_version_id = $${indice++}
          AND ru.unidad_id = u.id
      )`);
    }

    if (dto.tema_id !== undefined) {
      parametros.push(dto.tema_id);
      condiciones.push(`vu.tema_id = $${indice++}`);
    }

    if (dto.dificultad !== undefined) {
      parametros.push(dto.dificultad);
      condiciones.push(`vu.dificultad = $${indice++}`);
    }

    if (dto.tipo !== undefined) {
      parametros.push(dto.tipo);
      condiciones.push(`u.tipo = $${indice++}`);
    }

    const termino = dto.q && dto.q.length > 0 ? dto.q : dto.busqueda;
    if (termino) {
      const palabras = normalizarPalabrasBusqueda(termino);
      for (const palabra of palabras) {
        parametros.push(`%${escaparLike(palabra)}%`);
        condiciones.push(
          `TRANSLATE(LOWER(vu.titulo || ' ' || vu.descripcion), '${ACENTOS_ORIGEN}', '${ACENTOS_DESTINO}') LIKE $${indice++} ESCAPE '\\'`,
        );
      }
    }

    if (dto.cursor) {
      const cursorId = decodificarCursorId(dto.cursor);
      parametros.push(cursorId);
      condiciones.push(`u.id > $${indice++}`);
    }

    parametros.push(limite + 1);
    const paramLimite = `$${indice++}`;

    const filas = (await this.dataSource.query(
      `SELECT
         u.id,
         u.tipo,
         u.muestra_publica,
         vu.id AS version_id,
         vu.numero AS version_numero,
         vu.titulo,
         vu.descripcion,
         vu.dificultad,
         vu.publicada_en,
         t.id AS tema_id,
         t.nombre AS tema_nombre${selectCompletada}
       FROM unidad u
       INNER JOIN version_unidad vu
         ON vu.id = u.version_publicada_id
        AND vu.unidad_id = u.id
        AND vu.estado = 'publicado'
       INNER JOIN tema t
         ON t.id = vu.tema_id
        AND t.activo = TRUE
       WHERE ${condiciones.join(' AND ')}
       ORDER BY u.id ASC
       LIMIT ${paramLimite}`,
      parametros,
    )) as FilaCatalogo[];

    const hayMas = filas.length > limite;
    const filasPagina = hayMas ? filas.slice(0, limite) : filas;

    const items: ItemCatalogo[] = filasPagina.map((fila) => {
      const item: ItemCatalogo = {
        id: fila.id,
        tipo: fila.tipo,
        muestra_publica: fila.muestra_publica,
        version_id: Number(fila.version_id),
        version_numero: fila.version_numero,
        titulo: fila.titulo,
        descripcion: fila.descripcion,
        dificultad: fila.dificultad,
        publicada_en: fila.publicada_en,
        tema: {
          id: fila.tema_id,
          nombre: fila.tema_nombre,
        },
      };
      if (usuarioId !== undefined) {
        item.completada = Boolean(fila.completada);
      }
      return item;
    });

    const ultimo = items[items.length - 1];
    return {
      items,
      siguiente_cursor: hayMas && ultimo ? codificarCursorId(ultimo.id) : null,
    };
  }

  async obtenerUnidadPublicada(
    unidadId: number,
  ): Promise<DetalleUnidadPublica> {
    return this.consultarDetalleUnidad(unidadId, false);
  }

  async obtenerMuestraPublica(
    unidadId: number,
  ): Promise<DetalleUnidadPublica> {
    return this.consultarDetalleUnidad(unidadId, true);
  }

  private async consultarDetalleUnidad(
    unidadId: number,
    soloMuestraPublica: boolean,
  ): Promise<DetalleUnidadPublica> {
    const filtroMuestra = soloMuestraPublica
      ? 'AND u.muestra_publica = TRUE'
      : '';

    const filas = (await this.dataSource.query(
      `SELECT
         u.id,
         u.tipo,
         u.muestra_publica,
         vu.id AS version_id,
         vu.numero AS version_numero,
         vu.titulo,
         vu.descripcion,
         vu.dificultad,
         vu.esquema_version,
         vu.contenido,
         vu.publicada_en,
         t.id AS tema_id,
         t.nombre AS tema_nombre
       FROM unidad u
       INNER JOIN version_unidad vu
         ON vu.id = u.version_publicada_id
        AND vu.unidad_id = u.id
        AND vu.estado = 'publicado'
       INNER JOIN tema t
         ON t.id = vu.tema_id
        AND t.activo = TRUE
       WHERE u.id = $1
         AND u.activa = TRUE
         ${filtroMuestra}
       LIMIT 1`,
      [unidadId],
    )) as FilaDetalleUnidad[];

    const fila = filas[0];
    if (!fila) {
      throw new DomainError(
        HttpStatus.NOT_FOUND,
        'UNIDAD_NO_ENCONTRADA',
        'Unidad no encontrada',
      );
    }

    const fuentes = (await this.dataSource.query(
      `SELECT
         uf.clave_local,
         uf.revisada_en,
         f.nombre AS fuente_nombre,
         fv.titulo,
         fv.autor_organismo,
         fv.url,
         fv.fecha_o_version,
         fv.licencia_o_condicion_uso
       FROM unidad_fuente uf
       INNER JOIN fuente_version fv ON fv.id = uf.fuente_version_id
       INNER JOIN fuente f ON f.id = fv.fuente_id
       WHERE uf.version_id = $1
       ORDER BY uf.clave_local ASC`,
      [fila.version_id],
    )) as FuenteUnidadPublica[];

    const contenidoProyectado =
      this.contentValidator.proyectarContenidoParaAprendiz(
        fila.tipo,
        fila.contenido,
      );

    return {
      id: fila.id,
      tipo: fila.tipo,
      muestra_publica: fila.muestra_publica,
      version_id: Number(fila.version_id),
      version_numero: fila.version_numero,
      titulo: fila.titulo,
      descripcion: fila.descripcion,
      dificultad: fila.dificultad,
      esquema_version: fila.esquema_version,
      publicada_en: fila.publicada_en,
      tema: {
        id: fila.tema_id,
        nombre: fila.tema_nombre,
      },
      contenido: contenidoProyectado,
      fuentes,
    };
  }

  private async resolverRutaVersionParaFiltro(
    rutaId: number,
    usuarioId?: number,
  ): Promise<string | null> {
    if (usuarioId !== undefined) {
      const inscripciones = (await this.dataSource.query(
        `SELECT ir.ruta_version_id
         FROM inscripcion_ruta ir
         INNER JOIN version_ruta vr ON vr.id = ir.ruta_version_id
         INNER JOIN ruta r ON r.id = vr.ruta_id
         WHERE ir.usuario_id = $1
           AND vr.ruta_id = $2
           AND r.activa = TRUE
         ORDER BY ir.inscrita_en DESC, ir.id DESC
         LIMIT 1`,
        [usuarioId, rutaId],
      )) as Array<{ ruta_version_id: string | number }>;

      if (inscripciones[0]) {
        return String(inscripciones[0].ruta_version_id);
      }
    }

    const rutas = (await this.dataSource.query(
      `SELECT version_actual_id
       FROM ruta
       WHERE id = $1 AND activa = TRUE
       LIMIT 1`,
      [rutaId],
    )) as Array<{ version_actual_id: string | number | null }>;

    const versionActualId = rutas[0]?.version_actual_id;
    return versionActualId !== null && versionActualId !== undefined
      ? String(versionActualId)
      : null;
  }
}
