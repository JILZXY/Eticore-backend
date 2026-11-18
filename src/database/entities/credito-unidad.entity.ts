import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('credito_unidad')
export class CreditoUnidad {
  @PrimaryColumn({ name: 'usuario_id', type: 'integer' })
  usuarioId: number;

  @PrimaryColumn({ name: 'unidad_id', type: 'integer' })
  unidadId: number;

  @Column({ name: 'intento_origen_id', type: 'uuid' })
  intentoOrigenId: string;

  @Column({ type: 'smallint' })
  puntos: number;

  @Column({ name: 'completada_en', type: 'timestamptz' })
  completadaEn: Date;
}
