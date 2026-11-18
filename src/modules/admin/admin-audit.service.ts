import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  codificarCursorId,
  decodificarCursorId,
} from '../../common/utils/paginacion-cursor.js';
import { AUDIT_DATA_SOURCE } from '../../database/audit-database.module.js';
import type {
  OrigenActor,
  ResultadoAuditoria,
} from '../../shared/audit/audit.service.js';
import type {
  ConsultarAuditoriaAdminDto,
  FuenteAuditoria,
} from './dto/consultar-auditoria-admin.dto.js';

export interface AuditoriaAplicacionItem {
  id: number;
  actor_id: number | null;
  origen_actor: OrigenActor;
  fecha_servidor: Date;
  accion: string;
  recurso_tipo: string;
  recurso_id: string;
  resultado: ResultadoAuditoria;
  correlacion: string | null;
  detalle_minimo: string | null;
}

export interface AuditoriaBdItem {
  id: number;
  fecha_servidor: Date;
  usuario_bd: string;
  operacion: 'INSERT' | 'UPDATE' | 'DELETE';
  esquema: string;
  tabla: string;
  registro_id: string | null;
  datos_anteriores: Record<string, unknown> | null;
  datos_nuevos: Record<string, unknown> | null;
  aplicacion: string | null;
  direccion_ip: string | null;
}

export type RespuestaAuditoriaAdmin =
  | {
      fuente: 'aplicacion';
      items: AuditoriaAplicacionItem[];
      siguiente_cursor: string | null;
    }
  | {
      fuente: 'bd';
      items: AuditoriaBdItem[];
      siguiente_cursor: string | null;
    };

interface FilaAuditoriaApp {
  id: string | number;
  actor_id: number | null;
  origen_actor: OrigenActor;
  fecha_servidor: Date;
  accion: string;
  recurso_tipo: string;
  recurso_id: string;
  resultado: ResultadoAuditoria;
  correlacion: string | null;
  detalle_minimo: string | null;
}

interface FilaAuditoriaBd {
  id: string | number;
  fecha_servidor: Date;
  usuario_bd: string;
  operacion: 'INSERT' | 'UPDATE' | 'DELETE';
  esquema: string;
  tabla: string;
  registro_id: string | null;
  datos_anteriores: Record<string, unknown> | null;
  datos_nuevos: Record<string, unknown> | null;
  aplicacion: string | null;
  direccion_ip: string | null;
}

@Injectable()
export class AdminAuditService {
  constructor(
    @Inject(AUDIT_DATA_SOURCE)
    private readonly auditDataSource: DataSource,
  ) {}

  async listarAuditoria(
    dto: ConsultarAuditoriaAdminDto,
  ): Promise<RespuestaAuditoriaAdmin> {
    const fuente: FuenteAuditoria = dto.fuente ?? 'aplicacion';
    const limite = dto.limit ?? 20;

    if (fuente === 'bd') {
      return this.listarAuditoriaBd(dto, limite);
    }

    return this.listarAuditoriaAplicacion(dto, limite);
  }

  private async listarAuditoriaAplicacion(
    dto: ConsultarAuditoriaAdminDto,
    limite: number,
  ): Promise<RespuestaAuditoriaAdmin> {
    const condiciones: string[] = [];
    const parametros: unknown[] = [];
    let indice = 1;

    if (dto.accion) {
      parametros.push(dto.accion);
      condiciones.push(`accion = $${indice++}`);
    }

    if (dto.actor_id !== undefined) {
      parametros.push(dto.actor_id);
      condiciones.push(`actor_id = $${indice++}`);
    }

    if (dto.recurso_tipo) {
      parametros.push(dto.recurso_tipo);
      condiciones.push(`recurso_tipo = $${indice++}`);
    }

    if (dto.resultado) {
      parametros.push(dto.resultado);
      condiciones.push(`resultado = $${indice++}`);
    }

    if (dto.cursor) {
      const cursorId = decodificarCursorId(dto.cursor);
      parametros.push(cursorId);
      condiciones.push(`id < $${indice++}`);
    }

    parametros.push(limite + 1);
    const paramLimite = `$${indice++}`;

    const clausulaWhere =
      condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const filas = (await this.auditDataSource.query(
      `SELECT
         id,
         actor_id,
         origen_actor,
         fecha_servidor,
         accion,
         recurso_tipo,
         recurso_id,
         resultado,
         correlacion,
         detalle_minimo
       FROM auditoria
       ${clausulaWhere}
       ORDER BY id DESC
       LIMIT ${paramLimite}`,
      parametros,
    )) as FilaAuditoriaApp[];

    const hayMas = filas.length > limite;
    const filasPagina = hayMas ? filas.slice(0, limite) : filas;

    const items: AuditoriaAplicacionItem[] = filasPagina.map((fila) => ({
      id: Number(fila.id),
      actor_id: fila.actor_id,
      origen_actor: fila.origen_actor,
      fecha_servidor: fila.fecha_servidor,
      accion: fila.accion,
      recurso_tipo: fila.recurso_tipo,
      recurso_id: fila.recurso_id,
      resultado: fila.resultado,
      correlacion: fila.correlacion,
      detalle_minimo: fila.detalle_minimo,
    }));

    const ultimo = items[items.length - 1];
    return {
      fuente: 'aplicacion',
      items,
      siguiente_cursor: hayMas && ultimo ? codificarCursorId(ultimo.id) : null,
    };
  }

  private async listarAuditoriaBd(
    dto: ConsultarAuditoriaAdminDto,
    limite: number,
  ): Promise<RespuestaAuditoriaAdmin> {
    const condiciones: string[] = [];
    const parametros: unknown[] = [];
    let indice = 1;

    if (dto.accion) {
      parametros.push(dto.accion.toUpperCase());
      condiciones.push(`operacion = $${indice++}`);
    }

    if (dto.recurso_tipo) {
      parametros.push(dto.recurso_tipo);
      condiciones.push(`tabla = $${indice++}`);
    }

    if (dto.cursor) {
      const cursorId = decodificarCursorId(dto.cursor);
      parametros.push(cursorId);
      condiciones.push(`id < $${indice++}`);
    }

    parametros.push(limite + 1);
    const paramLimite = `$${indice++}`;

    const clausulaWhere =
      condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const filas = (await this.auditDataSource.query(
      `SELECT
         id,
         fecha_servidor,
         usuario_bd,
         operacion,
         esquema,
         tabla,
         registro_id,
         datos_anteriores,
         datos_nuevos,
         aplicacion,
         host(direccion_ip) AS direccion_ip
       FROM auditoria_bd
       ${clausulaWhere}
       ORDER BY id DESC
       LIMIT ${paramLimite}`,
      parametros,
    )) as FilaAuditoriaBd[];

    const hayMas = filas.length > limite;
    const filasPagina = hayMas ? filas.slice(0, limite) : filas;

    const items: AuditoriaBdItem[] = filasPagina.map((fila) => ({
      id: Number(fila.id),
      fecha_servidor: fila.fecha_servidor,
      usuario_bd: fila.usuario_bd,
      operacion: fila.operacion,
      esquema: fila.esquema,
      tabla: fila.tabla,
      registro_id: fila.registro_id,
      datos_anteriores: fila.datos_anteriores,
      datos_nuevos: fila.datos_nuevos,
      aplicacion: fila.aplicacion,
      direccion_ip: fila.direccion_ip,
    }));

    const ultimo = items[items.length - 1];
    return {
      fuente: 'bd',
      items,
      siguiente_cursor: hayMas && ultimo ? codificarCursorId(ultimo.id) : null,
    };
  }
}
