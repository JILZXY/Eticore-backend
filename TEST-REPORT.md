# Reporte de Pruebas, Concurrencia, Carga y Endurecimiento — Eticore Backend

Fecha de ejecución: `2026-11-18`

## 1. Entorno de ejecución verificado

| Componente | Versión / Configuración observada |
|---|---|
| Runtime Node.js | `v24.22.1` (local y en imagen Docker `node:24.22.1-bookworm-slim`) |
| Base de datos | `postgres:18.6` (contenedor Docker `eticore-db` y contenedores efímeros por suite E2E) |
| Framework / ORM | NestJS 12 (`TypeScript strict`, ESM) + TypeORM (`synchronize: false`) |
| Pool de conexiones | `DB_POOL_MAX=10` (Docker Compose) / `15` (suite E2E), sin Redis ni réplicas |
| Puertos locales Compose | `eticore-api` en `127.0.0.1:3100->3000/tcp`, `eticore-db` en `127.0.0.1:5433->5432/tcp` |

## 2. Resumen de suites automatizadas

- **Compilación (`npm run build`):** `nest build` exitoso (`exit code 0`).
- **Linter (`npm run lint`):** `oxlint --type-aware src/ test/` -> `0` advertencias y `0` errores en `170` archivos.
- **Tests unitarios (`npm test`):** **16 suites / 51 tests aprobados** (`vitest run`).
- **Tests E2E e integración (`npm run test:e2e`):** **11 suites / 25 tests aprobados** contra `postgres:18.6` (`vitest.config.e2e.ts` con `maxWorkers: 3`, duración total `56.49 s`).

> Nota de infraestructura de pruebas: al ejecutar las 11 suites E2E en paralelo sin límite de workers sobre Docker Desktop en Windows, 10 contenedores `postgres:18.6` compitieron simultáneamente por inicialización e I/O produciendo timeouts (`30 s`) en 4 suites. Se limitó `maxWorkers: 3` en `vitest.config.e2e.ts` y se elevó `limiteTiempo` a `60_000 ms` en `test/helpers/postgres-test-db.ts` (manteniendo intacta la concurrencia interna de 10–50 hilos dentro de cada test), logrando **11/11 suites en verde**.

## 3. Matriz de criterios de aceptación y concurrencia (`01 §12`)

