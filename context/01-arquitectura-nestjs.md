# Eticore — 01 · Arquitectura a seguir (NestJS)

> Lee antes `00-contexto-proyecto.md`. Esta arquitectura **sustituye
> solo la capa de aplicación del reporte** (Next.js 16 + `pg` sin ORM,
> §1.2): el modelo de datos, las RN y los patrones A01–A58 no cambian.
> Si una decisión de aquí choca con el reporte o el DDL, manda el
> reporte/DDL y anota la divergencia en `00 §10`.

## 1. Decisión arquitectónica

**Monolito modular en NestJS, una sola base PostgreSQL 18.6, API REST,
todo en Docker (decisión del equipo, 2026-11-17).**

Docker no es un extra de despliegue: es el entorno estándar. La misma
imagen de la API que se prueba en local es la que se despliega; la BD
local de desarrollo/tests es el mismo `postgres:18.6` que la primaria
de despliegue (con datos distintos, nunca los mismos). Ver §11.

| Alternativa | Veredicto | Motivo (contra el reporte) |
|---|---|---|
| Monolito modular NestJS | **Elegida** | Carga de aceptación pequeña (50 concurrentes), un solo equipo, todas las invariantes críticas son transacciones en una sola BD. Los módulos son la frontera; extraer un servicio después es posible sin reescribir el dominio. |
| Microservicios | Rechazada | `finalizar_intento` (intento + crédito + insignias) y `publicar_version` exigen atomicidad en una transacción. Partirlos en servicios introduce 2PC/sagas y estados divergentes sin beneficio medible. |
| Next.js full-stack (reporte §1.2) | Sustituida | El usuario pidió NestJS. El frontend queda como cliente aparte; el backend deja de ser SSR y pasa a ser API pura. |
| Serverless / funciones | Rechazada | Sesiones en servidor, locks transaccionales y pool de conexiones no encajan; la ventana de servicio es fija (08:00–20:00). |

**Principios que no se negocian:**

1. La BD es la última defensa: PK/FK/UNIQUE/CHECK/triggers del DDL.
   El backend no sustituye esas garantías con un `SELECT` previo.
2. El cliente nunca es autoridad: ni puntuación, ni siguiente etapa de
   CasoTech, ni roles, ni versión publicada. Todo se recalcula/valida
   en servidor.
3. Sin lógica de negocio en controladores; sin SQL en controladores;
   sin secretos, hashes ni tokens en logs, respuestas ni auditoría.
4. Todo cambio de estado relevante es transaccional y auditado en la
   misma transacción (`auditoria`); lo de BD lo auditan los triggers
   (`auditoria_bd`).
5. Proyección mínima: cada endpoint devuelve solo los campos que su
   vista necesita. Nunca `credencial`, `segundo_factor.secreto_cifrado`,
   `sesion.token_hash`, `desafio_autenticacion.token_hash`, respuestas
   correctas ni ponderaciones.

## 2. Stack y por qué

| Pieza | Elección | Justificación |
|---|---|---|
| Framework | NestJS 11, TypeScript `strict` | DI, guards, interceptors y módulos por contexto acotado; encaja con los perfiles D1–D10 del reporte. |
| ORM | **TypeORM 0.3.x** (`pg`) | Nativo en NestJS; soporta PK compuestas, FK compuestas, JSONB, índices parciales y migraciones SQL. Prisma se descarta: las FK compuestas (`version_unidad(id, unidad_id)`, `intento(id, usuario_id, unidad_id)`), el índice único parcial de membresía abierta y las funciones `SECURITY DEFINER` + triggers son incómodos o imposibles de expresar bien en su esquema. `pg` directo se descarta: se pierde el modelo de entidades y la validación se dispersa. |
| Migraciones | TypeORM migrations, SQL explícito | Migración base = DDL vigente de 31 tablas (`eticore-postgres-ddl.sql`). Cambios posteriores = migraciones nuevas numeradas. **`synchronize: false` en todos los entornos.** |
| Validación de entrada | `class-validator` + `class-transformer` (DTOs) y **JSON Schema (Ajv) para el JSONB** | El JSONB cambia por módulo y por `esquema_version`; un DTO plano no basta. Un esquema por `(tipo, esquema_version)`. |
| Auth | Sesiones opacas + `argon2` + `otpauth` (TOTP) | Ver §5. |
| Config | `@nestjs/config` + validación de env con `zod`/`joi` | Sin secretos en código. La clave AES-256-GCM del TOTP y las credenciales de BD llegan por entorno/gestor de secretos. |
| HTTP | REST versionada `/api/v1`, Helmet, CORS restringido, `Throttler` | Ver §7. |
| **Docker** | **`Dockerfile` multistage (Node 24) + `docker-compose.yml` (`api` + `db` + `migrate` efímero)** | Entorno estándar reproducible (ver §11). La imagen de producción no lleva código fuente, ni `node_modules` de desarrollo, ni secretos, ni el DDL como script de arranque. |
| Tests | Jest (unit) + Testcontainers / `docker compose` con Postgres 18.6 (integración y concurrencia) | Los tests de concurrencia del reporte §4.4 son obligatorios, no opcionales. Los tests de integración levantan su propia BD en contenedor, nunca la BD de desarrollo. |

