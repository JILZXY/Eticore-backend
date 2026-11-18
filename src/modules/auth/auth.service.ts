import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator.js';
import type { RolCodigo } from '../../common/decorators/roles.decorator.js';
import { DomainError } from '../../common/errors/domain.error.js';
import {
  derivarArgon2id,
  generarCredencialSesion,
  VERIFICADOR_SIMULADO_ARGON2ID,
  validarPoliticaContrasena,
  verificarArgon2id,
} from '../../common/utils/hashing.js';
import {
  normalizarCorreo,
  validarCorreoNormalizado,
} from '../../common/utils/normalizacion-correo.js';
import type { AppConfiguration } from '../../config/configuration.js';
import { AUTH_DATA_SOURCE } from '../../database/auth-database.module.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegistroDto } from './dto/registro.dto.js';

export interface UsuarioPublico {
  id: number;
  nombre_visualizacion: string;
  correo_normalizado: string;
  activo: boolean;
  ruta_preferida_id: number | null;
  roles: RolCodigo[];
  creado_en: Date;
}

export interface ResultadoLogin {
  valorCookie: string;
  maxAgeMs: number;
  usuario: UsuarioPublico;
}

interface FilaAuthUsuario {
  id: number;
  nombre_visualizacion: string;
  correo_normalizado: string;
  activo: boolean;
  ruta_preferida_id: number | null;
  creado_en: Date;
  verificador_argon2id: string;
}

interface FilaUsuarioCreado {
  id: number;
  nombre_visualizacion: string;
  correo_normalizado: string;
  activo: boolean;
  ruta_preferida_id: number | null;
  creado_en: Date;
}

function esErrorUnicidadPostgres(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const errObj = error as {
    code?: string;
    driverError?: { code?: string };
  };
  return errObj.code === '23505' || errObj.driverError?.code === '23505';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(AUTH_DATA_SOURCE)
    private readonly authDataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService<AppConfiguration, true>,
  ) {}

  async registrar(dto: RegistroDto): Promise<UsuarioPublico> {
    const correoNormalizado = normalizarCorreo(dto.correo);
    validarCorreoNormalizado(correoNormalizado);

    const nombreVisualizacion = dto.nombre_visualizacion.trim();
    if (nombreVisualizacion.length < 2 || nombreVisualizacion.length > 80) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'NOMBRE_INVALIDO',
        'El nombre de visualización debe tener entre 2 y 80 caracteres',
      );
    }

    validarPoliticaContrasena(dto.contrasena, correoNormalizado);
    const verificadorArgon2id = await derivarArgon2id(dto.contrasena);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const roles = (await queryRunner.query(
        `SELECT id FROM rol WHERE codigo = 'APRENDIZ' LIMIT 1`,
      )) as Array<{ id: number }>;

      const rolAprendiz = roles[0];
      if (!rolAprendiz) {
        throw new Error('Rol APRENDIZ no encontrado en catálogo');
      }

      const usuariosCreados = (await queryRunner.query(
        `INSERT INTO usuario (nombre_visualizacion, correo_normalizado, activo)
         VALUES ($1, $2, TRUE)
         RETURNING id, nombre_visualizacion, correo_normalizado, activo, ruta_preferida_id, creado_en`,
        [nombreVisualizacion, correoNormalizado],
      )) as FilaUsuarioCreado[];

      const creado = usuariosCreados[0];

      await queryRunner.query(
        `INSERT INTO credencial (usuario_id, verificador_argon2id)
         VALUES ($1, $2)`,
        [creado.id, verificadorArgon2id],
      );

      await queryRunner.query(
        `INSERT INTO usuario_rol (usuario_id, rol_id)
         VALUES ($1, $2)`,
        [creado.id, rolAprendiz.id],
      );

      await this.auditService.registrar(queryRunner.manager, {
        actorId: creado.id,
        origenActor: 'usuario',
        accion: 'registro_usuario',
        recursoTipo: 'usuario',
        recursoId: String(creado.id),
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();

      return {
        id: creado.id,
        nombre_visualizacion: creado.nombre_visualizacion,
        correo_normalizado: creado.correo_normalizado,
        activo: creado.activo,
        ruta_preferida_id: creado.ruta_preferida_id,
        roles: ['APRENDIZ'],
        creado_en: creado.creado_en,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();

      if (esErrorUnicidadPostgres(error)) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'CORREO_YA_REGISTRADO',
          'El correo electrónico ya está registrado',
        );
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async login(dto: LoginDto): Promise<ResultadoLogin> {
    const correoNormalizado = normalizarCorreo(dto.correo);

    // La lectura de credencial ocurre exclusivamente en la conexion restringida authDataSource.
    const filas = (await this.authDataSource.query(
      `SELECT
         u.id,
         u.nombre_visualizacion,
         u.correo_normalizado,
         u.activo,
         u.ruta_preferida_id,
         u.creado_en,
         c.verificador_argon2id
       FROM usuario u
       INNER JOIN credencial c ON c.usuario_id = u.id
       WHERE u.correo_normalizado = $1
       LIMIT 1`,
      [correoNormalizado],
    )) as FilaAuthUsuario[];

    const cuenta = filas[0];
    if (!cuenta) {
      await verificarArgon2id(VERIFICADOR_SIMULADO_ARGON2ID, dto.contrasena);
      await this.auditService.registrarFueraDeTransaccion({
        actorId: null,
        origenActor: 'sistema',
        accion: 'login_fallido',
        recursoTipo: 'sesion',
        recursoId: 'anonimo',
        resultado: 'rechazado',
        detalleMinimo: 'credenciales_invalidas',
      });
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'CREDENCIALES_INVALIDAS',
        'Credenciales inválidas',
      );
    }

    const valida = await verificarArgon2id(
      cuenta.verificador_argon2id,
      dto.contrasena,
    );

    if (!valida || !cuenta.activo) {
      await this.auditService.registrarFueraDeTransaccion({
        actorId: cuenta.id,
        origenActor: 'usuario',
        accion: 'login_fallido',
        recursoTipo: 'sesion',
        recursoId: String(cuenta.id),
        resultado: 'rechazado',
        detalleMinimo: cuenta.activo
          ? 'credenciales_invalidas'
          : 'cuenta_inactiva',
      });
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'CREDENCIALES_INVALIDAS',
        'Credenciales inválidas',
      );
    }

    const { valorCookie, hashBytes } = generarCredencialSesion();
    const security = this.configService.get('security', { infer: true });
    const maxAgeMs = security.sessionAbsoluteTimeoutHours * 3_600_000;
    const expiraEn = new Date(Date.now() + maxAgeMs);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      await queryRunner.query(
        `INSERT INTO sesion (token_hash, usuario_id, expira_en, verificado_2fa)
         VALUES ($1, $2, $3, FALSE)`,
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

  async logout(usuario: UsuarioAutenticado): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      await queryRunner.query(
        `UPDATE sesion
         SET revocada_en = CURRENT_TIMESTAMP
         WHERE token_hash = $1 AND revocada_en IS NULL`,
        [usuario.hashSesion],
      );

      await this.auditService.registrar(queryRunner.manager, {
        actorId: usuario.id,
        origenActor: 'usuario',
        accion: 'logout',
        recursoTipo: 'sesion',
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
