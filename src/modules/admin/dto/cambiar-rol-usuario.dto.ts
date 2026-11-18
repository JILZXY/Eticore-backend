import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import type { RolCodigo } from '../../../common/decorators/roles.decorator.js';

export class CambiarRolUsuarioDto {
  @ApiProperty({
    description: 'Identificador del usuario al que se asignará o retirará el rol',
    example: 2,
  })
  @Type(() => Number)
  @IsInt({ message: 'usuario_id debe ser un entero positivo' })
  @Min(1)
  usuario_id!: number;

  @ApiPropertyOptional({
    description: 'Código del rol del catálogo fijo',
    enum: ['APRENDIZ', 'ADMIN_CONTENIDO', 'ADMIN_TECNICO'],
    example: 'ADMIN_CONTENIDO',
  })
  @IsOptional()
  @IsIn(['APRENDIZ', 'ADMIN_CONTENIDO', 'ADMIN_TECNICO'], {
    message: 'rol_codigo debe ser APRENDIZ, ADMIN_CONTENIDO o ADMIN_TECNICO',
  })
  rol_codigo?: RolCodigo;

  @ApiPropertyOptional({
    description: 'Alias de rol_codigo',
    enum: ['APRENDIZ', 'ADMIN_CONTENIDO', 'ADMIN_TECNICO'],
    example: 'ADMIN_CONTENIDO',
  })
  @IsOptional()
  @IsIn(['APRENDIZ', 'ADMIN_CONTENIDO', 'ADMIN_TECNICO'], {
    message: 'rol debe ser APRENDIZ, ADMIN_CONTENIDO o ADMIN_TECNICO',
  })
  rol?: RolCodigo;
}
