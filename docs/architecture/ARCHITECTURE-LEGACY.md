# Phosio — Arquitetura LEGACY (Histórico)

> **Status:** LEGADO / SOMENTE REFERÊNCIA HISTÓRICA  
> **Não utilizar como base para novas implementações.**

Este documento preserva a **arquitetura original do Phosio quando o projeto ainda era uma SPA**, gerada inicialmente com apoio do Lovable, utilizando **Vite + React Router** e integração client-side com Supabase.

Ele existe **exclusivamente para fins históricos, auditoria técnica e rastreabilidade de decisões**.  
A arquitetura vigente encontra-se documentada em `ARCHITECTURE.md`.

---

## 1. Contexto histórico

- Arquitetura **SPA (Single Page Application)**.
- Renderização 100% client-side.
- Autenticação, sessão e queries executadas no navegador.
- Build estático servido via Vite + Nginx.
- Forte acoplamento entre UI, roteamento e lógica de domínio no frontend.

Limitações identificadas que motivaram a migração:
- SEO fraco (conteúdo dependente de JS).
- Segurança limitada (tokens/sessão no cliente).
- Dificuldade de controle de cache e headers.
- Crescimento do domínio exigindo SSR/MPA.

---

## 2. Stack LEGACY

### Frontend
- React 18
- Vite
- TypeScript
- Tailwind CSS + shadcn/ui
- React Router (SPA)
- TanStack React Query

### Backend / BaaS
- Supabase
  - Auth
  - Postgres
  - Storage
  - PostgREST
  - Realtime

### Infra
- Docker
- Docker Compose
- Nginx (servindo build estático)

---

## 3. Estrutura de pastas (LEGACY)

```
src/
├── main.tsx
├── App.tsx
├── pages/
│   ├── Index.tsx
│   ├── Upload.tsx
│   ├── Auth.tsx
│   └── NotFound.tsx
├── components/
│   ├── Header.tsx
│   ├── MediaGrid.tsx
│   ├── MediaCard.tsx
│   ├── MediaViewer.tsx
│   ├── CategoryFilter.tsx
│   ├── UploadForm.tsx
│   └── ui/               # shadcn/ui
├── hooks/
│   ├── useAuth.tsx
│   ├── useMedia.tsx
│   └── utilitários de UI
├── integrations/
│   └── supabase/
│       ├── client.ts
│       └── types.ts
└── db/
    └── init/
        └── 01-base-media-share.sql
```

---

## 4. Rotas (LEGACY)

Definidas no cliente via React Router:

- `/` → catálogo principal
- `/upload` → upload de mídia
- `/auth` → login/cadastro
- `*` → 404

Proteção de rotas realizada no frontend (guards/hooks).

---

## 5. Autenticação e sessão (LEGACY)

- Supabase Auth inicializado no browser.
- Sessão/token mantidos no cliente.
- OAuth e callbacks tratados client-side.
- Ausência de cookies httpOnly.

Riscos conhecidos:
- Maior superfície de ataque.
- Dificuldade de enforcement de regras no servidor.
- Dependência excessiva de JS no cliente.

---

## 6. Estado do banco de dados

- Migrações mantidas em `supabase/migrations/`.
- Modelo já incluía:
  - Normalização de tags.
  - Checks e constraints.
  - Storage organizado por buckets.

Esse **modelo de dados foi preservado** e reaproveitado na arquitetura SSR/MPA.

---

## 7. Motivo da descontinuação

A arquitetura SPA foi considerada inadequada para os objetivos do produto:

- Aplicação orientada a conteúdo indexável.
- Necessidade de controle de sessão no servidor.
- Evolução para múltiplas páginas e SSR.
- Maior previsibilidade operacional.

Decisão tomada:
➡️ **Migrar para Remix (SSR-first) e abandonar SPA como arquitetura principal.**

---

## 8. Situação atual

- Diretório `src/` **removido** ou mantido apenas temporariamente durante a migração.
- Código LEGACY **não deve ser referenciado** por código novo.
- Documentação atual:
  - `ARCHITECTURE.md` → arquitetura vigente
  - `README.md` → execução e ambientes

---

## 9. Observação final

Este arquivo **não representa dívida técnica ativa**, apenas histórico.  
Pode ser removido no futuro se não houver mais necessidade de rastreabilidade.

