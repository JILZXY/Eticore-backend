import { createHash } from 'node:crypto';
import type { DificultadUnidad } from '../../modules/catalog/dto/consultar-catalogo.dto.js';

export interface ReferenciaEditorialHuella {
  clave_local: string;
  fuente_version_id: number;
  revisada_en: string;
}

export interface DatosHuellaEditorial {
  unidad_id: number;
  numero: number;
  titulo: string;
  descripcion: string;
  tema_id: number;
  dificultad: DificultadUnidad;
  esquema_version: number;
  contenido: Record<string, unknown>;
  referencias: ReferenciaEditorialHuella[];
}

export function canonicalizarJson(valor: unknown): string {
  if (valor === null) {
    return 'null';
  }
  if (valor instanceof Date) {
    return JSON.stringify(valor.toISOString());
  }
  if (Array.isArray(valor)) {
    const elementos = valor.map((item) =>
      item === undefined ? 'null' : canonicalizarJson(item),
    );
    return `[${elementos.join(',')}]`;
  }
  if (typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    const clavesOrdenadas = Object.keys(obj).sort();
    const pares: string[] = [];
    for (const clave of clavesOrdenadas) {
      const val = obj[clave];
      if (val !== undefined) {
        pares.push(`${JSON.stringify(clave)}:${canonicalizarJson(val)}`);
      }
    }
    return `{${pares.join(',')}}`;
  }
  return JSON.stringify(valor);
}

export function calcularHuellaEditorial(entrada: DatosHuellaEditorial): string {
  const referenciasOrdenadas = [...entrada.referencias]
    .map((ref) => ({
      clave_local: ref.clave_local,
      fuente_version_id: Number(ref.fuente_version_id),
      revisada_en: ref.revisada_en.slice(0, 10),
    }))
    .sort((a, b) => a.clave_local.localeCompare(b.clave_local));

  const payload = {
    unidad_id: Number(entrada.unidad_id),
    numero: Number(entrada.numero),
    titulo: entrada.titulo,
    descripcion: entrada.descripcion,
    tema_id: Number(entrada.tema_id),
    dificultad: entrada.dificultad,
    esquema_version: Number(entrada.esquema_version),
    contenido: entrada.contenido,
    referencias: referenciasOrdenadas,
  };

  return createHash('sha256')
    .update(canonicalizarJson(payload), 'utf8')
    .digest('hex');
}
