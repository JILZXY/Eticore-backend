import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('usuario_insignia')
export class UsuarioInsignia {
  @PrimaryColumn({ name: 'usuario_id', type: 'integer' })
  usuarioId: number;

  @PrimaryColumn({ name: 'insignia_id', type: 'smallint' })
  insigniaId: number;

  @Column({
    name: 'obtenida_en',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  obtenidaEn: Date;

  @Column({ name: 'intento_origen_id', type: 'uuid', nullable: true })
  intentoOrigenId: string | null;

  @Column({ name: 'inscripcion_origen_id', type: 'bigint', nullable: true })
  inscripcionOrigenId: string | null;
}
