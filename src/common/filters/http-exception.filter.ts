import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { type ApiErrorBody, DomainError } from '../errors/domain.error.js';

function codigoPorEstado(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'SOLICITUD_INVALIDA';
    case HttpStatus.UNAUTHORIZED:
      return 'NO_AUTENTICADO';
    case HttpStatus.FORBIDDEN:
      return 'SIN_PERMISO';
    case HttpStatus.NOT_FOUND:
      return 'NO_ENCONTRADO';
    case HttpStatus.CONFLICT:
      return 'CONFLICTO';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'REGLA_DE_NEGOCIO';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'LIMITE_EXCEDIDO';
    default:
      return 'ERROR_HTTP';
  }
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof DomainError) {
      const cuerpo = exception.getResponse() as ApiErrorBody;
      response.status(exception.getStatus()).json(cuerpo);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();

      if (
        typeof raw === 'object' &&
        raw !== null &&
        'error' in raw &&
        typeof (raw as Partial<ApiErrorBody>).error === 'object'
      ) {
        response.status(status).json(raw);
        return;
      }

      let mensaje = exception.message;
      let detalles: Record<string, unknown> = {};

      if (typeof raw === 'object' && raw !== null) {
        const record = raw as Record<string, unknown>;
        if (Array.isArray(record.message)) {
          mensaje = 'Error de validación en la solicitud';
          detalles = { errores: record.message };
        } else if (typeof record.message === 'string') {
          mensaje = record.message;
        }
      }

      const cuerpo: ApiErrorBody = {
        error: {
          codigo: codigoPorEstado(status),
          mensaje,
          detalles,
        },
      };
      response.status(status).json(cuerpo);
      return;
    }

    const mensajeInterno =
      exception instanceof Error ? exception.message : 'Error inesperado';
    this.logger.error(
      JSON.stringify({
        event: 'unhandled_exception',
        message: mensajeInterno,
      }),
    );

    const cuerpo: ApiErrorBody = {
      error: {
        codigo: 'ERROR_INTERNO',
        mensaje: 'Error interno del servidor',
        detalles: {},
      },
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(cuerpo);
  }
}
