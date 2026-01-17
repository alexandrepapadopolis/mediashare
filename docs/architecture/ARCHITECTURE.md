# Phosio — Arquitetura (Atual) e Direção de Evolução (SSR/MPA)

## 1. Objetivo deste documento

Este **ARCHITECTURE.md** descreve:

1) **Como o repositório está estruturado hoje** (stack, pastas, execução, rotas e integrações).  
2) A **direção arquitetural** definida para atender ao requisito de **não-SPA** (MPA/SSR), com um plano incremental.

Este arquivo é a leitura “humana” do plano detalhado em:

- `docs/architecture/phosio-mpa-ssr-plan.full.json`

---

## 2. Stack e execução (estado atual)

### Frontend
- **React 18 + Vite + TypeScript**
- **Tailwind CSS + shadcn/ui**
- **React Router** (SPA)
- **TanStack React Query** (data fetching/cache)

### Backend/BaaS
- **Supabase local via Docker** (Auth, Postgres, Storage, PostgREST, Realtime, Kong)

### Infra / execução
- DEV: Vite HMR em `http://localhost:5173`
- PROD: build estático servido via **Nginx** em `http://localhost:8080`
- Scripts principais:
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
  - `npm run lint`

---

## 3. Estrutura do repositório (estado atual)

### Raiz
- `docker-compose.yml`, `Dockerfile`, `nginx.conf`: infra e execução (DEV/PROD)
- `.env` / `.env.example`: configuração local (Supabase URL e publishable key)
- `ambiente.bat` / `ambiente.ps1`: scripts para subir/descer o ambiente com Docker
- `dist/`: artefatos de build (produção)
- `docs/`: documentação do projeto
  - `docs/acesso-rede-local.md`
  - `docs/remocao-lovable.md`
  - `docs/architecture/ARCHITECTURE.md` (este arquivo)
  - `docs/architecture/phosio-mpa-ssr-plan.full.json` (plano detalhado)

### Aplicação (SPA)
- `src/main.tsx`: bootstrap do React (entrypoint)
- `src/App.tsx`: composição principal da aplicação e roteamento
- `src/pages/`:
  - `Index.tsx`: página inicial do app (catálogo/listagem)
  - `Upload.tsx`: upload de mídia
  - `Auth.tsx`: autenticação (tela/fluxo atual)
  - `NotFound.tsx`: 404
- `src/components/`:
  - `Header.tsx`: cabeçalho/navegação
  - `MediaGrid.tsx`, `MediaCard.tsx`, `MediaViewer.tsx`: UI principal de catálogo e visualização
  - `CategoryFilter.tsx`: filtros/categorias
  - `UploadForm.tsx`: formulário de upload
  - `ui/`: componentes shadcn/ui (Radix UI)
- `src/hooks/`:
  - `useAuth.tsx`: estado/integração de autenticação
  - `useMedia.tsx`: queries e manipulação de mídia
  - `use-toast.ts`, `use-mobile.tsx`: utilitários de UI/UX
- `src/integrations/supabase/`:
  - `client.ts`: inicialização do client Supabase (browser)
  - `types.ts`: types gerados/definidos para Supabase
- `src/db/init/01-base-media-share.sql`: bootstrap/SQL base (legado de inicialização)
- `supabase/migrations/`: esquema e evolução do banco (tags normalizadas, checks etc.)

---

## 4. Rotas e fluxo do usuário (estado atual)

### Rotas SPA (React Router)
As rotas são definidas no frontend (ex.: em `src/App.tsx`), tipicamente incluindo:

- Página principal do app (catálogo): `src/pages/Index.tsx`
- Upload: `src/pages/Upload.tsx`
- Autenticação: `src/pages/Auth.tsx`
- Não encontrado: `src/pages/NotFound.tsx`

### Fluxo atual (alto nível)
- Usuário acessa a SPA e navega via React Router
- Autenticação e sessão são gerenciadas no cliente (via `useAuth` e Supabase JS)
- Dados de mídia são consultados/atualizados via Supabase (client-side) e React Query

