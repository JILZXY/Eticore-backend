import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import { SWAGGER_COOKIE_AUTH } from '../../config/openapi.config.js';
import { ActualizarVersionEditorialDto } from './dto/actualizar-version-editorial.dto.js';
import { CrearRevisionEditorialDto } from './dto/crear-revision-editorial.dto.js';
import { CrearUnidadEditorialDto } from './dto/crear-unidad-editorial.dto.js';
import { CrearVersionEditorialDto } from './dto/crear-version-editorial.dto.js';
import {
  EditorialDraftService,
  type RevisionEditorialResultado,
  type UnidadEditorialResultado,
  type VersionEditorialResultado,
} from './editorial-draft.service.js';
import {
  EditorialPublishService,
  type PublicacionVersionResultado,
} from './editorial-publish.service.js';

@ApiTags('Editorial')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller('editorial')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN_CONTENIDO')
export class EditorialController {
  constructor(
    private readonly editorialDraftService: EditorialDraftService,
    private readonly editorialPublishService: EditorialPublishService,
  ) {}

  @Post('unidades')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear unidad formativa base (solo ADMIN_CONTENIDO)',
  })
  @ApiResponse({ status: 201, description: 'Unidad creada sin versión publicada aún' })
  @ApiResponse({ status: 403, description: 'Requiere rol ADMIN_CONTENIDO y 2FA verificado' })
  crearUnidad(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CrearUnidadEditorialDto,
  ): Promise<UnidadEditorialResultado> {
    return this.editorialDraftService.crearUnidad(usuario.id, dto);
  }

  @Post('versiones')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear nueva versión en borrador sin mover el puntero público',
    description:
      'Crea versión con estado=borrador y calcula su huella SHA-256 inicial sin alterar unidad.version_publicada_id (REQ-F-74).',
  })
  @ApiResponse({ status: 201, description: 'Borrador creado con huella SHA-256' })
  @ApiResponse({ status: 422, description: 'Contenido excede 1 MiB o fuentes inexistentes' })
  crearVersionBorrador(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CrearVersionEditorialDto,
  ): Promise<VersionEditorialResultado> {
    return this.editorialDraftService.crearVersionBorrador(usuario.id, dto);
  }

  @Patch('versiones/:id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: Number, description: 'ID de la versión en borrador' })
  @ApiOperation({
    summary: 'Editar versión en borrador con control de revisión optimista',
    description:
      'Modifica contenido, metadatos o fuentes de una versión no publicada, incrementando revision y recalculando huella_actual.',
  })
  @ApiResponse({ status: 200, description: 'Borrador actualizado' })
  @ApiResponse({
    status: 409,
    description: 'Versión publicada inmutable (RN-18) o revisión optimista desactualizada',
  })
  actualizarVersionBorrador(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarVersionEditorialDto,
  ): Promise<VersionEditorialResultado> {
    return this.editorialDraftService.actualizarVersionBorrador(
      usuario.id,
      id,
      dto,
    );
  }

  @Post('versiones/:id/revisiones')
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'id', type: Number, description: 'ID de la versión editorial' })
  @ApiOperation({
    summary: 'Registrar dictamen de revisión editorial con huella SHA-256',
    description:
      'Calcula la huella SHA-256 sobre contenido + metadatos + referencias exactas. Si el resultado es aprobada, valida íntegramente el contenido JSONB.',
  })
  @ApiResponse({ status: 201, description: 'Revisión registrada con huella_revisada' })
  @ApiResponse({ status: 422, description: 'Contenido inválido al intentar aprobar (RN-15)' })
  registrarRevisionEditorial(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CrearRevisionEditorialDto,
  ): Promise<RevisionEditorialResultado> {
    return this.editorialDraftService.registrarRevisionEditorial(
      usuario.id,
      id,
      dto,
    );
  }

  @Post('versiones/:id/publicar')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: Number, description: 'ID de la versión editorial a publicar' })
  @ApiOperation({
    summary: 'Publicar versión atómicamente verificando huella SHA-256 aprobada',
    description:
      'En una transacción: bloquea la versión, valida contenido JSONB, verifica que exista revisión aprobada vigente cuya huella coincida con la versión actual, marca estado=publicado y mueve unidad.version_publicada_id.',
  })
  @ApiResponse({ status: 200, description: 'Versión publicada y puntero público actualizado' })
  @ApiResponse({
    status: 422,
    description:
      'Sin revisión aprobada (REVISION_APROBADA_REQUERIDA) o versión editada tras aprobar (HUELLA_EDITORIAL_DESACTUALIZADA)',
  })
  publicarVersion(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PublicacionVersionResultado> {
    return this.editorialPublishService.publicarVersion(usuario.id, id);
  }

  @Patch('unidades/:id/desactivar')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad a desactivar' })
  @ApiOperation({
    summary: 'Desactivar unidad formativa conservando versiones e historial',
    description:
      'Marca unidad.activa=false para impedir nuevos intentos, manteniendo intactas versiones, créditos e intentos históricos (REQ-F-58).',
  })
  @ApiResponse({ status: 200, description: 'Unidad desactivada' })
  desactivarUnidad(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UnidadEditorialResultado> {
    return this.editorialPublishService.desactivarUnidad(usuario.id, id);
  }
}
