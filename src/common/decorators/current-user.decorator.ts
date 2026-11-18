import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RolCodigo } from './roles.decorator.js';

export interface UsuarioAutenticado {
  id: number;
  nombreVisualizacion: string;
  correoNormalizado: string;
  rutaPreferidaId: number | null;
  roles: RolCodigo[];
  verificado2fa: boolean;
  hashSesion: Buffer;
}

export interface RequestConUsuario extends Request {
  user?: UsuarioAutenticado;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioAutenticado | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestConUsuario>();
    return request.user;
  },
);
