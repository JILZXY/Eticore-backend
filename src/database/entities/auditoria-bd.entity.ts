import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('auditoria_bd')
export class AuditoriaBd {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({
    name: 'fecha_servidor',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaServidor: Date;

  @Column({ name: 'usuario_bd', type: 'varchar', length: 64 })
  usuarioBd: string;

  @Column({ type: 'varchar', length: 16 })
  operacion: 'INSERT' | 'UPDATE' | 'DELETE';

  @Column({ type: 'varchar', length: 64, default: 'public' })
  esquema: string;

  @Column({ type: 'varchar', length: 64 })
  tabla: string;

  @Column({ name: 'registro_id', type: 'text', nullable: true })
  registroId: string | null;

  @Column({ name: 'datos_anteriores', type: 'jsonb', nullable: true })
  datosAnteriores: Record<string, unknown> | null;

  @Column({ name: 'datos_nuevos', type: 'jsonb', nullable: true })
  datosNuevos: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  aplicacion: string | null;

  @Column({ name: 'direccion_ip', type: 'inet', nullable: true })
  direccionIp: string | null;
}