---

## 5. Autenticação e sessão (estado atual)

- A integração com Supabase Auth existe e é consumida no **browser** (Supabase JS).
- Padrão típico neste modelo: sessão/token acessível no cliente (dependendo da implementação do `useAuth`).
- Proteção de rotas, quando existe, tende a ocorrer no frontend (route guards).

Implicação: embora funcione, este modelo tem limitações para:
- SEO (conteúdo principal depende de JS)
- Segurança (superfície maior no cliente)
- Controle de cache/performance (renderização no navegador)

---

## 6. Modelo de dados e tags (estado atual)

O repositório inclui migrações Supabase em `supabase/migrations/`, incluindo normalização de tags e checks.  
Isso indica que o domínio “mídias + tags” é parte central do produto e deve ser preservado e aprofundado na evolução do app.

---

## 7. Direção de evolução: SSR/MPA (não-SPA)

### Meta
Atender aos requisitos funcionais e não funcionais do produto **Phosio**:

- **Não ser SPA**
- Adotar **SSR/MPA**
- Melhorar SEO, performance e segurança
- Manter Supabase como BaaS
- Introduzir rotas dedicadas:
  - `/` (landing pública)
  - `/login`, `/signup`, `/verify-email`
  - `/app` (área autenticada)

### Abordagem recomendada
- Migrar para **Remix** (SSR-first), por alinhamento com React Router e suporte natural a loaders/actions.
- Gerenciar sessão via **cookies httpOnly** no servidor (evitar tokens em `localStorage`).
- Executar app SSR em Node.js; Nginx passa a ser reverse proxy (e não apenas server estático).

### Organização esperada (pós-migração)
- Criar diretório `app/` (Remix) com rotas SSR:
  - `app/routes/_index.tsx` (landing)
  - `app/routes/login.tsx`
  - `app/routes/signup.tsx`
  - `app/routes/verify-email.tsx`
  - `app/routes/app._index.tsx` (/app)
  - `app/routes/app.media.$id.tsx` (detalhe)
- Criar utilitários server-side:
  - `app/utils/supabase.server.ts`
  - `app/utils/auth.server.ts`

Observação: esta estrutura ainda **não está implementada** na base atual; ela é o alvo arquitetural do plano.

---

## 8. Segurança (alvo para SSR/MPA)

Regras mínimas a cumprir na migração:

- Sessão via cookie **httpOnly**, `Secure` em produção e `SameSite` apropriado
- Proteção de rotas no servidor (redirect para `/login` quando não autenticado)
- Validação de inputs no servidor (forms e querystrings)
- Headers de segurança (CSP, Referrer-Policy, Permissions-Policy)
- Proteção CSRF para actions SSR
- Rate limiting básico em endpoints sensíveis (login, reenvio de verificação)

---

## 9. UX e acessibilidade (alvo)

- Mobile-first
- WCAG AA como referência mínima
- Navegação por teclado e foco visível
- Mensagens de erro claras e contextualizadas
- Estados consistentes: loading / empty / error
- Consistência visual: reaproveitar `src/components/ui` (shadcn) sempre que possível

---

## 10. Estratégia de execução (resumo)

O plano detalhado define passos P01–P12. A ordem recomendada para reduzir retrabalho é:

1. P01 — Inventário técnico (rotas, hooks, supabase, modelo de dados)
2. P02 — Bootstrap SSR (Remix) preservando Tailwind/shadcn
3. P03 — Auth SSR com cookies e proteção server-side
4. P04 — Landing pública (Phosio)
5. P05–P08 — Auth pages + /app (catálogo) + detalhe com relacionados
6. P09–P12 — Hardening de segurança + testes

---

## 11. Referências no repositório

- Plano detalhado: `docs/architecture/phosio-mpa-ssr-plan.full.json`
- README (execução/ambientes): `README.md`
- SPA atual:
  - `src/main.tsx`
  - `src/App.tsx`
  - `src/pages/*`
  - `src/integrations/supabase/client.ts`
- Banco/migrações:
  - `supabase/migrations/*`

