# Eticore — 03 · Reglas de negocio

> Fuente: reporte §2.6 (matriz RN-01–RN-31) + Corrección 2026-11-10.
> **Estas reglas no se negocian en el código.** La columna
> *Dónde se cumple* dice dónde vive la garantía en NestJS; *Motor*
> significa que PostgreSQL la impone aunque el backend tenga un bug.
> Si una regla no se puede cumplir con el mecanismo indicado, el
> trabajo está incompleto, no “casi”.

## Cómo leer la tabla

- **Motor:** PK/FK/UNIQUE/CHECK/trigger en PostgreSQL.
- **Aplicación:** validación/lógica en el servicio NestJS.
- **Ambos:** protocolo coordinado (transacción + bloqueo + restricción).

## RN-01 — Acceso por rol

> Validar sesión, rol, propiedad y recurso **en cada operación**.

- Dónde: Aplicación — `SessionAuthGuard` → `RolesGuard` →
  `OwnershipGuard` en cada controlador. Nunca confiar en que el
  frontend oculte un botón.
- Prohibido: recibir roles o permisos en el cuerpo de la petición.

## RN-02 — Mínimo privilegio

> Alta con rol Aprendiz; se rechazan roles inexistentes y privilegios
> elegidos desde el cliente.

- Dónde: Ambos — registro inserta `usuario_rol(APRENDIZ)` en la misma
  transacción; `rol_id` con FK a `rol`; la correspondencia código →
  permisos es una constante del backend.
- El registro público nunca puede crear un admin.

## RN-03 — Visitante

> Solo publicación pública; sin escrituras de progreso.

- Dónde: Aplicación — endpoints públicos (`@Public()`) solo lectura
  de `version_publicada_id` / `muestra_publica`; no crean sesión,
  intento ni evento con identidad persistente.

## RN-04 — Progreso y finalización

> Completar una actividad acredita avance **aunque la nota sea
> inferior al umbral de dominio de 80 puntos**.

- Dónde: Ambos — `finalizar_intento` inserta `credito_unidad` si es
  primera finalización, sin condicionarlo a `puntuacion >= 80`.
- El 80 es umbral de dominio, no de finalización. No mezclarlos.

## RN-05 — Reintentos (idempotencia)

> El mismo intento recupera su resultado confirmado; reenviar no crea
> otro intento ni otro crédito.

- Dónde: Ambos — `intento.id` UUID estable emitido antes del primer
  envío; `finalizar` es condicional por `estado` + `revision`; si ya
  está `finalizado`, se devuelve el resultado existente.
- Test: 20 reenvíos concurrentes → 1 resultado, 1 crédito.

## RN-06 — Puntos por unidad

> Una cuenta recibe puntos **a lo sumo una vez por unidad**
> educativa (10 Aprende, 20 NormaMatch/CasoTech), aunque cambie la
> versión o la ruta.

- Dónde: Motor + Aplicación — PK `(usuario_id, unidad_id)` en
  `credito_unidad` + inserción dentro de la transacción de
  finalización. La garantía no depende de un `SELECT` previo.

## RN-07 — Insignia única

> Una cuenta recibe cada insignia **una sola vez**; dos solicitudes
> simultáneas no duplican la concesión.

- Dónde: Motor + Aplicación — PK `(usuario_id, insignia_id)` en
  `usuario_insignia` + evaluación de elegibilidad tras la finalización,
  en la misma transacción.

## RN-08 — Ruta sin privilegios

> La ruta es clasificación educativa, no autorización.

- Dónde: Aplicación + FK separadas — `usuario.ruta_preferida_id` y
  `inscripcion_ruta` no conceden permisos; `usuario_rol` es la única
  fuente de autorización.

## RN-09 — Publicación autorizada

> Permiso editorial + validación + publicación atómica; el puntero
> público cambia solo al publicar.

- Dónde: Ambos — `publicar_version` en una transacción (estado +
  puntero + auditoría) y solo con rol `ADMIN_CONTENIDO`.

## RN-10 — Fuentes revisadas

> FK a edición de fuente + fecha de revisión requerida + revisión
> editorial. Que exista una URL no prueba vigencia.

- Dónde: Ambos — `unidad_fuente(revisada_en)` obligatorio;
  `fuente_version` inmutable; la publicación exige revisión con
  huella vigente.

## RN-11 — Finalidad educativa

> Textos y avisos de orientación; es una propiedad semántica, no una FK.

