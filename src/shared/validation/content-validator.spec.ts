import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ContentValidatorService } from './content-validator.service.js';

describe('ContentValidatorService (unit)', () => {
  const validator = new ContentValidatorService();

  const aprendeValido = {
    objetivo: 'Comprender principios básicos de protección de datos.',
    secciones: [
      {
        id: 'sec-1',
        orden: 1,
        titulo: 'Introducción',
        cuerpo: 'Texto de prueba para la sección 1.',
        referencias_locales: ['REF1'],
      },
      {
        id: 'sec-2',
        orden: 2,
        titulo: 'Aplicación',
        cuerpo: 'Texto de prueba para la sección 2.',
      },
    ],
    ejemplo: 'Ejemplo ilustrativo sintético.',
    buenas_practicas: ['Minimizar datos recolectados'],
  };

  const normaMatchValido = {
    situaciones: [
      {
        id: 'sit-1',
        enunciado: 'Situación de prueba 1',
        opciones: [
          { id: 'op-a', texto: 'Opción A' },
          { id: 'op-b', texto: 'Opción B' },
        ],
        respuesta_correcta: 'op-a',
        explicacion: 'La opción A aplica el principio correspondiente.',
        referencia_local: 'REF1',
      },
    ],
  };

  const casoTechValido = {
    etapa_inicial_id: 'et-1',
    etapas: [
      {
        id: 'et-1',
        titulo: 'Inicio del caso',
        terminal: false,
        alternativas: [
          {
            id: 'alt-1',
            texto: 'Elegir ruta segura',
            ponderacion: 2,
            siguiente_etapa_id: 'et-fin',
            explicacion: 'Decisión óptima.',
          },
          {
            id: 'alt-2',
            texto: 'Elegir ruta intermedia',
            ponderacion: 1,
            siguiente_etapa_id: 'et-fin',
          },
        ],
      },
      {
        id: 'et-fin',
        titulo: 'Cierre',
        terminal: true,
      },
    ],
  };

  it('acepta contenidos validos de aprende, normamatch y casotech', () => {
    const fuentes = new Set(['REF1']);

    expect(() =>
      validator.validarContenido({
        tipo: 'aprende',
        esquemaVersion: 1,
        contenido: aprendeValido,
        clavesFuentesRegistradas: fuentes,
      }),
    ).not.toThrow();

    expect(() =>
      validator.validarContenido({
        tipo: 'normamatch',
        esquemaVersion: 1,
        contenido: normaMatchValido,
        clavesFuentesRegistradas: fuentes,
      }),
    ).not.toThrow();

    expect(() =>
      validator.validarContenido({
        tipo: 'casotech',
        esquemaVersion: 1,
        contenido: casoTechValido,
        clavesFuentesRegistradas: fuentes,
      }),
    ).not.toThrow();
  });

  it('rechaza esquema_version desconocida y exceso de 1 MiB', () => {
    expect(() =>
      validator.validarContenido({
        tipo: 'aprende',
        esquemaVersion: 99,
        contenido: aprendeValido,
      }),
    ).toThrowError(
      expect.objectContaining({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        codigo: 'ESQUEMA_VERSION_NO_SOPORTADO',
      }),
    );

    const enorme = {
      ...aprendeValido,
      ejemplo: 'x'.repeat(1_050_000),
    };
    expect(() =>
      validator.validarContenido({
        tipo: 'aprende',
        esquemaVersion: 1,
        contenido: enorme,
      }),
    ).toThrowError(
      expect.objectContaining({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        codigo: 'CONTENIDO_EXCEDE_LIMITE',
      }),
    );
  });

  it('rechaza orden duplicado en aprende y referencia local inexistente', () => {
    const ordenDuplicado = {
      ...aprendeValido,
      secciones: [
        { ...aprendeValido.secciones[0], orden: 1 },
        { ...aprendeValido.secciones[1], orden: 1 },
      ],
    };

    expect(() =>
      validator.validarContenido({
        tipo: 'aprende',
        esquemaVersion: 1,
        contenido: ordenDuplicado,
      }),
    ).toThrowError(
      expect.objectContaining({
        codigo: 'ORDEN_SECCION_DUPLICADO',
      }),
    );

    expect(() =>
      validator.validarContenido({
        tipo: 'aprende',
        esquemaVersion: 1,
        contenido: aprendeValido,
        clavesFuentesRegistradas: new Set(),
      }),
    ).toThrowError(
      expect.objectContaining({
        codigo: 'REFERENCIA_LOCAL_INEXISTENTE',
      }),
    );
  });

  it('rechaza NormaMatch sin explicacion o con respuesta_correcta inexistente', () => {
    const sinExplicacion = {
      situaciones: [
        {
          id: 'sit-1',
          enunciado: 'Situación sin explicación',
          opciones: [
            { id: 'op-a', texto: 'Opción A' },
            { id: 'op-b', texto: 'Opción B' },
          ],
          respuesta_correcta: 'op-a',
        },
      ],
    };

    expect(() =>
      validator.validarContenido({
        tipo: 'normamatch',
        esquemaVersion: 1,
        contenido: sinExplicacion,
      }),
    ).toThrowError(
      expect.objectContaining({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        codigo: 'CONTENIDO_SIN_EXPLICACION',
      }),
    );

    const respuestaInexistente = {
      situaciones: [
        {
          id: 'sit-1',
          enunciado: 'Situación con clave rota',
          opciones: [
            { id: 'op-a', texto: 'Opción A' },
            { id: 'op-b', texto: 'Opción B' },
          ],
          respuesta_correcta: 'op-z',
          explicacion: 'Explicación presente.',
        },
      ],
    };

    expect(() =>
      validator.validarContenido({
        tipo: 'normamatch',
        esquemaVersion: 1,
        contenido: respuestaInexistente,
      }),
    ).toThrowError(
      expect.objectContaining({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        codigo: 'RESPUESTA_CORRECTA_INEXISTENTE',
      }),
    );
  });

  it('rechaza CasoTech con ciclo o ponderacion invalida', () => {
    const grafoConCiclo = {
      etapa_inicial_id: 'et-1',
      etapas: [
        {
          id: 'et-1',
          titulo: 'Etapa 1',
          terminal: false,
          alternativas: [
            {
              id: 'alt-1',
              texto: 'Avanzar a etapa 2',
              ponderacion: 1,
              siguiente_etapa_id: 'et-2',
            },
          ],
        },
        {
          id: 'et-2',
          titulo: 'Etapa 2',
          terminal: false,
          alternativas: [
            {
              id: 'alt-2',
              texto: 'Volver a etapa 1',
              ponderacion: 0,
              siguiente_etapa_id: 'et-1',
            },
            {
              id: 'alt-3',
              texto: 'Ir a terminal',
              ponderacion: 2,
              siguiente_etapa_id: 'et-fin',
            },
          ],
        },
        {
          id: 'et-fin',
          titulo: 'Final',
          terminal: true,
        },
      ],
    };

    expect(() =>
      validator.validarContenido({
        tipo: 'casotech',
        esquemaVersion: 1,
        contenido: grafoConCiclo,
      }),
    ).toThrowError(
      expect.objectContaining({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        codigo: 'CASOTECH_CICLO_DETECTADO',
      }),
    );

    const ponderacionInvalida = {
      etapa_inicial_id: 'et-1',
      etapas: [
        {
          id: 'et-1',
          titulo: 'Etapa 1',
          terminal: false,
          alternativas: [
            {
              id: 'alt-1',
              texto: 'Ponderación 5 no permitida',
              ponderacion: 5,
              siguiente_etapa_id: 'et-fin',
            },
          ],
        },
        {
          id: 'et-fin',
          titulo: 'Final',
          terminal: true,
        },
      ],
    };

    expect(() =>
      validator.validarContenido({
        tipo: 'casotech',
        esquemaVersion: 1,
        contenido: ponderacionInvalida,
      }),
    ).toThrowError(
      expect.objectContaining({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        codigo: 'PONDERACION_INVALIDA',
      }),
    );
  });

  it('proyecta contenido sin respuestas correctas, explicaciones ni ponderaciones', () => {
    const proyNorma = validator.proyectarContenidoParaAprendiz('normamatch', {
      ...normaMatchValido,
      clave_asociacion: { 'sit-1': 'op-a' },
    });

    expect(proyNorma.clave_asociacion).toBeUndefined();
    const situaciones = proyNorma.situaciones as Array<Record<string, unknown>>;
    expect(situaciones[0].respuesta_correcta).toBeUndefined();
    expect(situaciones[0].explicacion).toBeUndefined();
    expect(situaciones[0].opciones).toHaveLength(2);

    const proyCaso = validator.proyectarContenidoParaAprendiz(
      'casotech',
      casoTechValido,
    );
    const etapas = proyCaso.etapas as Array<Record<string, unknown>>;
    const alts = etapas[0].alternativas as Array<Record<string, unknown>>;
    expect(alts[0].ponderacion).toBeUndefined();
    expect(alts[0].explicacion).toBeUndefined();
    expect(alts[0].texto).toBe('Elegir ruta segura');
  });
});
