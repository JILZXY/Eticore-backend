import { HttpStatus } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { DomainError } from '../errors/domain.error.js';

const CONTRASENA_MIN_LONGITUD = 15;
const CONTRASENA_MAX_LONGITUD = 128;

const CONTRASENAS_COMUNES = new Set<string>([
  '123456789012345',
  '1234567890123456',
  '000000000000000',
  '111111111111111',
  'qwertyuiop12345',
  'qwertyuiopasdfg',
  'admin1234567890',
  'contrasena12345',
  'password1234567',
  'password12345678',
  'letmein12345678',
  'welcome12345678',
  'iloveyou1234567',
  'abc123456789012',
  'eticore12345678',
  'eticore2026etic',
  'changeme1234567',
  'passphrase12345',
]);

// Verificador constante sintético para igualar tiempos cuando la cuenta no existe.
export const VERIFICADOR_SIMULADO_ARGON2ID =
  '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function derivarArgon2id(contrasena: string): Promise<string> {
  return argon2.hash(contrasena, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verificarArgon2id(
  verificador: string,
  contrasena: string,
): Promise<boolean> {
  try {
    return await argon2.verify(verificador, contrasena);
  } catch {
    return false;
  }
}

export function validarPoliticaContrasena(
  contrasena: string,
  correoNormalizado?: string,
): void {
  if (
    typeof contrasena !== 'string' ||
    contrasena.length < CONTRASENA_MIN_LONGITUD ||
    contrasena.length > CONTRASENA_MAX_LONGITUD
  ) {
    throw new DomainError(
      HttpStatus.BAD_REQUEST,
      'CONTRASENA_INVALIDA',
      'La contraseña debe tener entre 15 y 128 caracteres',
    );
  }

  if (contrasena.trim().length === 0) {
    throw new DomainError(
      HttpStatus.BAD_REQUEST,
      'CONTRASENA_INVALIDA',
      'La contraseña no puede contener únicamente espacios',
    );
  }

  if (/^([\s\S])\1+$/.test(contrasena)) {
    throw new DomainError(
      HttpStatus.BAD_REQUEST,
      'CONTRASENA_COMUN',
      'La contraseña es demasiado predecible',
    );
  }

  const comparacion = contrasena.trim().toLowerCase();
  if (CONTRASENAS_COMUNES.has(comparacion)) {
    throw new DomainError(
      HttpStatus.BAD_REQUEST,
      'CONTRASENA_COMUN',
      'La contraseña es demasiado común; elige una frase menos predecible',
    );
  }

  if (correoNormalizado) {
    const parteLocal = correoNormalizado.split('@')[0] ?? '';
    if (
      comparacion.includes(correoNormalizado) ||
      (parteLocal.length >= 4 && comparacion.includes(parteLocal))
    ) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'CONTRASENA_INVALIDA',
        'La contraseña no debe incluir tu correo electrónico',
      );
    }
  }
}

export function generarCredencialSesion(): {
  valorCookie: string;
  hashBytes: Buffer;
} {
  const valorCookie = randomBytes(32).toString('base64url');
  const hashBytes = calcularHashSesion(valorCookie);
  return { valorCookie, hashBytes };
}

export function calcularHashSesion(valorCookie: string): Buffer {
  return createHash('sha256').update(valorCookie, 'utf8').digest();
}

export function extraerCookieDeCabecera(
  cookies: Record<string, unknown> | undefined,
  cabeceraCookie: string | undefined,
  nombreCookie: string,
): string | undefined {
  if (cookies && typeof cookies[nombreCookie] === 'string') {
    const valor = cookies[nombreCookie];
    return valor.length > 0 ? valor : undefined;
  }

  if (!cabeceraCookie) {
    return undefined;
  }

  const partes = cabeceraCookie.split(';');
  for (const parte of partes) {
    const indice = parte.indexOf('=');
    if (indice <= 0) {
      continue;
    }
    const clave = parte.slice(0, indice).trim();
    if (clave !== nombreCookie) {
      continue;
    }
    const valorCrudo = parte.slice(indice + 1).trim();
    if (!valorCrudo) {
      return undefined;
    }
    try {
      return decodeURIComponent(valorCrudo);
    } catch {
      return valorCrudo;
    }
  }

  return undefined;
}
