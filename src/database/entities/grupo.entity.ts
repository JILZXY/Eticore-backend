import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('grupo')
export class Grupo {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
  })
  id: number;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'varchar', length: 64 })
  periodo: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({
    name: 'creado_en',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  creadoEn: Date;
}
