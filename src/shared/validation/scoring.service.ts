import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain.error.js';
import type { TipoUnidad } from './content-validator.service.js';

export const PUNTOS_APRENDE = 10;
export const PUNTOS_EVALUATIVO = 20;
export const UMBRAL_RANGO_INTERMEDIO = 100;
export const UMBRAL_RANGO_AVANZADO = 300;
export const MAX_RECORRIDO_BYTES = 1_048_576; // 1 MiB

export interface PasoIntentoInput {
  seccion_id?: string;
  secciones_visitadas?: string[];
  confirmado?: boolean;
  asociaciones?: Record<string, string>;
  etapa_id?: string;
  alternativa_id?: string;
  decisiones?: Array<{ etapa_id: string; alternativa_id: string }>;
  recorrido?: Record<string, unknown>;
}

export interface EvaluacionFinalizacion {
  recorridoFinal: Record<string, unknown>;
  puntuacion: number | null;
  puntosUnidad: typeof PUNTOS_APRENDE | typeof PUNTOS_EVALUATIVO;
}

interface SeccionAprende {
  id: string;
  orden: number;
  titulo: string;
}

interface OpcionNormaMatch {
  id: string;
  texto: string;
}

interface SituacionNormaMatch {
  id: string;
  enunciado?: string;
  texto?: string;
  opciones?: OpcionNormaMatch[];
  respuesta_correcta?: string;
  opcion_correcta_id?: string;
  explicacion: string;
}

interface AlternativaCasoTech {
  id: string;
  texto: string;
  ponderacion: 0 | 1 | 2;
  siguiente_etapa_id: string;
  explicacion?: string;
}

interface EtapaCasoTech {
  id: string;
  titulo?: string;
  enunciado?: string;
  terminal?: boolean;
  alternativas?: AlternativaCasoTech[];
}

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

@Injectable()
export class ScoringService {
  crearRecorridoInicial(
    tipo: TipoUnidad,
    contenido: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (tipo) {
      case 'aprende':
        return {
          secciones_visitadas: [],
          confirmado: false,
        };
      case 'normamatch':
        return {
          asociaciones: {},
        };
      case 'casotech': {
        const etapas = (contenido.etapas as EtapaCasoTech[] | undefined) ?? [];
        const etapaInicialId =
          typeof contenido.etapa_inicial_id === 'string'
            ? contenido.etapa_inicial_id
            : (etapas[0]?.id ?? null);
        return {
          decisiones: [],
          etapa_actual_id: etapaInicialId,
        };
      }
    }
  }

  aplicarPaso(params: {
    tipo: TipoUnidad;
    contenido: Record<string, unknown>;
    recorridoActual: Record<string, unknown>;
    paso: PasoIntentoInput;
  }): Record<string, unknown> {
    const { tipo, contenido, recorridoActual, paso } = params;

    let nuevoRecorrido: Record<string, unknown>;
    switch (tipo) {
      case 'aprende':
        nuevoRecorrido = this.aplicarPasoAprende(
          contenido,
          recorridoActual,
          paso,
        );
        break;
      case 'normamatch':
        nuevoRecorrido = this.aplicarPasoNormaMatch(
          contenido,
          recorridoActual,
          paso,
        );
        break;
      case 'casotech':
        nuevoRecorrido = this.aplicarPasoCasoTech(
          contenido,
          recorridoActual,
          paso,
        );
        break;
    }

    this.validarLimiteRecorrido(nuevoRecorrido);
    return nuevoRecorrido;
  }

  evaluarFinalizacion(params: {
    tipo: TipoUnidad;
    contenido: Record<string, unknown>;
    recorridoActual: Record<string, unknown>;
    payloadFinal?: PasoIntentoInput;
  }): EvaluacionFinalizacion {
    const { tipo, contenido, recorridoActual, payloadFinal } = params;

    const hayCambiosFinales =
      payloadFinal !== undefined &&
      (payloadFinal.confirmado !== undefined ||
        payloadFinal.seccion_id !== undefined ||
        payloadFinal.secciones_visitadas !== undefined ||
        payloadFinal.asociaciones !== undefined ||
        payloadFinal.alternativa_id !== undefined ||
        payloadFinal.decisiones !== undefined ||
        payloadFinal.recorrido !== undefined);

    const recorrido = hayCambiosFinales
      ? this.aplicarPaso({
          tipo,
          contenido,
          recorridoActual,
          paso: payloadFinal,
        })
      : { ...recorridoActual };

    this.validarLimiteRecorrido(recorrido);

    switch (tipo) {
      case 'aprende':
        return this.evaluarAprende(contenido, recorrido);
      case 'normamatch':
        return this.evaluarNormaMatch(contenido, recorrido);
      case 'casotech':
        return this.evaluarCasoTech(contenido, recorrido);
    }
  }

