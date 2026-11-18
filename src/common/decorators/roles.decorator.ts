import { SetMetadata } from '@nestjs/common';

export type RolCodigo = 'APRENDIZ' | 'ADMIN_CONTENIDO' | 'ADMIN_TECNICO';

export const ROLES_KEY = 'roles';
export const Roles = (
  ...roles: RolCodigo[]
): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
