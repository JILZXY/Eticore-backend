# Eticore Backend — API REST (`/api/v1`)

Backend monolito modular en **NestJS 12 (TypeScript estricto, ESM, Node.js 24 LTS)** sobre **PostgreSQL 18.6** con **TypeORM (`synchronize: false`)**, sesiones opacas en servidor (`SHA-256` en BD), `Argon2id`, segundo factor `TOTP` (`AES-256-GCM`) y validación de contenido `JSONB` versionado (`Aprende`, `NormaMatch`, `CasoTech`).

> **Prototipo académico sintético (RN-30):** este repositorio opera únicamente con cuentas y contenidos sintéticos de ejemplo. No almacena ni procesa datos reales de personas.

---

## Requisitos del entorno

- **Docker** y **Docker Compose v2+** (entorno estándar).
- **Node.js 24 LTS** (`v24.x`) y **npm** para desarrollo y pruebas locales.

---

## Puesta en marcha con Docker Compose

1. Crear el archivo `.env` a partir de `.env.example` y definir contraseñas locales y una llave `TOTP_ENCRYPTION_KEY` de 32 bytes (64 caracteres hexadecimales):

   ```bash
   cp .env.example .env
   ```

2. Ejecutar las migraciones base (31 tablas + funciones `SECURITY DEFINER`):

   ```bash
   docker compose run --rm migrate
   ```

3. Sembrar el catálogo base mínimo (roles `APRENDIZ`, `ADMIN_CONTENIDO`, `ADMIN_TECNICO`, `guarda_integridad` y versiones sintéticas de documentos legales):

   ```bash
   docker compose run --rm api npm run seed:run
   ```

4. Levantar la base de datos y la API:

   ```bash
   docker compose up --build -d
   ```

5. Documentación interactiva **OpenAPI / Swagger**:
   - UI: `/api/docs`
   - JSON: `/api/docs-json` (archivo estático exportado en `openapi.json`)
   - YAML: `/api/docs-yaml`

---

## Seed de contenido educativo de ejemplo (solo desarrollo y pruebas)

El script `seed:contenido` llena la plataforma con contenido educativo sintético y verificable (marcado explícitamente con `[CONTENIDO DE EJEMPLO SINTÉTICO - ETICORE SEED]`):

- **2 rutas:** `General` y `TI` (con su `version_ruta` número 1 y composición en `ruta_unidad`).
- **3 temas:** `Privacidad y datos personales`, `Seguridad de la información` y `Ética en tecnologías de la información`.
- **Fuentes reales con URL pública:** `LFPDPPP`, `LGPDPPSO`, `NIST SP 800-63B`, `OWASP Authentication Cheat Sheet`, `LFDA` y `ACM Code of Ethics`.
- **8 unidades publicadas** pasando por el flujo editorial completo (`borrador` -> `revisión editorial aprobada con huella SHA-256` -> `publicar`) y por `ContentValidatorService`:
  - **3 `Aprende`:** *Minimización de datos*, *Contraseñas seguras*, *Licencias de software*.
  - **3 `NormaMatch`:** *Relaciona cada situación con su principio*, *Datos necesarios para la finalidad*, *Consentimiento informado*.
  - **2 `CasoTech`:** *Un correo sospechoso*, *Datos de un compañero en un proyecto*.

### Reglas de seguridad del seed de contenido

1. **Nunca corre automáticamente** al iniciar la API ni en el contenedor `migrate`.
2. **Prohibido en producción:** el script rechaza ejecutarse si `NODE_ENV=production` (`SEED_PRODUCCION_PROHIBIDO`), salvo que existiera `SEED_ALLOW_PRODUCTION=true` explícito (variable que no debe configurarse en este proyecto).
3. **Sin cuentas masivas ni contraseñas hardcodeadas:**
   - Si defines `SEED_REVISOR_ID=<id>` de un usuario activo existente, utiliza ese usuario como revisor y **no crea ninguna cuenta**.
   - Si no defines `SEED_REVISOR_ID` pero ya existe algún usuario activo con rol `ADMIN_CONTENIDO`, lo reutiliza automáticamente.
   - Solo si no existe ningún `ADMIN_CONTENIDO` en la base de datos, crea **una sola** cuenta sintética de editor leyendo `SEED_EDITOR_PASSWORD` (15 a 128 caracteres) y `SEED_EDITOR_EMAIL` (o `ETICORE_API_DOMAIN`) desde variables de entorno.
4. **Idempotente:** ejecutarlo dos o más veces no duplica temas, fuentes, rutas, unidades ni versiones (salta las unidades cuya versión 1 ya está publicada).

### Cómo ejecutar el seed en desarrollo

Con Docker Compose (una vez compilada la imagen y corridas las migraciones):

```bash
# Opción A: usando un revisor existente en BD
docker compose run --rm -e SEED_REVISOR_ID=1 api npm run seed:contenido

# Opción B: si la BD aún no tiene ningún ADMIN_CONTENIDO
docker compose run --rm \
  -e SEED_EDITOR_EMAIL=editor.seed@eticore-api.example.invalid \
  -e SEED_EDITOR_PASSWORD="DefineUnaClaveLocalSegura_2026!" \
  api npm run seed:contenido
```

O en entorno local de desarrollo (previo `npm run build`):

```bash
npm run build
npm run seed:contenido
```

### Cómo limpiar el contenido de ejemplo en desarrollo

El comando `seed:limpiar-contenido` también está restringido a entornos de desarrollo/pruebas (`NODE_ENV != production`) y elimina **únicamente** el contenido de ejemplo sembrado que no tenga historial de aprendizaje, conservando intactos los intentos, créditos, insignias y registros de auditoría:

```bash
# Con Docker Compose
docker compose run --rm api npm run seed:limpiar-contenido

# O en entorno local (previo npm run build)
npm run seed:limpiar-contenido
```

---

## Verificación y pruebas

```bash
npm run build      # Compilación TypeScript / NestJS
npm run lint       # Oxlint type-aware sobre src/ y test/
npm test           # Pruebas unitarias (Vitest)
npm run test:e2e   # Pruebas de integración, concurrencia (PA-01..PA-10) y carga con PostgreSQL 18.6
```