  construirRetroalimentacionHistorica(
    tipo: TipoUnidad,
    contenido: Record<string, unknown>,
    recorrido: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (tipo) {
      case 'aprende': {
        const secciones =
          (contenido.secciones as SeccionAprende[] | undefined) ?? [];
        const visitadas = Array.isArray(recorrido.secciones_visitadas)
          ? (recorrido.secciones_visitadas as string[])
          : [];
        return {
          tipo: 'aprende',
          total_secciones: secciones.length,
          secciones_visitadas: visitadas,
          confirmado: recorrido.confirmado === true,
          ejemplo: contenido.ejemplo,
          buenas_practicas: contenido.buenas_practicas ?? [],
        };
      }
      case 'normamatch': {
        const situaciones =
          (contenido.situaciones as SituacionNormaMatch[] | undefined) ?? [];
        const claveAsociacion = esObjetoPlano(contenido.clave_asociacion)
          ? (contenido.clave_asociacion as Record<string, string>)
          : {};
        const asociaciones = esObjetoPlano(recorrido.asociaciones)
          ? (recorrido.asociaciones as Record<string, string>)
          : {};

        const detalle = situaciones.map((sit) => {
          const correctaId =
            sit.respuesta_correcta ??
            sit.opcion_correcta_id ??
            claveAsociacion[sit.id];
          const elegidaId = asociaciones[sit.id] ?? null;
          return {
            situacion_id: sit.id,
            enunciado: sit.enunciado ?? sit.texto ?? '',
            respuesta_usuario: elegidaId,
            respuesta_correcta: correctaId,
            correcta: elegidaId === correctaId,
            explicacion: sit.explicacion,
          };
        });

        const aciertos = detalle.filter((d) => d.correcta).length;
        return {
          tipo: 'normamatch',
          total_situaciones: situaciones.length,
          aciertos,
          situaciones: detalle,
        };
      }
      case 'casotech': {
        const etapas = (contenido.etapas as EtapaCasoTech[] | undefined) ?? [];
        const etapasPorId = new Map(etapas.map((e) => [e.id, e]));
        const decisiones = Array.isArray(recorrido.decisiones)
          ? (recorrido.decisiones as Array<{
              etapa_id: string;
              alternativa_id: string;
            }>)
          : [];

        const detalleDecisiones = decisiones.map((dec) => {
          const etapa = etapasPorId.get(dec.etapa_id);
          const alt = etapa?.alternativas?.find(
            (a) => a.id === dec.alternativa_id,
          );
          return {
            etapa_id: dec.etapa_id,
            etapa_titulo: etapa?.titulo ?? etapa?.enunciado ?? '',
            alternativa_id: dec.alternativa_id,
            alternativa_texto: alt?.texto ?? '',
            ponderacion: alt?.ponderacion ?? 0,
            explicacion: alt?.explicacion ?? null,
          };
        });

        const sumaPonderaciones = detalleDecisiones.reduce(
          (acc, d) => acc + d.ponderacion,
          0,
        );

        return {
          tipo: 'casotech',
          total_decisiones: detalleDecisiones.length,
          suma_ponderaciones: sumaPonderaciones,
          etapa_final_id:
            typeof recorrido.etapa_actual_id === 'string'
              ? recorrido.etapa_actual_id
              : null,
          decisiones: detalleDecisiones,
        };
      }
    }
  }

