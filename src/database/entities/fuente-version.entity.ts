import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('fuente_version')
export class FuenteVersion {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'fuente_id', type: 'integer' })
  fuenteId: number;

  @Column({ type: 'text' })
  titulo: string;

  @Column({ name: 'autor_organismo', type: 'text' })
  autorOrganismo: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ name: 'fecha_o_version', type: 'varchar', length: 120 })
  fechaOVersion: string;

  @Column({ name: 'licencia_o_condicion_uso', type: 'text', nullable: true })
  licenciaOCondicionUso: string | null;
}
