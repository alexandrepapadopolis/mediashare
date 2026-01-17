# P01 — Baseline (Inventário técnico) — mediashare → Phosio

Este documento registra o **baseline técnico** do repositório `alexandrepapadopolis/mediashare` antes da migração para **SSR/MPA (não‑SPA)**.

## 1. Rotas atuais (SPA)

Arquivo: `src/App.tsx`

A aplicação é uma SPA com `react-router-dom` e define as rotas:

- `/` → `src/pages/Index.tsx` (catálogo/listagem principal)
- `/auth` → `src/pages/Auth.tsx` (login + cadastro em abas)
- `/upload` → `src/pages/Upload.tsx` (upload de mídia)
- `*` → `src/pages/NotFound.tsx` (404)

Bootstrap de providers (ordem atual):

1. `QueryClientProvider` (TanStack Query)
2. `AuthProvider` (contexto de autenticação via Supabase)
3. `TooltipProvider`
4. `Toaster` / `Sonner` (notificações)
5. `BrowserRouter` / `Routes`

Implicações para SSR:
- `BrowserRouter` e o roteamento SPA precisam ser substituídos por roteamento SSR (ex.: Remix routes).
- Providers e componentes UI são reaproveitáveis, mas o “entrypoint” muda (server-first).

## 2. Autenticação atual (Supabase Auth client-side)

### 2.1 Página de autenticação
Arquivo: `src/pages/Auth.tsx`

- Tela única (`/auth`) com tabs:
  - `login` (Entrar)
  - `signup` (Cadastrar)
- Após login/cadastro bem-sucedido: `navigate('/')`.
- Redirecionamento automático para `/` se `user` já existe (guard simples client-side):
  - `useEffect(() => { if (user && !authLoading) navigate('/') })`
- Tratamento de erro:
  - “Invalid login credentials” → mensagem amigável.
  - “User already registered” → mensagem amigável.

Observações:
- UI já usa marca/branding “Phosio” no CardTitle.
- Ainda não existem rotas dedicadas `/login`, `/signup`, `/verify-email` (exigência futura).

### 2.2 Contexto / Hook de autenticação
Arquivo: `src/hooks/useAuth.tsx`

- Integração via `supabase.auth` (client SDK).
- Estado mantido em React state:
  - `user: User | null`
  - `session: Session | null`
  - `loading: boolean`

Fluxo de sessão:
- `supabase.auth.onAuthStateChange(...)`:
  - atualiza `session`, `user`
  - seta `loading=false`
- `supabase.auth.getSession()` inicial:
  - popular `session`, `user`
  - seta `loading=false`

Login:
- `supabase.auth.signInWithPassword({ email, password })`

Cadastro:
- `supabase.auth.signUp({ email, password, options: { emailRedirectTo, data } })`
- `emailRedirectTo` atual: `${window.location.origin}/` (importante: depende de `window`)

Logout:
- `supabase.auth.signOut()`

Implicações para SSR:
- O fluxo atual é **100% client-side** (depende de `window`, `BrowserRouter` e callback `onAuthStateChange`).
- Para SSR, o ideal é:
  - Sessão via **cookies httpOnly** (server-managed)
  - Supabase SSR helpers / client server-side
  - Redirecionamentos no servidor (loaders) em vez de `useEffect(navigate)`

## 3. Domínio de mídia (catálogo, busca, upload, delete)

Arquivo: `src/hooks/useMedia.tsx`

### 3.1 Leituras
Categorias:
- `supabase.from('categories').select('*').order('name')`

Mídias:
- `supabase.from('media').select("*, category:categories(id, name, description, created_at)")`
- Ordena por `created_at desc`
- Filtros:
  - por categoria: `.eq('category_id', categoryId)`
  - busca: `.or("title.ilike.%q%,description.ilike.%q%")`

Observações:
- Não há paginação no baseline atual (carrega tudo).
- “Tags” no retorno são tratadas como array do campo `media.tags`:
  - `tags: Array.isArray(item.tags) ? item.tags : []`

### 3.2 Escritas
Upload:
- Exige `user` (do `useAuth`), senão erro “Usuário não autenticado”.
- Se `source_type === 'file'`:
  - upload em Storage bucket `media` com path: `{user.id}/{timestamp}.{ext}`
  - obtém `publicUrl` via `getPublicUrl`
  - usa `publicUrl.publicUrl` como `thumbnail_url`
- Se `source_type === 'url'`:
  - `thumbnail_url = external_url`

