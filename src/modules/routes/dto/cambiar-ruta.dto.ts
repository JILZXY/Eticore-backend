import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CambiarRutaDto {
  @ApiProperty({
    description:
      'Identificador de la nueva ruta activa a elegir (crea inscripción separada sin migrar ni borrar la anterior)',
    example: 2,
  })
  @IsInt({ message: 'ruta_id debe ser un entero positivo' })
  @Min(1)
  ruta_id: number;
}