Versiones a fijar en `package.json` y a documentar en la matriz de
aceptación (como hace el reporte con Node 24.21.0 / Next 16.3.7): Node
24 LTS, NestJS 11.x, TypeORM 0.3.x, `pg` 8.x.

## 3. Estructura de carpetas

```text
Dockerfile                   # multistage: build (Node 24) -> runtime (Node 24 slim, usuario no-root)
docker-compose.yml           # api + db (postgres:18.6) + migrate (perfil efímero, ver §11)
docker-compose.override.yml  # solo desarrollo local (puertos, volúmenes de código); NO se usa en despliegue
.dockerignore                # node_modules, dist, .env, .git, coverage, *.md de trabajo
.env.example                 # variables con valores de ejemplo SOLO para desarrollo local, sin secretos reales
src/
  main.ts                    # bootstrap: ValidationPipe global, helmet, CORS, cookie-parser
  app.module.ts
  config/
    configuration.ts         # env validado: DATABASE_URL, AUTH_DATABASE_URL, TOTP_KEY, SESSION_*
    database.config.ts
  common/
    decorators/              # @CurrentUser(), @Roles(), @Public()
    guards/                  # SessionAuthGuard, RolesGuard, OwnershipGuard
    interceptors/            # AuditInterceptor, ResponseInterceptor
    filters/                 # HttpExceptionFilter (formato de error único)
    pipes/                   # ParseUUIDPipe, etc.
    utils/                   # normalizacion-correo, paginacion-cursor, hashing
    errors/                  # DomainError, codigos de error estables
  database/
    database.module.ts       # DataSource eticore_app (pool limitado)
    auth-database.module.ts  # DataSource eticore_auth (solo verifica credenciales/2FA)
    migrations/              # 001-baseline-31-tablas.ts (= DDL vigente), 002-*.ts, ...
    entities/                # 31 entidades TypeORM (una por tabla, nombres = tablas)
    seeds/                   # roles (3 códigos) + guarda_integridad; insignias SOLO cuando el equipo defina códigos/criterios
  shared/
    audit/                   # AuditService: insert en `auditoria` dentro de la tx que recibe
    validation/
      schemas/               # aprende.v1.json, normamatch.v1.json, casotech.v1.json, recorrido.v1.json
      content-validator.service.ts   # valida contenido por (tipo, esquema_version), claves únicas, REF locales, DAG CasoTech
      scoring.service.ts     # fórmulas RN-21/RN-22, sin aceptar notas del cliente
  modules/
    auth/                    # login, logout, 2FA (setup/verify/disable), desafio, sesiones
    users/                   # registro, perfil propio, admin de cuentas
    roles/                   # catálogo de roles y asignación (ADMIN_TECNICO)
    catalog/                 # temas, unidades, versiones, fuentes, revision_editorial, publicación
    routes/                  # rutas, versiones de ruta, inscripciones, progreso
    attempts/                # intentos: crear, guardar paso, reanudar, finalizar, historial
    gamification/            # puntos, rango, insignias (lectura + concesión interna)
    groups/                  # grupos, membresías
    reports/                 # reporte agregado de grupo (A50)
    legal/                   # documentos legales, eventos, solicitudes de privacidad
    admin/                   # auditoría (lectura), cuentas, guardas de último técnico
test/
  unit/  integration/  concurrency/   # §4.4 del reporte como casos de test
```

**Regla de dependencias entre módulos** (ningún módulo importa
controladores de otro; solo servicios exportados):

