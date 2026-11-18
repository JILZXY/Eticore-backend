import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator.js';
import { DomainError } from '../../common/errors/domain.error.js';
import { verificarArgon2id } from '../../common/utils/hashing.js';
import {
  type AlgoritmoTotp,
  cifrarSecretoTotp,
  codificarBase32,
  construirOtpAuthUri,
  descifrarSecretoTotp,
  verificarCodigoTotp,
} from '../../common/utils/totp.js';
import type { AppConfiguration } from '../../config/configuration.js';
import { AUTH_DATA_SOURCE } from '../../database/auth-database.module.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { Confirmar2faDto } from './dto/confirmar-2fa.dto.js';
import type { Desactivar2faDto } from './dto/desactivar-2fa.dto.js';

export interface RespuestaInicio2fa {
  otpauth_uri: string;
  qr_uri: string;
  clave_base32: string;
  algoritmo: AlgoritmoTotp;
  digitos: 6;
  periodo: 30;
}

export interface FilaSegundoFactorAuth {
  usuario_id: number;
  secreto_cifrado: Buffer;
  algoritmo: AlgoritmoTotp;
  periodo: number;
  digitos: number;
  confirmado_en: Date | null;
  ultimo_paso_totp: string | null;
}

@Injectable()
export class TotpSetupService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(AUTH_DATA_SOURCE)
    private readonly authDataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService<AppConfiguration, true>,
  ) {}

  async iniciar(usuario: UsuarioAutenticado): Promise<RespuestaInicio2fa> {
    const existentes = (await this.authDataSource.query(
      `SELECT * FROM obtener_segundo_factor_para_verificacion($1)`,
      [usuario.id],
    )) as FilaSegundoFactorAuth[];

    if (existentes[0]?.confirmado_en !== null && existentes[0] !== undefined) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'SEGUNDO_FACTOR_YA_ACTIVO',
        'El segundo factor ya está activo para esta cuenta',
      );
    }

    const bytesPlano = randomBytes(20);
    const security = this.configService.get('security', { infer: true });
    const bytesCifrados = cifrarSecretoTotp(
      bytesPlano,
      security.totpEncryptionKeyHex,
    );

    const guardados = (await this.authDataSource.query(
      `SELECT * FROM guardar_segundo_factor_iniciado($1, $2, $3, $4, $5)`,
      [usuario.id, bytesCifrados, 'SHA1', 30, 6],
    )) as Array<{ usuario_id: number }>;

    if (guardados.length === 0) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'SEGUNDO_FACTOR_YA_ACTIVO',
        'El segundo factor ya está activo para esta cuenta',
      );
    }

    const claveBase32 = codificarBase32(bytesPlano);
    const otpauthUri = construirOtpAuthUri({
      emisor: 'Eticore',
      correo: usuario.correoNormalizado,
      claveBase32,
      algoritmo: 'SHA1',
      digitos: 6,
      periodo: 30,
    });

    return {
      otpauth_uri: otpauthUri,
      qr_uri: otpauthUri,
      clave_base32: claveBase32,
      algoritmo: 'SHA1',
      digitos: 6,
      periodo: 30,
    };
  }

  async confirmar(
    usuario: UsuarioAutenticado,
    dto: Confirmar2faDto,
  ): Promise<{ verificado_2fa: true; confirmado_en: Date }> {
    const codigo = (dto.codigo ?? dto.codigo_totp ?? '').trim();
    if (!/^\d{6,8}$/.test(codigo)) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'CODIGO_TOTP_INVALIDO',
        'Debes proporcionar un código TOTP válido de 6 u 8 dígitos',
      );
    }

    const filas = (await this.authDataSource.query(
      `SELECT * FROM obtener_segundo_factor_para_verificacion($1)`,
      [usuario.id],
    )) as FilaSegundoFactorAuth[];

    const fila = filas[0];
    if (!fila) {
      throw new DomainError(
        HttpStatus.NOT_FOUND,
        'SEGUNDO_FACTOR_NO_INICIADO',
        'No existe un alta pendiente de segundo factor',
      );
    }

    if (fila.confirmado_en !== null) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'SEGUNDO_FACTOR_YA_ACTIVO',
        'El segundo factor ya fue confirmado',
      );
    }

    const security = this.configService.get('security', { infer: true });
    const bytesPlano = descifrarSecretoTotp(
      fila.secreto_cifrado,
      security.totpEncryptionKeyHex,
    );

    const resultado = verificarCodigoTotp({
      bytesPlano,
      codigo,
      ultimoPasoTotp: fila.ultimo_paso_totp,
      algoritmo: fila.algoritmo,
      periodo: fila.periodo,
      digitos: fila.digitos,
    });

    if (!resultado.valido || resultado.pasoAceptado === null) {
      await this.auditService.registrarFueraDeTransaccion({
        actorId: usuario.id,
        origenActor: 'usuario',
        accion: 'autenticacion_segundo_factor_fallido',
        recursoTipo: 'segundo_factor',
        recursoId: String(usuario.id),
        resultado: 'rechazado',
        detalleMinimo: 'confirmacion_inicial_invalida',
      });
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'CODIGO_TOTP_INVALIDO',
        'Código TOTP inválido',
      );
    }

    const confirmados = (await this.authDataSource.query(
      `SELECT * FROM confirmar_segundo_factor($1, $2)`,
      [usuario.id, resultado.pasoAceptado.toString()],
    )) as Array<{ usuario_id: number; confirmado_en: Date }>;

    const confirmado = confirmados[0];
    if (!confirmado) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'SEGUNDO_FACTOR_YA_ACTIVO',
        'El segundo factor ya fue confirmado',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      await queryRunner.query(
        `UPDATE sesion
         SET verificado_2fa = TRUE
         WHERE token_hash = $1
           AND usuario_id = $2
           AND revocada_en IS NULL`,
        [usuario.hashSesion, usuario.id],
      );

      await this.auditService.registrar(queryRunner.manager, {
        actorId: usuario.id,
        origenActor: 'usuario',
        accion: 'segundo_factor_activado',
        recursoTipo: 'segundo_factor',
        recursoId: String(usuario.id),
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();

      return {
        verificado_2fa: true,
        confirmado_en: confirmado.confirmado_en,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async desactivar(
    usuario: UsuarioAutenticado,
    dto?: Desactivar2faDto,
  ): Promise<void> {
    if (
      usuario.roles.includes('ADMIN_TECNICO') ||
      usuario.roles.includes('ADMIN_CONTENIDO')
    ) {
      throw new DomainError(
        HttpStatus.FORBIDDEN,
        'SEGUNDO_FACTOR_OBLIGATORIO_ADMIN',
        'Las cuentas administrativas no pueden desactivar el segundo factor',
      );
    }

    if (dto?.contrasena !== undefined) {
      const cuentas = (await this.authDataSource.query(
        `SELECT * FROM obtener_contexto_autenticacion_por_correo($1)`,
        [usuario.correoNormalizado],
      )) as Array<{ verificador_argon2id: string }>;

      const verificador = cuentas[0]?.verificador_argon2id;
      const valida = verificador
        ? await verificarArgon2id(verificador, dto.contrasena)
        : false;
      if (!valida) {
        throw new DomainError(
          HttpStatus.UNAUTHORIZED,
          'CREDENCIALES_INVALIDAS',
          'Credenciales inválidas',
        );
      }
    }

    const eliminados = (await this.authDataSource.query(
      `SELECT * FROM eliminar_segundo_factor($1)`,
      [usuario.id],
    )) as Array<{ usuario_id: number }>;

    if (eliminados.length === 0) {
      throw new DomainError(
        HttpStatus.NOT_FOUND,
        'SEGUNDO_FACTOR_NO_ACTIVO',
        'El segundo factor no está configurado',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      await queryRunner.query(
        `UPDATE sesion
         SET verificado_2fa = FALSE
         WHERE usuario_id = $1 AND revocada_en IS NULL`,
        [usuario.id],
      );

      await this.auditService.registrar(queryRunner.manager, {
        actorId: usuario.id,
        origenActor: 'usuario',
        accion: 'segundo_factor_desactivado',
        recursoTipo: 'segundo_factor',
        recursoId: String(usuario.id),
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
