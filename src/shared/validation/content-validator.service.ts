import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain.error.js';

export type TipoUnidad = 'aprende' | 'normamatch' | 'casotech';

const MAX_CONTENIDO_BYTES = 1_048_576; // 1 MiB
const ESQUEMAS_SOPORTADOS = new Set<string>([
  'aprende:1',
  'normamatch:1',
  'casotech:1',
]);

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esTextoNoVacio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}

@Injectable()
export class ContentValidatorService {
  validarContenido(params: {
    tipo: TipoUnidad;
    esquemaVersion: number;
    contenido: unknown;
    clavesFuentesRegistradas?: Set<string>;
  }): void {
    const { tipo, esquemaVersion, contenido, clavesFuentesRegistradas } = params;

    if (!ESQUEMAS_SOPORTADOS.has(`${tipo}:${esquemaVersion}`)) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'ESQUEMA_VERSION_NO_SOPORTADO',
        `Esquema no soportado para (${tipo}, v${esquemaVersion})`,
      );
    }

    if (!esObjetoPlano(contenido)) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CONTENIDO_ESTRUCTURA_INVALIDA',
        'El contenido debe ser un objeto JSON válido',
      );
    }

    const bytes = Buffer.byteLength(JSON.stringify(contenido), 'utf8');
    if (bytes > MAX_CONTENIDO_BYTES) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CONTENIDO_EXCEDE_LIMITE',
        'El contenido supera el tamaño máximo permitido de 1 MiB',
        { bytes, maximoBytes: MAX_CONTENIDO_BYTES },
      );
    }

    const referenciasCitadas = this.extraerReferenciasLocales(contenido);
    if (clavesFuentesRegistradas !== undefined) {
      for (const claveLocal of referenciasCitadas) {
        if (!clavesFuentesRegistradas.has(claveLocal)) {
          throw new DomainError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'REFERENCIA_LOCAL_INEXISTENTE',
            `La referencia local "${claveLocal}" no existe en unidad_fuente`,
            { claveLocal },
          );
        }
      }
    }

    switch (tipo) {
      case 'aprende':
        this.validarAprendeV1(contenido);
        break;
      case 'normamatch':
        this.validarNormaMatchV1(contenido);
        break;
      case 'casotech':
        this.validarCasoTechV1(contenido);
        break;
    }
  }

  proyectarContenidoParaAprendiz(
    tipo: TipoUnidad,
    contenido: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (tipo) {
      case 'aprende':
        return this.proyectarAprende(contenido);
      case 'normamatch':
        return this.proyectarNormaMatch(contenido);
      case 'casotech':
        return this.proyectarCasoTech(contenido);
    }
  }

  private extraerReferenciasLocales(
    nodo: unknown,
    acumulado = new Set<string>(),
  ): Set<string> {
    if (Array.isArray(nodo)) {
      for (const elemento of nodo) {
        this.extraerReferenciasLocales(elemento, acumulado);
      }
      return acumulado;
    }

    if (!esObjetoPlano(nodo)) {
      return acumulado;
    }

    if ('referencia_local' in nodo && nodo.referencia_local !== undefined) {
      if (!esTextoNoVacio(nodo.referencia_local)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'REFERENCIA_LOCAL_INVALIDA',
          'referencia_local debe ser un texto no vacío',
        );
      }
      acumulado.add(nodo.referencia_local.trim());
    }

    if (
      'referencias_locales' in nodo &&
      nodo.referencias_locales !== undefined
    ) {
      if (!Array.isArray(nodo.referencias_locales)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'REFERENCIA_LOCAL_INVALIDA',
          'referencias_locales debe ser un arreglo de claves locales',
        );
      }
      for (const clave of nodo.referencias_locales) {
        if (!esTextoNoVacio(clave)) {
          throw new DomainError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'REFERENCIA_LOCAL_INVALIDA',
            'Cada referencia local debe ser un texto no vacío',
          );
        }
        acumulado.add(clave.trim());
      }
    }

    for (const [clave, valor] of Object.entries(nodo)) {
      if (clave === 'referencia_local' || clave === 'referencias_locales') {
        continue;
      }
      if (typeof valor === 'object' && valor !== null) {
        this.extraerReferenciasLocales(valor, acumulado);
      }
    }

    return acumulado;
  }

  private validarAprendeV1(contenido: Record<string, unknown>): void {
    if (!esTextoNoVacio(contenido.objetivo)) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CONTENIDO_ESTRUCTURA_INVALIDA',
        'Aprende requiere un objetivo no vacío',
      );
    }

    const ejemploValido =
      esTextoNoVacio(contenido.ejemplo) ||
      (esObjetoPlano(contenido.ejemplo) &&
        esTextoNoVacio(contenido.ejemplo.descripcion));
    if (!ejemploValido) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CONTENIDO_ESTRUCTURA_INVALIDA',
        'Aprende requiere un ejemplo no vacío',
      );
    }

    if (!Array.isArray(contenido.secciones) || contenido.secciones.length === 0) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CONTENIDO_ESTRUCTURA_INVALIDA',
        'Aprende requiere al menos una sección',
      );
    }

    const idsVistos = new Set<string>();
    const ordenesVistos = new Set<number>();

    for (const seccion of contenido.secciones) {
      if (!esObjetoPlano(seccion)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          'Cada sección de Aprende debe ser un objeto',
        );
      }

      if (!esTextoNoVacio(seccion.id)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          'Cada sección de Aprende requiere un id no vacío',
        );
      }
      if (idsVistos.has(seccion.id)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CLAVE_INTERNA_DUPLICADA',
          `Id de sección duplicado en Aprende: ${seccion.id}`,
        );
      }
      idsVistos.add(seccion.id);

      if (
        typeof seccion.orden !== 'number' ||
        !Number.isInteger(seccion.orden) ||
        seccion.orden < 1
      ) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          'Cada sección de Aprende requiere un orden entero >= 1',
        );
      }
      if (ordenesVistos.has(seccion.orden)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'ORDEN_SECCION_DUPLICADO',
          `El orden ${seccion.orden} está duplicado en las secciones de Aprende`,
        );
      }
      ordenesVistos.add(seccion.orden);

      if (!esTextoNoVacio(seccion.titulo)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          'Cada sección de Aprende requiere un título no vacío',
        );
      }

      if (
        !esTextoNoVacio(seccion.cuerpo) &&
        !esTextoNoVacio(seccion.contenido)
      ) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          'Cada sección de Aprende requiere cuerpo o contenido no vacío',
        );
      }
    }

    if (contenido.buenas_practicas !== undefined) {
      if (
        !Array.isArray(contenido.buenas_practicas) ||
        contenido.buenas_practicas.length === 0 ||
        contenido.buenas_practicas.some((item) => !esTextoNoVacio(item))
      ) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          'buenas_practicas debe ser un arreglo no vacío de textos',
        );
      }
    }
  }

  private validarOpcionesNormaMatch(
    opcionesRaw: unknown,
    contexto: string,
  ): Set<string> {
    if (!Array.isArray(opcionesRaw) || opcionesRaw.length < 2) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CONTENIDO_ESTRUCTURA_INVALIDA',
        `${contexto} requiere al menos 2 opciones`,
      );
    }

    const idsOpciones = new Set<string>();
    for (const opcion of opcionesRaw) {
      if (
        !esObjetoPlano(opcion) ||
        !esTextoNoVacio(opcion.id) ||
        !esTextoNoVacio(opcion.texto)
      ) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          `Cada opción en ${contexto} requiere id y texto no vacíos`,
        );
      }
      if (idsOpciones.has(opcion.id)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CLAVE_INTERNA_DUPLICADA',
          `Id de opción duplicado (${opcion.id}) en ${contexto}`,
        );
      }
      idsOpciones.add(opcion.id);
    }

    return idsOpciones;
  }

  private validarNormaMatchV1(contenido: Record<string, unknown>): void {
    if (
      !Array.isArray(contenido.situaciones) ||
      contenido.situaciones.length === 0
    ) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CONTENIDO_ESTRUCTURA_INVALIDA',
        'NormaMatch requiere al menos una situación',
      );
    }

    let opcionesGlobales: Set<string> | undefined;
    if (contenido.opciones !== undefined) {
      opcionesGlobales = this.validarOpcionesNormaMatch(
        contenido.opciones,
        'NormaMatch (opciones globales)',
      );
    }

    const claveAsociacion = esObjetoPlano(contenido.clave_asociacion)
      ? contenido.clave_asociacion
      : undefined;

    const idsSituaciones = new Set<string>();

    for (const situacion of contenido.situaciones) {
      if (!esObjetoPlano(situacion)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          'Cada situación de NormaMatch debe ser un objeto',
        );
      }

      if (!esTextoNoVacio(situacion.id)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          'Cada situación de NormaMatch requiere un id no vacío',
        );
      }
      if (idsSituaciones.has(situacion.id)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CLAVE_INTERNA_DUPLICADA',
          `Id de situación duplicado en NormaMatch: ${situacion.id}`,
        );
      }
      idsSituaciones.add(situacion.id);

      if (
        !esTextoNoVacio(situacion.enunciado) &&
        !esTextoNoVacio(situacion.texto)
      ) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          `La situación "${situacion.id}" requiere enunciado o texto`,
        );
      }

      if (!esTextoNoVacio(situacion.explicacion)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_SIN_EXPLICACION',
          `La situación "${situacion.id}" de NormaMatch debe incluir una explicación obligatoria`,
          { situacionId: situacion.id },
        );
      }

      const opcionesValidas =
        situacion.opciones !== undefined
          ? this.validarOpcionesNormaMatch(
              situacion.opciones,
              `situación "${situacion.id}"`,
            )
          : opcionesGlobales;

      if (!opcionesValidas) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          `La situación "${situacion.id}" no tiene opciones definidas`,
        );
      }

      const respuestaCorrecta = esTextoNoVacio(situacion.respuesta_correcta)
        ? situacion.respuesta_correcta
        : esTextoNoVacio(situacion.opcion_correcta_id)
          ? situacion.opcion_correcta_id
          : claveAsociacion?.[situacion.id];

      if (
        !esTextoNoVacio(respuestaCorrecta) ||
        !opcionesValidas.has(respuestaCorrecta)
      ) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'RESPUESTA_CORRECTA_INEXISTENTE',
          `La respuesta correcta de la situación "${situacion.id}" no existe entre sus opciones`,
          { situacionId: situacion.id },
        );
      }
    }
  }

  private validarCasoTechV1(contenido: Record<string, unknown>): void {
    if (!Array.isArray(contenido.etapas) || contenido.etapas.length === 0) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CONTENIDO_ESTRUCTURA_INVALIDA',
        'CasoTech requiere al menos una etapa',
      );
    }

    const etapasPorId = new Map<string, Record<string, unknown>>();
    const terminales = new Set<string>();

    for (const etapa of contenido.etapas) {
      if (!esObjetoPlano(etapa)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          'Cada etapa de CasoTech debe ser un objeto',
        );
      }

      if (!esTextoNoVacio(etapa.id)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          'Cada etapa de CasoTech requiere un id no vacío',
        );
      }
      if (etapasPorId.has(etapa.id)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CLAVE_INTERNA_DUPLICADA',
          `Id de etapa duplicado en CasoTech: ${etapa.id}`,
        );
      }

      if (!esTextoNoVacio(etapa.enunciado) && !esTextoNoVacio(etapa.titulo)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          `La etapa "${etapa.id}" de CasoTech requiere enunciado o título`,
        );
      }

      const esTerminal = etapa.terminal === true;
      if (etapa.terminal !== undefined && typeof etapa.terminal !== 'boolean') {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTENIDO_ESTRUCTURA_INVALIDA',
          `El campo terminal de la etapa "${etapa.id}" debe ser booleano`,
        );
      }

      etapasPorId.set(etapa.id, etapa);
      if (esTerminal) {
        terminales.add(etapa.id);
      }
    }

    if (terminales.size === 0) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CASOTECH_SIN_TERMINAL',
        'CasoTech debe tener al menos una etapa terminal',
      );
    }

    const etapaInicialId =
      contenido.etapa_inicial_id !== undefined
        ? contenido.etapa_inicial_id
        : (contenido.etapas[0] as Record<string, unknown>).id;

    if (!esTextoNoVacio(etapaInicialId) || !etapasPorId.has(etapaInicialId)) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CASOTECH_ETAPA_INICIAL_INVALIDA',
        'La etapa inicial de CasoTech no existe en las etapas declaradas',
      );
    }

    const adyacencia = new Map<string, string[]>();

    for (const [etapaId, etapa] of etapasPorId.entries()) {
      const esTerminal = terminales.has(etapaId);
      const alternativas = etapa.alternativas;

      if (esTerminal) {
        if (Array.isArray(alternativas) && alternativas.length > 0) {
          throw new DomainError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'ETAPA_TERMINAL_CON_ALTERNATIVAS',
            `La etapa terminal "${etapaId}" no debe tener alternativas`,
          );
        }
        adyacencia.set(etapaId, []);
        continue;
      }

      if (!Array.isArray(alternativas) || alternativas.length === 0) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'ETAPA_SIN_ALTERNATIVAS',
          `La etapa no terminal "${etapaId}" debe tener al menos una alternativa`,
        );
      }

      const idsAlternativas = new Set<string>();
      const vecinos: string[] = [];

      for (const alt of alternativas) {
        if (!esObjetoPlano(alt)) {
          throw new DomainError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'CONTENIDO_ESTRUCTURA_INVALIDA',
            `Cada alternativa de "${etapaId}" debe ser un objeto`,
          );
        }

        if (!esTextoNoVacio(alt.id) || !esTextoNoVacio(alt.texto)) {
          throw new DomainError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'CONTENIDO_ESTRUCTURA_INVALIDA',
            `Cada alternativa de "${etapaId}" requiere id y texto no vacíos`,
          );
        }

        if (idsAlternativas.has(alt.id)) {
          throw new DomainError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'CLAVE_INTERNA_DUPLICADA',
            `Id de alternativa duplicado (${alt.id}) en etapa "${etapaId}"`,
          );
        }
        idsAlternativas.add(alt.id);

        if (
          typeof alt.ponderacion !== 'number' ||
          !Number.isInteger(alt.ponderacion) ||
          (alt.ponderacion !== 0 &&
            alt.ponderacion !== 1 &&
            alt.ponderacion !== 2)
        ) {
          throw new DomainError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'PONDERACION_INVALIDA',
            `La alternativa "${alt.id}" en etapa "${etapaId}" tiene ponderación inválida (solo 0, 1 o 2)`,
          );
        }

        if (
          !esTextoNoVacio(alt.siguiente_etapa_id) ||
          !etapasPorId.has(alt.siguiente_etapa_id)
        ) {
          throw new DomainError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'TRANSICION_INVALIDA',
            `La transición de "${alt.id}" en "${etapaId}" apunta a una etapa inexistente`,
          );
        }

        vecinos.push(alt.siguiente_etapa_id);
      }

      adyacencia.set(etapaId, vecinos);
    }

    // Detección de ciclos sobre todo el grafo (0 = no visitado, 1 = en pila, 2 = cerrado)
    const estadoVisita = new Map<string, 0 | 1 | 2>();
    for (const etapaId of etapasPorId.keys()) {
      estadoVisita.set(etapaId, 0);
    }

    const detectarCiclo = (nodo: string): void => {
      estadoVisita.set(nodo, 1);
      for (const siguiente of adyacencia.get(nodo) ?? []) {
        const estado = estadoVisita.get(siguiente);
        if (estado === 1) {
          throw new DomainError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'CASOTECH_CICLO_DETECTADO',
            'El grafo de CasoTech contiene un ciclo y debe ser acíclico (DAG)',
            { desde: nodo, hacia: siguiente },
          );
        }
        if (estado === 0) {
          detectarCiclo(siguiente);
        }
      }
      estadoVisita.set(nodo, 2);
    };

    for (const etapaId of etapasPorId.keys()) {
      if (estadoVisita.get(etapaId) === 0) {
        detectarCiclo(etapaId);
      }
    }

    // Verifica que toda etapa alcance un terminal (en el DAG ya validado, comprobado explícitamente)
    const alcanzaTerminal = new Map<string, boolean>();
    const verificarTerminal = (nodo: string): boolean => {
      const cacheado = alcanzaTerminal.get(nodo);
      if (cacheado !== undefined) {
        return cacheado;
      }
      if (terminales.has(nodo)) {
        alcanzaTerminal.set(nodo, true);
        return true;
      }
      const vecinos = adyacencia.get(nodo) ?? [];
      const llega = vecinos.every((v) => verificarTerminal(v));
      alcanzaTerminal.set(nodo, llega);
      return llega;
    };

    if (!verificarTerminal(etapaInicialId)) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CASOTECH_RUTA_SIN_TERMINAL',
        'Toda alternativa de CasoTech debe conducir a una etapa terminal',
      );
    }
  }

  private proyectarAprende(
    contenido: Record<string, unknown>,
  ): Record<string, unknown> {
    const secciones = Array.isArray(contenido.secciones)
      ? contenido.secciones.map((s) => {
          if (!esObjetoPlano(s)) {
            return s;
          }
          const limpia: Record<string, unknown> = {
            id: s.id,
            orden: s.orden,
            titulo: s.titulo,
          };
          if (s.cuerpo !== undefined) {
            limpia.cuerpo = s.cuerpo;
          }
          if (s.contenido !== undefined) {
            limpia.contenido = s.contenido;
          }
          if (s.referencia_local !== undefined) {
            limpia.referencia_local = s.referencia_local;
          }
          if (s.referencias_locales !== undefined) {
            limpia.referencias_locales = s.referencias_locales;
          }
          return limpia;
        })
      : [];

    const resultado: Record<string, unknown> = {
      objetivo: contenido.objetivo,
      secciones,
      ejemplo: contenido.ejemplo,
    };

    if (contenido.buenas_practicas !== undefined) {
      resultado.buenas_practicas = contenido.buenas_practicas;
    }

    return resultado;
  }

  private proyectarNormaMatch(
    contenido: Record<string, unknown>,
  ): Record<string, unknown> {
    const situaciones = Array.isArray(contenido.situaciones)
      ? contenido.situaciones.map((s) => {
          if (!esObjetoPlano(s)) {
            return s;
          }
          const limpia: Record<string, unknown> = {
            id: s.id,
          };
          if (s.enunciado !== undefined) {
            limpia.enunciado = s.enunciado;
          }
          if (s.texto !== undefined) {
            limpia.texto = s.texto;
          }
          if (Array.isArray(s.opciones)) {
            limpia.opciones = s.opciones.map((op) =>
              esObjetoPlano(op) ? { id: op.id, texto: op.texto } : op,
            );
          }
          if (s.referencia_local !== undefined) {
            limpia.referencia_local = s.referencia_local;
          }
          if (s.referencias_locales !== undefined) {
            limpia.referencias_locales = s.referencias_locales;
          }
          return limpia;
        })
      : [];

    const resultado: Record<string, unknown> = {
      situaciones,
    };

    if (Array.isArray(contenido.opciones)) {
      resultado.opciones = contenido.opciones.map((op) =>
        esObjetoPlano(op) ? { id: op.id, texto: op.texto } : op,
      );
    }

    return resultado;
  }

  private proyectarCasoTech(
    contenido: Record<string, unknown>,
  ): Record<string, unknown> {
    const etapas = Array.isArray(contenido.etapas)
      ? contenido.etapas.map((etapa) => {
          if (!esObjetoPlano(etapa)) {
            return etapa;
          }
          const limpia: Record<string, unknown> = {
            id: etapa.id,
            terminal: etapa.terminal === true,
          };
          if (etapa.titulo !== undefined) {
            limpia.titulo = etapa.titulo;
          }
          if (etapa.enunciado !== undefined) {
            limpia.enunciado = etapa.enunciado;
          }
          if (etapa.contexto !== undefined) {
            limpia.contexto = etapa.contexto;
          }
          if (etapa.referencia_local !== undefined) {
            limpia.referencia_local = etapa.referencia_local;
          }
          if (etapa.referencias_locales !== undefined) {
            limpia.referencias_locales = etapa.referencias_locales;
          }
          if (Array.isArray(etapa.alternativas)) {
            limpia.alternativas = etapa.alternativas.map((alt) => {
              if (!esObjetoPlano(alt)) {
                return alt;
              }
              const altLimpia: Record<string, unknown> = {
                id: alt.id,
                texto: alt.texto,
                siguiente_etapa_id: alt.siguiente_etapa_id,
              };
              if (alt.referencia_local !== undefined) {
                altLimpia.referencia_local = alt.referencia_local;
              }
              if (alt.referencias_locales !== undefined) {
                altLimpia.referencias_locales = alt.referencias_locales;
              }
              return altLimpia;
            });
          }
          return limpia;
        })
      : [];

    const resultado: Record<string, unknown> = {
      etapas,
    };

    if (contenido.etapa_inicial_id !== undefined) {
      resultado.etapa_inicial_id = contenido.etapa_inicial_id;
    }

    return resultado;
  }
}