```text
attempts → catalog (versión publicada) + gamification (concesión) + shared/scoring
routes   → catalog + attempts (créditos, solo lectura)
reports  → groups + attempts (solo lectura, SQL agregado)
auth     → users (lectura mínima) + database/auth-database
admin    → users + roles + groups + shared/audit
catalog  → shared/validation
todos    → shared/audit, common/guards
```

Si un servicio necesita escribir en tablas de otro módulo, lo hace a
través del servicio de ese módulo dentro de la misma transacción
(`QueryRunner` compartido), nunca con un repositorio ajeno directo.

## 4. Capas dentro de cada módulo

```text
Controller  →  Service (aplicación/orquestación)  →  Domain policy/service
     │                  │                                   │
     │ DTO in/out       │ transacción, locks,               │ reglas puras
     │ Guards           │ idempotencia, auditoría           │ (p. ej. elegibilidad de insignia)
     │ (auth/roles)     │                                   │
     └──────────────────┴── Repository (TypeORM) ──────────┘
                              ↓ SQL / QueryBuilder, solo aquí
```

- **Controller:** routing, DTOs, guards, códigos HTTP. Nada de
  `if` de negocio.
- **Service:** caso de uso completo: abre la transacción, bloquea lo
  que el protocolo exige (§6), llama a repositorios y políticas,
  inserta auditoría, hace commit y solo después devuelve la respuesta
  confirmada.
- **Repository:** TypeORM `Repository`/`EntityManager` del
  `QueryRunner`. Consultas con `QueryBuilder` o SQL parametrizado
  cuando el agregado lo exige (reporte A50). Paginación por cursor y
  proyección explícita (`select`) en listados.
- **Entidades:** 1:1 con las tablas del DDL (mismos nombres, mismos
  tipos, `jsonb` para `contenido`/`recorrido`). Los CHECK/UNIQUE/FK no
  se “reimplementan” en TypeORM si ya están en la migración base; las
  entidades los reflejan, no los sustituyen. Los índices parciales
  (`uq_membresia_grupo_abierta`) y los triggers van en migraciones SQL.

## 5. Autenticación y sesiones (el módulo más delicado)

**No JWT.** Sesión opaca en servidor, como exige el reporte
(REQ-NF-10, RN-17). Motivo: revocación inmediata, `verificado_2fa`
por sesión y ventanas de inactividad/absoluta no se pueden revocar
de forma fiable con un token autocontenido.

### 5.1 Flujo

```text
POST /api/v1/auth/login { correo, contrasena }
  → normalizar correo (lowercase, trim) → verificar vía eticore_auth
    (función SECURITY DEFINER; eticore_app NUNCA hace SELECT a
     credencial/segundo_factor)
  → contraseña incorrecta: 401 genérico (sin distinguir usuario/contraseña),
    registrar intento fallido por canal separado del rollback
  → si la cuenta NO exige 2FA: crear sesion (verificado_2fa=false)
  → si exige 2FA: crear desafio_autenticacion (token hash SHA-256,
    expira_en = +5 min, intentos=0) y responder 202 { desafio_id,
    requiere_2fa: true } — SIN crear sesión todavía

POST /api/v1/auth/2fa/verificar { desafio_id, codigo_totp }
  → desafío vigente y con intentos restantes; verificar TOTP contra el
    secreto descifrado (AES-256-GCM, clave fuera de BD)
  → anti-replay: rechazar si paso_totp <= ultimo_paso_totp; al aceptar,
    actualizar ultimo_paso_totp
  → fallido: intentos+1, auditar `autenticacion_segundo_factor_fallido`;
    agotar intentos = desafío inválido (+ bloqueo temporal, ver §5.3)
  → éxito: borrar/consumir desafío, crear sesion (verificado_2fa=true)

Cookie de sesión: HttpOnly, Secure, SameSite=Lax, Path=/api,
  Max-Age = min(8 h, restante). El valor es un token aleatorio de
  32 bytes; en BD solo su hash SHA-256 (token_hash, PK de sesion).

Cada petición autenticada (SessionAuthGuard):
  usuario.activo AND sesion no revocada
  AND ultima_actividad dentro de 30 min AND creada_en dentro de 8 h
  AND (si el usuario tiene rol admin: sesion.verificado_2fa = true)
  → actualizar ultima_actividad (sin extender expira_en)
  Si expira: 401 + limpieza diferida por tarea programada (la purga
  no es el mecanismo de autorización).
```

### 5.2 2FA — alta, verificación y baja

