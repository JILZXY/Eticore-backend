# Eticore — 00 · Contexto del proyecto

> **Fuente única de verdad para la base de datos:** `Reporte Técnico de la Base de Datos — Eticore`
> (01 nov 2026) + **Corrección 2026-11-10** (31 tablas). DDL vigente:
> `workspace/your_files/eticore-postgres-ddl.sql` (31 tablas, verificado
> estáticamente, **no ejecutado contra un PostgreSQL vivo**).
>
> **Este archivo es contexto para la IA del IDE, no un documento nuevo de
> requisitos.** Cuando algo aquí contradiga al reporte o al DDL, manda el
> reporte/DDL. Lo que está marcado **inferido** es una reconstrucción a
> partir de los patrones A01–A58 del reporte (§2.1); la especificación
> original es *Eticore, revisión 1.4* [S1], que no está en este paquete.
> No inventes requisitos que no estén trazados a un patrón, una RN o el DDL.

## 1. Qué es Eticore

Plataforma educativa para aprender ética y legislación en tecnologías de
la información. Un aprendiz recorre unidades educativas, responde
actividades, acumula puntos e insignias, y un instructor/administrador
consulta reportes agregados por grupo.

- **Módulos de aprendizaje:** `Aprende`, `NormaMatch`, `CasoTech`.
- **Rutas de aprendizaje:** `General` y `TI` (inicialmente; el catálogo
  admite más rutas, no están hardcodeadas).
- **Gamificación:** puntos por primera finalización + insignias.
- **Reportes:** agregados por grupo, con privacidad por celda.
- **Fase actual:** prototipo académico. **Solo cuentas y contenidos
  sintéticos (RN-30).** No hay datos reales de personas. Las tablas de
  evidencia legal y privacidad existen para una eventual puesta en marcha,
  no para operar con datos reales ahora.

## 2. Equipo y materia

| Dato | Valor |
|---|---|
| Integrantes | Gilberto Málaga Fernández (243686), Arturo Yion Jaime (243602), Jeshua Isaac Luna Zúñiga (243764) |
| Grupo | 7A |
| Materia | Ética y Legislación en Tecnologías de la Información |
| Docente | José Pablo Vázquez Cruz |
| Universidad | Universidad Politécnica de Chiapas, Suchiapa, Chiapas |

## 3. Stack decidido

| Capa | Decisión | Nota |
|---|---|---|
| Backend | **NestJS (TypeScript, monolito modular)** | Ver `01-arquitectura-nestjs.md`. El reporte original (§1.2) proponía Next.js + `pg` sin ORM; **esta capa se sustituye por NestJS**. La base de datos no cambia. |
| Lenguaje / runtime | TypeScript estricto, Node.js 24 LTS |  |
| Base de datos | **PostgreSQL 18.6, una sola instancia primaria** | Sin réplicas de lectura, sin Redis, sin segundo motor documental en v1.0. |
| Acceso a datos | **TypeORM 0.3.x + migraciones SQL** | Entidades TypeORM para el modelo; las invariantes duras viven en PostgreSQL (PK/FK/UNIQUE/CHECK/triggers) y en transacciones explícitas. `synchronize: false` siempre. |
| Auth | Sesiones opacas en servidor + Argon2id + TOTP | **No JWT.** Ver §7 y `01-arquitectura-nestjs.md`. |
| Validación | DTOs `class-validator` + JSON Schema versionado para el JSONB | El JSONB se valida por `esquema_version`, no a ciegas. |
| **Docker** | **Docker + Docker Compose como entorno estándar** (decisión del equipo, 2026-11-17) | **La misma imagen de la API corre en desarrollo, tests y despliegue.** Compose levanta `api` + `db` (PostgreSQL 18.6). La BD de producción no es otra base distinta: es la misma primaria, en contenedor o gestionada, accesible solo desde el backend. Detalle en `01 §11`. |
| Frontend | Fuera de este paquete | El backend es API REST `/api/v1` only. El frontend consume la API; nunca accede a la BD. |

