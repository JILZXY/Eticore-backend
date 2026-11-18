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
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
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
  crearUnidad(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CrearUnidadEditorialDto,
  ): Promise<UnidadEditorialResultado> {
    return this.editorialDraftService.crearUnidad(usuario.id, dto);
  }

  @Post('versiones')
  @HttpCode(HttpStatus.CREATED)
  crearVersionBorrador(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CrearVersionEditorialDto,
  ): Promise<VersionEditorialResultado> {
    return this.editorialDraftService.crearVersionBorrador(usuario.id, dto);
  }

  @Patch('versiones/:id')
  @HttpCode(HttpStatus.OK)
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
  publicarVersion(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PublicacionVersionResultado> {
    return this.editorialPublishService.publicarVersion(usuario.id, id);
  }

  @Patch('unidades/:id/desactivar')
  @HttpCode(HttpStatus.OK)
  desactivarUnidad(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UnidadEditorialResultado> {
    return this.editorialPublishService.desactivarUnidad(usuario.id, id);
  }
}
