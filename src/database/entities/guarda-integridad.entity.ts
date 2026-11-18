import { Entity, PrimaryColumn } from 'typeorm';

@Entity('guarda_integridad')
export class GuardaIntegridad {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  clave: string;
}
