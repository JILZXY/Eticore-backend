import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { RequestConUsuario } from '../decorators/current-user.decorator.js';
import { DomainError } from '../errors/domain.error.js';

@Injectable()
export class OwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestConUsuario>();
    const usuario = request.user;

    if (!usuario) {
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'SESION_INVALIDA',
        'Autenticación requerida',
      );
    }

    if (usuario.roles.includes('ADMIN_TECNICO')) {
      return true;
    }

    const objetivoParam =
      request.params?.usuarioId ?? request.params?.id ?? undefined;
    if (objetivoParam === undefined || objetivoParam === 'me') {
      return true;
    }

    const objetivoId = Number(objetivoParam);
    if (!Number.isInteger(objetivoId) || objetivoId !== usuario.id) {
      throw new DomainError(
        HttpStatus.FORBIDDEN,
        'SIN_PERMISO',
        'No puedes acceder a recursos de otro usuario',
      );
    }

    return true;
  }
}
