import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

@Entity('ruta_unidad')
@Unique(['rutaVersionId', 'orden'])
export class RutaUnidad {
  @PrimaryColumn({ name: 'ruta_version_id', type: 'bigint' })
  rutaVersionId: string;

  @PrimaryColumn({ name: 'unidad_id', type: 'integer' })
  unidadId: number;

  @Column({ type: 'integer' })
  orden: number;

  @Column({ type: 'boolean', default: true })
  obligatoria: boolean;
}
