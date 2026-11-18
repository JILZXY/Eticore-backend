# Eticore — Contexto para la IA del IDE (NestJS)

Carpeta de contexto para desarrollar el backend de Eticore en NestJS.
No es código: es la fuente de verdad que la IA del IDE debe respetar.

## Archivos

| Archivo | Qué es |
|---|---|
| `00-contexto-proyecto.md` | Qué es Eticore, stack, actores, módulos, no-funcionales, fuera de alcance |
| `01-arquitectura-nestjs.md` | **La arquitectura a seguir**: monolito modular, módulos, auth/sesiones/2FA, transacciones, API REST, validación JSONB, tests |
| `02-requisitos-funcionales.md` | REQ-F-01…75 reconstruidos desde los patrones A01–A58 (redacción inferida, trazada) + no-funcionales |
| `03-reglas-de-negocio.md` | RN-01…RN-31 + adendas C-01…C-07 de la corrección 2026-11-10 |
| `eticore-grado-inferido.json` | Las 31 entidades + 40 relaciones con su grado/cardinalidad inferido (1:1, 1:N, N:M, N:M temporal) |

Fuente de la base de datos (fuera de esta carpeta):
`workspace/your_files/eticore-postgres-ddl.sql` — DDL vigente, 31 tablas.

## Cómo usarlo en el IDE

1. Copia esta carpeta a la raíz del repo del backend.
2. Pídele a la IA del IDE que lea, en este orden:
   `00` → `01` → `02` → `03` → `eticore-grado-inferido.json` → el DDL.
3. Regla de oro: si el código contradice `03` o el DDL, está mal el
   código, no la regla.

## Decisiones clave (resumen)

- **NestJS + TypeORM 0.3 + PostgreSQL 18.6**, una sola instancia.
  `synchronize: false`. Migración base = DDL de 31 tablas.
- **Docker + Compose como entorno estándar** (decisión 2026-11-17):
  misma imagen de la API en dev, tests y despliegue; Compose con
  `api` + `db` (`postgres:18.6`, volumen `pgdata`) + `migrate`
  efímero. Comandos: `docker compose up --build -d`,
  `docker compose run --rm migrate`. El puerto 5432 no se publica.
- **Monolito modular**, no microservicios. Sin Redis, sin réplicas,
  sin segundo motor en v1.0.
- **Sesiones opacas en servidor, no JWT.** Argon2id + TOTP
  (AES-256-GCM, clave fuera de la BD). 2FA obligatorio para admins.
- **JSONB solo** en `version_unidad.contenido` e `intento.recorrido`
  (1 MiB). El resto es relacional.
- **Puntos, progreso y rango son derivados**, no columnas.
- **Finalizar y publicar son transacciones** con bloqueos explícitos;
  los duplicados los impiden PK/UNIQUE, no un `SELECT` previo.

## Lo que NO está definido (no inventarlo)

- Códigos/criterios de las 4 insignias iniciales (RN-25).
- REQ-F-09, F-55, F-61 (no citados en el reporte).
- Hash encadenado en `auditoria_bd` (decisión diferida).
- Proveedor de hosting (Docker sí está decidido; falta solo dónde
  corre el Compose).
