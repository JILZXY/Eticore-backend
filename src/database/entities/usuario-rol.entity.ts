import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('usuario_rol')
export class UsuarioRol {
  @PrimaryColumn({ name: 'usuario_id', type: 'integer' })
  usuarioId: number;

  @PrimaryColumn({ name: 'rol_id', type: 'smallint' })
  rolId: number;

  @Column({
    name: 'asignado_en',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  asignadoEn: Date;
}