**Topología con Docker:** un host / una VM con Compose: contenedor
`api` (NestJS, un proceso, puerto 3000 publicado solo tras el proxy o
en localhost en desarrollo) + contenedor `db` (`postgres:18.6`, volumen
nombrado `pgdata`, puerto 5432 **no publicado** fuera de la red interna
de Compose) + un servicio efímero `migrate` que corre las migraciones
antes de arrancar la API. Sin Redis, sin réplicas, sin segundo motor.
Los secretos llegan por `.env` / gestor de secretos, nunca dentro de
la imagen ni en el `docker-compose.yml`.

## 4. Modelo de datos en una frase

**Híbrido, un solo motor:** núcleo relacional normalizado (3FN) para
identidad, sesiones, versiones, rutas, grupos, membresías y recompensas;
**JSONB solo en dos columnas** — `version_unidad.contenido` y
`intento.recorrido` — con cota de **1 MiB** cada una.

- **31 tablas.** 28 del reporte + 3 de la corrección 2026-11-10:
  `segundo_factor`, `desafio_autenticacion`, `auditoria_bd`.
- **JSONB nunca** para historiales crecientes (intentos, sesiones,
  membresías, versiones, eventos), ni para listas que son relaciones N:M,
  ni como segunda fuente de verdad de una composición.
- **Versiones inmutables una vez publicadas.** Una unidad y una ruta
  tienen muchas versiones; el intento queda fijado a la versión exacta
  que cursó; el progreso se calcula contra la versión de ruta de su
  inscripción, no contra la actual.
- **Derivado, no almacenado:** porcentaje de ruta, saldo de puntos y
  rango se calculan a partir de los hechos (`credito_unidad`,
  `usuario_insignia`). No hay columnas de saldo/progreso que se puedan
  desincronizar.

### 4.1 Las 31 tablas, agrupadas

| Grupo | Tablas |
|---|---|
| Identidad y acceso (D1/D10) | `usuario`, `credencial`, `segundo_factor`, `sesion`, `desafio_autenticacion`, `rol`, `usuario_rol`, `guarda_integridad` |
| Catálogo y contenido (D2/D3) | `tema`, `unidad`, `version_unidad`, `revision_editorial`, `fuente`, `fuente_version`, `unidad_fuente` |
| Rutas (D2/D5) | `ruta`, `version_ruta`, `ruta_unidad`, `inscripcion_ruta` |
| Ejecución y recompensas (D4/D5/D6) | `intento`, `credito_unidad`, `insignia`, `usuario_insignia` |
| Grupos y reportes (D7/D8) | `grupo`, `membresia_grupo` |
| Evidencia y privacidad (D9) | `documento_legal`, `version_documento`, `evento_legal`, `auditoria`, `auditoria_bd`, `solicitud_privacidad` |

El grado/cardinalidad de cada relación está en
`eticore-grado-inferido.json` (p. ej. `usuario–credencial 1:1`,
`usuario–sesion 1:N`, `usuario–rol N:M` vía `usuario_rol`,
`grupo–usuario N:M temporal` vía `membresia_grupo`).

### 4.2 Los tres contenidos JSONB (por `version_unidad.tipo`)

| Tipo | `contenido` (JSONB) | `recorrido` en el intento |
|---|---|---|
| `aprende` | objetivo, secciones ordenadas, ejemplo, buenas prácticas | secciones visitadas |
| `normamatch` | situaciones, opciones, clave de asociación, explicación por situación | asociaciones `situacion_id → opcion_id` |
| `casotech` | grafo finito de etapas, alternativas con ponderación 0/1/2 y transiciones | decisiones confirmadas en orden |

Reglas comunes: claves internas únicas, referencias locales (`REF1`…)
deben existir en `unidad_fuente`, CasoTech es un DAG — toda alternativa
lleva a un terminal — y al servir una actividad **solo se proyectan
enunciados y opciones**; respuestas correctas y ponderaciones se quedan
en el servidor.

## 5. Actores y roles

Roles de aplicación (tabla `rol`, códigos fijos; la correspondencia
código → permisos vive centralizada en el backend, nunca llega del
cliente):

| Rol | Puede | No puede (por diseño) |
|---|---|---|
| **Visitante** (sin cuenta) | Ver catálogo publicado, muestras públicas, aviso de privacidad | Guardar progreso, ver borradores ni resultados |
| **APRENDIZ** | Catálogo publicado, sus actividades, su historial, sus puntos/insignias, su perfil | Modificar contenido, ver resultados ajenos |
| **ADMIN_CONTENIDO** | Temas, fuentes, borradores, revisión, publicación, reportes agregados autorizados | Asignar roles técnicos por tener rol editorial (RN-14) |
| **ADMIN_TECNICO** | Cuentas, roles, grupos, reportes, auditoría autorizada | Editar contenido sin rol editorial adicional (RN-14) |

