import { HttpException, HttpStatus } from '@nestjs/common';

export interface ApiErrorBody {
  error: {
    codigo: string;
    mensaje: string;
    detalles: Record<string, unknown>;
  };
}

export class DomainError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalles: Record<string, unknown> = {},
  ) {
    super(
      {
        error: {
          codigo,
          mensaje,
          detalles,
        },
      } satisfies ApiErrorBody,
      status,
    );
  }
}
