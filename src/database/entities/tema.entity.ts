import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tema')
export class Tema {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
  })
  id: number;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'text' })
  descripcion: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}
