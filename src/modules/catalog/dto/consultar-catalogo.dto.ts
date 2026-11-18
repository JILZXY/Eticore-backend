import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { TipoUnidad } from '../../../shared/validation/content-validator.service.js';

export type DificultadUnidad = 'basico' | 'intermedio' | 'especializado';
export type FiltroAvanceCatalogo = 'pendiente' | 'completada';

export class ConsultarCatalogoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tema_id debe ser un entero positivo' })
  @Min(1)
  tema_id?: number;

  @IsOptional()
  @IsIn(['basico', 'intermedio', 'especializado'], {
    message: 'dificultad debe ser basico, intermedio o especializado',
  })
  dificultad?: DificultadUnidad;

  @IsOptional()
  @IsIn(['aprende', 'normamatch', 'casotech'], {
    message: 'tipo debe ser aprende, normamatch o casotech',
  })
  tipo?: TipoUnidad;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'ruta_id debe ser un entero positivo' })
  @Min(1)
  ruta_id?: number;

  @IsOptional()
  @IsIn(['pendiente', 'completada'], {
    message: 'avance debe ser pendiente o completada',
  })
  avance?: FiltroAvanceCatalogo;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  busqueda?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero entre 1 y 100' })
  @Min(1)
  @Max(100)
  limit?: number;
}
