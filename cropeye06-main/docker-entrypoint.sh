#!/usr/bin/env sh
set -eu

# Render provides $PORT. Default for local docker run.
: "${PORT:=10000}"

# Optional upstreams for unified routing behind ONE domain.
# If these are not set, we do NOT add proxy routes (so Render deploy won't break).
: "${GATEWAY_UPSTREAM:=}"
: "${SUGARCANE_UPSTREAM:=}"

# Base config (SPA)
envsubst '${PORT}' < /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/default.conf

# Conditionally append reverse-proxy locations if upstreams are provided.
if [ -n "${GATEWAY_UPSTREAM}" ]; then
  cat >> /etc/nginx/conf.d/default.conf <<EOF

  location /login {
    proxy_pass ${GATEWAY_UPSTREAM};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
EOF
fi

if [ -n "${SUGARCANE_UPSTREAM}" ]; then
  cat >> /etc/nginx/conf.d/default.conf <<EOF

  location /sugarcane/ {
    proxy_pass ${SUGARCANE_UPSTREAM}/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
EOF
fi

# Close server block (template ended it). We appended inside server, so re-open/close correctly.
# The template ends with '}', so we need to insert locations before that. To keep it simple:
# rewrite the config by moving the last '}' to the end after appends.
tmp="/tmp/nginx.conf"
sed '$d' /etc/nginx/conf.d/default.conf > "$tmp"
mv "$tmp" /etc/nginx/conf.d/default.conf

# Re-append the conditional blocks again (they were appended after the closing brace removal)
if [ -n "${GATEWAY_UPSTREAM}" ]; then
  cat >> /etc/nginx/conf.d/default.conf <<EOF

  location /login {
    proxy_pass ${GATEWAY_UPSTREAM};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
EOF
fi

if [ -n "${SUGARCANE_UPSTREAM}" ]; then
  cat >> /etc/nginx/conf.d/default.conf <<EOF

  location /sugarcane/ {
    proxy_pass ${SUGARCANE_UPSTREAM}/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
EOF
fi

echo "}" >> /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
