import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('fuente')
export class Fuente {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
  })
  id: number;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;
}
