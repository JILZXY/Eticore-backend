import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

@Entity('intento')
@Unique(['usuarioId', 'unidadId', 'numero'])
@Unique(['id', 'usuarioId'])
@Unique(['id', 'usuarioId', 'unidadId'])
export class Intento {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'usuario_id', type: 'integer' })
  usuarioId: number;

  @Column({ name: 'unidad_id', type: 'integer' })
  unidadId: number;

  @Column({ name: 'version_id', type: 'bigint' })
  versionId: string;

  @Column({ type: 'integer' })
  numero: number;

  @Column({ type: 'varchar', length: 16, default: 'en_curso' })
  estado: 'en_curso' | 'finalizado';

  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  inicio: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finalizacion: Date | null;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  puntuacion: string | null;

  @Column({ type: 'integer', default: 1 })
  revision: number;

  @Column({ name: 'esquema_version', type: 'smallint', default: 1 })
  esquemaVersion: number;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  recorrido: Record<string, unknown>;
}
