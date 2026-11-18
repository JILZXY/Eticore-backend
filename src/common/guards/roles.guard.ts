import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestConUsuario } from '../decorators/current-user.decorator.js';
import { ROLES_KEY, type RolCodigo } from '../decorators/roles.decorator.js';
import { DomainError } from '../errors/domain.error.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<RolCodigo[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!rolesRequeridos || rolesRequeridos.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestConUsuario>();
    const usuario = request.user;
    if (!usuario) {
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'SESION_INVALIDA',
        'Autenticación requerida',
      );
    }

    const tieneRol = rolesRequeridos.some((rol) => usuario.roles.includes(rol));
    if (!tieneRol) {
      throw new DomainError(
        HttpStatus.FORBIDDEN,
        'SIN_PERMISO',
        'No tienes permisos para realizar esta acción',
      );
    }

    return true;
  }
}
