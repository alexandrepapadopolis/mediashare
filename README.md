# Phosio

Phosio é uma aplicação web para **catálogo e gerenciamento de mídias**, organizada por categorias (fotos, vídeos e áudios), construída com **Remix (React + TypeScript, SSR/MPA)** e integrada ao **Supabase** para autenticação, banco de dados, storage e APIs.

O projeto foi originalmente concebido como uma SPA, mas encontra-se **em migração completa para uma arquitetura de múltiplas páginas com renderização no servidor (SSR)**, priorizando segurança, previsibilidade de ambiente e isolamento de infraestrutura.

A execução local é feita de forma **reprodutível via Docker**, com separação clara entre **ambiente de desenvolvimento** e **ambiente de produção**.

---

## Arquitetura

### Frontend / Web
- Remix 2 (SSR / MPA)
- React 18
- TypeScript
- Tailwind CSS + shadcn/ui
- Renderização no servidor (Node.js)
- Rotas protegidas via loaders/actions (SSR)

### Backend (BaaS)
- Supabase (executado localmente via Docker)
  - Postgres
  - Auth
  - Storage
  - PostgREST
  - Realtime
  - Kong API Gateway

### Infraestrutura
- Docker
- Docker Compose (v2)
- Node.js 20 (runtime)
- Nginx (somente para cenários externos; não obrigatório no fluxo padrão)

---

## Pré-requisitos

- Docker Desktop (com Docker Compose v2)
- Git
- Node.js 20+ (opcional; apenas fora do container)

---

## Estrutura de ambientes

### Desenvolvimento (DEV)
- Remix Dev Server (SSR)
- Hot reload
- Porta: http://localhost:3000

### Produção (PROD)
- Build do Remix executado em Node.js
- Porta externa: http://localhost:8080
- Container expõe internamente a porta 3000

---

## Variáveis de ambiente

As variáveis de ambiente **não são versionadas**.

O projeto utiliza **exclusivamente o arquivo `.env` local**, localizado na raiz do repositório.

### Exemplo (`.env.example`)

```env
MEDIA_PATH=E:/mediashare-files

SUPABASE_URL=http://host.docker.internal:54321
SUPABASE_ANON_KEY=sb_publishable__REPLACE_ME__
SUPABASE_SERVICE_ROLE_KEY=sb_secret__REPLACE_ME__

SUPABASE_STORAGE_BUCKET=media
MEDIASHARE_SYSTEM_USER_ID=__REPLACE_ME_UUID__

SESSION_SECRET=__GENERATE_STRONG_SECRET__
```

> Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no frontend.

---

## Subindo o projeto

### Desenvolvimento
```bash
ambiente up dev
```

Acesse: http://localhost:3000

### Produção
```bash
ambiente up prod
```

Acesse: http://localhost:8080

---

## Encerrando o ambiente
```bash
ambiente down dev
```

---

## Reset completo (destrutivo)
```bash
ambiente reset dev
```

---

## Reiniciar somente a aplicação
```bash
ambiente restart dev
```

---

## Rodando sem Docker (opcional)

```bash
npm install
npm run dev
```

O Supabase ainda precisa estar ativo via Docker.

---

## Scripts disponíveis

- npm run dev
- npm run build
- npm run start
- npm run lint

---

## Troubleshooting

### Dados não carregam
- Verifique se o Supabase está ativo
- Confirme `SUPABASE_URL`

### Porta em uso
```bash
ambiente down dev
```

---

## Boas práticas adotadas

- `.env` como fonte única de verdade
- SSR por padrão
- Separação DEV / PROD
- Infraestrutura reproduzível

---

## Licença

Projeto privado.
