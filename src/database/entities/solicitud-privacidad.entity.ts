import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('solicitud_privacidad')
export class SolicitudPrivacidad {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'usuario_id', type: 'integer', nullable: true })
  usuarioId: number | null;

  @Column({ type: 'varchar', length: 32 })
  tipo: string;

  @Column({
    name: 'recibida_en',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  recibidaEn: Date;

  @Column({ type: 'varchar', length: 24 })
  estado: 'recibida' | 'en_revision' | 'resuelta';

  @Column({ name: 'verificacion_minima', type: 'text', nullable: true })
  verificacionMinima: string | null;

  @Column({ name: 'resuelta_en', type: 'timestamptz', nullable: true })
  resueltaEn: Date | null;

  @Column({ type: 'text', nullable: true })
  resultado: string | null;
}
