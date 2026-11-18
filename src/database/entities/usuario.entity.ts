import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('usuario')
export class Usuario {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
  })
  id: number;

  @Column({ name: 'nombre_visualizacion', type: 'varchar', length: 80 })
  nombreVisualizacion: string;

  @Column({
    name: 'correo_normalizado',
    type: 'varchar',
    length: 254,
    unique: true,
  })
  correoNormalizado: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ name: 'ruta_preferida_id', type: 'integer', nullable: true })
  rutaPreferidaId: number | null;

  @Column({
    name: 'creado_en',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  creadoEn: Date;
}
