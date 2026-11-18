import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('sesion')
export class Sesion {
  @PrimaryColumn({ name: 'token_hash', type: 'bytea' })
  tokenHash: Buffer;

  @Column({ name: 'usuario_id', type: 'integer' })
  usuarioId: number;

  @Column({
    name: 'creada_en',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  creadaEn: Date;

  @Column({
    name: 'ultima_actividad',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  ultimaActividad: Date;

  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiraEn: Date;

  @Column({ name: 'revocada_en', type: 'timestamptz', nullable: true })
  revocadaEn: Date | null;

  @Column({ name: 'verificado_2fa', type: 'boolean', default: false })
  verificado2fa: boolean;
}