- Dónde: Aplicación + revisión editorial — el validador y el revisor
  verifican que el contenido tenga finalidad educativa; no hay
  restricción declarativa que lo capture.

## RN-12 — Minimización

> Campos permitidos, esquema y privilegios; sin datos sensibles.
> Solo nombre de visualización, correo y credencial.

- Dónde: Ambos — DTOs con lista cerrada de campos (sin
  `whitelist: false` que deje pasar extras), sin nombre legal,
  matrícula, edad, teléfono ni domicilio; recorridos sin texto libre
  con datos de terceros; sin IP completa ni huella de dispositivo en
  eventos legales.

## RN-13 — Reportes privados

> Agregado autorizado + **supresión por celda menor que cinco**.

- Dónde: Aplicación/consulta — en A50, `AVG` solo si
  `COUNT(*) >= 5` por celda (versión), evaluado **después** de
  filtrar. Los conteos sí se muestran. La aplicación devuelve solo
  agregados, nunca filas de elegibles ni respuestas.
- Advertencia del reporte: esto no garantiza anonimato; revisar
  combinaciones inferibles y restringir filtros/exportaciones.

## RN-14 — Separación administrativa

> Tener rol técnico no concede edición automáticamente, ni al revés.

- Dónde: Aplicación — permisos por rol explícito y acumulativo;
  `ADMIN_TECNICO` no edita contenido sin `ADMIN_CONTENIDO`, y
  viceversa. Asignación explícita y auditada si una persona tiene
  ambos.

## RN-15 — Explicación obligatoria

> El validador completo corre antes de publicar; en JSON, tipos
> válidos no prueban que la explicación sea suficiente.

- Dónde: Aplicación — `ContentValidatorService`: cada situación de
  NormaMatch tiene explicación; cada etapa/caso tiene la información
  necesaria. Publicar sin validar está prohibido.

## RN-16 — Sin escrituras incompatibles

> La confirmación incluye resultado, crédito y recompensas elegibles
> en una transacción.

- Dónde: Ambos — `finalizar_intento` es una sola transacción; si
  falla una parte, no se confirma ninguna.

## RN-17 — Autenticación

> Argon2id, sesión del servidor y revocación. Nunca se registran
> credenciales ni tokens en claro.

- Dónde: Aplicación — hash Argon2id con sal individual; token de
  sesión aleatorio, en BD solo su hash; sin contraseñas ni tokens en
  logs ni en `auditoria`/`auditoria_bd` (el trigger elimina
  `verificador_argon2id`, `secreto_cifrado` y `token_hash` del JSONB).

## RN-18 — Contenido oficial protegido

> Publicado inmutable; un usuario final no escribe contenido ni
> rúbricas.

- Dónde: Aplicación + permisos del motor — solo `ADMIN_CONTENIDO`
  escribe versiones; una versión `publicado` no se edita, se crea
  una revisión nueva. Defensa adicional (opcional): trigger de
  inmutabilidad que rechace cambios sustantivos en publicados y
  resultados cerrados.

## RN-19 — Cuenta válida

> Correo canónico UNIQUE y obligatorio (motor); normalización,
> formato y política de contraseña (aplicación).

- Dónde: Motor + Aplicación — `correo_normalizado` UNIQUE + CHECK
  (minúsculas, sin espacios externos) + normalización en el servicio
  antes de insertar; contraseña 15–128, admite espacios, rechaza
  comunes.

## RN-20 — Aprende completo

> Secciones visitadas de la versión + confirmación explícita. No se
> confunde recorrido con comprensión.

- Dónde: Aplicación — finalizar Aprende exige todas las secciones de
  **esa versión** en `recorrido` y confirmación explícita.

## RN-21 — NormaMatch

> Conjunto completo y `100 × aciertos / total`, `total > 0`. La nota
> sale de la clave histórica del servidor.

- Dónde: Aplicación — `ScoringService` con la versión fijada del
  intento; nunca aceptar `puntuacion` del cliente.

## RN-22 — CasoTech

> Ruta válida a terminal; `100 × suma / (2 × decisiones)`, mínimo
> una decisión.

- Dónde: Aplicación — validar que el recorrido sea una ruta válida
  del grafo de esa versión hasta un terminal; ponderaciones solo
  0/1/2. Una nota en rango no demuestra que el cálculo sea correcto:
  el cálculo vive en el servidor y se prueba.

## RN-23 — Porcentaje de ruta

