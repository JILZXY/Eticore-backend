# Eticore — 02 · Requisitos funcionales

> **Advertencia de trazabilidad.** El reporte cita los IDs REQ-F-01 a
> REQ-F-75 y los patrones A01–A58, pero **no reproduce el texto
> completo de la especificación rev 1.4 [S1]**. La redacción de abajo es
> una **reconstrucción inferida** a partir de los patrones A01–A58
> (§2.1 del reporte), las RN (§2.6) y el DDL. Cada requisito indica su
> patrón y sus tablas. Si la especificación rev 1.4 dice otra cosa,
> manda ella.
>
> IDs **no citados en ningún patrón del reporte**: F-09, F-55, F-61.
> No se inventa su contenido: aparecen como `— no citado —` y deben
> verificarse en [S1] antes de implementarse.

Prioridad: **Alta** = sin esto el flujo central no funciona;
**Media** = gestión/editorial; **Baja** = evidencia preparatoria
(prototipo sintético). Actor: V = visitante, A = aprendiz,
AC = admin contenido, AT = admin técnico, S = sistema.

## 1. Identidad, autenticación y perfil

| ID | Requisito (inferido) | Actor | Patrón | Tablas |
|---|---|---|---|---|
| REQ-F-01 | El sistema registra una cuenta con nombre de visualización (2–80), correo y contraseña (15–128), normalizando el correo (minúsculas, sin espacios externos) y rechazando duplicados. | V | A01 | usuario, credencial, usuario_rol |
| REQ-F-02 | El registro crea la credencial (Argon2id, sal individual) y asigna el rol APRENDIZ en la misma transacción; una cuenta sin credencial o sin rol es un estado inválido. | S | A01 | usuario, credencial, usuario_rol |
| REQ-F-03 | El registro valida la política de contraseña (RN-19) antes de derivar el hash y rechaza contraseñas comunes. | V | A01 | credencial |
| REQ-F-04 | El sistema autentica con correo + contraseña, crea una sesión en servidor y permite cerrarla con revocación inmediata. | A/AC/AT | A02, A03 | credencial, sesion |
| REQ-F-05 | La autenticación verifica que la cuenta esté activa, que la sesión no esté revocada y que se cumplan 30 min de inactividad / 8 h absolutas en cada petición. | S | A02 | usuario, sesion |
| REQ-F-06 | El sistema consulta los permisos vigentes de la cuenta (roles asignados) para cada operación y recurso; los permisos no llegan del cliente. | A/AC/AT | A04, A42 | usuario_rol, rol |
| REQ-F-07 | El aprendiz edita su propio perfil (nombre de visualización, ruta preferida); el correo no es editable en autoservicio. | A | A51 | usuario |
| REQ-F-08 | El sistema exige el segundo factor cuando la cuenta lo requiere (obligatorio para admins) antes de crear una sesión verificada; un desafío dura 5 min y se consume con un código TOTP válido. | A/AC/AT | A02 | desafio_autenticacion, segundo_factor, sesion |
| REQ-F-09 | — No citado en los patrones del reporte. Verificar en [S1] rev 1.4. — | — | — | — |
| REQ-F-75 | La autenticación registra los intentos fallidos relevantes sin exponer si falló el usuario o la contraseña, y bloquea temporalmente tras N fallos. *(ID citado en A02 junto a F-04/05/08; redacción inferida.)* | S | A02 | auditoria, sesion |

**2FA (corrección 2026-11-10, sin ID F propio en el reporte):** activar
el segundo factor exige verificar el primer código (`confirmado_en`);
desactivarlo borra la fila; el secreto va cifrado AES-256-GCM con clave
fuera de la BD; anti-replay por `ultimo_paso_totp`. Sin códigos de
respaldo.

## 2. Catálogo y rutas

