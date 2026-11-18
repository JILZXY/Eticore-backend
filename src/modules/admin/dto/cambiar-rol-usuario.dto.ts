import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import type { RolCodigo } from '../../../common/decorators/roles.decorator.js';

export class CambiarRolUsuarioDto {
  @Type(() => Number)
  @IsInt({ message: 'usuario_id debe ser un entero positivo' })
  @Min(1)
  usuario_id!: number;

  @IsOptional()
  @IsIn(['APRENDIZ', 'ADMIN_CONTENIDO', 'ADMIN_TECNICO'], {
    message: 'rol_codigo debe ser APRENDIZ, ADMIN_CONTENIDO o ADMIN_TECNICO',
  })
  rol_codigo?: RolCodigo;

  @IsOptional()
  @IsIn(['APRENDIZ', 'ADMIN_CONTENIDO', 'ADMIN_TECNICO'], {
    message: 'rol debe ser APRENDIZ, ADMIN_CONTENIDO o ADMIN_TECNICO',
  })
  rol?: RolCodigo;
}
