import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length } from 'class-validator';

export class RegistroDto {
  @ApiProperty({
    description: 'Nombre de visualización del usuario (2 a 80 caracteres)',
    example: 'Aprendiz Eticore',
    minLength: 2,
    maxLength: 80,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El nombre de visualización debe ser texto' })
  @Length(2, 80, {
    message: 'El nombre de visualización debe tener entre 2 y 80 caracteres',
  })
  nombre_visualizacion: string;

  @ApiProperty({
    description: 'Correo electrónico (se normaliza a minúsculas sin espacios)',
    example: 'aprendiz@eticore.edu.mx',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El correo debe ser texto' })
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  correo: string;

  @ApiProperty({
    description:
      'Contraseña de 15 a 128 caracteres (admite espacios, rechaza contraseñas comunes)',
    example: 'frase de prueba segura eticore 2026',
    minLength: 15,
    maxLength: 128,
  })
  @IsString({ message: 'La contraseña debe ser texto' })
  @Length(15, 128, {
    message: 'La contraseña debe tener entre 15 y 128 caracteres',
  })
  contrasena: string;
}
