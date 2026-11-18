import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

export type OrigenActor = 'usuario' | 'sistema' | 'cuenta_suprimida';
export type ResultadoAuditoria = 'exitoso' | 'rechazado' | 'fallido';

export interface EntradaAuditoria {
  actorId: number | null;
  origenActor: OrigenActor;
  accion: string;
  recursoTipo: string;
  recursoId: string;
  resultado: ResultadoAuditoria;
  correlacion?: string | null;
  detalleMinimo?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly dataSource: DataSource) {}

  async registrar(em: EntityManager, entrada: EntradaAuditoria): Promise<void> {
    await em.query(
      `INSERT INTO auditoria (
         actor_id,
         origen_actor,
         accion,
         recurso_tipo,
         recurso_id,
         resultado,
         correlacion,
         detalle_minimo
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entrada.actorId,
        entrada.origenActor,
        entrada.accion,
        entrada.recursoTipo,
        entrada.recursoId,
        entrada.resultado,
        entrada.correlacion ?? null,
        entrada.detalleMinimo ?? null,
      ],
    );
  }

  async registrarFueraDeTransaccion(entrada: EntradaAuditoria): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO auditoria (
         actor_id,
         origen_actor,
         accion,
         recurso_tipo,
         recurso_id,
         resultado,
         correlacion,
         detalle_minimo
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entrada.actorId,
        entrada.origenActor,
        entrada.accion,
        entrada.recursoTipo,
        entrada.recursoId,
        entrada.resultado,
        entrada.correlacion ?? null,
        entrada.detalleMinimo ?? null,
      ],
    );
  }
}
