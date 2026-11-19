import { describe, expect, it } from 'vitest';
import { ContentValidatorService } from '../../shared/validation/content-validator.service.js';
import { ScoringService } from '../../shared/validation/scoring.service.js';
import {
  FUENTES_SEED,
  MARCA_CONTENIDO_SEED,
  RUTAS_SEED,
  TEMAS_SEED,
} from './content-catalog.data.js';
import { LECCIONES_SEED } from './content-lessons.data.js';
import { verificarPermisoEjecucionSeed } from './content-seed-guard.js';

describe('Seed de contenido sintético (validación y guardas)', () => {
  const validator = new ContentValidatorService();
  const scoring = new ScoringService();

  it('se niega a correr si NODE_ENV=production sin SEED_ALLOW_PRODUCTION=true', () => {
    expect(() =>
      verificarPermisoEjecucionSeed({
        NODE_ENV: 'production',
      }),
    ).toThrow(/SEED_PRODUCCION_PROHIBIDO/);

    expect(() =>
      verificarPermisoEjecucionSeed({
        NODE_ENV: 'production',
        SEED_ALLOW_PRODUCTION: 'false',
      }),
    ).toThrow(/SEED_PRODUCCION_PROHIBIDO/);

    expect(() =>
      verificarPermisoEjecucionSeed({
        NODE_ENV: 'development',
      }),
    ).not.toThrow();

    expect(() =>
      verificarPermisoEjecucionSeed({
        NODE_ENV: 'test',
      }),
    ).not.toThrow();
  });

  it('define las 2 rutas (General y TI), 3 temas y fuentes con URLs públicas reales', () => {
    expect(RUTAS_SEED.map((r) => r.nombre)).toEqual(['General', 'TI']);
    expect(TEMAS_SEED.map((t) => t.nombre)).toEqual([
      'Privacidad y datos personales',
      'Seguridad de la información',
      'Ética en tecnologías de la información',
    ]);

    for (const tema of TEMAS_SEED) {
      expect(tema.descripcion).toContain(MARCA_CONTENIDO_SEED);
    }

    for (const fuente of FUENTES_SEED) {
      expect(fuente.url).toMatch(/^https:\/\//);
      expect(fuente.autorOrganismo.length).toBeGreaterThan(3);
      expect(fuente.fechaOVersion.length).toBeGreaterThan(3);
    }
  });

  it('valida las 8 unidades (3 Aprende, 3 NormaMatch, 2 CasoTech) con ContentValidatorService y ScoringService', () => {
    const aprende = LECCIONES_SEED.filter((l) => l.tipo === 'aprende');
    const normamatch = LECCIONES_SEED.filter((l) => l.tipo === 'normamatch');
    const casotech = LECCIONES_SEED.filter((l) => l.tipo === 'casotech');

    expect(aprende).toHaveLength(3);
    expect(normamatch).toHaveLength(3);
    expect(casotech).toHaveLength(2);

    const clavesFuentesDisponibles = new Set(FUENTES_SEED.map((f) => f.clave));

    for (const leccion of LECCIONES_SEED) {
      expect(leccion.descripcion).toContain(MARCA_CONTENIDO_SEED);
      expect(leccion.citas.length).toBeGreaterThanOrEqual(1);

      const clavesLocales = new Set<string>();
      for (const cita of leccion.citas) {
        expect(clavesFuentesDisponibles.has(cita.fuenteClave)).toBe(true);
        expect(cita.revisadaEn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        clavesLocales.add(cita.claveLocal);
      }

      expect(() =>
        validator.validarContenido({
          tipo: leccion.tipo,
          esquemaVersion: 1,
          contenido: leccion.contenido,
          clavesFuentesRegistradas: clavesLocales,
        }),
      ).not.toThrow();

      // Verifica que una ejecución completa del recorrido sea calificable por ScoringService
      const recorridoInicial = scoring.crearRecorridoInicial(
        leccion.tipo,
        leccion.contenido,
      );

      if (leccion.tipo === 'aprende') {
        const secciones = leccion.contenido.secciones as Array<{ id: string }>;
        const evalResult = scoring.evaluarFinalizacion({
          tipo: 'aprende',
          contenido: leccion.contenido,
          recorridoActual: recorridoInicial,
          payloadFinal: {
            secciones_visitadas: secciones.map((s) => s.id),
            confirmado: true,
          },
        });
        expect(evalResult.puntuacion).toBeNull();
        expect(evalResult.puntosUnidad).toBe(10);
      } else if (leccion.tipo === 'normamatch') {
        const situaciones = leccion.contenido.situaciones as Array<{
          id: string;
          respuesta_correcta: string;
        }>;
        const asociaciones: Record<string, string> = {};
        for (const sit of situaciones) {
          asociaciones[sit.id] = sit.respuesta_correcta;
        }
        const evalResult = scoring.evaluarFinalizacion({
          tipo: 'normamatch',
          contenido: leccion.contenido,
          recorridoActual: recorridoInicial,
          payloadFinal: { asociaciones },
        });
        expect(evalResult.puntuacion).toBe(100);
        expect(evalResult.puntosUnidad).toBe(20);
      } else {
        const evalResult = scoring.evaluarFinalizacion({
          tipo: 'casotech',
          contenido: leccion.contenido,
          recorridoActual: recorridoInicial,
          payloadFinal: {
            decisiones: [
              { etapa_id: 'etapa-1', alternativa_id: 'alt-1a' },
              { etapa_id: 'etapa-2', alternativa_id: 'alt-2a' },
            ],
          },
        });
        expect(evalResult.puntuacion).toBe(100);
        expect(evalResult.puntosUnidad).toBe(20);
      }
    }
  });
});
