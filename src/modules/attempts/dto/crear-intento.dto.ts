import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CrearIntentoDto {
  @IsOptional()
  @IsUUID('4', { message: 'El id del intento debe ser un UUID v4 válido' })
  id?: string;

  @IsInt({ message: 'unidad_id debe ser un entero positivo' })
  @Min(1)
  unidad_id: number;
}