  private validarLimiteRecorrido(recorrido: Record<string, unknown>): void {
    const bytes = Buffer.byteLength(JSON.stringify(recorrido), 'utf8');
    if (bytes > MAX_RECORRIDO_BYTES) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'RECORRIDO_EXCEDE_LIMITE',
        'El recorrido supera el límite de 1 MiB',
      );
    }
  }

  private aplicarPasoAprende(
    contenido: Record<string, unknown>,
    recorridoActual: Record<string, unknown>,
    paso: PasoIntentoInput,
  ): Record<string, unknown> {
    const secciones =
      (contenido.secciones as SeccionAprende[] | undefined) ?? [];
    const idsValidos = new Set(secciones.map((s) => s.id));

    const visitadasSet = new Set<string>(
      Array.isArray(recorridoActual.secciones_visitadas)
        ? (recorridoActual.secciones_visitadas as string[]).filter((id) =>
            idsValidos.has(id),
          )
        : [],
    );

    const fuenteRecorrido = esObjetoPlano(paso.recorrido) ? paso.recorrido : {};
    const listaExtra = Array.isArray(paso.secciones_visitadas)
      ? paso.secciones_visitadas
      : Array.isArray(fuenteRecorrido.secciones_visitadas)
        ? (fuenteRecorrido.secciones_visitadas as unknown[])
        : undefined;

    if (listaExtra) {
      for (const seccionId of listaExtra) {
        if (typeof seccionId !== 'string' || !idsValidos.has(seccionId)) {
          throw new DomainError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'SECCION_INEXISTENTE',
            `La sección "${String(seccionId)}" no existe en esta versión`,
          );
        }
        visitadasSet.add(seccionId);
      }
    }

    if (paso.seccion_id !== undefined) {
      if (!idsValidos.has(paso.seccion_id)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'SECCION_INEXISTENTE',
          `La sección "${paso.seccion_id}" no existe en esta versión`,
        );
      }
      visitadasSet.add(paso.seccion_id);
    }

    const confirmado =
      paso.confirmado !== undefined
        ? paso.confirmado
        : typeof fuenteRecorrido.confirmado === 'boolean'
          ? fuenteRecorrido.confirmado
          : recorridoActual.confirmado === true;

    return {
      secciones_visitadas: [...visitadasSet],
      confirmado,
    };
  }

  private aplicarPasoNormaMatch(
    contenido: Record<string, unknown>,
    recorridoActual: Record<string, unknown>,
    paso: PasoIntentoInput,
  ): Record<string, unknown> {
    const situaciones =
      (contenido.situaciones as SituacionNormaMatch[] | undefined) ?? [];
    const opcionesGlobales = Array.isArray(contenido.opciones)
      ? (contenido.opciones as OpcionNormaMatch[]).map((o) => o.id)
      : [];

    const opcionesPorSituacion = new Map<string, Set<string>>();
    for (const sit of situaciones) {
      const ops = Array.isArray(sit.opciones)
        ? sit.opciones.map((o) => o.id)
        : opcionesGlobales;
      opcionesPorSituacion.set(sit.id, new Set(ops));
    }

    const asociacionesActuales = esObjetoPlano(recorridoActual.asociaciones)
      ? { ...(recorridoActual.asociaciones as Record<string, string>) }
      : {};

    const fuenteRecorrido = esObjetoPlano(paso.recorrido) ? paso.recorrido : {};
    const nuevasAsociaciones =
      paso.asociaciones ??
      (esObjetoPlano(fuenteRecorrido.asociaciones)
        ? (fuenteRecorrido.asociaciones as Record<string, unknown>)
        : undefined);

    if (nuevasAsociaciones) {
      for (const [sitId, opcionId] of Object.entries(nuevasAsociaciones)) {
        const opcionesValidas = opcionesPorSituacion.get(sitId);
        if (
          !opcionesValidas ||
          typeof opcionId !== 'string' ||
          !opcionesValidas.has(opcionId)
        ) {
          throw new DomainError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'ASOCIACION_INVALIDA',
            `Asociación inválida para la situación "${sitId}"`,
          );
        }
        asociacionesActuales[sitId] = opcionId;
      }
    }

    return {
      asociaciones: asociacionesActuales,
    };
  }

  private aplicarPasoCasoTech(
    contenido: Record<string, unknown>,
    recorridoActual: Record<string, unknown>,
    paso: PasoIntentoInput,
  ): Record<string, unknown> {
    const etapas = (contenido.etapas as EtapaCasoTech[] | undefined) ?? [];
    const etapasPorId = new Map(etapas.map((e) => [e.id, e]));
    const etapaInicialId =
      typeof contenido.etapa_inicial_id === 'string'
        ? contenido.etapa_inicial_id
        : (etapas[0]?.id ?? '');

    const decisionesActuales = Array.isArray(recorridoActual.decisiones)
      ? [
          ...(recorridoActual.decisiones as Array<{
            etapa_id: string;
            alternativa_id: string;
          }>),
        ]
      : [];

    // Reconstruimos la etapa actual esperada exclusivamente desde el servidor
    let etapaActualId = etapaInicialId;
    for (const dec of decisionesActuales) {
      const etapa = etapasPorId.get(etapaActualId);
      const alt = etapa?.alternativas?.find((a) => a.id === dec.alternativa_id);
      if (!etapa || dec.etapa_id !== etapaActualId || !alt) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'RECORRIDO_CORRUPTO',
          'El recorrido previo del caso no es válido',
        );
      }
      etapaActualId = alt.siguiente_etapa_id;
    }

    const decisionesLote =
      paso.decisiones ??
      (esObjetoPlano(paso.recorrido) && Array.isArray(paso.recorrido.decisiones)
        ? (paso.recorrido.decisiones as Array<{
            etapa_id: string;
            alternativa_id: string;
          }>)
        : undefined);

    if (decisionesLote && paso.alternativa_id === undefined) {
      // Acepta lista completa desde el inicio o decisiones nuevas en orden
      const nuevasDesdeCero =
        decisionesLote.length >= decisionesActuales.length &&
        decisionesActuales.every(
          (d, i) =>
            decisionesLote[i]?.etapa_id === d.etapa_id &&
            decisionesLote[i]?.alternativa_id === d.alternativa_id,
        );

      const pendientes = nuevasDesdeCero
        ? decisionesLote.slice(decisionesActuales.length)
        : decisionesLote;

      for (const dec of pendientes) {
        etapaActualId = this.avanzarEtapaCasoTech(
          etapasPorId,
          etapaActualId,
          decisionesActuales,
          dec.etapa_id,
          dec.alternativa_id,
        );
      }
    } else if (paso.alternativa_id !== undefined) {
      etapaActualId = this.avanzarEtapaCasoTech(
        etapasPorId,
        etapaActualId,
        decisionesActuales,
        paso.etapa_id,
        paso.alternativa_id,
      );
    }

    return {
      decisiones: decisionesActuales,
      etapa_actual_id: etapaActualId,
    };
  }

  private avanzarEtapaCasoTech(
    etapasPorId: Map<string, EtapaCasoTech>,
    etapaActualId: string,
    decisiones: Array<{ etapa_id: string; alternativa_id: string }>,
    etapaSolicitadaId: string | undefined,
    alternativaId: string,
  ): string {
    const etapaActual = etapasPorId.get(etapaActualId);
    if (!etapaActual) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'ETAPA_INEXISTENTE',
        'La etapa actual del caso no existe',
      );
    }

    if (etapaActual.terminal === true) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'ETAPA_YA_TERMINAL',
        'El caso ya alcanzó una etapa terminal',
      );
    }

    if (
      etapaSolicitadaId !== undefined &&
      etapaSolicitadaId !== etapaActualId
    ) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'TRANSICION_FUERA_DE_ORDEN',
        `La etapa esperada es "${etapaActualId}"`,
        { etapaEsperada: etapaActualId },
      );
    }

    const alternativa = etapaActual.alternativas?.find(
      (a) => a.id === alternativaId,
    );
    if (!alternativa) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'ALTERNATIVA_INVALIDA',
        `La alternativa "${alternativaId}" no pertenece a la etapa "${etapaActualId}"`,
      );
    }

    decisiones.push({
      etapa_id: etapaActualId,
      alternativa_id: alternativa.id,
    });

    return alternativa.siguiente_etapa_id;
  }

  private evaluarAprende(
    contenido: Record<string, unknown>,
    recorrido: Record<string, unknown>,
  ): EvaluacionFinalizacion {
    const secciones =
      (contenido.secciones as SeccionAprende[] | undefined) ?? [];
    const visitadas = new Set<string>(
      Array.isArray(recorrido.secciones_visitadas)
        ? (recorrido.secciones_visitadas as string[])
        : [],
    );

    const faltantes = secciones
      .map((s) => s.id)
      .filter((id) => !visitadas.has(id));

    if (faltantes.length > 0) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'APRENDE_INCOMPLETO',
        'Debes visitar todas las secciones de la versión antes de finalizar',
        { seccionesFaltantes: faltantes },
      );
    }

    if (recorrido.confirmado !== true) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'APRENDE_SIN_CONFIRMACION',
        'Se requiere confirmación explícita para finalizar la lección',
      );
    }

    return {
      recorridoFinal: {
        secciones_visitadas: secciones.map((s) => s.id),
        confirmado: true,
      },
      puntuacion: null,
      puntosUnidad: PUNTOS_APRENDE,
    };
  }

  private evaluarNormaMatch(
    contenido: Record<string, unknown>,
    recorrido: Record<string, unknown>,
  ): EvaluacionFinalizacion {
    const situaciones =
      (contenido.situaciones as SituacionNormaMatch[] | undefined) ?? [];
    const total = situaciones.length;
    if (total === 0) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CONTENIDO_ESTRUCTURA_INVALIDA',
        'La actividad NormaMatch no tiene situaciones',
      );
    }

    const claveAsociacion = esObjetoPlano(contenido.clave_asociacion)
      ? (contenido.clave_asociacion as Record<string, string>)
      : {};
    const asociaciones = esObjetoPlano(recorrido.asociaciones)
      ? (recorrido.asociaciones as Record<string, string>)
      : {};

    const opcionesGlobales = Array.isArray(contenido.opciones)
      ? (contenido.opciones as OpcionNormaMatch[]).map((o) => o.id)
      : [];

    let aciertos = 0;

    for (const sit of situaciones) {
      const elegida = asociaciones[sit.id];
      const opcionesValidas = new Set(
        Array.isArray(sit.opciones)
          ? sit.opciones.map((o) => o.id)
          : opcionesGlobales,
      );

      if (typeof elegida !== 'string' || !opcionesValidas.has(elegida)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'NORMAMATCH_INCOMPLETO',
          'Debes responder todas las situaciones con opciones válidas antes de finalizar',
          { situacionFaltante: sit.id },
        );
      }

      const correcta =
        sit.respuesta_correcta ??
        sit.opcion_correcta_id ??
        claveAsociacion[sit.id];
      if (elegida === correcta) {
        aciertos += 1;
      }
    }

    const puntuacion = Number(((100 * aciertos) / total).toFixed(2));

    return {
      recorridoFinal: {
        asociaciones,
      },
      puntuacion,
      puntosUnidad: PUNTOS_EVALUATIVO,
    };
  }

  private evaluarCasoTech(
    contenido: Record<string, unknown>,
    recorrido: Record<string, unknown>,
  ): EvaluacionFinalizacion {
    const etapas = (contenido.etapas as EtapaCasoTech[] | undefined) ?? [];
    const etapasPorId = new Map(etapas.map((e) => [e.id, e]));
    const etapaInicialId =
      typeof contenido.etapa_inicial_id === 'string'
        ? contenido.etapa_inicial_id
        : (etapas[0]?.id ?? '');

    const decisiones = Array.isArray(recorrido.decisiones)
      ? (recorrido.decisiones as Array<{
          etapa_id: string;
          alternativa_id: string;
        }>)
      : [];

    if (decisiones.length < 1) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CASOTECH_SIN_DECISIONES',
        'CasoTech requiere al menos una decisión para finalizar',
      );
    }

    let etapaActualId = etapaInicialId;
    let sumaPonderaciones = 0;

    for (const dec of decisiones) {
      const etapa = etapasPorId.get(etapaActualId);
      const alt = etapa?.alternativas?.find((a) => a.id === dec.alternativa_id);
      if (!etapa || dec.etapa_id !== etapaActualId || !alt) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CASOTECH_RUTA_INVALIDA',
          'La ruta de decisiones no corresponde al grafo de esta versión',
        );
      }
      sumaPonderaciones += alt.ponderacion;
      etapaActualId = alt.siguiente_etapa_id;
    }

    const etapaFinal = etapasPorId.get(etapaActualId);
    if (!etapaFinal || etapaFinal.terminal !== true) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CASOTECH_NO_TERMINAL',
        'El caso debe llegar a una etapa terminal para finalizar',
      );
    }

    const puntuacion = Number(
      ((100 * sumaPonderaciones) / (2 * decisiones.length)).toFixed(2),
    );

    return {
      recorridoFinal: {
        decisiones,
        etapa_actual_id: etapaActualId,
      },
      puntuacion,
      puntosUnidad: PUNTOS_EVALUATIVO,
    };
  }
}