| Criterio | Qué se verificó | Evidencia ejecutada | Estado |
|---|---|---|---|
| **PA-01** Correo duplicado (`RN-19`) | 10 registros concurrentes con el mismo correo (mayúsculas y espacios) crean 1 cuenta y rechazan 9 con `409` | `test/auth.e2e-spec.ts` y `test/concurrency/pa-acceptance-suite.e2e-spec.ts` | Aprobado |
| **PA-02** 20 reenvíos concurrentes de finalización (`RN-05/06/07`) | 20 `POST /intentos/:id/finalizar` simultáneos producen 1 resultado confirmado, 1 fila en `credito_unidad` y `<= 1` en `usuario_insignia` | `test/attempts.e2e-spec.ts` y `test/concurrency/pa-acceptance-suite.e2e-spec.ts` | Aprobado |
| **PA-03** Nueva versión con intento abierto (`REQ-F-21/25/41`) | Publicar V2 con intento V1 abierto conserva `version_id` V1 y la explicación histórica `EXPLICACION_ORIGINAL_V1` | `test/attempts.e2e-spec.ts` y `test/concurrency/pa-acceptance-suite.e2e-spec.ts` | Aprobado |
| **PA-04** Último técnico activo (`RN-29`) | Dos `ADMIN_TECNICO` piden su baja simultáneamente; `SELECT ... FOR UPDATE` sobre `guarda_integridad` acepta 1 (`200`), rechaza 1 (`409 ULTIMO_ADMIN_TECNICO_ACTIVO`) y conserva 1 técnico activo | `test/admin-legal.e2e-spec.ts` y `test/concurrency/pa-acceptance-suite.e2e-spec.ts` | Aprobado |
| **PA-05** Membresías: retiro, reingreso y solapamiento (`RN-28`) | Dos altas concurrentes aceptan 1 y rechazan 1 (`409`); solapamiento rechazado; reingreso válido permitido y sin doble conteo en reporte | `test/groups-reports.e2e-spec.ts` y `test/concurrency/pa-acceptance-suite.e2e-spec.ts` | Aprobado |
| **PA-06** Edición tras aprobar antes de publicar (`RN-26`) | Editar borrador ya aprobado invalida la huella y `publicar` rechaza con `422 HUELLA_EDITORIAL_DESACTUALIZADA` sin mover `version_publicada_id` | `test/editorial.e2e-spec.ts` y `test/concurrency/pa-acceptance-suite.e2e-spec.ts` | Aprobado |
| **PA-07** Reporte 4 vs 5 participantes (`RN-13`) | Celda con 4 participantes devuelve `promedio: null` (suprimido) y conteos visibles; con 5 muestra promedio exacto; versiones V1 y V2 separadas | `test/groups-reports.e2e-spec.ts` y `test/concurrency/pa-acceptance-suite.e2e-spec.ts` | Aprobado |
| **PA-08** Ruta vacía y unidad retirada (`RN-23`) | Ruta sin obligatorias devuelve `"Sin actividades"` y `porcentaje: null` (sin 100 % falso); desactivar unidad conserva crédito previo | `test/routes.e2e-spec.ts` y `test/concurrency/pa-acceptance-suite.e2e-spec.ts` | Aprobado |
| **PA-09** Carga con 50 concurrentes (`REQ-NF-01`) | 50 trabajadores simultáneos contra Docker Compose y E2E (`400` peticiones, `0` errores, máximo `170.22 ms` vs umbral `<= 5000 ms`) | `test/load/load-acceptance.e2e-spec.ts` (detalles en §4) | Aprobado (ensayo de respaldo pendiente a Fase 11) |
| **PA-10** 2FA replay, desafío expirado y admin sin verificar (`C-01..C-03`) | Replay TOTP -> `401 CODIGO_TOTP_REUTILIZADO`; desafío expirado -> `401 DESAFIO_EXPIRADO`; admin sin 2FA -> `403 SEGUNDO_FACTOR_REQUERIDO`; baja borra fila físicamente | `test/auth-2fa.e2e-spec.ts` y `test/concurrency/pa-acceptance-suite.e2e-spec.ts` | Aprobado |

## 4. Medidas reales de carga (`50` concurrentes, umbral `<= 5 000 ms`)

Escenario ejecutado con `test/load/load-acceptance.e2e-spec.ts`: **50 usuarios concurrentes** lanzados en paralelo (`8` peticiones por usuario = `400` peticiones HTTP totales: `150` listados de catálogo, `50` búsquedas filtradas, `100` aperturas de lección/actividad y `100` envíos/finalizaciones).

### 4.1 Contra el stack Docker Compose local (`eticore-api` + `eticore-db`, `http://127.0.0.1:3100`)

- **Duración total de la ráfaga concurrente:** `824.73 ms` (`400` peticiones, `0` errores)

