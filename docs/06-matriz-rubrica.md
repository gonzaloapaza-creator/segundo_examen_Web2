# StockGuard - Matriz de cumplimiento de la rubrica

Estado: **OK** = implementado y verificado tecnicamente (ver `08-resultados-verificacion.md`); **PENDIENTE** = accion tecnica de integracion/release aun no realizada en el repositorio; **PENDIENTE (estudiante)** = pruebas manuales, capturas, informe PDF y entrega en Moodle, que realiza el estudiante.

## API Gateway (25 puntos)

| Criterio | Evidencia en el repositorio | Verificacion realizada | Estado |
| --- | --- | --- | --- |
| Unico punto de entrada HTTP para los clientes | `docker-compose.yml`: solo `gateway` tiene `ports` (`${GATEWAY_PORT:-8080}:80`); `backend` y `db` solo `expose`/red interna | `docker compose ps` muestra puerto publicado unicamente en `stockguard-gateway` | OK |
| Proxy inverso con enrutamiento funcional al microservicio | `gateway/templates/10-stockguard.conf.template` (`location /api/v1/`, `/api/v1/health/`, `/docs` -> `proxy_pass http://backend:3000`), `gateway/snippets/proxy.conf` | Smoke tests (29/29) y Newman (151 aserciones) ejecutados contra `http://localhost:8080` | OK |
| >= 2 caracteristicas transversales | CORS por lista blanca (`snippets/cors.conf`, `docker-entrypoint.d/15-cors-origins.sh`), logs JSON (`nginx.conf` `log_format json_combined`), rate limiting (`limit_req_zone`, 429 JSON), `X-Request-ID` (`add_header`/`proxy_set_header $request_id`), limites de tamano y timeouts | Preflight permitido/no permitido, 60 peticiones -> mezcla 200/429, mismo `request_id` en log de Gateway y backend | OK |

## Microservicio y base de datos (30 puntos)

| Criterio | Evidencia | Verificacion | Estado |
| --- | --- | --- | --- |
| NestJS con TypeScript | `backend/src/**`, `tsconfig.json` (`strict`), `package.json` (`@nestjs/*` 11.2.7, TypeScript 5.9.3) | `npm run typecheck` y `npm run build` sin errores; imagen construida con `tsc` | OK |
| Conexion a PostgreSQL y persistencia | `database/data-source.ts`, `database.module.ts` (TypeORM + `pg`), migracion `1760000000000-InitialSchema.ts`, volumen `stockguard-pgdata` | Migracion aplicada; datos conservados tras `docker compose down` + `up` | OK |
| CRUD completo de categorias y productos | `categories/` y `products/` (POST, GET lista, GET id, PATCH, DELETE) | Pruebas de integracion `catalog.e2e-spec.ts`, Postman carpetas 01-02, smoke test | OK |
| DTO | `*/dto/create-*.dto.ts` (class-validator + class-transformer), `list-*.dto.ts`, `*-response.dto.ts`, `common/pipes/validation.pipe.ts` (whitelist, forbidNonWhitelisted) | 400 `VALIDATION_ERROR` con `details[]` por campo | OK |
| Repository | `categories.repository.ts`, `products.repository.ts`, `movements.repository.ts` sobre `Repository<T>` de TypeORM | Los servicios no construyen consultas directamente | OK |
| Inyeccion de dependencias | Providers por modulo, constructores `@Injectable()`, token `APP_CONFIG`, `@InjectRepository` | Arranque de la aplicacion y pruebas con `Test.createTestingModule` | OK |
| Endpoints REST y reglas de negocio | `docs/03-endpoints.md`, `docs/02-reglas-de-negocio.md`; `MovementsService` (transaccion + `SELECT ... FOR UPDATE`), `IdempotencyService`, baja logica, reversiones, reportes | 35 pruebas (6 unitarias + 29 integracion), smoke tests, Newman | OK |
| Extras: movimientos transaccionales, concurrencia, idempotencia, reversiones | `movements.service.ts`, `idempotency/idempotency.service.ts`, indices unicos y CHECK en la migracion | Dos salidas simultaneas -> `[201, 409]`; 6 reintentos simultaneos misma clave -> un solo movimiento; reversion doble -> 409 | OK |

