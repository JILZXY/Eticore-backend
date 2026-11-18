/**
 * En TypeORM para PostgreSQL, UPDATE/DELETE con RETURNING devuelven
 * [filas, cantidadAfectada], mientras que SELECT/INSERT devuelven filas[].
 */
export function extraerFilasMutacion<T>(resultado: unknown): T[] {
  if (
    Array.isArray(resultado) &&
    resultado.length === 2 &&
    Array.isArray(resultado[0]) &&
    typeof resultado[1] === 'number'
  ) {
    return resultado[0] as T[];
  }

  if (Array.isArray(resultado)) {
    return resultado as T[];
  }

  return [];
}
