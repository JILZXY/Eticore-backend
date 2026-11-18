import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';

export interface RegistroLogHttp {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  event: 'http_request';
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  constructor(private readonly escribirLog?: (lineaJson: string) => void) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const inicio = performance.now();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const method = request.method;
    const rawUrl = request.path || request.originalUrl || '/';
    const path = rawUrl.split('?')[0] ?? '/';

    const emitir = (statusCode: number): void => {
      const durationMs = Math.round((performance.now() - inicio) * 100) / 100;
      const level: RegistroLogHttp['level'] =
        statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

      const registro: RegistroLogHttp = {
        timestamp: new Date().toISOString(),
        level,
        event: 'http_request',
        method,
        path,
        statusCode,
        durationMs,
      };
      const linea = JSON.stringify(registro);

      if (this.escribirLog) {
        this.escribirLog(linea);
        return;
      }

      if (level === 'error') {
        this.logger.error(linea);
      } else if (level === 'warn') {
        this.logger.warn(linea);
      } else {
        this.logger.log(linea);
      }
    };

    return next.handle().pipe(
      tap({
        next: () => {
          emitir(response.statusCode || 200);
        },
        error: (error: unknown) => {
          const status =
            error instanceof HttpException ? error.getStatus() : 500;
          emitir(status);
        },
      }),
    );
  }
}
