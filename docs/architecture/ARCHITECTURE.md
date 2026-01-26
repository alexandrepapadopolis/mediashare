# Phosio — Arquitetura (Estado Atual)

## 1. Objetivo deste documento

Este **ARCHITECTURE.md** descreve a **arquitetura atual e efetivamente implementada** do projeto **Phosio**, após a migração da base original (SPA) para um modelo **SSR / MPA**, utilizando **Remix** como framework principal.

Este documento tem como objetivos:

- Documentar **como o sistema funciona hoje**
- Servir como **referência técnica confiável** para manutenção e evolução
- Evitar divergência entre documentação e código

A arquitetura **SPA original** não faz mais parte do sistema ativo.  
Ela foi preservada **apenas para fins históricos** no arquivo:

➡ **`ARCHITECTURE-LEGACY.md` (Apêndice histórico)**

---

## 2. Visão arquitetural (atual)

O Phosio adota uma arquitetura **server-first**, com renderização no servidor e responsabilidades claramente separadas entre **cliente**, **servidor** e **infraestrutura**.

### Princípios fundamentais

- **Não-SPA**: navegação baseada em múltiplas páginas (MPA)
- **SSR por padrão**: HTML renderizado no servidor
- **Supabase como BaaS** (Auth, Database, Storage)
- **Sessão gerenciada no servidor**
- **`.env` como fonte única de configuração**
- **Docker como ambiente canônico de execução**

---

## 3. Stack tecnológica

### Aplicação Web

- Remix 2 (SSR / MPA)
- React 18
- TypeScript
- Tailwind CSS
- shadcn/ui (Radix UI)

### Backend (BaaS)

- Supabase (executado localmente via Docker)
  - Postgres
  - Auth
  - Storage
  - PostgREST
  - Realtime
  - Kong API Gateway

### Infraestrutura

- Node.js 20
- Docker
- Docker Compose v2
- Supabase CLI (via `npx`)

---

## 4. Execução por ambiente

### Desenvolvimento (DEV)

- Remix Dev Server
- Hot reload (frontend e backend)
- Porta: http://localhost:3000

### Produção (PROD)

- Build do Remix executado em Node.js
- Mesmo modelo SSR do DEV
- Porta externa: http://localhost:8080
- Container expõe internamente a porta 3000

> DEV e PROD compartilham a **mesma arquitetura**; apenas o modo de execução difere.

---

## 5. Estrutura do repositório (atual)

### Raiz

- `docker-compose.yml`: definição dos serviços (app-dev / app-prod)
- `Dockerfile`: build da aplicação
- `.env` / `.env.example`: configuração local (server-only)
- `ambiente.ps1` / `ambiente.bat`: orquestração de ambiente (up / down / reset / restart)
- `docs/`: documentação técnica e histórica

### Aplicação (Remix)

- `app/`
  - `routes/`: rotas SSR
    - `_index.tsx`: landing pública
    - `login.tsx`, `signup.tsx`, `verify-email.tsx`
    - `app._index.tsx`: área autenticada (/app)
    - `app.media.$id.tsx`: detalhe de mídia
    - `app.upload.tsx`: upload SSR
  - `utils/`
    - `env.server.ts`: leitura e validação de variáveis de ambiente
    - `session.server.ts`: gestão de sessão (cookies httpOnly)
    - `supabase.server.ts`: integração server-side com Supabase
  - `tailwind.css`: estilos globais

> O diretório `src/` da SPA original **não faz mais parte da arquitetura ativa**.

---

## 6. Rotas e navegação

As rotas são definidas **no servidor**, seguindo o modelo file-based routing do Remix.

### Exemplos de rotas

- `/` → landing pública
- `/login` → autenticação
- `/signup` → criação de conta
- `/app` → área autenticada
- `/app/media/:id` → detalhe da mídia

### Proteção de rotas

- Validação de sessão ocorre nos **loaders SSR**
- Usuários não autenticados são redirecionados para `/login`
- Tokens **não são expostos ao cliente**

---

## 7. Autenticação e sessão

- Autenticação baseada no **Supabase Auth**
- Sessão persistida via **cookies httpOnly**
- Tokens manipulados apenas no servidor
- Não há uso de `localStorage` para sessão

### Benefícios

- Menor superfície de ataque
- Melhor controle de expiração
- Comportamento consistente entre DEV e PROD

---

## 8. Integração com Supabase

### Banco e APIs

- Chamadas ao PostgREST feitas **exclusivamente no servidor**
- Autorização via `SUPABASE_ANON_KEY` + token de sessão
- Operações administrativas utilizam `SUPABASE_SERVICE_ROLE_KEY` (server-only)

### Storage

- Upload e geração de signed URLs realizados no SSR
- URLs temporárias com TTL curto
- Metadados persistidos no banco

---

## 9. Modelo de dados

- Banco Postgres gerenciado pelo Supabase
- Migrações versionadas em `supabase/migrations/`
- Entidade central: **media**
  - Associação com usuários
  - Tags normalizadas
  - Metadados estruturados (JSONB)

O modelo de dados é considerado **estável** e evolui de forma incremental.

---

## 10. Segurança

Práticas adotadas:

- Cookies `httpOnly`
- Separação clara entre client e server
- Validação de inputs no servidor
- Redirecionamento seguro (anti open-redirect)
- Uso restrito de chaves sensíveis
- Reset destrutivo explícito (nunca implícito)

---

## 11. UX e acessibilidade

- Mobile-first
- HTML semântico renderizado no servidor
- Estados claros: loading / empty / error
- Componentes reutilizáveis via shadcn/ui
- Base preparada para WCAG AA

---

## 12. Estratégia de evolução

A base atual já cumpre os requisitos de **SSR / MPA**.

Evoluções previstas:

- Hardening de headers de segurança
- Rate limiting em autenticação
- Testes automatizados (unit / integration)
- Observabilidade (logs estruturados)

---

## 13. Referências

- Execução e ambientes: `README.md`
- Arquitetura legada (SPA): `ARCHITECTURE-LEGACY.md`
- Plano histórico de migração: `docs/architecture/phosio-mpa-ssr-plan.full.json`
- Migrações do banco: `supabase/migrations/*`
