# Phosio

Phosio é uma aplicação web para **catálogo e gerenciamento de mídias**, organizada por categorias, construída com **React + Vite + TypeScript** e integrada ao **Supabase** (Auth, Database, Storage e APIs).

O projeto é totalmente executável em ambiente local usando **Docker**, com separação clara entre **ambiente de desenvolvimento (hot reload)** e **ambiente de produção (build + Nginx)**.

---

## Arquitetura

- **Frontend**
  - Vite
  - React 18
  - TypeScript
  - Tailwind CSS + shadcn/ui
  - React Router
  - TanStack React Query

- **Backend (BaaS)**
  - Supabase (local via Docker)
    - Postgres
    - Auth
    - Storage
    - PostgREST
    - Realtime
    - Kong API Gateway

- **Infra**
  - Docker
  - Docker Compose
  - Nginx (produção)

---

## Pré-requisitos

- Docker Desktop (com Docker Compose v2)
- Git
- Node.js 20+ (opcional, apenas se rodar fora do container)

---

## Estrutura de ambientes

### Desenvolvimento (DEV)
- Vite com hot reload
- Porta: http://localhost:5173

### Produção (PROD)
- Build estático servido via Nginx
- Porta: http://localhost:8080

---

## Variáveis de ambiente

As variáveis de ambiente **não são versionadas**.

Crie um arquivo `.env` na raiz do projeto.

### Exemplo (`.env.example`)

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxx
```

Copie para `.env` e ajuste conforme necessário.

> Não utilize variáveis globais do sistema (setx / export).  
> O projeto foi projetado para usar exclusivamente o `.env` local.

---

## Supabase local

O Supabase roda localmente via Docker, incluindo:

- API Gateway (Kong): http://localhost:54321
- Supabase Studio: http://localhost:54323
- Postgres interno

Suba o Supabase antes do frontend.

---

## Subindo o projeto

### Usando script de ambiente (recomendado)

#### DEV
```
ambiente up dev
```

Acesse:
http://localhost:5173

#### PROD
```
ambiente up prod
```

Acesse:
http://localhost:8080

### Encerrar tudo
```
ambiente down dev
```

---

## Rodando sem Docker (opcional)

```
npm install
npm run dev
```

O Supabase ainda deve estar rodando via Docker.

---

## Scripts disponíveis

- npm run dev
- npm run build
- npm run preview
- npm run lint

---

## Troubleshooting

### Frontend tenta acessar localhost:8000
Causa: variável de ambiente incorreta.

Solução:
- Verifique `.env`
- Use `VITE_SUPABASE_URL=http://127.0.0.1:54321`
- Suba o ambiente via script

### Dados não carregam
- Verifique se o Supabase está ativo
- Verifique Kong (porta 54321)

### Porta em uso
Finalize ambientes com:
```
ambiente down dev
```

---

## Boas práticas adotadas

- Isolamento total de plataformas externas
- `.env` como fonte única de verdade
- Separação DEV / PROD
- Infra reproduzível com Docker

---

## Licença

Projeto privado.
