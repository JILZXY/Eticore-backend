import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('desafio_autenticacion')
export class DesafioAutenticacion {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'usuario_id', type: 'integer' })
  usuarioId: number;

  @Column({ name: 'token_hash', type: 'bytea' })
  tokenHash: Buffer;

  @Column({
    name: 'creado_en',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  creadoEn: Date;

  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiraEn: Date;

  @Column({ type: 'smallint', default: 0 })
  intentos: number;
}