| ID | Requisito (inferido) | Actor | Patrón | Tablas |
|---|---|---|---|---|
| REQ-F-10 | El sistema muestra el catálogo de unidades publicadas con metadatos (título, descripción, tema, dificultad), sin cargar el contenido completo para listar. | V/A | A05 | unidad, version_unidad, tema |
| REQ-F-11 | El catálogo solo muestra versiones publicadas y autorizadas; los borradores no son visibles para aprendices ni visitantes. | V/A | A05 | version_unidad |
| REQ-F-12 | El visitante consulta muestras públicas (`muestra_publica`) y el aviso de privacidad sin crear cuenta ni guardar progreso. | V | A54 | unidad, version_unidad, version_documento |
| REQ-F-13 | El aprendiz abre su ruta asignada con la composición fijada por su inscripción; una nueva edición de la ruta no altera su ruta anterior. | A | A09 | inscripcion_ruta, version_ruta, ruta_unidad |
| REQ-F-14 | Completar una actividad acredita avance y puede conceder crédito/puntos aunque la nota sea < 80; la primera finalización por unidad es el hecho que cuenta. | A | A26 | credito_unidad, intento |
| REQ-F-15 | El catálogo permite filtrar/buscar por los metadatos de la versión publicada (ver §5). | V/A | A05 | version_unidad |
| REQ-F-16 | El aprendiz abre una lección Aprende con su versión completa publicada (secciones juntas) y sus fuentes por vínculo externo. | A | A10 | version_unidad, unidad_fuente |
| REQ-F-17 | Al abrir Aprende se sirve la versión publicada fija; el contenido no cambia durante la ejecución aunque se publique otra versión. | A | A10 | version_unidad, intento |
| REQ-F-44 | El sistema calcula el progreso de ruta cruzando las unidades obligatorias de la versión asignada con los créditos del usuario; denominador 0 = “Sin actividades”. | A | A09, A25, A38 | inscripcion_ruta, ruta_unidad, credito_unidad |
| REQ-F-51 | El sistema busca por palabras en título y descripción de unidades publicadas (normalizando mayúsculas y acentos), sin motores externos. | V/A | A07 | version_unidad |
| REQ-F-52 | El sistema combina filtros de ruta, tema, dificultad y avance en un mismo corte de consulta. | A | A08 | version_unidad, ruta_unidad, credito_unidad |
| REQ-F-53 | Los filtros combinados usan la misma versión de ruta y el mismo corte temporal para todos los criterios. | A | A08 | version_unidad, ruta_unidad |
| REQ-F-54 | El resultado de filtros/búsqueda pagina y proyecta solo los campos de la vista. | V/A | A08 | version_unidad |
| REQ-F-70 | El aprendiz elige una ruta (se crea inscripción contra la versión actual si falta) y puede cambiar de ruta conservando el avance de cada inscripción por separado, sin migración implícita. | A | A06, A31 | usuario, inscripcion_ruta, ruta |
| REQ-F-73 | El sistema muestra el aviso de privacidad y las muestras públicas sin exigir cuenta. | V | A54 | version_documento, unidad |

## 3. Aprende

| ID | Requisito (inferido) | Actor | Patrón | Tablas |
|---|---|---|---|---|
| REQ-F-18 | Finalizar Aprende valida que se visitaron todas las secciones de la versión y que hubo confirmación explícita; concede crédito una sola vez por unidad. | A | A13 | intento, credito_unidad |
| REQ-F-19 | Aprende no tiene nota evaluativa (`puntuacion = NULL`); completar es distinto de alcanzar el umbral de dominio. | A | A13 | intento |
| REQ-F-20 | El sistema registra las secciones visitadas en el recorrido del intento y permite reanudar la lección solo desde el avance confirmado. | A | A11, A12 | intento |
| REQ-F-21 | Reanudar una lección recupera el intento en curso y su versión exacta, no la versión publicada actual. | A | A12 | intento, version_unidad |

## 4. NormaMatch

| ID | Requisito (inferido) | Actor | Patrón | Tablas |
|---|---|---|---|---|
| REQ-F-22 | El aprendiz abre NormaMatch con su versión publicada y se crea un intento con identidad de ejecución propia. | A | A14 | version_unidad, intento |
| REQ-F-23 | Al abrir NormaMatch se proyectan solo situaciones y opciones; la clave de asociación no se envía al cliente. | A | A14 | version_unidad |
| REQ-F-24 | El aprendiz envía el conjunto completo de asociaciones de la actividad. | A | A15 | intento |
| REQ-F-25 | El sistema muestra retroalimentación con la explicación de la versión usada por el intento (rúbrica histórica fija), no la de una versión posterior. | A | A16 | intento, version_unidad |
| REQ-F-26 | La retroalimentación incluye la explicación obligatoria por situación (RN-15). | A | A16 | version_unidad |
| REQ-F-27 | La calificación se calcula en servidor con la clave histórica: `100 × aciertos / total`, `total > 0`. | S | A15 | intento, version_unidad |
| REQ-F-28 | Enviar asociaciones produce un solo resultado por intento; reenviar el mismo intento recupera el resultado confirmado. | A | A15 | intento |
| REQ-F-29 | Repetir una actividad crea una nueva ejecución (nuevo UUID y ordinal); reenviar no crea otro número de intento. | A | A24 | intento |