- `POST /auth/2fa/iniciar` (autenticado): genera secreto, lo cifra
  AES-256-GCM, crea `segundo_factor` con `confirmado_en = NULL`,
  devuelve QR/URI **una sola vez**. Hasta verificar el primer código,
  el 2FA no se considera activo.
- `POST /auth/2fa/confirmar { codigo }`: verifica el primer código →
  `confirmado_en = now()`, audita `segundo_factor_activado`.
- `DELETE /auth/2fa` (autenticado + contraseña): **borra la fila**,
  audita `segundo_factor_desactivado`. No hay “desactivado lógico”.
- Restablecimiento por admin: flujo aparte, audita
  `restablecimiento_segundo_factor_por_admin` (por confirmar, `00 §10`).
- **Sin códigos de respaldo.** No crear tabla/columna para ellos.

### 5.3 Endurecimiento

- Argon2id con parámetros OWASP vigentes, sal individual (librería
  `argon2` mantenida). Contraseña 15–128 caracteres, admite espacios;
  rechazar contraseñas comunes (lista en backend, RN-19).
- Rate limiting por IP + cuenta en login/2FA; bloqueo temporal tras
  N fallos (`cuenta_bloqueada_2fa` en auditoría). Respuestas de error
  genéricas en auth.
- `POST /auth/logout`: revoca la sesión actual (`revocada_en = now()`).
  Desactivar una cuenta revoca todas sus sesiones en la misma
  transacción (A41).
- Rotación de secretos: la clave AES-256-GCM vive fuera de la BD y
  tiene rotación definida en despliegue; el procedimiento de rotación
  (re-cifrar secretos) es una migración de datos, no un cambio de
  código en caliente.

### 5.4 Autorización

`SessionAuthGuard` → `RolesGuard` (`@Roles('ADMIN_TECNICO', …)`) →
`OwnershipGuard` (el `usuario_id` del recurso es el de la sesión, o
el rol lo permite). Los permisos se resuelven desde `usuario_rol` en
cada petición (sin caché de permisos; RN-01). El frontend puede ocultar
botones, pero el backend vuelve a validar siempre.

## 6. Transacciones y concurrencia (protocolos del reporte §2.6)

Todas con `QueryRunner` + `READ COMMITTED` + bloqueos explícitos,
mismo orden de bloqueos en todos los escritores, reintento idempotente
ante conflictos transitorios. **Nunca `MAX(numero)+1` sin bloqueo.**

| Operación | Protocolo |
|---|---|
| **Finalizar intento** (A13/A15/A21) | Tx: bloquear fila `usuario` (serializa concesiones de esa cuenta) → bloquear `intento` → verificar propietario, versión y estado. Si `finalizado`, devolver el resultado existente (idempotente). Si `en_curso`: validar recorrido contra la versión fijada, calcular nota en servidor, `UPDATE … WHERE estado='en_curso' AND revision=:esperada`, insertar `credito_unidad` (PK impide duplicado) si es primera finalización, conceder insignias elegibles (PK impide duplicado). Auditoría en la misma tx. Responder después del commit. |
| **Nueva ejecución** (A14/A17/A24) | El cliente envía (o recibe antes) el UUID del intento; reenviar el inicio reutiliza el mismo `id`. Para el ordinal: bloquear `usuario`, calcular siguiente `numero`, insertar con UNIQUE. Escrituras por etapa con `revision` esperada. |
| **Guardar paso no terminal** (A11/A18) | `UPDATE intento SET recorrido=…, revision=revision+1 WHERE id=:id AND revision=:esperada`. Si 0 filas: 409 (revisión desactualizada) — el cliente re-lee y reintenta, no sobrescribe. |
| **Publicar versión** (A36) | Tx: bloquear `version_unidad` → verificar huella SHA-256 de `revision_editorial` aprobada contra contenido+metadatos+referencias actuales → `estado='publicado'`, `publicada_en`, mover puntero (`unidad.version_publicada_id` / `ruta.version_actual_id`), auditoría. Si la versión cambió tras la aprobación, rechazar. Crear borrador (A35) no mueve el puntero. |
| **Membresía** (A48/A49) | Tx: bloquear fila `grupo` → comprobar solapamiento de intervalos `[ingreso, salida)` para esa pareja → insertar/cerrar. El índice único parcial cubre solo el caso abierto; el solapamiento histórico lo comprueba el servicio. |
| **Último técnico activo** (A41/A43, RN-29) | Tx: `SELECT … FOR UPDATE` sobre `guarda_integridad` (`clave='admin_tecnico_activo'`) **antes** de contar técnicos activos y de modificar. Sin esta guarda, dos bajas simultáneas pueden dejar cero técnicos. |
| **Asignar/retirar rol** (A43) | Misma guarda si afecta a `ADMIN_TECNICO`; auditoría en la misma tx; historial en `auditoria`, no borrado de `usuario_rol` sin rastro. |
| **Registro** (A01) | Una tx: `usuario` + `credencial` + `usuario_rol(APRENDIZ)` (+ eventos legales). Sin tx, una cuenta sin credencial o sin rol es un estado parcial prohibido. |

