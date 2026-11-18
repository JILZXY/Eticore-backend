import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class Desactivar2faDto {
  @ApiPropertyOptional({
    description: 'Contraseña actual del usuario para confirmar la baja del segundo factor',
    example: 'frase de prueba segura eticore 2026',
  })
  @IsOptional()
  @IsString({ message: 'La contraseña debe ser texto' })
  contrasena?: string;
}