> Créditos sobre unidades obligatorias de la versión asignada.
> Denominador cero = “Sin actividades”.

- Dónde: Aplicación/consulta — `progreso = créditos / obligatorias
  de inscripcion_ruta.version_ruta`; nunca 100 % falso por ruta
  vacía; nunca usar la versión actual de la ruta para una inscripción
  antigua.

## RN-24 — Puntos y rangos

> Crédito de 10 o 20 según módulo; suma global; umbrales 100 y 300.
> No se duplican saldos por ruta.

- Dónde: Ambos — CHECK `puntos IN (10, 20)` + suma global por
  cuenta desde `credito_unidad`; rango derivado del mismo corte que
  el saldo.

## RN-25 — Elegibilidad de insignias

> Evaluar condiciones tras la finalización; concesión con unicidad.
> Ruta completa exige una ruta no vacía al 100 %.

- Dónde: Ambos — evaluar tras `finalizar` en la misma transacción;
  PK de concesión; `inscripcion_origen_id` solo para insignia de
  ruta completa (CHECK de exclusión mutua con `intento_origen_id`).
- **Pendiente:** los códigos/criterios de las 4 insignias iniciales
  no están en el reporte ni en el DDL. No inventarlos.

## RN-26 — Flujo editorial

> Transiciones válidas, revisión favorable de la misma huella y
> bloqueo al publicar. En el piloto se permite autorrevisión con rol
> editorial.

- Dónde: Ambos — estados `borrador → en_revision → publicado /
  desactivado`; publicar exige `revision_editorial.resultado =
  'aprobada'` y `huella_revisada = SHA-256(contenido + metadatos +
  referencias actuales)`; si la versión cambió tras aprobar, rechazar.

## RN-27 — Intentos históricos

> Nuevo id por ejecución; finalizado inmutable; ordinal único.

- Dónde: Ambos — UUID nuevo por ejecución; UNIQUE
  `(usuario_id, unidad_id, numero)`; un intento `finalizado` no
  acepta mutaciones de recorrido ni de nota (reenvío = devolver
  resultado, no reescribirlo).

## RN-28 — Grupos y métricas

> Intervalos sin solapamiento; consulta de mejores notas por persona
> y versión. No mezclar versiones ni duplicar intentos por reingreso.

- Dónde: Ambos — intervalos semiabiertos `[ingreso, salida)`;
  índice único parcial anti-doble-apertura + comprobación de
  solapamiento bajo bloqueo de `grupo`; reporte con `EXISTS` de
  pertenencia en `finalizacion` y mejor nota por
  `(usuario, version_id)`.

## RN-29 — Último técnico activo

> Serializar cambios relevantes con una guarda común **antes** de
> contar y modificar.

- Dónde: Ambos — `SELECT … FOR UPDATE` sobre
  `guarda_integridad(clave='admin_tecnico_activo')` en toda
  desactivación de cuenta o retiro de rol que afecte a un
  `ADMIN_TECNICO`. Un conteo sin coordinación falla con dos bajas
  simultáneas. Test obligatorio (§12 de `01`).

## RN-30 — Prototipo sintético

> Importaciones y cuentas de prueba sin personas reales.

- Dónde: Aplicación + proceso — seeds y datos de prueba sintéticos;
  la arquitectura no habilita por sí sola la operación productiva.
  Antes de datos reales: REQ-LEG-01/02 (responsable, régimen,
  canal de atención).

## RN-31 — Sin tiempo pedagógico

> Separar caducidad de sesión de evaluación y recorrido.

- Dónde: Aplicación — que expire una sesión no cambia una
  puntuación ni borra avance confirmado; reanudar usa el intento
  guardado, no la sesión.

---

## Adendas de la Corrección 2026-11-10 (sin número RN propio)

