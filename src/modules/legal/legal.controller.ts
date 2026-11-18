import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import { SWAGGER_COOKIE_AUTH } from '../../config/openapi.config.js';
import { ConsultarAvisoLegalDto } from './dto/consultar-aviso-legal.dto.js';
import { CrearSolicitudPrivacidadDto } from './dto/crear-solicitud-privacidad.dto.js';
import { PublicarVersionDocumentoDto } from './dto/publicar-version-documento.dto.js';
import { RegistrarEventoLegalDto } from './dto/registrar-evento-legal.dto.js';
import {
  type EventoLegalResultado,
  LegalService,
  type RespuestaMisEventosLegales,
  type SolicitudPrivacidadResultado,
  type VersionDocumentoLegalResultado,
} from './legal.service.js';

@ApiTags('Legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Get('aviso')
  @Public()
  @ApiOperation({
    summary: 'Consultar la versión vigente de un documento legal sin iniciar sesión',
    description:
      'Por defecto devuelve el aviso_privacidad más reciente con su texto íntegro y huella SHA-256 (REQ-F-12, REQ-F-73).',
  })
  @ApiResponse({ status: 200, description: 'Versión vigente del documento legal' })
  obtenerAvisoVigente(
    @Query() query: ConsultarAvisoLegalDto,
  ): Promise<VersionDocumentoLegalResultado> {
    return this.legalService.obtenerAvisoVigente(query);
  }

  @Post('documentos/versiones')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN_TECNICO')
  @HttpCode(HttpStatus.CREATED)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Publicar nueva versión inmutable de documento legal con huella SHA-256 (solo ADMIN_TECNICO)',
  })
  @ApiResponse({ status: 201, description: 'Versión legal publicada y auditada' })
  publicarVersionDocumento(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: PublicarVersionDocumentoDto,
  ): Promise<VersionDocumentoLegalResultado> {
    return this.legalService.publicarVersionDocumento(usuario.id, dto);
  }

  @Post('eventos')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Registrar evento legal idempotente por clave_operacion y versión exacta',
    description:
      'Registra presentación de aviso, aceptación de términos o otorgamiento/retiro de consentimiento sin sobrescribir eventos previos.',
  })
  @ApiResponse({ status: 201, description: 'Evento legal registrado o recuperado idempotentemente' })
  registrarEventoLegal(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: RegistrarEventoLegalDto,
  ): Promise<EventoLegalResultado> {
    return this.legalService.registrarEventoLegal(usuario.id, dto);
  }

  @Get('mis-eventos')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Listar historial de eventos legales propios y estado efectivo de consentimientos',
  })
  @ApiResponse({ status: 200, description: 'Eventos legales y estado efectivo por finalidad' })
  listarMisEventos(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<RespuestaMisEventosLegales> {
    return this.legalService.listarMisEventos(usuario.id);
  }

  @Post('solicitudes')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Registrar solicitud de privacidad con expediente mínimo sin adjuntar identificaciones (RN-12)',
  })
  @ApiResponse({ status: 201, description: 'Solicitud registrada en estado recibida' })
  @ApiResponse({ status: 400, description: 'Rechazo por intento de adjuntar identificaciones (ADJUNTO_IDENTIFICACION_PROHIBIDO)' })
  crearSolicitudPrivacidad(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CrearSolicitudPrivacidadDto,
  ): Promise<SolicitudPrivacidadResultado> {
    return this.legalService.crearSolicitudPrivacidad(usuario.id, dto);
  }
}
