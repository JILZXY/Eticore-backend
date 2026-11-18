import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';

export class ConsultarReporteGrupoDto {
  @IsISO8601(
    { strict: true },
    { message: 'desde debe tener formato ISO 8601 válido' },
  )
  desde!: string;

  @IsISO8601(
    { strict: true },
    { message: 'hasta debe tener formato ISO 8601 válido' },
  )
  hasta!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'unidad_id debe ser un entero positivo' })
  @Min(1)
  unidad_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'ruta_id debe ser un entero positivo' })
  @Min(1)
  ruta_id?: number;
}
