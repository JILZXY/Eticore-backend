import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/errors/domain.error.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type {
  ConsultarAvisoLegalDto,
  TipoDocumentoLegal,
} from './dto/consultar-aviso-legal.dto.js';
import type { CrearSolicitudPrivacidadDto } from './dto/crear-solicitud-privacidad.dto.js';
import type { PublicarVersionDocumentoDto } from './dto/publicar-version-documento.dto.js';
import type {
  RegistrarEventoLegalDto,
  TipoEventoLegal,
} from './dto/registrar-evento-legal.dto.js';

export interface VersionDocumentoLegalResultado {
  version_documento_id: number;
  documento_id: number;
  tipo: TipoDocumentoLegal;
  numero: number;
  texto: string;
  huella: string;
  publicada_en: Date;
}

export interface EventoLegalResultado {
  id: number;
  usuario_id: number;
  version_documento_id: number;
  finalidad_codigo: string | null;
  tipo_evento: TipoEventoLegal;
  fecha_servidor: Date;
  canal: string;
  clave_operacion: string;
  idempotente: boolean;
}

export interface EventoLegalUsuarioItem {
  id: number;
  version_documento_id: number;
  documento_tipo: TipoDocumentoLegal;
  version_numero: number;
  huella: string;
  finalidad_codigo: string | null;
  tipo_evento: TipoEventoLegal;
  fecha_servidor: Date;
  canal: string;
  clave_operacion: string;
}

export interface RespuestaMisEventosLegales {
  eventos: EventoLegalUsuarioItem[];
  estado_consentimientos: Record<
    string,
    {
      finalidad_codigo: string;
      tipo_evento: TipoEventoLegal;
      fecha_servidor: Date;
      version_documento_id: number;
    }
  >;
}

export interface SolicitudPrivacidadResultado {
  id: number;
  usuario_id: number | null;
  tipo: string;
  recibida_en: Date;
  estado: 'recibida' | 'en_revision' | 'resuelta';
  verificacion_minima: string | null;
  resuelta_en: Date | null;
  resultado: string | null;
}

interface FilaVersionDocumento {
  version_documento_id: string | number;
  documento_id: number;
  tipo: TipoDocumentoLegal;
  numero: number;
  texto: string;
  huella: string;
  publicada_en: Date;
}

interface FilaEventoLegal {
  id: string | number;
  usuario_id: number;
  version_documento_id: string | number;
  finalidad_codigo: string | null;
  tipo_evento: TipoEventoLegal;
  fecha_servidor: Date;
  canal: string;
  clave_operacion: string;
}

interface FilaEventoUsuarioJoin extends FilaEventoLegal {
  documento_tipo: TipoDocumentoLegal;
  version_numero: number;
  huella: string;
}

interface FilaSolicitudPrivacidad {
  id: string | number;
  usuario_id: number | null;
  tipo: string;
  recibida_en: Date;
  estado: 'recibida' | 'en_revision' | 'resuelta';
  verificacion_minima: string | null;
  resuelta_en: Date | null;
  resultado: string | null;
}

const PATRON_ADJUNTO_IDENTIFICACION =
  /(data:[a-z]+\/[a-z0-9.+-]+;base64,|\b(ine|pasaporte|curp|rfc|adjunto_id)\b\s*:)/i;

