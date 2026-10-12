# StockGuard - Matriz de cumplimiento de la rubrica (fase 1)

Estado: **OK** = implementado y verificado en este entorno; **PENDIENTE** = requiere accion del estudiante o segunda fase.

| Criterio de evaluacion | Evidencia en el repositorio | Verificacion realizada | Estado |
| --- | --- | --- | --- |
| API Gateway como proxy inverso y unico punto de entrada HTTP | `gateway/` (Dockerfile, `nginx.conf`, `templates/10-stockguard.conf.template`, `snippets/`), `docker-compose.yml` (solo `gateway` publica `8080:80`) | `docker compose ps` muestra puertos solo en gateway; rutas `/api/v1`, `/docs`, `/health` responden por 8080 | OK |
| >= 2 caracteristicas transversales en el Gateway | CORS por lista blanca, logs JSON, rate limiting 429, `X-Request-ID` generado/propagado, limites de tamano y timeouts | Smoke test (`scripts/smoke-test.*`) y Newman: preflight permitido/no permitido, 429 JSON, requestId compartido en logs de gateway y backend | OK |
| Microservicio NestJS con CRUD, logica de negocio y persistencia | `backend/src/{categories,products,movements,reports,health}` + TypeORM/PostgreSQL | 29 pruebas de integracion con PostgreSQL real + 6 unitarias (35/35), Newman 151 aserciones | OK |
| Uso de DTO, Repository e inyeccion de dependencias | `*/dto/*.dto.ts`, `*.repository.ts`, constructores `@Injectable()` con providers por modulo | Compilacion `tsc` y pruebas | OK |
| Dockerfiles para Gateway y backend | `gateway/Dockerfile`, `backend/Dockerfile` (multi-etapa, usuario `node`, `dumb-init`, HEALTHCHECK) | `docker compose up --build` construye ambas imagenes | OK |
| Docker Compose con Gateway, backend y BD, red bridge, depends_on y healthchecks | `docker-compose.yml` (`stockguard-net`, `depends_on.condition: service_healthy`, healthchecks con `wget`/`pg_isready`, volumen `stockguard-pgdata`) | Los tres servicios alcanzan `healthy`; persistencia tras `down`/`up` verificada | OK |
| Repositorio publico con historial Git Flow | Ramas `main`, `develop`, `feature/backend-foundation`, `feature/gateway`, `feature/docs`; commits convencionales; merges `--no-ff` | `git log --graph` local | **PENDIENTE**: crear el repositorio remoto publico, agregar `origin` y hacer push (ver README > Flujo de ramas) |
| README reproducible, documentacion de endpoints y pruebas | `README.md`, `docs/03-endpoints.md`, `docs/08-resultados-verificacion.md`, `postman/` | Flujo desde clon limpio probado con Docker Desktop en Windows | OK (la URL de clonacion debe completarse al publicar) |
| Diagramas C4 de contexto y contenedores | `docs/diagrams/*.puml` (editables) y `docs/diagrams/export/*.png|svg` | Exportados con PlantUML 1.2025.4 | OK |
| Informe PDF (5-8 paginas) con evidencias reales | `docs/07-evidencias-para-el-informe.md` (lista de capturas a tomar) | - | **PENDIENTE** (segunda fase, lo elabora el estudiante) |

## Requisitos funcionales especificos

| Requisito | Estado | Referencia |
| --- | --- | --- |
| CRUD categorias / productos | OK | `docs/03-endpoints.md` |
| Movimientos IN/OUT con stocks calculados en el servidor | OK | `MovementsService.applyMovement` |
| Rechazo de salidas superiores al stock | OK | prueba "rechaza salidas superiores al stock" |
| Transaccion unica + bloqueo de fila | OK | prueba "dos salidas simultaneas para la ultima unidad" (201/409, stock 0, un solo OUT) |
| Baja logica coordinada con movimientos | OK | prueba "la baja logica no puede intercalarse con un movimiento concurrente" |
| Idempotencia persistida (secuencial, simultanea, contenido distinto) | OK | pruebas "idempotencia" (3) + Newman |
| Reversion (valida, doble, de compensacion, stock insuficiente, concurrente) | OK | pruebas "reversiones" (4) |
| Reportes low-stock y summary | OK | prueba "stock bajo incluye solo activos..." |
| Health live/ready con 503 sin BD | OK (verificado: con `docker compose stop db`, `/api/v1/health/ready` responde 503 `SERVICE_UNAVAILABLE`; tras `start db` vuelve a 200) | `HealthController` |
| Validacion global, campos no permitidos, UUID, fechas, rangos | OK | pruebas de catalogo y movimientos |
| Formato de error unico con requestId | OK | `HttpExceptionFilter` |
| Swagger en `/docs` via Gateway + OpenAPI JSON | OK | `/docs`, `/docs/openapi.json` |
| Coleccion y entorno Postman | OK | `postman/` (Newman 109 peticiones, 151 aserciones, 0 fallos) |
| Migraciones versionadas, sin `synchronize` | OK | `backend/src/database/migrations` |
| Seed idempotente con stock normal, bajo y cero | OK | prueba "el seed es idempotente..." |
| Smoke test del sistema completo | OK | `scripts/smoke-test.ps1` (29/29) y `scripts/smoke-test.sh` (29/29) |
