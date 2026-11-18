import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('unidad_fuente')
export class UnidadFuente {
  @PrimaryColumn({ name: 'version_id', type: 'bigint' })
  versionId: string;

  @PrimaryColumn({ name: 'clave_local', type: 'varchar', length: 40 })
  claveLocal: string;

  @Column({ name: 'fuente_version_id', type: 'bigint' })
  fuenteVersionId: string;

  @Column({ name: 'revisada_en', type: 'date' })
  revisadaEn: string;
}
