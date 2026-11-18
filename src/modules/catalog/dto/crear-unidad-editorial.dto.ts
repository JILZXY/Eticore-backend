import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import type { TipoUnidad } from '../../../shared/validation/content-validator.service.js';

export class CrearUnidadEditorialDto {
  @IsIn(['aprende', 'normamatch', 'casotech'], {
    message: 'tipo debe ser aprende, normamatch o casotech',
  })
  tipo!: TipoUnidad;

  @IsOptional()
  @IsBoolean({ message: 'muestra_publica debe ser booleano' })
  muestra_publica?: boolean;
}