| # | Regla | Dónde se cumple |
|---|---|---|
| C-01 | 2FA obligatorio para `ADMIN_TECNICO` y `ADMIN_CONTENIDO`; opcional para aprendices. La activación requiere verificar el primer código. | Auth: `sesion.verificado_2fa` debe ser `true` para sesiones admin; `segundo_factor.confirmado_en` no nulo para considerar el 2FA activo. |
| C-02 | Secreto TOTP cifrado AES-256-GCM, clave fuera de la BD; nunca en claro ni hasheado. Desactivar = borrar la fila. | Auth + despliegue (gestor de secretos, rotación definida). |
| C-03 | Desafío de 2FA: 5 min, hash del token (no el portador), contador de intentos, anti-replay por `ultimo_paso_totp`. | Auth: `desafio_autenticacion` + verificación TOTP. |
| C-04 | `auditoria_bd` es append-only, retención 12 meses, purga solo por `eticore_retencion`; sin hash encadenado (decisión diferida). El trigger elimina `verificador_argon2id`, `secreto_cifrado` y `token_hash` del JSONB. | BD (triggers en 6 tablas) + tarea programada con rol de retención. |
| C-05 | Nuevos códigos de `auditoria.accion`: `segundo_factor_activado`, `segundo_factor_desactivado`, `autenticacion_segundo_factor_fallido`, `cuenta_bloqueada_2fa`, `restablecimiento_segundo_factor_por_admin`. | `AuditService`: usar exactamente estos códigos, no sinónimos. |
| C-06 | `eticore_app` es INSERT-only en `auditoria` y `auditoria_bd` y **no lee** `credencial` ni `segundo_factor`; la verificación la hace `eticore_auth` con función `SECURITY DEFINER`. | Dos DataSources (§5 de `01`); el código de la app nunca hace `SELECT` a esas tablas. |
| C-07 | Sin códigos de respaldo; sin pgaudit ni logs del servidor como evidencia de auditoría. | No crear `codigo_respaldo`; `auditoria_bd` es la única evidencia a nivel de BD. |

## Docker y las reglas de negocio

Docker **no cambia ninguna RN**. Lo que cambia es dónde se cumplen
algunas garantías operativas; si Docker las rompiera, estaría mal el
despliegue, no la regla:

- **RN-06 / RN-07 / RN-29 (duplicados y último técnico):** dependen de
  PK/UNIQUE y de locks en PostgreSQL. Corren igual dentro del
  contenedor `db`, siempre que haya **una sola primaria** y la API no
  se escale a varias instancias sin revisar los protocolos de
  bloqueo. Docker no añade una segunda base ni un segundo escritor.
- **RN-17 / C-02 / C-06 (secretos):** la clave TOTP y las credenciales
  de `eticore_app` / `eticore_auth` llegan por entorno/gestor de
  secretos al contenedor, nunca en la imagen. Una imagen que contenga
  un secreto viola RN-17 aunque el código sea correcto.
- **C-04 (auditoría append-only, retención 12 meses):** `auditoria_bd`
  vive en el volumen `pgdata`. Borrar el volumen (`down -v`) o
  recrear la BD sin restaurar borra evidencia: en desarrollo local
  es un reset aceptado; en despliegue está prohibido y equivale a
  borrar auditoría.
- **REQ-NF-21/23 (respaldos):** el respaldo se saca del volumen de
  `db` y se guarda fuera del host. Un respaldo que solo existe dentro
  del contenedor o del volumen no es un respaldo.
- **RN-30 (prototipo sintético):** la BD de desarrollo en Docker
  lleva solo datos sintéticos. Nunca se restaura en ella un respaldo
  con datos reales, ni se apunta el Compose de desarrollo a una BD
  con datos reales.

## Reglas de integridad referencial (resumen §2.6)

- IDs inmutables; FK con `ON UPDATE NO ACTION`. No `ON UPDATE CASCADE`.
- `CASCADE` solo para datos de acceso dependientes (`credencial`,
  `sesion`, `segundo_factor`, `desafio_autenticacion`, `usuario_rol`
  hacia `usuario`) y **solo al ejecutar la purga autorizada** de la
  cuenta. El resto es `RESTRICT` (intentos, créditos, inscripciones,
  membresías, eventos legales, insignias, fuentes) o `SET NULL`
  (`auditoria.actor_id`, `solicitud_privacidad.usuario_id`,
  `usuario.ruta_preferida_id` tras supresión autorizada).
- FK compuestas que impiden cruzar versiones/usuarios:
  `intento(version_id, unidad_id)`, `unidad(version_publicada_id,
  id)`, `credito_unidad(intento_origen_id, usuario_id, unidad_id)`,
  `usuario_insignia` (origen del mismo usuario), `inscripcion_ruta`
  (`migrada_de_id` del mismo usuario, distinta de sí misma).
- `usuario_insignia`: exactamente uno de `intento_origen_id` /
  `inscripcion_origen_id` (CHECK de exclusión mutua).
- Las FK no sustituyen las precondiciones de estado (p. ej. versión
  publicada antes de iniciar un intento): se validan en la transacción,
  bloqueando la fila cuando compite con una baja.
