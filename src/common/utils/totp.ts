import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export type AlgoritmoTotp = 'SHA1' | 'SHA256' | 'SHA512';

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function cifrarSecretoTotp(
  bytesPlano: Buffer,
  claveHex: string,
): Buffer {
  const clave = Buffer.from(claveHex, 'hex');
  const iv = randomBytes(IV_BYTES);
  const cifrador = createCipheriv('aes-256-gcm', clave, iv);
  const cifrado = Buffer.concat([cifrador.update(bytesPlano), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();
  return Buffer.concat([iv, etiqueta, cifrado]);
}

export function descifrarSecretoTotp(
  datosCifrados: Buffer,
  claveHex: string,
): Buffer {
  const clave = Buffer.from(claveHex, 'hex');
  const iv = datosCifrados.subarray(0, IV_BYTES);
  const etiqueta = datosCifrados.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const textoCifrado = datosCifrados.subarray(IV_BYTES + TAG_BYTES);

  const descifrador = createDecipheriv('aes-256-gcm', clave, iv);
  descifrador.setAuthTag(etiqueta);
  return Buffer.concat([
    descifrador.update(textoCifrado),
    descifrador.final(),
  ]);
}

export function codificarBase32(datos: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = '';

  for (const byte of datos) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    salida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  }

  return salida;
}

export function construirOtpAuthUri(params: {
  emisor: string;
  correo: string;
  claveBase32: string;
  algoritmo?: AlgoritmoTotp;
  digitos?: number;
  periodo?: number;
}): string {
  const algoritmo = params.algoritmo ?? 'SHA1';
  const digitos = params.digitos ?? 6;
  const periodo = params.periodo ?? 30;
  const etiqueta = `${encodeURIComponent(params.emisor)}:${encodeURIComponent(params.correo)}`;
  const query = new URLSearchParams({
    issuer: params.emisor,
    algorithm: algoritmo,
    digits: String(digitos),
    period: String(periodo),
  });
  return `otpauth://totp/${etiqueta}?secret=${params.claveBase32}&${query.toString()}`;
}

export function calcularPasoTotp(
  ahoraMs: number = Date.now(),
  periodo: number = 30,
): bigint {
  return BigInt(Math.floor(ahoraMs / 1000 / periodo));
}

export function generarCodigoTotpEnPaso(
  bytesPlano: Buffer,
  paso: bigint,
  opciones?: { algoritmo?: AlgoritmoTotp; digitos?: number },
): string {
  const algoritmo = opciones?.algoritmo ?? 'SHA1';
  const digitos = opciones?.digitos ?? 6;
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(paso, 0);

  const hashAlg = algoritmo.toLowerCase();
  const resumen = createHmac(hashAlg, bytesPlano).update(contador).digest();
  const desplazamiento = resumen[resumen.length - 1] & 0x0f;

  const codigoBinario =
    ((resumen[desplazamiento] & 0x7f) << 24) |
    ((resumen[desplazamiento + 1] & 0xff) << 16) |
    ((resumen[desplazamiento + 2] & 0xff) << 8) |
    (resumen[desplazamiento + 3] & 0xff);

  const modulo = 10 ** digitos;
  return String(codigoBinario % modulo).padStart(digitos, '0');
}

export function verificarCodigoTotp(params: {
  bytesPlano: Buffer;
  codigo: string;
  ahoraMs?: number;
  ultimoPasoTotp: string | number | bigint | null;
  algoritmo?: AlgoritmoTotp;
  periodo?: number;
  digitos?: number;
}): {
  valido: boolean;
  esReplay: boolean;
  pasoAceptado: bigint | null;
} {
  const codigoLimpio = params.codigo.trim();
  const digitos = params.digitos ?? 6;
  const periodo = params.periodo ?? 30;
  const algoritmo = params.algoritmo ?? 'SHA1';

  if (!/^\d+$/.test(codigoLimpio) || codigoLimpio.length !== digitos) {
    return { valido: false, esReplay: false, pasoAceptado: null };
  }

  const pasoActual = calcularPasoTotp(params.ahoraMs, periodo);
  const ultimoPaso =
    params.ultimoPasoTotp !== null && params.ultimoPasoTotp !== undefined
      ? BigInt(params.ultimoPasoTotp)
      : null;

  const codigoBuf = Buffer.from(codigoLimpio, 'utf8');

  for (let delta = -1n; delta <= 1n; delta += 1n) {
    const pasoEvaluado = pasoActual + delta;
    if (pasoEvaluado < 0n) {
      continue;
    }

    const esperado = generarCodigoTotpEnPaso(params.bytesPlano, pasoEvaluado, {
      algoritmo,
      digitos,
    });
    const esperadoBuf = Buffer.from(esperado, 'utf8');

    if (
      codigoBuf.length === esperadoBuf.length &&
      timingSafeEqual(codigoBuf, esperadoBuf)
    ) {
      if (ultimoPaso !== null && pasoEvaluado <= ultimoPaso) {
        return { valido: false, esReplay: true, pasoAceptado: null };
      }
      return { valido: true, esReplay: false, pasoAceptado: pasoEvaluado };
    }
  }

  return { valido: false, esReplay: false, pasoAceptado: null };
}
