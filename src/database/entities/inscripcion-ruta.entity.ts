import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('inscripcion_ruta')
@Unique(['usuarioId', 'rutaVersionId'])
@Unique(['id', 'usuarioId'])
export class InscripcionRuta {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'usuario_id', type: 'integer' })
  usuarioId: number;

  @Column({ name: 'ruta_version_id', type: 'bigint' })
  rutaVersionId: string;

  @Column({
    name: 'inscrita_en',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  inscritaEn: Date;

  @Column({ name: 'migrada_de_id', type: 'bigint', nullable: true })
  migradaDeId: string | null;
}
