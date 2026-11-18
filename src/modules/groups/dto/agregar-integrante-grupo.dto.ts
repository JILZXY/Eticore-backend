import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';

export class AgregarIntegranteGrupoDto {
  @Type(() => Number)
  @IsInt({ message: 'usuario_id debe ser un entero positivo' })
  @Min(1)
  usuario_id!: number;

  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'ingreso debe tener formato ISO 8601 válido' },
  )
  ingreso?: string;

  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'salida debe tener formato ISO 8601 válido' },
  )
  salida?: string;
}
