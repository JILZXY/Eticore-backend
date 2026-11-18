import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import type { AppConfiguration } from '../../config/configuration.js';
import type { RequestConUsuario, UsuarioAutenticado } from '../decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { RolCodigo } from '../decorators/roles.decorator.js';
import { DomainError } from '../errors/domain.error.js';
import {
  calcularHashSesion,
  extraerCookieDeCabecera,
} from '../utils/hashing.js';
import { extraerFilasMutacion } from '../utils/typeorm-result.js';

interface FilaSesionUsuario {
  usuario_id: number;
  creada_en: Date | string;
  ultima_actividad: Date | string;
  expira_en: Date | string;
  revocada_en: Date | string | null;
  verificado_2fa: boolean;
  activo: boolean;
  nombre_visualizacion: string;
  correo_normalizado: string;
  ruta_preferida_id: number | null;
}

interface FilaRol {
  codigo: RolCodigo;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService<AppConfiguration, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublica) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestConUsuario>();
    request.user = await this.validarSesionDeRequest(request);
    return true;
  }

  async resolverUsuarioOpcional(
    request: RequestConUsuario,
  ): Promise<UsuarioAutenticado | undefined> {
    const security = this.configService.get('security', { infer: true });
    const valorCookie = extraerCookieDeCabecera(
      request.cookies as Record<string, unknown> | undefined,
      request.headers.cookie,
      security.sessionCookieName,
    );
    if (!valorCookie) {
      return undefined;
    }

    try {
      const usuario = await this.validarSesionDeRequest(request);
      request.user = usuario;
      return usuario;
    } catch {
      return undefined;
    }
  }

  private async validarSesionDeRequest(
    request: RequestConUsuario,
  ): Promise<UsuarioAutenticado> {
    const security = this.configService.get('security', { infer: true });

    const valorCookie = extraerCookieDeCabecera(
      request.cookies as Record<string, unknown> | undefined,
      request.headers.cookie,
      security.sessionCookieName,
    );
    if (!valorCookie) {
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'SESION_INVALIDA',
        'Sesión no proporcionada o inválida',
      );
    }

    const hashSesion = calcularHashSesion(valorCookie);
    const filas = (await this.dataSource.query(
      `SELECT
         s.usuario_id,
         s.creada_en,
         s.ultima_actividad,
         s.expira_en,
         s.revocada_en,
         s.verificado_2fa,
         u.activo,
         u.nombre_visualizacion,
         u.correo_normalizado,
         u.ruta_preferida_id
       FROM sesion s
       INNER JOIN usuario u ON u.id = s.usuario_id
       WHERE s.token_hash = $1
       LIMIT 1`,
      [hashSesion],
    )) as FilaSesionUsuario[];

    const fila = filas[0];
    if (!fila || !fila.activo || fila.revocada_en !== null) {
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'SESION_INVALIDA',
        'Sesión inválida o revocada',
      );
    }

    const ahoraMs = Date.now();
    const creadaMs = new Date(fila.creada_en).getTime();
    const ultimaActividadMs = new Date(fila.ultima_actividad).getTime();
    const expiraEnMs = new Date(fila.expira_en).getTime();
    const limiteInactividadMs = security.sessionIdleTimeoutMinutes * 60_000;
    const limiteAbsolutoMs = security.sessionAbsoluteTimeoutHours * 3_600_000;

    if (
      ahoraMs >= expiraEnMs ||
      ahoraMs - creadaMs >= limiteAbsolutoMs ||
      ahoraMs - ultimaActividadMs >= limiteInactividadMs
    ) {
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'SESION_EXPIRADA',
        'La sesión ha expirado',
      );
    }

    const resultadoActualizacion = (await this.dataSource.query(
      `UPDATE sesion
       SET ultima_actividad = CURRENT_TIMESTAMP
       WHERE token_hash = $1 AND revocada_en IS NULL
       RETURNING usuario_id`,
      [hashSesion],
    )) as unknown;

    const filasActualizadas = extraerFilasMutacion<{ usuario_id: number }>(
      resultadoActualizacion,
    );

    if (filasActualizadas.length === 0) {
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'SESION_INVALIDA',
        'Sesión inválida o revocada',
      );
    }

    const filasRoles = (await this.dataSource.query(
      `SELECT r.codigo
       FROM usuario_rol ur
       INNER JOIN rol r ON r.id = ur.rol_id
       WHERE ur.usuario_id = $1
       ORDER BY r.id`,
      [fila.usuario_id],
    )) as FilaRol[];

    return {
      id: fila.usuario_id,
      nombreVisualizacion: fila.nombre_visualizacion,
      correoNormalizado: fila.correo_normalizado,
      rutaPreferidaId: fila.ruta_preferida_id,
      roles: filasRoles.map((r) => r.codigo),
      verificado2fa: fila.verificado_2fa,
      hashSesion,
    };
  }
}
