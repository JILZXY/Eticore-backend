import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export type ResultadoRevisionEditorial =
  | 'aprobada'
  | 'rechazada'
  | 'observaciones';

export class CrearRevisionEditorialDto {
  @ApiProperty({
    description:
      'Dictamen de la revisión editorial (calcula y fija la huella SHA-256 del contenido, metadatos y fuentes actuales)',
    enum: ['aprobada', 'rechazada', 'observaciones'],
    example: 'aprobada',
  })
  @IsIn(['aprobada', 'rechazada', 'observaciones'], {
    message: 'resultado debe ser aprobada, rechazada u observaciones',
  })
  resultado!: ResultadoRevisionEditorial;
}
