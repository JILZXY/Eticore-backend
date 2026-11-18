import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { RolCodigo } from '../../common/decorators/roles.decorator.js';
import { DomainError } from '../../common/errors/domain.error.js';
import {
  calcularHashSesion,
  generarCredencialSesion,
} from '../../common/utils/hashing.js';
import {
  descifrarSecretoTotp,
  verificarCodigoTotp,
} from '../../common/utils/totp.js';
import { extraerFilasMutacion } from '../../common/utils/typeorm-result.js';
import type { AppConfiguration } from '../../config/configuration.js';
import { AUTH_DATA_SOURCE } from '../../database/auth-database.module.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { UsuarioPublico } from './auth.service.js';
import type { Verificar2faDto } from './dto/verificar-2fa.dto.js';
import type { FilaSegundoFactorAuth } from './totp-setup.service.js';

export const MAX_INTENTOS_DESAFIO_2FA = 5;

export interface RespuestaDesafio2fa {
  requiere_2fa: true;
  desafio_id: string;
  expira_en: Date;
}

export interface ResultadoSesionCreada {
  valorCookie: string;
  maxAgeMs: number;
  usuario: UsuarioPublico;
}

interface FilaDesafio {
  id: string;
  usuario_id: number;
  creado_en: Date;
  expira_en: Date;
  intentos: number;
}

interface FilaUsuarioBasico {
  id: number;
  nombre_visualizacion: string;
  correo_normalizado: string;
  activo: boolean;
  ruta_preferida_id: number | null;
  creado_en: Date;
}

