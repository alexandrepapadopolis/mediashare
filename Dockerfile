# build
FROM node:20-bullseye-slim AS build
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

COPY package.json ./

# Se o lockfile não existir (ou você remover), cai no npm install
RUN if [ -f package-lock.json ]; then \
      npm ci --foreground-scripts --no-audit --no-fund; \
    else \
      npm install --foreground-scripts --no-audit --no-fund; \
    fi

COPY . .
RUN npm run build

# runtime
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