| Operación | Muestras | Errores | Mín (ms) | Prom (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Umbral `REQ-NF-01` |
|---|---|---|---|---|---|---|---|---|---|
| `catalogo_listado` (`GET /api/v1/catalogo`) | 150 | 0 | 70.67 | 95.74 | 88.89 | 137.62 | 150.40 | **151.25** | `<= 5 000 ms` (Cumple) |
| `catalogo_busqueda` (`GET /api/v1/catalogo?q=...`) | 50 | 0 | 62.83 | 68.97 | 68.77 | 73.84 | 76.21 | **76.21** | `<= 5 000 ms` (Cumple) |
| `apertura_actividad` (`GET unidad` + `POST /intentos`) | 100 | 0 | 75.79 | 102.06 | 88.89 | 140.41 | 144.38 | **147.67** | `<= 5 000 ms` (Cumple) |
| `envio_finalizacion` (`PATCH /paso` + `POST /finalizar`) | 100 | 0 | 94.90 | 114.89 | 116.44 | 123.98 | 126.63 | **128.53** | `<= 5 000 ms` (Cumple) |

### 4.2 En la suite E2E automatizada (`npm run test:e2e`, PostgreSQL `18.6` efímero)

- **Duración total de la ráfaga concurrente:** `972.17 ms` (`400` peticiones, `0` errores)

| Operación | Muestras | Errores | Mín (ms) | Prom (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |
|---|---|---|---|---|---|---|---|---|
| `catalogo_listado` | 150 | 0 | 71.44 | 104.96 | 95.87 | 157.98 | 165.84 | **167.49** |
| `catalogo_busqueda` | 50 | 0 | 77.20 | 87.34 | 88.04 | 93.47 | 100.44 | **100.44** |
| `apertura_actividad` | 100 | 0 | 80.88 | 113.35 | 99.99 | 153.51 | 169.92 | **170.22** |
| `envio_finalizacion` | 100 | 0 | 122.49 | 146.81 | 147.07 | 161.96 | 162.90 | **163.08** |

## 5. Endurecimiento de seguridad verificado

1. **Rate limiting (`AuthRateLimitGuard`, `429 LIMITE_PETICIONES_AUTH` + `Retry-After`):**
   - Aplicado sobre `POST /api/v1/auth/login`, `POST /api/v1/auth/2fa/verificar`, `POST /api/v1/auth/2fa/iniciar`, `POST /api/v1/auth/2fa/confirmar` y `DELETE /api/v1/auth/2fa`.
   - Parametricado por entorno (`AUTH_RATE_LIMIT_TTL_SECONDS`, `AUTH_RATE_LIMIT_MAX_ATTEMPTS`) con cubetas combinadas por `(ruta | IP | cuenta/desafío/usuario)` y tope amplio por `(ruta | IP)`.
   - Verificado en `src/common/guards/auth-rate-limit.spec.ts` y `test/concurrency/pa-acceptance-suite.e2e-spec.ts`.
2. **Helmet y CORS estricto por entorno (`src/app.setup.ts`):**
   - Cabeceras verificadas en respuesta HTTP: `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`.
   - `CORS` valida `Origin` contra la lista configurada en `CORS_ORIGIN`, otorgando `Access-Control-Allow-Origin` solo a orígenes autorizados y denegándolo a orígenes externos.
3. **Logs JSON estructurados sin secretos ni cuerpos (`RequestLoggingInterceptor`):**
   - Verificado en `src/common/guards/auth-rate-limit.spec.ts` y directamente en stdout de `docker compose logs api`: cada evento `http_request` emite únicamente `timestamp`, `level`, `event`, `method`, `path` (sin query strings), `statusCode` y `durationMs`, omitiendo `req.body`, cookies, cabeceras de autorización, hashes y secretos.
4. **Escaneo estático de secretos hardcodeados:** `0` coincidencias en `src/`, `docker-compose.yml` y `Dockerfile`.

## 6. Pendientes explícitos (alcance de fases posteriores, `00 §10`)

- **Definición y seed de las 4 insignias (`RN-25`, Fase 10):** la tabla `insignia` permanece sin sembrar hasta que se proporcionen los códigos y criterios oficiales en los seeds de contenido; la evaluación de concesión en `AttemptsService` funciona de forma segura ante catálogo vacío.
- **Ensayo de restauración de respaldo dentro de RTO/RPO (`REQ-NF-21/23`, Fase 11):** la restauración en contenedor `db` limpio y el checklist de despliegue/proxy quedan para la fase de preparación de despliegue (`Fase 11`).