## 5. CasoTech

| ID | Requisito (inferido) | Actor | Patrón | Tablas |
|---|---|---|---|---|
| REQ-F-30 | El aprendiz abre CasoTech en su etapa inicial válida, con el grafo de la versión publicada. | A | A17 | version_unidad, intento |
| REQ-F-31 | Al abrir CasoTech se proyectan etapas y alternativas sin ponderaciones. | A | A17 | version_unidad |
| REQ-F-32 | El aprendiz confirma una decisión por etapa; el servidor valida que la transición sea la esperada del intento. | A | A18 | intento, version_unidad |
| REQ-F-33 | Confirmar una decisión impide dos ramas concurrentes del mismo recorrido (revisión esperada / secuencia de decisión). | A | A18 | intento |
| REQ-F-34 | El sistema permite consultar las fuentes citadas de la versión, con la edición exacta citada. | A | A20 | unidad_fuente, fuente_version |
| REQ-F-35 | Avanzar o reanudar un caso sigue la siguiente etapa que indica el servidor; el cliente no decide transiciones válidas. | A | A19 | intento, version_unidad |
| REQ-F-36 | Finalizar un caso calcula la nota en servidor y marca el intento como terminal en una transacción (resultado + crédito + insignias). | S | A21 | intento, credito_unidad |
| REQ-F-37 | Reanudar un caso recupera el recorrido confirmado y la etapa siguiente, no reinicia el grafo. | A | A19 | intento |
| REQ-F-39 | La calificación de CasoTech es `100 × suma_ponderaciones / (2 × decisiones)`, con mínimo una decisión y ruta válida hasta un terminal. | S | A21 | intento, version_unidad |

## 6. Historial, progreso y gamificación

| ID | Requisito (inferido) | Actor | Patrón | Tablas |
|---|---|---|---|---|
| REQ-F-38 | El aprendiz consulta su historial de intentos, paginado por fecha, con resultados confirmados y sin leer los recorridos completos. | A | A22 | intento |
| REQ-F-40 | El aprendiz abre un resultado histórico con la versión usada, su explicación y su calificación reproducibles. | A | A23 | intento, version_unidad |
| REQ-F-41 | El resultado histórico no cambia aunque la unidad se vuelva a publicar. | A | A23 | intento, version_unidad |
| REQ-F-42 | El historial filtra por cuenta y por actividad sin exponer resultados ajenos. | A | A22 | intento |
| REQ-F-43 | Repetir o reenviar una actividad respeta la idempotencia: mismo UUID = mismo intento. | A | A24 | intento |
| REQ-F-45 | El aprendiz consulta sus puntos como suma de las concesiones confirmadas (global por cuenta, no por ruta). | A | A27 | credito_unidad |
| REQ-F-46 | El sistema concede una insignia solo si se cumple su criterio, y una sola vez por cuenta e insignia. | S | A30 | usuario_insignia, insignia |
| REQ-F-47 | El aprendiz consulta su rango y su meta derivados del mismo corte que su saldo (umbrales 100 y 300, RN-24). | A | A28 | credito_unidad |
| REQ-F-48 | El aprendiz lista sus insignias con su origen verificable (intento o inscripción). | A | A29 | usuario_insignia, insignia |
| REQ-F-49 | El rango/meta se derivan del saldo global; no se almacenan valores que se puedan desincronizar. | S | A28 | credito_unidad |
| REQ-F-50 | La primera finalización por unidad otorga 10 puntos (Aprende) o 20 (NormaMatch/CasoTech) y es el hecho que alimenta puntos, progreso e insignias de actividad. | S | A26, A30 | credito_unidad |

## 7. Editorial y fuentes

