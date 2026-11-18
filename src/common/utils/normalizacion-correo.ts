import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../errors/domain.error.js';

const CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

export function validarCorreoNormalizado(correoNormalizado: string): void {
  if (
    correoNormalizado.length === 0 ||
    correoNormalizado.length > 254 ||
    !CORREO_REGEX.test(correoNormalizado)
  ) {
    throw new DomainError(
      HttpStatus.BAD_REQUEST,
      'CORREO_INVALIDO',
      'El correo electrónico no tiene un formato válido',
    );
  }
}
