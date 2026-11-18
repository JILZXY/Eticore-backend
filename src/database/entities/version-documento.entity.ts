import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('version_documento')
@Unique(['documentoId', 'numero'])
export class VersionDocumento {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'documento_id', type: 'integer' })
  documentoId: number;

  @Column({ type: 'integer' })
  numero: number;

  @Column({ type: 'text' })
  texto: string;

  @Column({ type: 'char', length: 64 })
  huella: string;

  @Column({
    name: 'publicada_en',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  publicadaEn: Date;
}
