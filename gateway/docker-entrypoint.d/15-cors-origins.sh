#!/bin/sh
# Genera /etc/nginx/conf.d/00-cors-map.conf a partir de CORS_ALLOWED_ORIGINS.
# Formato de la variable: origenes separados por "|" (ej. http://localhost:5173|http://127.0.0.1:5173).
# Se escapan los puntos para que la comparacion sea literal: nunca se refleja un origen arbitrario.
set -eu

ORIGINS="${CORS_ALLOWED_ORIGINS:-}"
ESCAPED="$(printf '%s' "$ORIGINS" | sed -e 's/[.]/\\./g' -e 's/[[:space:]]//g')"
OUT=/etc/nginx/conf.d/00-cors-map.conf

{
  echo "# Generado automaticamente desde CORS_ALLOWED_ORIGINS=\"$ORIGINS\""
  echo "map \$http_origin \$cors_origin {"
  echo "    default \"\";"
  if [ -n "$ESCAPED" ]; then
    echo "    \"~^(${ESCAPED})\$\" \$http_origin;"
  fi
  echo "}"
} > "$OUT"

echo "[gateway] CORS permitido para: ${ORIGINS:-<ninguno>}"
