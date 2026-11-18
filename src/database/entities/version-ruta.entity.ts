import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('version_ruta')
@Unique(['rutaId', 'numero'])
@Unique(['id', 'rutaId'])
export class VersionRuta {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'ruta_id', type: 'integer' })
  rutaId: number;

  @Column({ type: 'integer' })
  numero: number;

  @Column({ name: 'publicada_en', type: 'timestamptz', nullable: true })
  publicadaEn: Date | null;
}