| ID | Requisito (inferido) | Actor | Patrón | Tablas |
|---|---|---|---|---|
| REQ-F-55 | — No citado en los patrones del reporte. Verificar en [S1] rev 1.4. — | — | — | — |
| REQ-F-56 | El editor guarda borradores de contenido con control de revisión concurrente, sin alterar las tablas de negocio ni publicar. | AC | A34, A38 | version_unidad |
| REQ-F-57 | El editor abre una unidad para edición, crea una revisión de una versión publicada (nueva versión, publicado anterior inmutable) y guarda borradores. | AC | A33, A35 | version_unidad |
| REQ-F-58 | El editor revisa, publica o desactiva una unidad; desactivar impide nuevos intentos y conserva versiones e historial. | AC | A36, A37 | version_unidad, unidad |
| REQ-F-59 | Publicar exige una revisión editorial aprobatoria cuya huella SHA-256 coincida con el contenido, metadatos y referencias exactos que se publican. | AC | A36 | revision_editorial, version_unidad |
| REQ-F-60 | El sistema revisa la vigencia de las fuentes citadas sin alterar las citas antiguas; la fecha de revisión vive en `unidad_fuente`, no en la edición de la fuente. | AC | A20, A39 | unidad_fuente, fuente_version |
| REQ-F-61 | — No citado en los patrones del reporte. Verificar en [S1] rev 1.4. — | — | — | — |
| REQ-F-62 | La publicación es atómica: cambia estado + puntero público + auditoría en una transacción; crear el borrador no mueve el puntero. | AC | A36 | version_unidad, unidad, auditoria |
| REQ-F-74 | Crear una revisión de una versión publicada genera una versión nueva (V4) y conserva V3 como pública hasta que V4 se publique. | AC | A35 | version_unidad |

## 8. Administración, grupos y reportes

| ID | Requisito (inferido) | Actor | Patrón | Tablas |
|---|---|---|---|---|
| REQ-F-63 | El admin técnico consulta cuentas (paginado, datos mínimos, sin hash ni respuestas) y activa/desactiva cuentas revocando sus sesiones en la misma transacción. | AT | A40, A41 | usuario, sesion, auditoria |
| REQ-F-64 | El admin técnico asigna o retira roles; retirar el último ADMIN_TECNICO activo está prohibido (guarda `guarda_integridad`, RN-29). | AT | A42, A43 | usuario_rol, guarda_integridad |
| REQ-F-65 | El sistema consulta los permisos/roles existentes; no se aceptan permisos arbitrarios desde el cliente. | AT | A04 | rol |
| REQ-F-66 | El instructor/admin consulta reportes agregados de grupo y la lista de grupos de su ámbito autorizado. | AC/AT | A46, A50 | grupo, membresia_grupo, intento |
| REQ-F-67 | El reporte de grupo agrega por periodo y versión (mejor nota por persona y versión) con supresión por celda < 5. | AC/AT | A50 | intento, membresia_grupo |
| REQ-F-68 | El reporte muestra conteos (incluidas celdas pequeñas) aunque el promedio esté suprimido; Aprende muestra promedio “No aplica”. | AC/AT | A50 | intento |
| REQ-F-69 | Toda acción administrativa relevante queda auditada (actor, recurso, resultado) y el historial de roles se conserva en auditoría. | AT | A41, A43, A52, A53 | auditoria, usuario_rol |
| REQ-F-71 | El admin técnico crea grupos (nombre + periodo) y los desactiva sin borrar su historial. | AT | A44, A45, A46 | grupo |
| REQ-F-72 | El admin gestiona integrantes: agrega, reingresa (nuevo intervalo) y retira (cierre del intervalo); no hay dos membresías abiertas simultáneas para la misma pareja grupo–usuario ni intervalos solapados. | AT | A47, A48, A49 | membresia_grupo |

## 9. Legal y privacidad (propuesto, prototipo sintético)

| ID | Requisito (inferido) | Actor | Patrón | Tablas |
|---|---|---|---|---|
| REQ-F-74 | Ver §7 (revisión de publicado). | AC | A35 | version_unidad |
| (propuesto) | Publicar una versión inmutable de un documento legal (términos / aviso / consentimiento) con texto exacto y huella SHA-256. | AT | A55 | documento_legal, version_documento |
| (propuesto) | Registrar presentación del aviso y aceptación de términos como eventos ligados a la versión exacta y a una clave de operación idempotente. | V/A | A56 | evento_legal |
| (propuesto) | Registrar el retiro de consentimiento como un evento nuevo por finalidad, sin sobrescribir la aceptación histórica; el estado efectivo es el evento más reciente. | A | A57 | evento_legal |
| (propuesto) | Atender una solicitud de privacidad (LEG-02) con expediente mínimo: tipo, recepción, verificación mínima, decisión, ejecución y resolución, sin adjuntar identificaciones por defecto. | AT | A58 | solicitud_privacidad |

