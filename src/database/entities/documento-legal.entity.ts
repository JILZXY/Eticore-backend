import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('documento_legal')
export class DocumentoLegal {
  @PrimaryGeneratedColumn('identity', {
    type: 'integer',
    generatedIdentity: 'ALWAYS',
  })
  id: number;

  @Column({ type: 'varchar', length: 24 })
  tipo: 'terminos' | 'aviso_privacidad' | 'consentimiento';
}
