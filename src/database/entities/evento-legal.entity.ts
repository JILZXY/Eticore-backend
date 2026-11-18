import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('evento_legal')
@Unique(['usuarioId', 'claveOperacion'])
export class EventoLegal {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'usuario_id', type: 'integer' })
  usuarioId: number;

  @Column({ name: 'version_documento_id', type: 'bigint' })
  versionDocumentoId: string;

  @Column({
    name: 'finalidad_codigo',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  finalidadCodigo: string | null;

  @Column({ name: 'tipo_evento', type: 'varchar', length: 32 })
  tipoEvento:
    | 'aviso_presentado'
    | 'terminos_aceptados'
    | 'consentimiento_otorgado'
    | 'consentimiento_retirado'
    | 'consentimiento_rechazado';

  @Column({
    name: 'fecha_servidor',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaServidor: Date;

  @Column({ type: 'varchar', length: 32 })
  canal: string;

  @Column({ name: 'clave_operacion', type: 'uuid' })
  claveOperacion: string;
}
