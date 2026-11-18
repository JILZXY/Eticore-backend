import { getMetadataArgsStorage } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { ALL_ENTITIES } from './index.js';

const EXPECTED_TABLES = [
  'rol',
  'tema',
  'fuente',
  'documento_legal',
  'insignia',
  'grupo',
  'usuario',
  'credencial',
  'segundo_factor',
  'sesion',
  'desafio_autenticacion',
  'usuario_rol',
  'unidad',
  'version_unidad',
  'revision_editorial',
  'fuente_version',
  'unidad_fuente',
  'ruta',
  'version_ruta',
  'ruta_unidad',
  'inscripcion_ruta',
  'intento',
  'credito_unidad',
  'usuario_insignia',
  'membresia_grupo',
  'version_documento',
  'evento_legal',
  'auditoria',
  'auditoria_bd',
  'solicitud_privacidad',
  'guarda_integridad',
];

describe('Entidades TypeORM', () => {
  it('registra exactamente 31 entidades 1:1 con el DDL', () => {
    expect(ALL_ENTITIES).toHaveLength(31);

    const registeredTables = getMetadataArgsStorage()
      .tables.filter((table) =>
        ALL_ENTITIES.includes(table.target as (typeof ALL_ENTITIES)[number]),
      )
      .map((table) => table.name);

    expect(new Set(registeredTables)).toEqual(new Set(EXPECTED_TABLES));
  });
});
