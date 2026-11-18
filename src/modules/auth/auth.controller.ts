import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import type { AppConfiguration } from '../../config/configuration.js';
import { AuthService, type UsuarioPublico } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegistroDto } from './dto/registro.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
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
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ usuario: UsuarioPublico }> {
    const resultado = await this.authService.login(dto);
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

  @Post('logout')
  @UseGuards(SessionAuthGuard)
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
