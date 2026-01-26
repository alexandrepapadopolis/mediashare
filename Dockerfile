# build
FROM node:20-bookworm-slim AS build
WORKDIR /app

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

# Build do Remix (SSR)
RUN npm run build

# runtime (Node)
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# Copia runtime mínimo
COPY --from=build /app/package.json /app/package-lock.json* /app/
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/build /app/build
COPY --from=build /app/public /app/public

EXPOSE 3000
CMD ["npm","run","start"]