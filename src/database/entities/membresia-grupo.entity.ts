import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('membresia_grupo')
@Unique(['grupoId', 'usuarioId', 'ingreso'])
export class MembresiaGrupo {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'grupo_id', type: 'integer' })
  grupoId: number;

  @Column({ name: 'usuario_id', type: 'integer' })
  usuarioId: number;

  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  ingreso: Date;

  @Column({ type: 'timestamptz', nullable: true })
  salida: Date | null;
}
