import { IsInt, Min } from 'class-validator';

export class CambiarRutaDto {
  @IsInt({ message: 'ruta_id debe ser un entero positivo' })
  @Min(1)
  ruta_id: number;
}
