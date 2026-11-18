import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('segundo_factor')
export class SegundoFactor {
  @PrimaryColumn({ name: 'usuario_id', type: 'integer' })
  usuarioId: number;

  @Column({ name: 'secreto_cifrado', type: 'bytea' })
  secretoCifrado: Buffer;

  @Column({ type: 'varchar', length: 16, default: 'SHA1' })
  algoritmo: 'SHA1' | 'SHA256' | 'SHA512';

  @Column({ type: 'smallint', default: 30 })
  periodo: number;

  @Column({ type: 'smallint', default: 6 })
  digitos: number;

  @Column({
    name: 'creado_en',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  creadoEn: Date;

  @Column({ name: 'confirmado_en', type: 'timestamptz', nullable: true })
  confirmadoEn: Date | null;

  @Column({ name: 'ultimo_paso_totp', type: 'bigint', nullable: true })
  ultimoPasoTotp: string | null;
}
