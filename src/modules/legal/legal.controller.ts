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
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
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

@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Get('aviso')
  @Public()
  obtenerAvisoVigente(
    @Query() query: ConsultarAvisoLegalDto,
  ): Promise<VersionDocumentoLegalResultado> {
    return this.legalService.obtenerAvisoVigente(query);
  }

  @Post('documentos/versiones')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN_TECNICO')
  @HttpCode(HttpStatus.CREATED)
  publicarVersionDocumento(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: PublicarVersionDocumentoDto,
  ): Promise<VersionDocumentoLegalResultado> {
    return this.legalService.publicarVersionDocumento(usuario.id, dto);
  }

  @Post('eventos')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  registrarEventoLegal(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: RegistrarEventoLegalDto,
  ): Promise<EventoLegalResultado> {
    return this.legalService.registrarEventoLegal(usuario.id, dto);
  }

  @Get('mis-eventos')
  @UseGuards(SessionAuthGuard)
  listarMisEventos(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<RespuestaMisEventosLegales> {
    return this.legalService.listarMisEventos(usuario.id);
  }

  @Post('solicitudes')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  crearSolicitudPrivacidad(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CrearSolicitudPrivacidadDto,
  ): Promise<SolicitudPrivacidadResultado> {
    return this.legalService.crearSolicitudPrivacidad(usuario.id, dto);
  }
}
