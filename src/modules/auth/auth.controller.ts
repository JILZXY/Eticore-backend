import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AllowUnverified2fa } from '../../common/decorators/allow-unverified-2fa.decorator.js';
import {
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { AuthRateLimitGuard } from '../../common/guards/auth-rate-limit.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import type { AppConfiguration } from '../../config/configuration.js';
import { SWAGGER_COOKIE_AUTH } from '../../config/openapi.config.js';
import { AuthService, type UsuarioPublico } from './auth.service.js';
import { Confirmar2faDto } from './dto/confirmar-2fa.dto.js';
import { Desactivar2faDto } from './dto/desactivar-2fa.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegistroDto } from './dto/registro.dto.js';
import { Verificar2faDto } from './dto/verificar-2fa.dto.js';
import {
  type RespuestaDesafio2fa,
  TotpChallengeService,
} from './totp-challenge.service.js';
import {
  type RespuestaInicio2fa,
  TotpSetupService,
} from './totp-setup.service.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly totpSetupService: TotpSetupService,
    private readonly totpChallengeService: TotpChallengeService,
    private readonly configService: ConfigService<AppConfiguration, true>,
  ) {}

  @Post('registro')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar nueva cuenta con rol APRENDIZ y credencial Argon2id',
    description:
      'Normaliza el correo (minúsculas, sin espacios), valida política de contraseña (15–128 caracteres, rechaza comunes) y crea usuario + credencial + rol APRENDIZ en una sola transacción.',
  })
  @ApiResponse({ status: 201, description: 'Cuenta creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o contraseña débil' })
  @ApiResponse({ status: 409, description: 'Correo ya registrado (CORREO_YA_REGISTRADO)' })
  async registro(@Body() dto: RegistroDto): Promise<{ usuario: UsuarioPublico }> {
    const usuario = await this.authService.registrar(dto);
    return { usuario };
  }

  @Post('login')
  @Public()
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({
    summary: 'Iniciar sesión con correo y contraseña',
    description:
      'Si la cuenta no tiene 2FA confirmado, crea sesión opaca (200 OK) y emite cookie HttpOnly. Si tiene 2FA confirmado, crea desafío de 5 minutos y responde 202 Accepted sin crear sesión.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión creada y cookie HttpOnly emitida',
  })
  @ApiResponse({
    status: 202,
    description: 'Se requiere segundo factor TOTP (devuelve desafio_id)',
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas (401 genérico CREDENCIALES_INVALIDAS)',
  })
  @ApiResponse({
    status: 429,
    description: 'Límite de intentos excedido (LIMITE_PETICIONES_AUTH)',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ usuario: UsuarioPublico } | RespuestaDesafio2fa> {
    const resultado = await this.authService.login(dto);

    if (resultado.requiere_2fa) {
      res.status(HttpStatus.ACCEPTED);
      return resultado;
    }

    const security = this.configService.get('security', { infer: true });
    res.cookie(security.sessionCookieName, resultado.valorCookie, {
      httpOnly: true,
      secure: security.sessionCookieSecure,
      sameSite: 'lax',
      path: '/api',
      maxAge: resultado.maxAgeMs,
    });
    res.status(HttpStatus.OK);
    return { usuario: resultado.usuario };
  }

  @Post('2fa/verificar')
  @Public()
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Consumir desafío de 2FA con código TOTP y crear sesión verificada',
    description:
      'Verifica el desafío de 5 minutos y el código TOTP con protección anti-replay (ultimo_paso_totp). Al superar 5 fallos invalida el desafío y audita cuenta_bloqueada_2fa.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión creada con verificado_2fa=true y cookie HttpOnly emitida',
  })
  @ApiResponse({
    status: 401,
    description:
      'Código inválido, reutilizado (CODIGO_TOTP_REUTILIZADO) o desafío expirado (DESAFIO_EXPIRADO)',
  })
  @ApiResponse({
    status: 429,
    description: 'Cuenta bloqueada por fallos de 2FA (CUENTA_BLOQUEADA_2FA) o rate limit',
  })
  async verificar2fa(
    @Body() dto: Verificar2faDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ usuario: UsuarioPublico }> {
    const resultado = await this.totpChallengeService.verificarDesafio(dto);
    const security = this.configService.get('security', { infer: true });

    res.cookie(security.sessionCookieName, resultado.valorCookie, {
      httpOnly: true,
      secure: security.sessionCookieSecure,
      sameSite: 'lax',
      path: '/api',
      maxAge: resultado.maxAgeMs,
    });

    return { usuario: resultado.usuario };
  }

  @Post('2fa/iniciar')
  @UseGuards(SessionAuthGuard, AuthRateLimitGuard)
  @AllowUnverified2fa()
  @HttpCode(HttpStatus.CREATED)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Iniciar enrolamiento de segundo factor TOTP',
    description:
      'Genera secreto TOTP cifrado con AES-256-GCM (confirmado_en = NULL) y devuelve otpauth_uri y clave_base32 una sola vez.',
  })
  @ApiResponse({
    status: 201,
    description: 'Secreto TOTP generado y URI otpauth devuelta una sola vez',
  })
  @ApiResponse({ status: 409, description: 'El segundo factor ya está confirmado' })
  iniciar2fa(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<RespuestaInicio2fa> {
    return this.totpSetupService.iniciar(usuario);
  }

  @Post('2fa/confirmar')
  @UseGuards(SessionAuthGuard, AuthRateLimitGuard)
  @AllowUnverified2fa()
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Confirmar activación de 2FA con el primer código TOTP',
    description:
      'Verifica el primer código TOTP, fija confirmado_en, marca verificado_2fa=true en la sesión actual y audita segundo_factor_activado.',
  })
  @ApiResponse({ status: 200, description: 'Segundo factor activado y sesión elevada' })
  @ApiResponse({ status: 401, description: 'Código TOTP inválido' })
  confirmar2fa(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: Confirmar2faDto,
  ): Promise<{ verificado_2fa: true; confirmado_en: Date }> {
    return this.totpSetupService.confirmar(usuario, dto);
  }

  @Delete('2fa')
  @UseGuards(SessionAuthGuard, AuthRateLimitGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Desactivar segundo factor TOTP (solo aprendices)',
    description:
      'Verifica la contraseña actual, borra físicamente la fila de segundo_factor y audita segundo_factor_desactivado. Prohibido para administradores (C-01).',
  })
  @ApiResponse({ status: 204, description: 'Segundo factor eliminado físicamente' })
  @ApiResponse({
    status: 403,
    description: 'Prohibido desactivar 2FA en cuentas administrativas (SEGUNDO_FACTOR_OBLIGATORIO_ADMIN)',
  })
  async desactivar2fa(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto?: Desactivar2faDto,
  ): Promise<void> {
    await this.totpSetupService.desactivar(usuario, dto);
  }

  @Post('logout')
  @UseGuards(SessionAuthGuard)
  @AllowUnverified2fa()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Cerrar sesión actual con revocación inmediata',
    description: 'Marca revocada_en en la sesión actual y limpia la cookie de sesión.',
  })
  @ApiResponse({ status: 204, description: 'Sesión revocada exitosamente' })
  async logout(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(usuario);
    const security = this.configService.get('security', { infer: true });

    res.clearCookie(security.sessionCookieName, {
      httpOnly: true,
      secure: security.sessionCookieSecure,
      sameSite: 'lax',
      path: '/api',
    });
  }
}