## 10. Requisitos no funcionales que el backend debe cumplir

| ID | Requisito |
|---|---|
| REQ-NF-01 | ≤ 5 s: consulta de catálogo, apertura de lecciones, envío de actividades. |
| REQ-NF-08 | BD accesible solo desde backend y canales admin; nunca desde el navegador. |
| REQ-NF-10 | Sesión 30 min inactividad / 8 h absoluta, verificada en servidor por petición. |
| REQ-NF-21 | Respaldo diario, rotación 7 copias, volumen independiente y acceso restringido. |
| REQ-NF-23 | RPO ≤ 24 h, RTO ≤ 4 h (verificado con ensayo de restauración). |
| REQ-NF-42 | Ventana 08:00–20:00 America/Mexico_City; disponibilidad mensual meta 99 %. |
| REQ-INT-02 | Timestamps UTC en BD; formato America/Mexico_City solo en interfaz. |
| REQ-DB-04 | Retención: aprendizaje ≤ 12 meses tras desactivación; auditoría 12 meses. |
| REQ-SW-02 | Topología: servicio Node + una primaria PostgreSQL 18.6. |
| REQ-COM-01 | HTTPS navegador→backend; TLS verificado backend→BD. |
| REQ-LEG-01/02 | Antes de datos reales: responsable y régimen definidos; canal de atención de privacidad abierto. |

### 10.1 Despliegue con Docker (decisión del equipo, 2026-11-17 — no viene del reporte)

Estos IDs son nuevos (`DOCKER-*`), no REQ-F/NF del reporte. Son el
contrato que la IA del IDE debe cumplir al escribir el `Dockerfile` y
el `docker-compose.yml` (detalle en `01 §11.1`).

| ID | Requisito |
|---|---|
| DOCKER-01 | El repo lleva `Dockerfile` multistage (Node 24) + `docker-compose.yml` con servicios `api` + `db` (`postgres:18.6`) + `migrate` efímero. `docker compose up --build` levanta el sistema completo en una máquina limpia. |
| DOCKER-02 | La misma imagen de `api` corre en desarrollo, tests y despliegue; solo cambian el `.env` y el override de Compose. |
| DOCKER-03 | Los datos de PostgreSQL viven en un volumen nombrado (`pgdata`); `docker compose down` sin `-v` no borra datos. |
| DOCKER-04 | El puerto 5432 no se publica fuera de la red interna de Compose en despliegue; la API se conecta a `db` por nombre de servicio. |
| DOCKER-05 | Las migraciones las corre el servicio `migrate` antes de arrancar `api`; la API nunca migra al arrancar. |
| DOCKER-06 | Ningún secreto (clave TOTP, contraseñas de BD) va en la imagen, en el `Dockerfile` ni en el `docker-compose.yml`; llegan por `.env` / gestor de secretos y `.env` está en `.dockerignore` y `.gitignore`. |
| DOCKER-07 | Imágenes pinneadas (`postgres:18.6`, Node 24.x exacto), nunca `latest`; la versión exacta se documenta en la matriz de aceptación. |
| DOCKER-08 | `db` tiene healthcheck (`pg_isready`) y `api` expone `GET /health` sin auth; `api` no arranca hasta que `db` esté sano y `migrate` haya terminado con éxito. |
| DOCKER-09 | Los tests de integración/concurrencia levantan su propia BD en contenedor (perfil `test` o Testcontainers), nunca la BD de desarrollo ni la de despliegue. |

## 11. Criterios de aceptación (resumen del reporte §4.4, PA-01–PA-16)

Ver la lista ejecutable en `01-arquitectura-nestjs.md §12`. En
particular: idempotencia bajo 20 reenvíos concurrentes, último técnico
activo, solapamiento de membresías, huella editorial desactualizada,
umbral de 5 en reportes, ruta vacía sin 100 % falso, y carga +
restauración dentro de los umbrales.