**Idempotencia:** `intento.id` (UUID), `evento_legal.clave_operacion`
(UNIQUE por usuario) y, para `finalizar`, el propio estado
`finalizado` + `revision`. Si se añade `Idempotency-Key` en POST de
finalización, persistirlo y devolver la respuesta almacenada ante
reenvío; no es sustituto de los mecanismos anteriores.

## 7. API REST

Base `/api/v1`. JSON. Timestamps ISO 8601 UTC. Paginación por cursor
(`?cursor=…&limit=…`, por defecto 20, máx 100) en historial, cuentas,
integrantes y auditoría. Errores con formato único:

```json
{ "error": { "codigo": "INTENTO_YA_FINALIZADO", "mensaje": "…", "detalles": {} } }
```

Códigos HTTP: 200 lectura, 201 creación, 204 logout, 400 validación,
401 sesión inválida/expirada, 403 sin permiso / sin 2FA verificado,
404 recurso inexistente o no autorizado a verlo (no distinguir),
409 conflicto de revisión/estado/duplicado, 422 regla de negocio
(p. ej. publicar sin revisión aprobada), 429 rate limit.

| Recurso | Endpoints principales | Módulo |
|---|---|---|
| Auth | `POST /auth/registro`, `POST /auth/login`, `POST /auth/2fa/verificar`, `POST /auth/logout`, `POST /auth/2fa/iniciar|confirmar`, `DELETE /auth/2fa` | auth |
| Perfil | `GET/PATCH /usuarios/me` (nombre, `ruta_preferida_id`; correo no editable en autoservicio) | users |
| Catálogo | `GET /catalogo` (filtros tema/dificultad/ruta/avance, búsqueda F-51), `GET /catalogo/unidades/:id`, `GET /catalogo/unidades/:id/muestra` (público, solo `muestra_publica`) | catalog |
| Actividades | `POST /intentos` (con UUID), `GET /intentos/:id`, `PATCH /intentos/:id/paso`, `POST /intentos/:id/finalizar`, `GET /intentos/me/historial`, `GET /intentos/:id/resultado` | attempts |
| Rutas | `GET /rutas`, `POST /rutas/:id/elegir`, `GET /rutas/me/progreso`, `POST /rutas/me/cambiar` | routes |
| Gamificación | `GET /gamificacion/me/puntos`, `GET /gamificacion/me/insignias`, `GET /gamificacion/me/rango` | gamification |
| Grupos | `POST /grupos`, `GET /grupos`, `GET /grupos/:id/integrantes`, `POST /grupos/:id/integrantes`, `PATCH /grupos/:id/integrantes/:usuarioId/retirar` | groups |
| Reportes | `GET /reportes/grupos/:id?desde&hasta` (agregado A50) | reports |
| Editorial | `POST /editorial/unidades`, `POST /editorial/versiones`, `POST /editorial/versiones/:id/revisiones`, `POST /editorial/versiones/:id/publicar`, `PATCH /editorial/unidades/:id/desactivar` | catalog |
| Admin | `GET /admin/cuentas`, `PATCH /admin/cuentas/:id/activar|desactivar`, `POST /admin/roles/asignar|retirar`, `GET /admin/auditoria` | admin |
| Legal | `GET /legal/aviso`, `POST /legal/eventos`, `GET /legal/mis-eventos`, `POST /legal/solicitudes` | legal |

**Proyección por endpoint (obligatoria):** al abrir una actividad se
devuelve la versión **sin** respuestas correctas ni ponderaciones; al
consultar retroalimentación se devuelve la explicación de la versión
fijada del intento, no la actual; el historial lista cabeceras sin
`recorrido`; el reporte devuelve solo agregados, nunca filas de
elegibles ni respuestas.

## 8. Validación del contenido JSONB

`ContentValidatorService` (en `shared/validation`):

