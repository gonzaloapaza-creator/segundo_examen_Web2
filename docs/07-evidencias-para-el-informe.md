# StockGuard - Evidencias a capturar para el informe PDF

Lista de capturas/salidas **reales** que el estudiante debe tomar en su maquina para el informe (5-8 paginas).
No incluir capturas simuladas. Sugerencia: guardar en `docs/evidencias/` (carpeta no versionada si contiene datos locales).

## A. Arquitectura y despliegue

1. `docker compose ps` con los tres servicios `healthy` y solo el Gateway con puerto publicado.
2. `docker compose up --build -d` desde un clon limpio (fragmento final con "Healthy"/"Started").
3. `docker images stockguard/*` mostrando etiquetas de version (sin `latest`).
4. Diagramas C4: `docs/diagrams/export/c4-level1-context.png` y `c4-level2-containers.png`.

## B. Gateway (caracteristicas transversales)

5. `curl.exe -i http://localhost:8080/health` con `X-Request-ID`.
6. Preflight CORS permitido (204 + `Access-Control-Allow-Origin`) y no permitido (sin la cabecera).
7. Respuesta 429 JSON (`code: RATE_LIMITED`) y el conteo de 200/429 de la rafaga.
8. Linea de log JSON del Gateway (`docker compose logs gateway`) y la linea del backend con el **mismo** `request_id`.
9. Error 404/409 del backend atravesando el Gateway con cabeceras CORS.

## C. Backend (reglas de negocio)

10. Swagger UI en `http://localhost:8080/docs` (vista de grupos) y `GET /docs/openapi.json`.
11. Creacion de producto con `stock: 0` y `referencePrice` como cadena.
12. 400 `VALIDATION_ERROR` con `details[]` (por ejemplo, `stock` en el body).
13. 409 `CATEGORY_NAME_TAKEN` y 409 `CATEGORY_HAS_PRODUCTS`.
14. Movimiento OUT 201 con `previousStock`/`resultingStock`.
15. Reintento idempotente: misma clave -> `Idempotent-Replayed: true`, mismo `id`.
16. Misma clave con contenido distinto -> 409 `IDEMPOTENCY_KEY_REUSED`.
17. 409 `INSUFFICIENT_STOCK` con `details.available`.
18. Reversion 201 con `reversesMovementId`; segunda reversion 409 `MOVEMENT_ALREADY_REVERSED`; detalle con `reversedByMovementId`.
19. Baja logica: 409 `PRODUCT_HAS_STOCK`, luego 204, luego `GET` con `isActive: false` y 409 `PRODUCT_INACTIVE` al mover.
20. Reportes `low-stock` y `summary`.
21. `/api/v1/health/ready` con 503 tras `docker compose stop db` y 200 tras `start db`.

## D. Concurrencia e idempotencia

22. Salida del smoke test (`.\scripts\smoke-test.ps1`) con `Dos salidas simultaneas ... -> [201, 409]` y `Stock final = 0`.
23. Resultado de `docker compose -f docker-compose.test.yml run --rm --build backend-test` (35 pruebas, incluidas "dos salidas simultaneas", "reintentos simultaneos con la misma clave", "transaccion revertida").

## E. Persistencia

24. `docker compose down` + `docker compose up -d` y `GET /api/v1/reports/summary` con los mismos valores; log "Esquema al dia" y seed con `movementsReplayed`.
25. `docker volume ls` mostrando `stockguard-pgdata`.

## F. Pruebas y herramientas

26. Postman: coleccion importada y resultado del Runner (o salida de Newman).
27. Tabla de PostgreSQL: `docker compose exec db psql -U stockguard -d stockguard -c "\d inventory_movements"` mostrando las restricciones CHECK/UNIQUE.

## G. Git Flow

28. `git log --oneline --graph --all` con `main`, `develop` y ramas `feature/*`.
29. Pagina del repositorio publico y, si aplica, el Pull Request a `develop`.
