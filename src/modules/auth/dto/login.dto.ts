import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Correo electrónico de la cuenta',
    example: 'aprendiz@eticore.edu.mx',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El correo debe ser texto' })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  correo: string;

  @ApiProperty({
    description: 'Contraseña de la cuenta',
    example: 'frase de prueba segura eticore 2026',
  })
  @IsString({ message: 'La contraseña debe ser texto' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  contrasena: string;
}