- Un esquema JSON por `(tipo, esquema_version)`; `esquema_version`
  desconocida = rechazo.
- Aprende: secciones con orden único, objetivo y ejemplo presentes.
- NormaMatch: situaciones con `id` único, opciones con `id` único por
  situación, `respuesta_correcta` existe, **cada situación tiene
  explicación** (RN-15).
- CasoTech: grafo acíclico, toda alternativa llega a un terminal,
  ponderaciones solo 0/1/2, transiciones a etapas de la misma versión.
- Toda `referencia_local` del contenido existe en `unidad_fuente`
  para esa versión; toda `unidad_fuente` corresponde a una
  `fuente_version` existente.
- Tamaño ≤ 1 MiB por documento; si se supera, 422 antes de tocar la BD.
- La validación corre **antes de publicar** (y al guardar borrador,
  como advertencia o error según el equipo decida; publicar sin
  validar está prohibido).

**Puntuación (servidor, nunca del cliente):**

- Aprende: sin nota (`puntuacion = NULL`); completar = visitar todas
  las secciones de la versión + confirmación explícita (RN-20).
- NormaMatch: `100 × aciertos / total`, `total > 0` (RN-21).
- CasoTech: `100 × suma_ponderaciones / (2 × decisiones)`, mínimo
  1 decisión, ruta válida hasta terminal (RN-22).
- Completar acredita avance aunque la nota sea < 80 (RN-04); el
  umbral 80 es de dominio, no de finalización.

## 9. Reporte de grupo (A50) — SQL, no bucles en JS

Una sola consulta con CTEs (`elegibles → mejores → promedios →
conteos`), como en el reporte §4.2. Claves:

- Periodo `[desde, hasta)` sobre `intento.finalizacion`; pertenencia
  con `EXISTS (membresia_grupo … ingreso <= finalizacion AND
  (salida IS NULL OR finalizacion < salida))` — así un reingreso no
  duplica el intento.
- Mejor nota por `(usuario, version_id)`; promedio por versión solo si
  `COUNT(*) >= 5`, si no `NULL` (celda suprimida, RN-13). Aprende:
  promedio `No aplica`, conteos sí se muestran.
- Filtros opcionales (actividad, ruta) se aplican al conjunto
  elegible **antes** de agrupar; el umbral de 5 se evalúa después de
  filtrar, por celda.
- Índices: `intento(usuario_id, finalizacion DESC, id DESC)` para
  historial; `intento(finalizacion, version_id, usuario_id)` para el
  reporte si la medición lo justifica. No crear índices por costumbre.

## 10. Auditoría, retención y tareas programadas

- `AuditService.audit(em, { actorId, accion, recursoTipo, recursoId,
  resultado, correlacion, detalleMinimo })`: `INSERT` en `auditoria`
  dentro de la transacción que recibe. `auditoria` es append-only
  para `eticore_app` (sin UPDATE/DELETE). Los rechazos de auth se
  registran por canal separado (no se pierden con el rollback).
- `auditoria_bd` la llenan los triggers de BD (6 tablas); el backend
  **no escribe** en ella y **no la audita a sí misma**. Lectura solo
  vía `eticore_auditoria` / endpoint admin restringido.
- Tareas (`@nestjs/schedule`, fuera del request): purgar sesiones
  expiradas y desafíos vencidos; purgar `auditoria_bd` > 12 meses
  **solo con el rol `eticore_retencion`** (no con la conexión de la
  app); recordar que la purga no sustituye a la verificación de
  sesión en cada petición.
- Retención de aprendizaje: 12 meses tras desactivación (REQ-DB-04);
  la supresión es un flujo explícito (seudonimización + `SET NULL` en
  auditoría), nunca `CASCADE` silencioso sobre evidencia.

## 11. Configuración, despliegue y observabilidad

```text
# .env (ejemplo; nunca en el repo)
DATABASE_URL=postgres://eticore_app:***@host:5432/eticore
AUTH_DATABASE_URL=postgres://eticore_auth:***@host:5432/eticore
TOTP_ENCRYPTION_KEY=<32 bytes, gestor de secretos>
SESSION_COOKIE_SECURE=true
CORS_ORIGIN=https://<frontend>
```

- Un proceso Node + pool limitado (no 50 conexiones por instancia;
  dimensionar por procesos totales). Sin Redis ni réplicas en v1.0.
### 11.1 Docker — entorno estándar (no opcional)

**Servicios de `docker-compose.yml`:**