## Docker (15 puntos)

| Criterio | Evidencia | Verificacion | Estado |
| --- | --- | --- | --- |
| Dockerfile del Gateway | `gateway/Dockerfile` (`nginx:1.28.2-alpine`, plantillas, HEALTHCHECK) | Imagen `stockguard/gateway:1.0.0` construida | OK |
| Dockerfile del backend | `backend/Dockerfile` multi-etapa (`build`, `deps`, `runtime`), usuario `node`, `dumb-init`, HEALTHCHECK | Imagen `stockguard/backend:1.0.0` construida | OK |
| Compose con Gateway, backend y PostgreSQL | `docker-compose.yml` (3 servicios) | `docker compose ps` -> 3 servicios | OK |
| Red bridge comun | `networks.stockguard-net.driver: bridge` | `docker compose config` | OK |
| `depends_on` | `gateway -> backend -> db` con `condition: service_healthy` | Orden de arranque observado en `docker compose up` | OK |
| Healthchecks | `wget /health` (gateway), `wget /api/v1/health/ready` (backend), `pg_isready` (db) | Los tres alcanzan `(healthy)` | OK |
| Volumen persistente | `volumes.stockguard-pgdata` montado en `/var/lib/postgresql/data` | Persistencia verificada tras `down`/`up` | OK |
| Solo el Gateway publica un puerto | Ver arriba | `docker compose ps` | OK |

## Dominio y C4 (20 puntos)

| Criterio | Evidencia | Estado |
| --- | --- | --- |
| Problema de negocio y alcance justificados | `README.md` seccion 1, `docs/01-dominio.md`, `docs/BASE_PARA_INFORME.md` | OK |
| C4 nivel 1 (contexto) | `docs/diagrams/c4-level1-context.puml` + `export/c4-level1-context.{png,svg}`: operador, evaluador, clientes HTTP de prueba y StockGuard | OK |
| C4 nivel 2 (contenedores) | `docs/diagrams/c4-level2-containers.puml` + `export/c4-level2-containers.{png,svg}`: Gateway Nginx, microservicio NestJS, PostgreSQL, red interna, puertos | OK |
| Coherencia con la implementacion real | Nombres, puertos, tecnologias y responsabilidades coinciden con `docker-compose.yml` y el codigo; no se representa ningun frontend | OK |

## Git, README y entrega (10 puntos)

| Criterio | Evidencia | Estado |
| --- | --- | --- |
| Repositorio publico | <https://github.com/gonzaloapaza-creator/segundo_examen_Web2> | OK (ver nota en `08-resultados-verificacion.md` sobre la comprobacion de acceso sin autenticacion) |
| Historial Git Flow (ramas `feature/*`/`fix/*` integradas en `develop`, release fusionada en `main` y de vuelta en `develop`, merges `--no-ff`) | Ramas `develop`, `feature/backend-foundation`, `feature/gateway`, `feature/docs`, `fix/line-endings`, `fix/tsconfig-forward-compat`, `feature/cierre-tecnico`, `release/1.0.0` publicadas en `origin` | OK |
| Release `v1.0.0` fusionada en `main` | `release/1.0.0` fusionada en `main` (y de vuelta en `develop`); etiqueta anotada `v1.0.0` | OK (ver `docs/08-resultados-verificacion.md` para los SHA exactos verificados) |
| README con clonacion, ejecucion con Docker Compose y pruebas cURL/Postman | `README.md` secciones 5-13 | OK |
| Informe PDF (5-8 paginas) con evidencias reales | `docs/BASE_PARA_INFORME.md` + `docs/GUIA_PRUEBAS_Y_CAPTURAS.md` | **PENDIENTE (estudiante)** |
| Entrega en Moodle | - | **PENDIENTE (estudiante)** |
