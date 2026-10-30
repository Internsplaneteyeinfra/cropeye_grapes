### Build stage
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm ci

# Build
COPY . .
RUN npm run build

### Runtime stage
FROM nginx:1.27-alpine

# Nginx template + entrypoint to inject $PORT at runtime (Render)
# hadolint ignore=DL3018
RUN apk add --no-cache gettext

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Render uses a single port provided via $PORT
EXPOSE 10000

ENTRYPOINT ["/docker-entrypoint.sh"]