| Servicio | Imagen / build | Responsabilidad |
|---|---|---|
| `api` | Imagen del `Dockerfile` (misma en dev, tests y despliegue) | NestJS, un proceso, puerto 3000. `depends_on: db: condition: service_healthy`. `restart: unless-stopped`. Límites de recursos acordes al dimensionamiento (2 vCPU / 4 GB en aceptación). |
| `db` | `postgres:18.6` (pinneado, nunca `latest`) | Única primaria. Volumen nombrado `pgdata` (los datos sobreviven a `down` sin `-v`). `healthcheck: pg_isready`. Puerto 5432 **no publicado** al host en despliegue; en desarrollo solo en localhost vía `docker-compose.override.yml`. |
| `migrate` | Misma imagen que `api`, perfil efímero (`profiles: ["migrate"]`) | Corre `npm run migration:run` (migración base de 31 tablas + siguientes) y termina. Se ejecuta **antes** de arrancar `api`. La API nunca corre migraciones al arrancar: con dos instancias, dos procesos migrando a la vez es una carrera. |
| `db-test` *(solo tests)* | `postgres:18.6`, perfil `test` o Testcontainers | BD desechable para integración/concurrencia. Se crea vacía, se migran las 31 tablas, se corre el test, se destruye. Nunca apunta a `db` de desarrollo. |

**Comandos canónicos (los que la IA del IDE debe usar):**

```bash
docker compose up --build -d          # dev: levanta db + api
docker compose run --rm migrate       # migraciones (antes del primer arranque y tras cada cambio)
docker compose logs -f api            # ver logs de la API
docker compose down                   # parar sin borrar datos (pgdata persiste)
docker compose down -v                # SOLO para resetear el entorno local de desarrollo
```

**Reglas de Docker que no se negocian:**

1. **Una sola imagen de API para todos los entornos.** Lo que cambia
   entre dev y despliegue es el `.env` y el Compose override, nunca
   el `Dockerfile` ni el código.
2. **Sin secretos en la imagen ni en el Compose.** `.env` no se copia
   al build (`.dockerignore`), no se commitea (`.gitignore`) y no se
   escribe en `docker-compose.yml`. En despliegue, los secretos llegan
   por `env_file` / gestor de secretos del host. La clave TOTP y las
   contraseñas de `eticore_app` / `eticore_auth` nunca van en una
   imagen publicada.
3. **La BD no se expone.** Dentro de Compose, `api` habla a `db` por
   el nombre del servicio (`db:5432`) en la red interna. El puerto
   5432 no se publica en despliegue. El acceso administrativo a la BD
   es por `docker compose exec db psql` (o canal admin autorizado),
   nunca desde el navegador ni desde el frontend.
4. **Roles de BD se aprovisionan fuera de la app.** `eticore_app`,
   `eticore_auth`, `eticore_retencion`, `eticore_auditoria` y
   `eticore_migracion` los crea el aprovisionamiento inicial (usuario
   `postgres`, script aparte, una sola vez), no el contenedor `api`
   ni el `migrate`. La app corre siempre con `eticore_app`, nunca con
   superusuario.
5. **Datos en volumen, no en la imagen ni en un bind de código.**
   `pgdata` es un volumen nombrado. Los respaldos se sacan del
   volumen (`pg_dump` desde un contenedor efímero contra `db`, o
   copia del volumen con la BD parada), se cifran y se guardan fuera
   del host con rotación de 7 días (REQ-NF-21/23).
6. **TLS backend→BD:** si el tráfico sale del host / cruza la red
   (BD gestionada), TLS verificado. Dentro de la red interna de
   Compose en un solo host, el tráfico no sale del host; documentar
   esa decisión en la matriz de aceptación en vez de asumirla.
7. **Healthchecks y arranque ordenado:** `db` con `pg_isready`,
   `api` con `GET /health` (sin auth). `api` depende de `db` sano
   **y** de que `migrate` haya terminado con éxito. Un `up` que
   arranca la API contra una BD sin migrar es un fallo de despliegue,
   no un error de la app.
8. **Las tareas programadas (`@nestjs/schedule`, §10) corren en el
   contenedor `api`.** No crear un contenedor aparte para purgar
   sesiones: con una sola instancia de API no hay duplicidad. Si
   algún día hay 2 instancias de API, las purgas deben ser
   idempotentes o con lock (revisar entonces; hoy, una instancia).
