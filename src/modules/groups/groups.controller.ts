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

@ApiTags('Grupos')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller('grupos')
@UseGuards(SessionAuthGuard, RolesGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @Roles('ADMIN_TECNICO')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear grupo académico (solo ADMIN_TECNICO)',
  })
  @ApiResponse({ status: 201, description: 'Grupo creado' })
  crearGrupo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CrearGrupoDto,
  ): Promise<GrupoItem> {
    return this.groupsService.crearGrupo(usuario.id, dto);
  }

  @Get()
  @Roles('ADMIN_TECNICO', 'ADMIN_CONTENIDO')
  @ApiOperation({
    summary: 'Listar grupos con conteo de integrantes activos (ADMIN_TECNICO y ADMIN_CONTENIDO)',
  })
  @ApiResponse({ status: 200, description: 'Listado paginado de grupos' })
  listarGrupos(
    @Query() query: ListarGruposDto,
  ): Promise<RespuestaListadoGrupos> {
    return this.groupsService.listarGrupos(query);
  }

  @Patch(':id/desactivar')
  @Roles('ADMIN_TECNICO')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: Number, description: 'ID del grupo' })
  @ApiOperation({
    summary: 'Desactivar grupo conservando su historial de membresías y reportes',
  })
  @ApiResponse({ status: 200, description: 'Grupo desactivado' })
  desactivarGrupo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<GrupoItem> {
    return this.groupsService.desactivarGrupo(usuario.id, id);
  }

  @Get(':id/integrantes')
  @Roles('ADMIN_TECNICO')
  @ApiParam({ name: 'id', type: Number, description: 'ID del grupo' })
  @ApiOperation({
    summary: 'Listar integrantes e intervalos temporales de membresía de un grupo',
  })
  @ApiResponse({ status: 200, description: 'Integrantes paginados por cursor' })
  listarIntegrantes(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListarIntegrantesGrupoDto,
  ): Promise<RespuestaListadoIntegrantes> {
    return this.groupsService.listarIntegrantes(id, query);
  }

  @Post(':id/integrantes')
  @Roles('ADMIN_TECNICO')
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'id', type: Number, description: 'ID del grupo' })
  @ApiOperation({
    summary: 'Agregar o reingresar integrante con intervalo semiabierto [ingreso, salida)',
    description:
      'Bloquea la fila grupo con FOR UPDATE antes de comprobar solapamientos y respeta el índice único parcial uq_membresia_grupo_abierta (RN-28).',
  })
  @ApiResponse({ status: 201, description: 'Membresía registrada' })
  @ApiResponse({ status: 409, description: 'Intervalo solapado o doble membresía abierta (MEMBRESIA_SOLAPADA)' })
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
  @ApiParam({ name: 'id', type: Number, description: 'ID del grupo' })
  @ApiParam({ name: 'usuarioId', type: Number, description: 'ID del usuario integrante a retirar' })
  @ApiOperation({
    summary: 'Cerrar la membresía abierta de un integrante en el grupo',
  })
  @ApiResponse({ status: 200, description: 'Intervalo de membresía cerrado' })
  @ApiResponse({ status: 404, description: 'No existe membresía abierta para esa pareja grupo-usuario' })
  retirarIntegrante(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Body() dto: RetirarIntegranteGrupoDto,
  ): Promise<MembresiaGrupoResultado> {
    return this.groupsService.retirarIntegrante(usuario.id, id, usuarioId, dto);
  }
}
