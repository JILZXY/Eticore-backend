import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import { AgregarIntegranteGrupoDto } from './dto/agregar-integrante-grupo.dto.js';
import { CrearGrupoDto } from './dto/crear-grupo.dto.js';
import { ListarGruposDto } from './dto/listar-grupos.dto.js';
import { ListarIntegrantesGrupoDto } from './dto/listar-integrantes-grupo.dto.js';
import { RetirarIntegranteGrupoDto } from './dto/retirar-integrante-grupo.dto.js';
import {
  GroupsService,
  type GrupoItem,
  type MembresiaGrupoResultado,
  type RespuestaListadoGrupos,
  type RespuestaListadoIntegrantes,
} from './groups.service.js';

@Controller('grupos')
@UseGuards(SessionAuthGuard, RolesGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @Roles('ADMIN_TECNICO')
  @HttpCode(HttpStatus.CREATED)
  crearGrupo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CrearGrupoDto,
  ): Promise<GrupoItem> {
    return this.groupsService.crearGrupo(usuario.id, dto);
  }

  @Get()
  @Roles('ADMIN_TECNICO', 'ADMIN_CONTENIDO')
  listarGrupos(
    @Query() query: ListarGruposDto,
  ): Promise<RespuestaListadoGrupos> {
    return this.groupsService.listarGrupos(query);
  }

  @Patch(':id/desactivar')
  @Roles('ADMIN_TECNICO')
  @HttpCode(HttpStatus.OK)
  desactivarGrupo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<GrupoItem> {
    return this.groupsService.desactivarGrupo(usuario.id, id);
  }

  @Get(':id/integrantes')
  @Roles('ADMIN_TECNICO')
  listarIntegrantes(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListarIntegrantesGrupoDto,
  ): Promise<RespuestaListadoIntegrantes> {
    return this.groupsService.listarIntegrantes(id, query);
  }

  @Post(':id/integrantes')
  @Roles('ADMIN_TECNICO')
  @HttpCode(HttpStatus.CREATED)
  agregarIntegrante(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AgregarIntegranteGrupoDto,
  ): Promise<MembresiaGrupoResultado> {
    return this.groupsService.agregarIntegrante(usuario.id, id, dto);
  }

  @Patch(':id/integrantes/:usuarioId/retirar')
  @Roles('ADMIN_TECNICO')
  @HttpCode(HttpStatus.OK)
  retirarIntegrante(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Body() dto: RetirarIntegranteGrupoDto,
  ): Promise<MembresiaGrupoResultado> {
    return this.groupsService.retirarIntegrante(usuario.id, id, usuarioId, dto);
  }
}
