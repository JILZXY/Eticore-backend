import { IsISO8601, IsOptional } from 'class-validator';

export class RetirarIntegranteGrupoDto {
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'salida debe tener formato ISO 8601 válido' },
  )
  salida?: string;
}
