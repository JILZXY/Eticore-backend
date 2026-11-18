import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('unidad')
export class Unidad {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
  })
  id: number;

  @Column({ type: 'varchar', length: 12 })
  tipo: 'aprende' | 'normamatch' | 'casotech';

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @Column({ name: 'muestra_publica', type: 'boolean', default: false })
  muestraPublica: boolean;

  @Column({ name: 'version_publicada_id', type: 'bigint', nullable: true })
  versionPublicadaId: string | null;
}
