import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ruta')
export class Ruta {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
  })
  id: number;

  @Column({ type: 'varchar', length: 80 })
  nombre: string;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @Column({ name: 'version_actual_id', type: 'bigint', nullable: true })
  versionActualId: string | null;
}
