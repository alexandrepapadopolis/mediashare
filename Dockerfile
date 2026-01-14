# build
FROM node:20-bullseye-slim AS build
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json package-lock.json* ./

RUN if [ -f package-lock.json ]; then \
      npm ci --foreground-scripts --no-audit --no-fund; \
    else \
      npm install --foreground-scripts --no-audit --no-fund; \
    fi

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
