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
import type { Response } from 'express';
import { AllowUnverified2fa } from '../../common/decorators/allow-unverified-2fa.decorator.js';
import {
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import type { AppConfiguration } from '../../config/configuration.js';
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
  async registro(@Body() dto: RegistroDto): Promise<{ usuario: UsuarioPublico }> {
    const usuario = await this.authService.registrar(dto);
    return { usuario };
  }

  @Post('login')
  @Public()
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
  @HttpCode(HttpStatus.OK)
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
  @UseGuards(SessionAuthGuard)
  @AllowUnverified2fa()
  @HttpCode(HttpStatus.CREATED)
  iniciar2fa(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<RespuestaInicio2fa> {
    return this.totpSetupService.iniciar(usuario);
  }

  @Post('2fa/confirmar')
  @UseGuards(SessionAuthGuard)
  @AllowUnverified2fa()
  @HttpCode(HttpStatus.OK)
  confirmar2fa(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: Confirmar2faDto,
  ): Promise<{ verificado_2fa: true; confirmado_en: Date }> {
    return this.totpSetupService.confirmar(usuario, dto);
  }

  @Delete('2fa')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
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