@Injectable()
export class TotpChallengeService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(AUTH_DATA_SOURCE)
    private readonly authDataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService<AppConfiguration, true>,
  ) {}

  async crearDesafio(usuarioId: number): Promise<RespuestaDesafio2fa> {
    const { valorCookie: valorDesafio, hashBytes: hashDesafio } =
      generarCredencialSesion();

    const filas = (await this.dataSource.query(
      `INSERT INTO desafio_autenticacion (usuario_id, token_hash, expira_en, intentos)
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '5 minutes', 0)
       RETURNING id, expira_en`,
      [usuarioId, hashDesafio],
    )) as Array<{ id: string; expira_en: Date }>;

    return {
      requiere_2fa: true,
      desafio_id: valorDesafio,
      expira_en: filas[0].expira_en,
    };
  }

  async verificarDesafio(
    dto: Verificar2faDto,
  ): Promise<ResultadoSesionCreada> {
    const codigo = (dto.codigo_totp ?? dto.codigo ?? '').trim();
    if (!/^\d{6,8}$/.test(codigo)) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'CODIGO_TOTP_INVALIDO',
        'Debes proporcionar un código TOTP válido de 6 u 8 dígitos',
      );
    }

    const hashDesafio = calcularHashSesion(dto.desafio_id);
    const desafios = (await this.dataSource.query(
      `SELECT id, usuario_id, creado_en, expira_en, intentos
       FROM desafio_autenticacion
       WHERE token_hash = $1
       LIMIT 1`,
      [hashDesafio],
    )) as FilaDesafio[];

    const desafio = desafios[0];
    if (!desafio) {
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'DESAFIO_INVALIDO',
        'Desafío de autenticación inválido',
      );
    }

    if (Date.now() >= new Date(desafio.expira_en).getTime()) {
      await this.dataSource.query(
        `DELETE FROM desafio_autenticacion WHERE id = $1`,
        [desafio.id],
      );
      await this.auditService.registrarFueraDeTransaccion({
        actorId: desafio.usuario_id,
        origenActor: 'usuario',
        accion: 'autenticacion_segundo_factor_fallido',
        recursoTipo: 'desafio_autenticacion',
        recursoId: String(desafio.id),
        resultado: 'rechazado',
        detalleMinimo: 'desafio_expirado',
      });
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'DESAFIO_EXPIRADO',
        'El desafío de verificación ha expirado',
      );
    }

    if (desafio.intentos >= MAX_INTENTOS_DESAFIO_2FA) {
      await this.dataSource.query(
        `DELETE FROM desafio_autenticacion WHERE id = $1`,
        [desafio.id],
      );
      throw new DomainError(
        HttpStatus.TOO_MANY_REQUESTS,
        'CUENTA_BLOQUEADA_2FA',
        'Demasiados intentos fallidos de segundo factor',
      );
    }

    const filasSf = (await this.authDataSource.query(
      `SELECT * FROM obtener_segundo_factor_para_verificacion($1)`,
      [desafio.usuario_id],
    )) as FilaSegundoFactorAuth[];

    const segundoFactor = filasSf[0];
    if (!segundoFactor || segundoFactor.confirmado_en === null) {
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'DESAFIO_INVALIDO',
        'Segundo factor no disponible',
      );
    }

    const security = this.configService.get('security', { infer: true });
    const bytesPlano = descifrarSecretoTotp(
      segundoFactor.secreto_cifrado,
      security.totpEncryptionKeyHex,
    );

    const evaluacion = verificarCodigoTotp({
      bytesPlano,
      codigo,
      ultimoPasoTotp: segundoFactor.ultimo_paso_totp,
      algoritmo: segundoFactor.algoritmo,
      periodo: segundoFactor.periodo,
      digitos: segundoFactor.digitos,
    });

    if (evaluacion.esReplay) {
      await this.registrarFalloDesafio(
        desafio.id,
        desafio.usuario_id,
        'replay_totp',
      );
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'CODIGO_TOTP_REUTILIZADO',
        'El código TOTP ya fue utilizado',
      );
    }

    if (!evaluacion.valido || evaluacion.pasoAceptado === null) {
      const bloqueado = await this.registrarFalloDesafio(
        desafio.id,
        desafio.usuario_id,
        'codigo_totp_invalido',
      );
      if (bloqueado) {
        throw new DomainError(
          HttpStatus.TOO_MANY_REQUESTS,
          'CUENTA_BLOQUEADA_2FA',
          'Demasiados intentos fallidos de segundo factor',
        );
      }
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'CODIGO_TOTP_INVALIDO',
        'Código TOTP inválido',
      );
    }

    // Actualización atómica anti-replay en BD mediante función SECURITY DEFINER
    const pasoActualizado = (await this.authDataSource.query(
      `SELECT * FROM actualizar_paso_segundo_factor($1, $2)`,
      [desafio.usuario_id, evaluacion.pasoAceptado.toString()],
    )) as Array<{ usuario_id: number }>;

    if (pasoActualizado.length === 0) {
      await this.registrarFalloDesafio(
        desafio.id,
        desafio.usuario_id,
        'replay_totp_concurrente',
      );
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'CODIGO_TOTP_REUTILIZADO',
        'El código TOTP ya fue utilizado',
      );
    }

    const { valorCookie, hashBytes } = generarCredencialSesion();
    const maxAgeMs = security.sessionAbsoluteTimeoutHours * 3_600_000;
    const expiraEn = new Date(Date.now() + maxAgeMs);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const borrados = (await queryRunner.query(
        `DELETE FROM desafio_autenticacion WHERE id = $1 RETURNING id`,
        [desafio.id],
      )) as unknown;
      if (extraerFilasMutacion<{ id: string }>(borrados).length === 0) {
        throw new DomainError(
          HttpStatus.UNAUTHORIZED,
          'DESAFIO_INVALIDO',
          'El desafío ya fue consumido',
        );
      }

      const usuarios = (await queryRunner.query(
        `SELECT id, nombre_visualizacion, correo_normalizado, activo, ruta_preferida_id, creado_en
         FROM usuario
         WHERE id = $1 AND activo = TRUE
         LIMIT 1`,
        [desafio.usuario_id],
      )) as FilaUsuarioBasico[];

      const cuenta = usuarios[0];
      if (!cuenta) {
        throw new DomainError(
          HttpStatus.UNAUTHORIZED,
          'CREDENCIALES_INVALIDAS',
          'Cuenta no disponible',
        );
      }

      await queryRunner.query(
        `INSERT INTO sesion (token_hash, usuario_id, expira_en, verificado_2fa)
         VALUES ($1, $2, $3, TRUE)`,
        [hashBytes, cuenta.id, expiraEn],
      );

      const filasRoles = (await queryRunner.query(
        `SELECT r.codigo
         FROM usuario_rol ur
         INNER JOIN rol r ON r.id = ur.rol_id
         WHERE ur.usuario_id = $1
         ORDER BY r.id`,
        [cuenta.id],
      )) as Array<{ codigo: RolCodigo }>;

      await this.auditService.registrar(queryRunner.manager, {
        actorId: cuenta.id,
        origenActor: 'usuario',
        accion: 'login_exitoso',
        recursoTipo: 'sesion',
        recursoId: String(cuenta.id),
        resultado: 'exitoso',
        detalleMinimo: '2fa_verificado',
      });

      await queryRunner.commitTransaction();

      return {
        valorCookie,
        maxAgeMs,
        usuario: {
          id: cuenta.id,
          nombre_visualizacion: cuenta.nombre_visualizacion,
          correo_normalizado: cuenta.correo_normalizado,
          activo: cuenta.activo,
          ruta_preferida_id: cuenta.ruta_preferida_id,
          roles: filasRoles.map((r) => r.codigo),
          creado_en: cuenta.creado_en,
        },
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async registrarFalloDesafio(
    desafioId: string,
    usuarioId: number,
    detalleMinimo: string,
  ): Promise<boolean> {
    const res = (await this.dataSource.query(
      `UPDATE desafio_autenticacion
       SET intentos = intentos + 1
       WHERE id = $1
       RETURNING intentos`,
      [desafioId],
    )) as unknown;

    const filas = extraerFilasMutacion<{ intentos: number }>(res);
    const intentosActuales = filas[0]?.intentos ?? MAX_INTENTOS_DESAFIO_2FA;

    await this.auditService.registrarFueraDeTransaccion({
      actorId: usuarioId,
      origenActor: 'usuario',
      accion: 'autenticacion_segundo_factor_fallido',
      recursoTipo: 'desafio_autenticacion',
      recursoId: String(desafioId),
      resultado: 'rechazado',
      detalleMinimo,
    });

    if (intentosActuales >= MAX_INTENTOS_DESAFIO_2FA) {
      await this.dataSource.query(
        `DELETE FROM desafio_autenticacion WHERE id = $1`,
        [desafioId],
      );
      await this.auditService.registrarFueraDeTransaccion({
        actorId: usuarioId,
        origenActor: 'usuario',
        accion: 'cuenta_bloqueada_2fa',
        recursoTipo: 'usuario',
        recursoId: String(usuarioId),
        resultado: 'rechazado',
        detalleMinimo: 'intentos_totp_agotados',
      });
      return true;
    }

    return false;
  }
}
