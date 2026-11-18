import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length } from 'class-validator';

export class RegistroDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El nombre de visualización debe ser texto' })
  @Length(2, 80, {
    message: 'El nombre de visualización debe tener entre 2 y 80 caracteres',
  })
  nombre_visualizacion: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El correo debe ser texto' })
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  correo: string;

  @IsString({ message: 'La contraseña debe ser texto' })
  @Length(15, 128, {
    message: 'La contraseña debe tener entre 15 y 128 caracteres',
  })
  contrasena: string;
}
