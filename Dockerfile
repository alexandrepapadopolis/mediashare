# build
FROM node:20-bookworm-slim AS build
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

# evita o aviso de update do npm
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# garante cadeia TLS/certificados em imagem slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copia manifestos primeiro para aproveitar cache
COPY package.json package-lock.json* ./

# Instalação determinística se houver lockfile
RUN if [ -f package-lock.json ]; then \
      npm ci --foreground-scripts --no-audit --no-fund; \
    else \
      npm install --foreground-scripts --no-audit --no-fund; \
    fi

# Copia o restante do projeto
COPY . .

# Build do Vite com variáveis somente em build-time (não persiste ENV na imagem)
RUN VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
    VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
    npm run build

# runtime
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
