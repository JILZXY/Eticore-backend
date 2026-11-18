import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('revision_editorial')
export class RevisionEditorial {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'version_id', type: 'bigint' })
  versionId: string;

  @Column({ name: 'revisor_id', type: 'integer' })
  revisorId: number;

  @Column({ name: 'huella_revisada', type: 'char', length: 64 })
  huellaRevisada: string;

  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fecha: Date;

  @Column({ type: 'varchar', length: 16 })
  resultado: 'aprobada' | 'rechazada' | 'observaciones';
}
