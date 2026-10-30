#!/usr/bin/env sh
set -eu

# Render provides $PORT. Default for local docker run.
: "${PORT:=10000}"

envsubst '${PORT}' < /etc/nginx/templates/nginx.render.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
