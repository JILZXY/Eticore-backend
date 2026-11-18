import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ConsultarProgresoRutaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'ruta_id debe ser un entero positivo' })
  @Min(1)
  ruta_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'inscripcion_id debe ser un entero positivo' })
  @Min(1)
  inscripcion_id?: number;
}