@Injectable()
export class LegalService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async obtenerAvisoVigente(
    dto?: ConsultarAvisoLegalDto,
  ): Promise<VersionDocumentoLegalResultado> {
    const tipo: TipoDocumentoLegal = dto?.tipo ?? 'aviso_privacidad';

    const filas = (await this.dataSource.query(
      `SELECT
         vd.id AS version_documento_id,
         dl.id AS documento_id,
         dl.tipo,
         vd.numero,
         vd.texto,
         vd.huella,
         vd.publicada_en
       FROM documento_legal dl
       INNER JOIN version_documento vd
         ON vd.documento_id = dl.id
       WHERE dl.tipo = $1
       ORDER BY vd.numero DESC, vd.id DESC
       LIMIT 1`,
      [tipo],
    )) as FilaVersionDocumento[];

    const fila = filas[0];
    if (!fila) {
      throw new DomainError(
        HttpStatus.NOT_FOUND,
        'DOCUMENTO_LEGAL_NO_PUBLICADO',
        `No existe una versión publicada para ${tipo}`,
      );
    }

    return {
      version_documento_id: Number(fila.version_documento_id),
      documento_id: fila.documento_id,
      tipo: fila.tipo,
      numero: fila.numero,
      texto: fila.texto,
      huella: fila.huella.trim(),
      publicada_en: fila.publicada_en,
    };
  }

  async publicarVersionDocumento(
    actorId: number,
    dto: PublicarVersionDocumentoDto,
  ): Promise<VersionDocumentoLegalResultado> {
    const huella = createHash('sha256')
      .update(dto.texto, 'utf8')
      .digest('hex');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const docs = (await queryRunner.query(
        `SELECT id FROM documento_legal WHERE tipo = $1 ORDER BY id ASC LIMIT 1 FOR UPDATE`,
        [dto.tipo],
      )) as Array<{ id: number }>;

      let documentoId = docs[0]?.id;
      if (documentoId === undefined) {
        const creados = (await queryRunner.query(
          `INSERT INTO documento_legal (tipo) VALUES ($1) RETURNING id`,
          [dto.tipo],
        )) as Array<{ id: number }>;
        documentoId = creados[0].id;
      }

      const ordinales = (await queryRunner.query(
        `SELECT COALESCE(MAX(numero), 0)::int + 1 AS siguiente
         FROM version_documento
         WHERE documento_id = $1`,
        [documentoId],
      )) as Array<{ siguiente: number }>;
      const numero = ordinales[0].siguiente;

      const insertadas = (await queryRunner.query(
        `INSERT INTO version_documento (documento_id, numero, texto, huella)
         VALUES ($1, $2, $3, $4)
         RETURNING id AS version_documento_id, documento_id, numero, texto, huella, publicada_en`,
        [documentoId, numero, dto.texto, huella],
      )) as Array<Omit<FilaVersionDocumento, 'tipo'>>;

      const version = insertadas[0];

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'publicar_documento_legal',
        recursoTipo: 'version_documento',
        recursoId: String(version.version_documento_id),
        resultado: 'exitoso',
        detalleMinimo: `tipo=${dto.tipo},numero=${version.numero}`,
      });

      await queryRunner.commitTransaction();

      return {
        version_documento_id: Number(version.version_documento_id),
        documento_id: version.documento_id,
        tipo: dto.tipo,
        numero: version.numero,
        texto: version.texto,
        huella: version.huella.trim(),
        publicada_en: version.publicada_en,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async registrarEventoLegal(
    usuarioId: number,
    dto: RegistrarEventoLegalDto,
  ): Promise<EventoLegalResultado> {
    const canal = dto.canal && dto.canal.length > 0 ? dto.canal : 'web';
    const finalidad =
      dto.finalidad_codigo && dto.finalidad_codigo.length > 0
        ? dto.finalidad_codigo
        : null;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const versiones = (await queryRunner.query(
        `SELECT id FROM version_documento WHERE id = $1 LIMIT 1`,
        [dto.version_documento_id],
      )) as Array<{ id: string | number }>;

      if (versiones.length === 0) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'VERSION_DOCUMENTO_NO_ENCONTRADA',
          'La versión del documento legal indicada no existe',
        );
      }

      const insertadas = (await queryRunner.query(
        `INSERT INTO evento_legal (
           usuario_id,
           version_documento_id,
           finalidad_codigo,
           tipo_evento,
           canal,
           clave_operacion
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (usuario_id, clave_operacion) DO NOTHING
         RETURNING id, usuario_id, version_documento_id, finalidad_codigo, tipo_evento, fecha_servidor, canal, clave_operacion`,
        [
          usuarioId,
          dto.version_documento_id,
          finalidad,
          dto.tipo_evento,
          canal,
          dto.clave_operacion,
        ],
      )) as FilaEventoLegal[];

      let evento = insertadas[0];
      let idempotente = false;

      if (!evento) {
        const existentes = (await queryRunner.query(
          `SELECT id, usuario_id, version_documento_id, finalidad_codigo, tipo_evento, fecha_servidor, canal, clave_operacion
           FROM evento_legal
           WHERE usuario_id = $1 AND clave_operacion = $2
           LIMIT 1`,
          [usuarioId, dto.clave_operacion],
        )) as FilaEventoLegal[];

        evento = existentes[0];
        idempotente = true;
      } else {
        await this.auditService.registrar(queryRunner.manager, {
          actorId: usuarioId,
          origenActor: 'usuario',
          accion: 'registrar_evento_legal',
          recursoTipo: 'evento_legal',
          recursoId: String(evento.id),
          resultado: 'exitoso',
          detalleMinimo: `tipo=${dto.tipo_evento},version=${dto.version_documento_id}`,
        });
      }

      await queryRunner.commitTransaction();

      return {
        id: Number(evento.id),
        usuario_id: evento.usuario_id,
        version_documento_id: Number(evento.version_documento_id),
        finalidad_codigo: evento.finalidad_codigo,
        tipo_evento: evento.tipo_evento,
        fecha_servidor: evento.fecha_servidor,
        canal: evento.canal,
        clave_operacion: evento.clave_operacion,
        idempotente,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async listarMisEventos(usuarioId: number): Promise<RespuestaMisEventosLegales> {
    const filas = (await this.dataSource.query(
      `SELECT
         el.id,
         el.usuario_id,
         el.version_documento_id,
         dl.tipo AS documento_tipo,
         vd.numero AS version_numero,
         vd.huella,
         el.finalidad_codigo,
         el.tipo_evento,
         el.fecha_servidor,
         el.canal,
         el.clave_operacion
       FROM evento_legal el
       INNER JOIN version_documento vd ON vd.id = el.version_documento_id
       INNER JOIN documento_legal dl ON dl.id = vd.documento_id
       WHERE el.usuario_id = $1
       ORDER BY el.fecha_servidor DESC, el.id DESC`,
      [usuarioId],
    )) as FilaEventoUsuarioJoin[];

    const eventos: EventoLegalUsuarioItem[] = filas.map((fila) => ({
      id: Number(fila.id),
      version_documento_id: Number(fila.version_documento_id),
      documento_tipo: fila.documento_tipo,
      version_numero: fila.version_numero,
      huella: fila.huella.trim(),
      finalidad_codigo: fila.finalidad_codigo,
      tipo_evento: fila.tipo_evento,
      fecha_servidor: fila.fecha_servidor,
      canal: fila.canal,
      clave_operacion: fila.clave_operacion,
    }));

    const estadoConsentimientos: RespuestaMisEventosLegales['estado_consentimientos'] =
      {};
    for (const ev of eventos) {
      if (
        ev.finalidad_codigo &&
        (ev.tipo_evento === 'consentimiento_otorgado' ||
          ev.tipo_evento === 'consentimiento_retirado' ||
          ev.tipo_evento === 'consentimiento_rechazado') &&
        !estadoConsentimientos[ev.finalidad_codigo]
      ) {
        estadoConsentimientos[ev.finalidad_codigo] = {
          finalidad_codigo: ev.finalidad_codigo,
          tipo_evento: ev.tipo_evento,
          fecha_servidor: ev.fecha_servidor,
          version_documento_id: ev.version_documento_id,
        };
      }
    }

    return {
      eventos,
      estado_consentimientos: estadoConsentimientos,
    };
  }

  async crearSolicitudPrivacidad(
    usuarioId: number,
    dto: CrearSolicitudPrivacidadDto,
  ): Promise<SolicitudPrivacidadResultado> {
    const verificacionMinima =
      dto.verificacion_minima && dto.verificacion_minima.length > 0
        ? dto.verificacion_minima
        : null;

    if (
      verificacionMinima !== null &&
      PATRON_ADJUNTO_IDENTIFICACION.test(verificacionMinima)
    ) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'ADJUNTO_IDENTIFICACION_PROHIBIDO',
        'No se deben adjuntar identificaciones ni imágenes codificadas en solicitudes de privacidad',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const insertadas = (await queryRunner.query(
        `INSERT INTO solicitud_privacidad (
           usuario_id,
           tipo,
           estado,
           verificacion_minima
         ) VALUES ($1, $2, 'recibida', $3)
         RETURNING id, usuario_id, tipo, recibida_en, estado, verificacion_minima, resuelta_en, resultado`,
        [usuarioId, dto.tipo, verificacionMinima],
      )) as FilaSolicitudPrivacidad[];

      const solicitud = insertadas[0];

      await this.auditService.registrar(queryRunner.manager, {
        actorId: usuarioId,
        origenActor: 'usuario',
        accion: 'crear_solicitud_privacidad',
        recursoTipo: 'solicitud_privacidad',
        recursoId: String(solicitud.id),
        resultado: 'exitoso',
        detalleMinimo: `tipo=${dto.tipo}`,
      });

      await queryRunner.commitTransaction();

      return {
        id: Number(solicitud.id),
        usuario_id: solicitud.usuario_id,
        tipo: solicitud.tipo,
        recibida_en: solicitud.recibida_en,
        estado: solicitud.estado,
        verificacion_minima: solicitud.verificacion_minima,
        resuelta_en: solicitud.resuelta_en,
        resultado: solicitud.resultado,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
