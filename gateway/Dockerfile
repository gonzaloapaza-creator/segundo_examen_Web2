# Gateway StockGuard: Nginx como proxy inverso y unico punto de entrada HTTP.
FROM nginx:1.28.2-alpine

# Valores por defecto (sobrescribibles desde docker-compose / .env)
ENV BACKEND_HOST=backend \
    BACKEND_PORT=3000 \
    CORS_ALLOWED_ORIGINS="http://localhost:5173|http://127.0.0.1:5173|http://localhost:8080" \
    RATE_LIMIT_RPS=10 \
    RATE_LIMIT_BURST=20 \
    CLIENT_MAX_BODY_SIZE=1m \
    PROXY_READ_TIMEOUT=30 \
    PROXY_CONNECT_TIMEOUT=5 \
    NGINX_ENVSUBST_FILTER="^(BACKEND_HOST|BACKEND_PORT|RATE_LIMIT_RPS|RATE_LIMIT_BURST|CLIENT_MAX_BODY_SIZE|PROXY_READ_TIMEOUT|PROXY_CONNECT_TIMEOUT)$"

# Configuracion principal (logs JSON, server_tokens off) y plantillas renderizadas por envsubst al arrancar
COPY nginx.conf /etc/nginx/nginx.conf
COPY templates/ /etc/nginx/templates/
COPY snippets/ /etc/nginx/snippets/
# Genera el mapa de origenes CORS escapando los puntos (se ejecuta antes del envsubst oficial, orden 20)
COPY docker-entrypoint.d/15-cors-origins.sh /docker-entrypoint.d/15-cors-origins.sh
# Pagina estatica de bienvenida con enlaces a Swagger, OpenAPI y salud
COPY html/ /usr/share/nginx/html/

RUN chmod +x /docker-entrypoint.d/15-cors-origins.sh && rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
