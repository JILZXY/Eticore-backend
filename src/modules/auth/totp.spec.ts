import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  calcularPasoTotp,
  cifrarSecretoTotp,
  codificarBase32,
  construirOtpAuthUri,
  descifrarSecretoTotp,
  generarCodigoTotpEnPaso,
  verificarCodigoTotp,
} from '../../common/utils/totp.js';

describe('Utilidades TOTP y AES-256-GCM (unit)', () => {
  it('cifra y descifra el secreto TOTP con AES-256-GCM', () => {
    const claveHex = randomBytes(32).toString('hex');
    const bytesPlano = randomBytes(20);

    const cifrado = cifrarSecretoTotp(bytesPlano, claveHex);
    expect(cifrado.equals(bytesPlano)).toBe(false);

    const descifrado = descifrarSecretoTotp(cifrado, claveHex);
    expect(descifrado.equals(bytesPlano)).toBe(true);
  });

  it('construye otpauth URI y valida codigos TOTP con deteccion anti-replay', () => {
    const bytesPlano = Buffer.from('12345678901234567890', 'ascii');
    const base32 = codificarBase32(bytesPlano);
    expect(base32).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');

    const uri = construirOtpAuthUri({
      emisor: 'Eticore',
      correo: 'admin@eticore.edu.mx',
      claveBase32: base32,
    });
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(`secret=${base32}`);

    const ahoraMs = 1_760_000_000_000;
    const paso = calcularPasoTotp(ahoraMs, 30);
    const codigoValido = generarCodigoTotpEnPaso(bytesPlano, paso);

    const ok = verificarCodigoTotp({
      bytesPlano,
      codigo: codigoValido,
      ahoraMs,
      ultimoPasoTotp: null,
    });
    expect(ok.valido).toBe(true);
    expect(ok.esReplay).toBe(false);
    expect(ok.pasoAceptado).toBe(paso);

    // Mismo paso ya consumido -> rechazado como replay
    const replay = verificarCodigoTotp({
      bytesPlano,
      codigo: codigoValido,
      ahoraMs,
      ultimoPasoTotp: paso,
    });
    expect(replay.valido).toBe(false);
    expect(replay.esReplay).toBe(true);
    expect(replay.pasoAceptado).toBeNull();
  });
});
