import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('credencial')
export class Credencial {
  @PrimaryColumn({ name: 'usuario_id', type: 'integer' })
  usuarioId: number;

  @Column({ name: 'verificador_argon2id', type: 'text' })
  verificadorArgon2id: string;
}
