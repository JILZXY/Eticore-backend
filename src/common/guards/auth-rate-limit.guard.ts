import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import type { AppConfiguration } from '../../config/configuration.js';
import type { RequestConUsuario } from '../decorators/current-user.decorator.js';
import { DomainError } from '../errors/domain.error.js';
import { normalizarCorreo } from '../utils/normalizacion-correo.js';

interface VentanaContador {
  intentos: number;
  expiraEnMs: number;
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly ventanas = new Map<string, VentanaContador>();
  private contadorLimpieza = 0;

  constructor(
    private readonly configService: ConfigService<AppConfiguration, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestConUsuario>();
    const response = http.getResponse<Response>();

    const security = this.configService.get('security', { infer: true });
    const ttlSeconds = security?.authRateLimitTtlSeconds ?? 60;
    const maxAttempts = security?.authRateLimitMaxAttempts ?? 20;

    const ahora = Date.now();
    this.limpiarExpiradasSiAplica(ahora);

    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const ruta = request.path || request.originalUrl.split('?')[0] || '/';
    const identificador = this.resolverIdentificador(request);

    const claveCuenta = `cuenta|${ruta}|${ip}|${identificador}`;
    const claveIp = `ip|${ruta}|${ip}`;
    const limiteIp = Math.max(100, maxAttempts * 5);

    this.consumirOCortar(claveCuenta, maxAttempts, ttlSeconds, ahora, response);
    this.consumirOCortar(claveIp, limiteIp, ttlSeconds, ahora, response);

    return true;
  }

  private resolverIdentificador(request: RequestConUsuario): string {
    if (request.user?.id !== undefined) {
      return `u:${request.user.id}`;
    }

    const cuerpo = request.body as Record<string, unknown> | undefined;
    if (cuerpo && typeof cuerpo.correo === 'string') {
      const normalizado = normalizarCorreo(cuerpo.correo);
      if (normalizado.length > 0) {
        return `c:${createHash('sha256').update(normalizado, 'utf8').digest('hex').slice(0, 16)}`;
      }
    }

    const rawDesafio =
      cuerpo && typeof cuerpo.desafio_id === 'string'
        ? cuerpo.desafio_id
        : cuerpo && typeof cuerpo.desafio_token === 'string'
          ? cuerpo.desafio_token
          : undefined;
    if (rawDesafio) {
      const token = rawDesafio.trim();
      if (token.length > 0) {
        return `d:${createHash('sha256').update(token, 'utf8').digest('hex').slice(0, 16)}`;
      }
    }

    return 'anon';
  }

  private consumirOCortar(
    clave: string,
    limite: number,
    ttlSeconds: number,
    ahora: number,
    response: Response,
  ): void {
    const ttlMs = ttlSeconds * 1000;
    const actual = this.ventanas.get(clave);

    if (!actual || actual.expiraEnMs <= ahora) {
      this.ventanas.set(clave, {
        intentos: 1,
        expiraEnMs: ahora + ttlMs,
      });
      return;
    }

    if (actual.intentos >= limite) {
      const retryAfter = Math.max(
        1,
        Math.ceil((actual.expiraEnMs - ahora) / 1000),
      );
      if (typeof response.setHeader === 'function') {
        response.setHeader('Retry-After', String(retryAfter));
      }
      throw new DomainError(
        HttpStatus.TOO_MANY_REQUESTS,
        'LIMITE_PETICIONES_AUTH',
        'Demasiados intentos de autenticación; intenta más tarde',
        { retryAfterSeconds: retryAfter },
      );
    }

    actual.intentos += 1;
  }

  private limpiarExpiradasSiAplica(ahora: number): void {
    this.contadorLimpieza += 1;
    if (this.contadorLimpieza < 200) {
      return;
    }
    this.contadorLimpieza = 0;

    for (const [clave, ventana] of this.ventanas.entries()) {
      if (ventana.expiraEnMs <= ahora) {
        this.ventanas.delete(clave);
      }
    }
  }
}
