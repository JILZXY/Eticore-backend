import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('version_unidad')
@Unique(['unidadId', 'numero'])
@Unique(['id', 'unidadId'])
export class VersionUnidad {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'unidad_id', type: 'integer' })
  unidadId: number;

  @Column({ type: 'integer' })
  numero: number;

  @Column({ type: 'varchar', length: 200 })
  titulo: string;

  @Column({ type: 'text' })
  descripcion: string;

  @Column({ name: 'tema_id', type: 'integer' })
  temaId: number;

  @Column({ type: 'varchar', length: 16 })
  dificultad: 'basico' | 'intermedio' | 'especializado';

  @Column({ type: 'varchar', length: 16, default: 'borrador' })
  estado: 'borrador' | 'en_revision' | 'publicado' | 'desactivado';

  @Column({ name: 'esquema_version', type: 'smallint', default: 1 })
  esquemaVersion: number;

  @Column({ type: 'jsonb' })
  contenido: Record<string, unknown>;

  @Column({ type: 'integer', default: 1 })
  revision: number;

  @Column({
    name: 'creada_en',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  creadaEn: Date;

  @Column({ name: 'publicada_en', type: 'timestamptz', nullable: true })
  publicadaEn: Date | null;
}
