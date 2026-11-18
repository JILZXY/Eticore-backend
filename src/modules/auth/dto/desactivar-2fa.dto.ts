import { IsOptional, IsString } from 'class-validator';

export class Desactivar2faDto {
  @IsOptional()
  @IsString({ message: 'La contraseña debe ser texto' })
  contrasena?: string;
}