Una cuenta puede tener varios roles y acumula solo sus permisos
explícitos. El registro público asigna `APRENDIZ`. **Ruta no es rol
(RN-08):** la ruta es clasificación educativa, no autorización.

Roles técnicos de PostgreSQL (distintos de los de aplicación, §3.1 del
reporte + corrección): `eticore_owner`, `eticore_migracion`,
`eticore_app` (conexión diaria; INSERT-only en `auditoria` y
`auditoria_bd`, **no lee `credencial` ni `segundo_factor`**),
`eticore_auth` (verifica credenciales/2FA vía función `SECURITY DEFINER`),
`eticore_reportes` (opcional), `eticore_retencion` (único que purga),
`eticore_auditoria` (solo SELECT sobre auditoría). El usuario `postgres`
existe solo para el aprovisionamiento inicial.

## 6. Flujos que definen el sistema

1. **Registro →** alta en una transacción: `usuario` + `credencial` +
   `usuario_rol(APRENDIZ)` (+ eventos legales si se habilitan). Correo
   normalizado único.
2. **Login →** contraseña (Argon2id) → si la cuenta exige 2FA, desafío
   de 5 min → código TOTP → sesión con `verificado_2fa`. Si no exige
   2FA, sesión directa con `verificado_2fa = false`.
3. **Elegir ruta →** se crea `inscripcion_ruta` contra la versión actual
   de la ruta; cambiar de ruta no migra el progreso, crea otra
   inscripción.
4. **Abrir actividad →** se fija `version_unidad` publicada y se crea
   un `intento` con UUID generado antes del primer envío (idempotencia).
5. **Ejecutar →** se guarda el avance por etapas en `recorrido`
   (revisión optimista). El cliente nunca decide la siguiente etapa
   (CasoTech) ni la puntuación.
6. **Finalizar →** una transacción: validar recorrido, calcular nota en
   servidor, marcar `finalizado`, insertar `credito_unidad` solo si es
   primera finalización, conceder insignias elegibles. Reenvío del mismo
   intento devuelve el resultado ya confirmado, no crea otro.
7. **Publicar →** borrador → revisión editorial con huella SHA-256 del
   contenido exacto → publicar (cambia estado + puntero
   `version_publicada_id` + auditoría) en una transacción. El publicado
   anterior queda intacto; crear un borrador de V4 no mueve el puntero.
8. **Reporte de grupo →** agregación SQL sobre intentos finalizados en
   `[desde, hasta)` + pertenencia temporal (`EXISTS` sobre
   `membresia_grupo`). Mejor nota por persona y versión; promedio solo
   si la celda tiene ≥ 5 participantes.

## 7. Seguridad y privacidad (resumen; detalle en `03-reglas-de-negocio.md`)

- Contraseñas 15–128 caracteres, Argon2id con sal individual; sin
  restablecimiento por correo en v1.0 (no hay tokens de recuperación).
- TOTP: secreto cifrado **AES-256-GCM, clave fuera de la BD**, nunca en
  claro ni hasheado; `confirmado_en` NULL hasta verificar el primer
  código; desactivar = borrar la fila. **Sin códigos de respaldo.**
- Sesión: token aleatorio de alta entropía, en BD solo su hash SHA-256;
  inactividad 30 min, límite absoluto 8 h; revocación inmediata.
  2FA obligatorio para `ADMIN_TECNICO` y `ADMIN_CONTENIDO`, opcional
  para aprendices.
- Minimización (RN-12): solo nombre de visualización, correo y
  credencial. No se piden nombre legal, matrícula, edad, teléfono ni
  domicilio. Sin texto libre con datos de terceros en recorridos.
- Auditoría en dos niveles: `auditoria` (acciones de aplicación, en la
  misma transacción que el cambio, append-only) y `auditoria_bd`
  (triggers en 6 tablas sensibles, append-only, retención 12 meses,
  sin secretos en el JSONB, **sin pgaudit ni logs del servidor**).
