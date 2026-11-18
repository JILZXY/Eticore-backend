import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateIf,
} from 'class-validator';

export class ActualizarPerfilDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El nombre de visualización debe ser texto' })
  @Length(2, 80, {
    message: 'El nombre de visualización debe tener entre 2 y 80 caracteres',
  })
  nombre_visualizacion?: string;

  @IsOptional()
  @ValidateIf((obj: ActualizarPerfilDto) => obj.ruta_preferida_id !== null)
  @IsInt({ message: 'La ruta preferida debe ser un identificador entero' })
  @Min(1, { message: 'La ruta preferida debe ser un identificador válido' })
  ruta_preferida_id?: number | null;
}
