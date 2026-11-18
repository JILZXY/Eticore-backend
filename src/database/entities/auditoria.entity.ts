import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('auditoria')
export class Auditoria {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'actor_id', type: 'integer', nullable: true })
  actorId: number | null;

  @Column({ name: 'origen_actor', type: 'varchar', length: 20 })
  origenActor: 'usuario' | 'sistema' | 'cuenta_suprimida';

  @Column({
    name: 'fecha_servidor',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaServidor: Date;

  @Column({ type: 'varchar', length: 64 })
  accion: string;

  @Column({ name: 'recurso_tipo', type: 'varchar', length: 40 })
  recursoTipo: string;

  @Column({ name: 'recurso_id', type: 'text' })
  recursoId: string;

  @Column({ type: 'varchar', length: 16 })
  resultado: 'exitoso' | 'rechazado' | 'fallido';

  @Column({ type: 'uuid', nullable: true })
  correlacion: string | null;

  @Column({ name: 'detalle_minimo', type: 'text', nullable: true })
  detalleMinimo: string | null;
}