- Reportes: solo agregados; promedio suprimido si la celda tiene < 5.
  No hay ranking nominal público.

## 8. Requisitos no funcionales (los que condicionan la arquitectura)

| ID | Exigencia |
|---|---|
| REQ-NF-01 | ≤ 5 s para consulta de catálogo, apertura de lecciones y envío de actividades |
| REQ-NF-10 | Sesión: 30 min inactividad / 8 h absolutas, verificadas en servidor en cada petición |
| REQ-NF-08 | La BD solo es accesible desde el backend y canales admin autorizados; nunca desde el navegador |
| REQ-NF-21 / 23 | Respaldo diario, rotación 7 copias; RPO ≤ 24 h, RTO ≤ 4 h |
| REQ-NF-42 | Ventana 08:00–20:00 America/Mexico_City, disponibilidad mensual meta 99 % |
| Carga de aceptación | 1 000 cuentas, 300 unidades, 50 concurrentes / 30 min (60 % catálogo, 25 % envíos, 15 % búsquedas) |
| REQ-INT-02 | Timestamps en UTC (`TIMESTAMPTZ`); la interfaz formatea a America/Mexico_City |
| REQ-DB-04 | Retención: aprendizaje hasta 12 meses tras desactivación; auditoría 12 meses; sesiones solo su ventana de vigencia |

Dimensionamiento base de aceptación: 2 vCPU, 4 GB RAM, 20 GB SSD.

## 9. Fuera de alcance en v1.0 (no lo construyas)

- Restablecimiento de contraseña por correo, preguntas de seguridad.
- Códigos de respaldo de 2FA (`codigo_respaldo` no existe).
- `pgaudit`, `log_statement`, `log_connections`.
- Réplicas de lectura, Redis, segundo motor (MongoDB), sharding,
  particionado inicial, vistas materializadas.
- Alta disponibilidad / clúster. Ranking público, perfiles abiertos,
  publicidad o analítica de terceros.
- Reutilización de secciones entre unidades, edición concurrente por
  elemento dentro del JSONB, consultas frecuentes por pregunta
  individual (si aparecen, ese subconjunto se normaliza; no se anticipa).
- Datos reales de personas (RN-30). Todo lo legal/privacidad es diseño
  preparatorio con datos sintéticos.

## 10. Decisiones abiertas / por confirmar

1. **Alcance de 2FA** — obligatorio admins / opcional aprendices
   (aprobado 2026-11-10). Falta confirmar el flujo de restablecimiento
   de 2FA por admin (código `restablecimiento_segundo_factor_por_admin`
   ya existe en auditoría).
2. **Hash encadenado en `auditoria_bd`** — decisión diferida; hoy sin
   hash encadenado.
3. **Las 4 insignias iniciales (RN-25)** — sus códigos/criterios exactos
   no están en el reporte ni en el DDL (el DDL deja el seed comentado).
   No inventar códigos: pedirlos o definirlos con el equipo antes de
   sembrar `insignia`.
4. **Proveedor de hosting** — abierto. La topología (un backend + una
   primaria) no depende de él. **Docker sí está decidido:** el
   despliegue usa la imagen de la API + Compose (o el orquestador
   equivalente del proveedor), no una instalación manual de Node en el
   host. Lo que falta por confirmar es solo dónde corre ese Compose
   (VM propia, VPS, etc.), no si se usa Docker.
5. **REQ-F-09, F-55, F-61 y otros no citados** en los patrones A01–A58
   — no están en este paquete; verificar en la especificación rev 1.4
   antes de implementarlos.

## 11. Cómo usar estos archivos en el IDE

1. Copia esta carpeta (`eticore-nestjs/`) a la raíz del repo del backend
   (o referénciala como contexto).
2. Orden de lectura para la IA: `00` → `01` → `02` → `03` →
   `eticore-grado-inferido.json` (+ el DDL `eticore-postgres-ddl.sql`).
3. Regla de oro: **si el código contradice a `03-reglas-de-negocio.md`
   o al DDL, está mal el código, no la regla.** Las RN-06, RN-07, RN-26
   y RN-29 dependen de garantías de BD + transacción, no de un
   `SELECT` previo ni de buena voluntad del cliente.
4. No generes migraciones con `synchronize: true`. La migración base
   es el DDL vigente (31 tablas); los cambios van en migraciones nuevas.