9. **Tags y reproducibilidad:** pinnear `postgres:18.6` y
   `node:24.x` exactos; nunca `latest`. La versión exacta de
   PostgreSQL y de Node se documenta en la matriz de aceptación,
   como hace el reporte.
- TLS: HTTPS navegador→backend y TLS verificado backend→BD
  (validar certificado y hostname, sin desactivar la verificación).
- Logs estructurados (JSON), sin cuerpos de petición, sin tokens, sin
  SQL con parámetros sensibles. Métricas mínimas: latencia por
  endpoint, errores 5xx, pool de BD, duración de transacciones de
  finalización/publicación. En Docker, los logs salen por stdout/stderr
  (nada de archivos de log dentro del contenedor).
- Respaldos: diarios, volumen independiente, rotación 7 días; ensayo
  de restauración (RTO ≤ 4 h, RPO ≤ 24 h) antes de aceptar el entorno.
  El ensayo se hace restaurando el respaldo en un contenedor `db`
  limpio, no sobre la BD en uso.

## 12. Testing — lo que hay que probar antes de dar por hecho nada

Mínimo exigible (reporte §4.4, criterios PA-01–PA-16):

1. Dos registros con el mismo correo (mayúsculas/espacios) → una cuenta.
2. 20 reenvíos concurrentes de una finalización → 1 resultado,
   1 crédito, ≤ 1 concesión por insignia.
3. Nueva versión con intento abierto → el intento conserva versión y
   explicación originales.
4. Dos técnicos piden su baja a la vez → se acepta una, se rechaza la
   otra; queda 1 técnico activo.
5. Retiro, reingreso y solapamiento → reingreso válido, solapamiento
   rechazado, sin doble conteo en reportes.
6. Edición tras aprobar y antes de publicar → aprobación rechazada
   (huella desactualizada).
7. Reporte con 4 y con 5 participantes → promedio oculto con 4,
   visible con 5; versiones separadas.
8. Ruta vacía y unidad retirada → “Sin actividades”, crédito previo
   conservado (no 100 % falso).
9. Carga de aceptación (50 concurrentes) + restauración de respaldo
   dentro de RTO/RPO y ≤ 5 s (REQ-NF-01).
10. 2FA: código reutilizado (replay) rechazado; desafío expirado
    rechazado; sesión de admin sin `verificado_2fa` rechazada.

## 13. Orden de construcción sugerido

0. Docker primero: `Dockerfile` + `docker-compose.yml` (`api` + `db` +
   `migrate`) + `.dockerignore` + `.env.example`. Verificar
   `docker compose up --build` levanta la API contra una BD vacía
   antes de escribir el primer módulo: si el entorno no es
   reproducible, todo lo demás se construye sobre arena.
1. Migración base (DDL 31 tablas) + entidades + seeds de roles.
2. `auth` (registro/login/sesión) + `users` — sin 2FA todavía.
3. `catalog` (lectura pública + borradores) + validador JSONB.
4. `attempts` (crear/guardar paso/finalizar) + `gamification`.
5. `routes` + progreso derivado.
6. 2FA completo (desafío/TOTP/sesión verificada) + endurecimiento.
7. `groups` + `reports` (A50).
8. Editorial: revisión + publicación con huella.
9. `admin` + `legal` + auditoría de lectura.
10. Tests de concurrencia (§12) + carga + ensayo de restauración.

## 14. Antipatrones prohibidos en este proyecto

- `synchronize: true`, o migraciones generadas sin revisar.
- Guardar saldo, porcentaje o rango en columnas.
- Leer `credencial`/`segundo_factor` con la conexión de la app.
- Devolver el contenido JSONB completo al abrir una actividad
  (incluye respuestas correctas).
- Calcular la nota en el frontend o aceptar `puntuacion` del cliente.
- `MAX(numero)+1`, conteos sin bloqueo, o `SELECT` previo como única
  defensa contra duplicados.
- Embebeder historiales en arrays JSONB, o duplicar la composición de
  ruta en una lista dentro de `ruta`.
- Caché de permisos o de resultados confirmados.
- Borrar con `CASCADE` evidencia, intentos o auditoría desde una
  operación ordinaria.
- En Docker: publicar el puerto 5432, guardar datos en la imagen o en
  un bind de código, meter secretos en el `Dockerfile` o en
  `docker-compose.yml`, usar `latest`, correr migraciones desde la API
  al arrancar, o usar `docker compose down -v` fuera del desarrollo
  local (borra los datos).
