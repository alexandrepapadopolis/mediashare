# Phosio — Architectural Decisions (ADRs)

Este documento registra **decisões arquiteturais já tomadas e efetivamente implementadas** no projeto Phosio.
Ele serve como memória técnica, base para onboarding e referência para futuras mudanças.

---

## ADR-001 — Adoção de arquitetura SSR / MPA (não-SPA)

**Status:** Aceito  
**Data:** 2025

### Contexto
A base original do projeto foi criada como SPA (Vite + React Router), com forte acoplamento de lógica no cliente.

### Decisão
Migrar para uma arquitetura **server-first**, baseada em **SSR / MPA**, utilizando **Remix**.

### Consequências
- Melhor SEO e performance inicial
- Renderização previsível e controlada
- Redução da superfície de ataque no cliente
- Navegação baseada em múltiplas páginas

---

## ADR-002 — Remix como framework principal

**Status:** Aceito  
**Data:** 2025

### Contexto
Era necessário um framework React com SSR nativo, integração natural com rotas e suporte a formulários server-side.

### Decisão
Adotar **Remix 2** como framework principal da aplicação web.

### Consequências
- Loaders/actions server-side
- Roteamento por filesystem
- Integração direta com cookies e headers
- Menor dependência de bibliotecas externas

---

## ADR-003 — Supabase como Backend-as-a-Service

**Status:** Aceito  
**Data:** 2025

### Contexto
Necessidade de backend completo (Auth, DB, Storage) com baixo custo operacional.

### Decisão
Utilizar **Supabase** como BaaS, executado localmente via Docker em DEV.

### Consequências
- Postgres como banco principal
- Auth e Storage integrados
- PostgREST como camada de API
- Separação clara entre chaves anônimas e administrativas

---

## ADR-004 — Sessão gerenciada exclusivamente no servidor

**Status:** Aceito  
**Data:** 2025

### Contexto
Sessões client-side (localStorage) aumentam riscos de segurança e inconsistência.

### Decisão
Gerenciar sessão via **cookies httpOnly**, manipulados apenas no servidor.

### Consequências
- Tokens não acessíveis no browser
- Proteção natural contra XSS
- Controle explícito de expiração
- Redirecionamentos server-side

---

## ADR-005 — `.env` como fonte única de configuração

**Status:** Aceito  
**Data:** 2025

### Contexto
Variáveis globais do sistema causam inconsistência entre ambientes.

### Decisão
Usar exclusivamente arquivos `.env` locais, carregados explicitamente.

### Consequências
- Ambientes reproduzíveis
- Zero dependência de variáveis globais
- Facilidade de auditoria e reset

---

## ADR-006 — Docker como ambiente canônico

**Status:** Aceito  
**Data:** 2025

### Contexto
Diferenças entre ambientes locais geravam erros difíceis de reproduzir.

### Decisão
Executar aplicação e Supabase via **Docker + Docker Compose**.

### Consequências
- Paridade DEV/PROD
- Setup simplificado
- Reset controlado e explícito

---

## ADR-007 — Remoção definitiva da SPA legada (`src/`)

**Status:** Aceito  
**Data:** 2026

### Contexto
A base SPA original não era mais utilizada após a migração para Remix.

### Decisão
Remover o diretório `src/` da base ativa, mantendo documentação apenas para histórico.

### Consequências
- Redução de ambiguidade arquitetural
- Base mais simples e clara
- Documentação alinhada com o código
