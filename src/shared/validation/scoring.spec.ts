import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PUNTOS_APRENDE, PUNTOS_EVALUATIVO, ScoringService } from './scoring.service.js';

describe('ScoringService (unit)', () => {
  const scoring = new ScoringService();

  const aprendeContenido = {
    objetivo: 'Objetivo de prueba',
    secciones: [
      { id: 'sec-1', orden: 1, titulo: 'S1', cuerpo: 'C1' },
      { id: 'sec-2', orden: 2, titulo: 'S2', cuerpo: 'C2' },
    ],
    ejemplo: 'Ejemplo',
  };

  const normaMatchContenido = {
    situaciones: [
      {
        id: 'sit-1',
        enunciado: 'Situación 1',
        opciones: [
          { id: 'op-a', texto: 'Opción A' },
          { id: 'op-b', texto: 'Opción B' },
        ],
        respuesta_correcta: 'op-a',
        explicacion: 'Explicación 1',
      },
      {
        id: 'sit-2',
        enunciado: 'Situación 2',
        opciones: [
          { id: 'op-c', texto: 'Opción C' },
          { id: 'op-d', texto: 'Opción D' },
        ],
        respuesta_correcta: 'op-d',
        explicacion: 'Explicación 2',
      },
    ],
  };

  const casoTechContenido = {
    etapa_inicial_id: 'et-1',
    etapas: [
      {
        id: 'et-1',
        titulo: 'Etapa 1',
        terminal: false,
        alternativas: [
          {
            id: 'alt-opt',
            texto: 'Óptima',
            ponderacion: 2,
            siguiente_etapa_id: 'et-2',
          },
          {
            id: 'alt-reg',
            texto: 'Regular',
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
            id: 'alt-mal',
            texto: 'Mala',
            ponderacion: 0,
            siguiente_etapa_id: 'et-fin',
          },
        ],
      },
      {
        id: 'et-fin',
        titulo: 'Fin',
        terminal: true,
      },
    ],
  };

  it('Aprende exige todas las secciones y confirmacion explicita, con puntuacion null y 10 pts', () => {
    const inicial = scoring.crearRecorridoInicial('aprende', aprendeContenido);

    const paso1 = scoring.aplicarPaso({
      tipo: 'aprende',
      contenido: aprendeContenido,
      recorridoActual: inicial,
      paso: { seccion_id: 'sec-1' },
    });

    expect(() =>
      scoring.evaluarFinalizacion({
        tipo: 'aprende',
        contenido: aprendeContenido,
        recorridoActual: paso1,
        payloadFinal: { confirmado: true },
      }),
    ).toThrowError(
      expect.objectContaining({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        codigo: 'APRENDE_INCOMPLETO',
      }),
    );

    const evalOk = scoring.evaluarFinalizacion({
      tipo: 'aprende',
      contenido: aprendeContenido,
      recorridoActual: paso1,
      payloadFinal: { seccion_id: 'sec-2', confirmado: true },
    });

    expect(evalOk.puntuacion).toBeNull();
    expect(evalOk.puntosUnidad).toBe(PUNTOS_APRENDE);
  });

  it('NormaMatch calcula 100 * aciertos / total usando la clave historica', () => {
    const inicial = scoring.crearRecorridoInicial(
      'normamatch',
      normaMatchContenido,
    );

    const evalMitad = scoring.evaluarFinalizacion({
      tipo: 'normamatch',
      contenido: normaMatchContenido,
      recorridoActual: inicial,
      payloadFinal: {
        asociaciones: {
          'sit-1': 'op-a',
          'sit-2': 'op-c',
        },
      },
    });

    expect(evalMitad.puntuacion).toBe(50);
    expect(evalMitad.puntosUnidad).toBe(PUNTOS_EVALUATIVO);
  });

  it('CasoTech avanza etapa en servidor y calcula 100 * suma / (2 * decisiones)', () => {
    const inicial = scoring.crearRecorridoInicial('casotech', casoTechContenido);
    expect(inicial.etapa_actual_id).toBe('et-1');

    const paso1 = scoring.aplicarPaso({
      tipo: 'casotech',
      contenido: casoTechContenido,
      recorridoActual: inicial,
      paso: { alternativa_id: 'alt-reg' },
    });
    expect(paso1.etapa_actual_id).toBe('et-2');

    // No permite saltar etapa esperada
    expect(() =>
      scoring.aplicarPaso({
        tipo: 'casotech',
        contenido: casoTechContenido,
        recorridoActual: paso1,
        paso: { etapa_id: 'et-1', alternativa_id: 'alt-opt' },
      }),
    ).toThrowError(
      expect.objectContaining({
        status: HttpStatus.CONFLICT,
        codigo: 'TRANSICION_FUERA_DE_ORDEN',
      }),
    );

    // No permite finalizar antes de llegar a terminal
    expect(() =>
      scoring.evaluarFinalizacion({
        tipo: 'casotech',
        contenido: casoTechContenido,
        recorridoActual: paso1,
      }),
    ).toThrowError(
      expect.objectContaining({
        codigo: 'CASOTECH_NO_TERMINAL',
      }),
    );

    // Suma = 1 + 0 = 1, decisiones = 2 -> 100 * 1 / 4 = 25
    const evalFinal = scoring.evaluarFinalizacion({
      tipo: 'casotech',
      contenido: casoTechContenido,
      recorridoActual: paso1,
      payloadFinal: { alternativa_id: 'alt-mal' },
    });
    expect(evalFinal.puntuacion).toBe(25);
    expect(evalFinal.puntosUnidad).toBe(PUNTOS_EVALUATIVO);
  });
});