Insert em `media`:
- `user_id`, `title`, `description`, `media_type`, `source_type`
- `file_path`, `external_url`, `thumbnail_url`
- `tags` (array no registro atual)
- `category_id`

Após inserção sem erro:
- `fetchMedia()` (recarrega lista)

Delete:
- Se `file_path` existe:
  - remove do bucket `media` (`supabase.storage.from('media').remove([...])`)
- Remove o registro de `media` por `id`
- Atualiza estado local removendo item.

Implicações para SSR:
- SSR precisará substituir `useEffect(fetchMedia)` por loaders server-side (com paginação).
- Upload (file) em SSR pode continuar com fluxo híbrido:
  - Form SSR (action) + upload server-side, ou
  - Presigned upload (client) + insert server-side.
- `getPublicUrl` implica mídia pública. Se houver exigência de privacidade, revisar para URLs assinadas.

## 4. Tags normalizadas (migração Supabase)

Arquivo: `supabase/migrations/002_tags_normalized.sql`

Cria:
- `public.tags`:
  - `id uuid PK default gen_random_uuid()`
  - `name text not null`
  - `full_path text not null`
  - `created_at timestamptz default now()`
- Unique index: `uq_tags_full_path (full_path)`

Cria (condicional à existência de `public.media`):
- `public.media_tags` N:N:
  - `media_id` → `public.media(id)` on delete cascade
  - `tag_id` → `public.tags(id)` on delete cascade
  - PK composta `(media_id, tag_id)`
  - índices `idx_media_tags_tag_id`, `idx_media_tags_media_id`

Observação crítica:
- O baseline do `useMedia.tsx` ainda usa `media.tags` como array no registro.
- Há um “gap” entre modelo normalizado (tags/media_tags) e consumo atual (array em `media.tags`).
- Próximo passo (SSR) deve decidir e padronizar:
  1) **Continuar** com `media.tags` (array) e usar `media_tags` apenas como futuro, ou
  2) **Migrar o consumo** para o modelo normalizado (recomendado para “relacionados por tags”, busca e consistência).

Recomendação:
- Para P07/P08 (catálogo e relacionados), adotar o modelo normalizado e expor no SSR via:
  - `view` (como sugerido na própria migração) ou
  - query com join e agregação (server-side).

## 5. Reaproveitamento (alto valor para SSR)

Reaproveitar com alta probabilidade:
- Kit UI: `src/components/ui/*` (shadcn)
- Componentes de catálogo: `MediaGrid`, `MediaCard`, `MediaViewer`, `CategoryFilter` (com adaptações)
- Tipos: `src/types/media.ts` (validar aderência ao modelo normalizado)
- Estilos Tailwind e tokens existentes

Refatorar/substituir na migração SSR:
- `src/App.tsx` (BrowserRouter/Routes)
- `useAuth` (sessão client-side) → auth server-side (cookies httpOnly)
- `useMedia` (fetch client-side sem paginação) → loaders SSR com paginação

## 6. Riscos e pontos a validar antes de P02/P03

1) **E-mail verification**: o cadastro atual direciona para `/` e assume sucesso imediato.
   - Será necessário implementar `/verify-email` e a UX de “confirme seu e-mail”.
2) **OAuth (Google/Apple)**: não está implementado no baseline.
   - Verificar provedores habilitados no Supabase + redirect URLs (dev/prod).
3) **Privacidade do Storage**: uso de `getPublicUrl` indica bucket público.
   - Confirmar requisito de visibilidade/compartilhamento vs privacidade.
4) **Tags**: há dualidade `media.tags` vs `tags/media_tags`.
   - Definir padrão antes de implementar “relacionados por tags” em SSR.
5) **Paginação e performance**: baseline carrega tudo.
   - SSR deve implementar paginação desde o início (/app).

## 7. Encaminhamento para P02 (Bootstrap SSR)

Meta P02:
- Subir um runtime SSR (Remix) preservando Tailwind + shadcn/ui.
- Definir layout base e navegação mínima.
- Preparar terreno para P03 (auth SSR).

Entregáveis P02 esperados:
- App SSR executando localmente
- Rota pública `/` renderizada no servidor
- Pipeline de build/deploy ajustável ao Docker/Nginx existente

---

## Referências diretas (baseline analisado)
- `src/App.tsx`
- `src/pages/Auth.tsx`
- `src/hooks/useAuth.tsx`
- `src/hooks/useMedia.tsx`
- `supabase/migrations/002_tags_normalized.sql`
