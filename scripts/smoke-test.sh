#!/usr/bin/env bash
# Smoke test de StockGuard a traves del Gateway (bash + curl; Git Bash en Windows, Linux o macOS).
# Crea datos con prefijo SMOKE-<timestamp>; no modifica los datos de demostracion.
# Uso: ./scripts/smoke-test.sh [BASE_URL]
set -u
BASE_URL="${1:-http://localhost:8080}"
ORIGIN="${ORIGIN:-http://localhost:5173}"
PASS=0; FAIL=0
STAMP=$(date +%Y%m%d%H%M%S)
PREFIX="SMOKE-$STAMP"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

check() { if [ "$2" = "1" ]; then PASS=$((PASS+1)); echo "[OK]   $1"; else FAIL=$((FAIL+1)); echo "[FAIL] $1 ${3:-}"; fi; }
json() { node -e "const o=JSON.parse(require('fs').readFileSync(0,'utf8'));const v=$1;console.log(v===undefined||v===null?'':(typeof v==='object'?JSON.stringify(v):v))" 2>/dev/null; }
# req METHOD PATH [BODY] [HEADER...] -> escribe estado en $TMP/status, cuerpo en $TMP/body, cabeceras en $TMP/headers
req() {
  local method=$1 path=$2 body=${3:-}; shift; shift; [ $# -gt 0 ] && shift
  local args=(-s -o "$TMP/body" -D "$TMP/headers" -w "%{http_code}" -X "$method" "$BASE_URL$path")
  [ -n "$body" ] && args+=(-H "Content-Type: application/json" -d "$body")
  for h in "$@"; do args+=(-H "$h"); done
  curl "${args[@]}" > "$TMP/status"
}
status() { cat "$TMP/status"; }
hdr() { grep -i "^$1:" "$TMP/headers" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
field() { json "o$1" < "$TMP/body"; }

echo "== StockGuard smoke test contra $BASE_URL (prefijo $PREFIX) =="

req GET /health; check "Gateway /health -> 200" $([ "$(status)" = 200 ] && echo 1 || echo 0)
req GET /api/v1/health/ready; check "Backend ready -> 200 database=up" $([ "$(status)" = 200 ] && [ "$(field .checks.database)" = up ] && echo 1 || echo 0)
check "X-Request-ID presente" $([ -n "$(hdr X-Request-ID)" ] && echo 1 || echo 0)
req GET /docs; check "Swagger /docs -> 200" $([ "$(status)" = 200 ] && echo 1 || echo 0)
req GET /docs/openapi.json; check "OpenAPI JSON -> 200" $([ "$(status)" = 200 ] && echo 1 || echo 0)

req POST /api/v1/categories "{\"name\":\"$PREFIX categoria\",\"description\":\"smoke\"}"; CAT=$(field .id)
check "POST /categories -> 201" $([ "$(status)" = 201 ] && echo 1 || echo 0)
req POST /api/v1/categories "{\"name\":\"$PREFIX CATEGORIA\"}"
check "Categoria duplicada -> 409 CATEGORY_NAME_TAKEN" $([ "$(status)" = 409 ] && [ "$(field .code)" = CATEGORY_NAME_TAKEN ] && echo 1 || echo 0)
req POST /api/v1/products "{\"sku\":\"$PREFIX-SKU\",\"name\":\"$PREFIX producto\",\"referencePrice\":\"19.90\",\"minimumStock\":2,\"categoryId\":\"$CAT\"}"; PID=$(field .id)
check "POST /products -> 201 stock 0 precio '19.90'" $([ "$(status)" = 201 ] && [ "$(field .stock)" = 0 ] && [ "$(field .referencePrice)" = 19.90 ] && echo 1 || echo 0)
req POST /api/v1/products '{"sku":"x","name":"","referencePrice":"-1","categoryId":"no-uuid","stock":5}'
check "Producto invalido -> 400 VALIDATION_ERROR" $([ "$(status)" = 400 ] && [ "$(field .code)" = VALIDATION_ERROR ] && echo 1 || echo 0)
req DELETE "/api/v1/categories/$CAT"
check "DELETE categoria con productos -> 409" $([ "$(status)" = 409 ] && [ "$(field .code)" = CATEGORY_HAS_PRODUCTS ] && echo 1 || echo 0)

KEY_IN="$PREFIX-in-0001"
req POST /api/v1/movements "{\"productId\":\"$PID\",\"type\":\"IN\",\"quantity\":5,\"reason\":\"Compra inicial smoke\"}" "Idempotency-Key: $KEY_IN"; IN_ID=$(field .id)
check "IN 5 -> 201 resultingStock=5" $([ "$(status)" = 201 ] && [ "$(field .resultingStock)" = 5 ] && echo 1 || echo 0)
req POST /api/v1/movements "{\"productId\":\"$PID\",\"type\":\"IN\",\"quantity\":5,\"reason\":\"Compra inicial smoke\"}" "Idempotency-Key: $KEY_IN"
check "Reintento misma clave -> replay (mismo id, Idempotent-Replayed: true)" $([ "$(status)" = 201 ] && [ "$(field .id)" = "$IN_ID" ] && [ "$(hdr Idempotent-Replayed)" = true ] && echo 1 || echo 0)
req POST /api/v1/movements "{\"productId\":\"$PID\",\"type\":\"IN\",\"quantity\":6,\"reason\":\"Compra inicial smoke\"}" "Idempotency-Key: $KEY_IN"
check "Misma clave, contenido distinto -> 409 IDEMPOTENCY_KEY_REUSED" $([ "$(status)" = 409 ] && [ "$(field .code)" = IDEMPOTENCY_KEY_REUSED ] && echo 1 || echo 0)
req POST /api/v1/movements "{\"productId\":\"$PID\",\"type\":\"IN\",\"quantity\":1,\"reason\":\"Sin clave\"}"
check "Sin Idempotency-Key -> 400" $([ "$(status)" = 400 ] && [ "$(field .code)" = IDEMPOTENCY_KEY_REQUIRED ] && echo 1 || echo 0)
req POST /api/v1/movements "{\"productId\":\"$PID\",\"type\":\"OUT\",\"quantity\":4,\"reason\":\"Venta smoke\"}" "Idempotency-Key: $PREFIX-out-0001"; OUT_ID=$(field .id)
check "OUT 4 -> 201 resultingStock=1" $([ "$(status)" = 201 ] && [ "$(field .resultingStock)" = 1 ] && echo 1 || echo 0)
req POST /api/v1/movements "{\"productId\":\"$PID\",\"type\":\"OUT\",\"quantity\":9,\"reason\":\"Venta imposible\"}" "Idempotency-Key: $PREFIX-out-0002"
check "OUT mayor al stock -> 409 INSUFFICIENT_STOCK" $([ "$(status)" = 409 ] && [ "$(field .code)" = INSUFFICIENT_STOCK ] && echo 1 || echo 0)

# Concurrencia: dos salidas simultaneas por la ultima unidad
for k in a b; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE_URL/api/v1/movements" -H "Content-Type: application/json" -H "Idempotency-Key: $PREFIX-race-$k" \
    -d "{\"productId\":\"$PID\",\"type\":\"OUT\",\"quantity\":1,\"reason\":\"Carrera smoke\"}" > "$TMP/race-$k" &
done; wait
RACE=$(cat "$TMP"/race-* | tr -d '\r' | sort | tr '\n' ',' | sed 's/,$//')
check "Dos salidas simultaneas -> 201,409" $([ "$RACE" = "201,409" ] && echo 1 || echo 0) "obtenido=$RACE"
req GET "/api/v1/products/$PID"; check "Stock final 0 tras la carrera" $([ "$(field .stock)" = 0 ] && echo 1 || echo 0)

req POST "/api/v1/movements/$OUT_ID/reversal" '{"reason":"Venta anulada smoke"}' "Idempotency-Key: $PREFIX-rev-0001"; REV_ID=$(field .id)
check "Reversion -> 201 IN vinculado" $([ "$(status)" = 201 ] && [ "$(field .type)" = IN ] && [ "$(field .reversesMovementId)" = "$OUT_ID" ] && echo 1 || echo 0)
req POST "/api/v1/movements/$OUT_ID/reversal" '{"reason":"Otra vez"}' "Idempotency-Key: $PREFIX-rev-0002"
check "Segunda reversion -> 409 MOVEMENT_ALREADY_REVERSED" $([ "$(status)" = 409 ] && [ "$(field .code)" = MOVEMENT_ALREADY_REVERSED ] && echo 1 || echo 0)
req GET "/api/v1/movements/$OUT_ID"; check "Detalle expone reversedByMovementId" $([ "$(field .reversedByMovementId)" = "$REV_ID" ] && echo 1 || echo 0)

req GET "/api/v1/reports/low-stock?limit=100"; check "low-stock -> 200" $([ "$(status)" = 200 ] && echo 1 || echo 0)
req GET /api/v1/reports/summary; check "summary -> 200" $([ "$(status)" = 200 ] && echo 1 || echo 0)

req OPTIONS /api/v1/movements "" "Origin: $ORIGIN" "Access-Control-Request-Method: POST" "Access-Control-Request-Headers: content-type, idempotency-key"
check "Preflight origen permitido -> 204 + Allow-Origin" $([ "$(status)" = 204 ] && [ "$(hdr Access-Control-Allow-Origin)" = "$ORIGIN" ] && echo 1 || echo 0)
req OPTIONS /api/v1/movements "" "Origin: http://evil.example" "Access-Control-Request-Method: POST"
check "Preflight origen no permitido -> sin Allow-Origin" $([ -z "$(hdr Access-Control-Allow-Origin)" ] && echo 1 || echo 0)
req GET /api/v1/products/00000000-0000-4000-8000-000000000000 "" "Origin: $ORIGIN"
check "Error 404 con CORS y requestId" $([ "$(status)" = 404 ] && [ "$(hdr Access-Control-Allow-Origin)" = "$ORIGIN" ] && [ -n "$(field .requestId)" ] && echo 1 || echo 0)

# 60 peticiones por una sola conexion keep-alive (supera RATE_LIMIT_RPS + RATE_LIMIT_BURST por defecto)
URLS=(); for i in $(seq 1 60); do URLS+=(-o /dev/null "$BASE_URL/api/v1/categories?limit=1"); done
C429=$(curl -s -w "%{http_code}\n" "${URLS[@]}" | grep -c '^429$')
check "Rate limiting: >=1 respuesta 429 en 60 peticiones rapidas" $([ "$C429" -ge 1 ] && echo 1 || echo 0) "429s=$C429"
sleep 3

req GET "/api/v1/products/$PID"; STOCK=$(field .stock)
if [ "$STOCK" != "0" ]; then req POST /api/v1/movements "{\"productId\":\"$PID\",\"type\":\"OUT\",\"quantity\":$STOCK,\"reason\":\"Limpieza smoke\"}" "Idempotency-Key: $PREFIX-cleanup"; fi
req DELETE "/api/v1/products/$PID"; check "Baja logica -> 204" $([ "$(status)" = 204 ] && echo 1 || echo 0)
req GET "/api/v1/products/$PID"; check "Inactivo consultable por id" $([ "$(status)" = 200 ] && [ "$(field .isActive)" = false ] && echo 1 || echo 0)

echo; echo "== Resultado: $PASS OK, $FAIL FAIL =="
[ "$FAIL" -eq 0 ]
