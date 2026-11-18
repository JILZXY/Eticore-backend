import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../errors/domain.error.js';

export function codificarCursorId(id: number | string): string {
  const carga = JSON.stringify({ id: String(id) });
  return Buffer.from(carga, 'utf8').toString('base64url');
}

export function decodificarCursorId(cursor: string): number {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as { id?: unknown };
    const id = Number(parsed?.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      throw new Error('Cursor fuera de rango');
    }

    return id;
  } catch {
    throw new DomainError(
      HttpStatus.BAD_REQUEST,
      'CURSOR_INVALIDO',
      'El cursor de paginación no es válido',
    );
  }
}
