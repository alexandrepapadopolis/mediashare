# Phosio — Segurança (Produção Pública)

Este documento descreve o **baseline de segurança recomendado para produção pública** do Phosio (aplicação SSR/MPA em Remix + Supabase),
incluindo **headers**, **CSP**, **cookies**, **CSRF**, **rate limiting** e **operações**.

> Escopo: web app pública na internet (usuários não confiáveis, bots, scanners, tráfego malicioso).  
> Premissa: o Phosio executa SSR em Node.js atrás de um reverse proxy (ex.: Nginx) com TLS.

---

## 1. Objetivos de segurança (produção)

- Proteger sessão e credenciais (roubo de cookies/tokens).
- Reduzir impacto de XSS e injeção de conteúdo (CSP, sanitização, headers).
- Proteger rotas SSR e actions contra CSRF.
- Reduzir abuso (brute force / scraping) com rate limiting e controles antifraude.
- Garantir rastreabilidade (logging estruturado e auditoria de eventos).
- Manter chaves e segredos fora do cliente, com rotação e segregação.

---

## 2. Threat model (ameaças prioritárias)

1) **Account takeover**: phishing, brute force, reuse de senha, sessão roubada.  
2) **XSS**: injeção via parâmetros, conteúdo de mídia, metadados, páginas SSR.  
3) **CSRF**: ações SSR sensíveis (upload, troca de email, logout, etc.).  
4) **SSR injection / request smuggling / header spoofing**: quando atrás de proxy mal configurado.  
5) **Exfiltração de segredos**: env vars expostas, logs com chaves, erro exibindo stack/ENV.  
6) **Abuso de API/Storage**: scraping, download massivo via signed URLs, upload abusivo.  
7) **DoS**: bursts em endpoints caros (ex.: geração de signed URL, upload streaming).

---

## 3. Sessão, cookies e transporte seguro

### 3.1 Cookies (requisitos)
- `HttpOnly: true` (impede JS de ler cookie)
- `Secure: true` em produção (apenas HTTPS)
- `SameSite: Lax` como padrão (ou `Strict` se não quebrar OAuth/redirects)
- `Path=/` e **escopo mínimo** (evitar cookies amplos desnecessários)
- `Max-Age`/`Expires` controlados (expiração consistente)
- **Rotação de sessão** após login e eventos críticos (troca de senha/email)

### 3.2 TLS (HTTPS obrigatório)
- Terminar TLS no reverse proxy (Nginx) e encaminhar para Node via rede interna.
- Habilitar **HTTP/2** (opcional) e desabilitar suites fracas.
- Redirecionar **HTTP → HTTPS** com 301.

### 3.3 Proxy-awareness (muito importante em SSR)
Em SSR atrás de proxy, o app deve reconhecer corretamente:
- `X-Forwarded-Proto`
- `X-Forwarded-For`
- `X-Forwarded-Host`

Sem isso, você pode errar `Secure cookies`, URL canonical e redirects.

---

## 4. Security Headers (baseline recomendado)

Aplique headers preferencialmente no **reverse proxy** (Nginx) e, como redundância, também no Remix (route/root headers).

### 4.1 Lista recomendada
- `Strict-Transport-Security` (HSTS)  
- `Content-Security-Policy` (CSP)  
- `X-Content-Type-Options: nosniff`  
- `Referrer-Policy: strict-origin-when-cross-origin`  
- `Permissions-Policy` (reduzir APIs do browser)  
- `Cross-Origin-Opener-Policy` (COOP) e/ou `Cross-Origin-Resource-Policy` (CORP) quando aplicável  
- `X-Frame-Options` (opcional; prefira `frame-ancestors` na CSP)

> Nota: `X-XSS-Protection` é legado e não recomendado em navegadores modernos.

### 4.2 Exemplo de headers no Nginx (produção)

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()" always;

# HSTS (somente se HTTPS está correto e estável)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

# Antiframes (se não precisa embutir em iframes)
add_header X-Frame-Options "DENY" always;
```

---

## 5. CSP (Content Security Policy) — recomendação prática

### 5.1 Estratégia recomendada
Para SSR com Remix, a CSP deve ser **não-frágil** e evolutiva. A melhor prática é:
- Usar **nonce** por request para scripts inline necessários (se houver).
- Evitar `unsafe-inline` em `script-src` sempre que possível.
- Começar com CSP restritiva e relaxar explicitamente apenas o necessário.

### 5.2 CSP base sugerida (ponto de partida)
Ajuste domínios conforme seu ambiente (ex.: Supabase local vs hosted).

```http
Content-Security-Policy:
  default-src 'self';
  base-uri 'self';
  object-src 'none';
  frame-ancestors 'none';
  form-action 'self';
  img-src 'self' data: blob: https:;
  media-src 'self' blob: https:;
  font-src 'self' data: https:;
  style-src 'self' 'unsafe-inline';
  script-src 'self' 'nonce-<RUNTIME_NONCE>';
  connect-src 'self' https: http://host.docker.internal:54321;
  upgrade-insecure-requests;
```

### 5.3 Observações importantes de CSP
- `style-src 'unsafe-inline'` é comum quando Tailwind/shadcn geram estilos inline (pode ser removido se não necessário).
- `connect-src` precisa permitir:
  - Supabase (REST/Auth/Storage endpoints)
  - Qualquer observabilidade/analytics (se existirem)
- Se você usa **OAuth** do Supabase, valide redirects e se a CSP não bloqueia o fluxo.
- Se futuramente houver assets em CDN, incluir explicitamente em `script-src`/`style-src`/`img-src`.

---

## 6. CSRF para actions SSR

Como o app tem actions (ex.: upload), em produção pública é recomendado:
- Token CSRF por sessão e por form (double submit cookie ou token em session store).
- Validar método e origem:
  - `Origin` e `Referer` em requests mutantes (POST/PATCH/DELETE).
- `SameSite=Lax` ajuda, mas **não substitui CSRF**.

Checklist mínimo por action sensível:
- Exigir `POST`
- Verificar `Origin`/`Host`
- Validar token CSRF
- Validar input no servidor

---

## 7. Rate limiting, brute force e abuso

### 7.1 Onde aplicar
- Preferência: **Nginx** (mais eficiente) para limites por IP.
- Complemento: limites no app (por user/session) para ações autenticadas.

### 7.2 Endpoints típicos a limitar
- `/login`, `/signup`, `/verify-email`, reenvio de e-mail
- Upload SSR e endpoints que geram signed URLs
- Qualquer endpoint “caro” (query ampla, filtros pesados)

### 7.3 Exemplo Nginx (simples)
```nginx
limit_req_zone $binary_remote_addr zone=login_zone:10m rate=10r/m;

location = /login {
  limit_req zone=login_zone burst=20 nodelay;
  proxy_pass http://phosio_app;
}
```

> Para produção real: use também WAF/edge (Cloudflare, etc.), especialmente contra bots.

---

## 8-A. Thumbnails server-side (SSR) e políticas de Storage

### Contexto
O upload de thumbnails é realizado **no servidor (SSR)** durante o fluxo de upload de mídias,
utilizando **Sharp** para geração e **Supabase Storage** para persistência.

Os thumbnails:
- são gerados apenas para **imagens**;
- são **best-effort** (falhas não bloqueiam o upload principal);
- são armazenados em paths dedicados (`thumbnails/<user_id>/<media_id>/w320.webp`);
- utilizam **URL pública estável** quando o bucket é público.

### Requisitos de segurança
- As **policies de Storage (RLS)** devem permitir explicitamente:
  - `INSERT`/`UPSERT` no prefixo `thumbnails/**` para o usuário autenticado; e
  - leitura pública apenas se o bucket for intencionalmente público.
- Caso o bucket seja **privado**, o acesso ao thumbnail deve ocorrer via **signed URL** gerada no SSR.
- O SSR **não deve** usar `SUPABASE_SERVICE_ROLE_KEY` para upload de thumbnails em produção pública;
  o fluxo deve funcionar corretamente com **anon key + access token** do usuário.

### Riscos mitigados
- Escrita indevida em paths arbitrários do bucket.
- Escalada de privilégios via uso incorreto de service role.
- Exposição acidental de thumbnails se o bucket não for público por design.

---

## 8. Upload/Storage hardening

- Validar **MIME**, tamanho, e número de arquivos no servidor.
- Usar TTL curto em signed URLs (ex.: 60–300s).
- Considerar **limites por usuário** (quota diária/mensal).
- Sanitizar nomes de arquivos e paths.
- Evitar exposição de bucket público; preferir private + signed URL.
- Garantir que paths auxiliares (ex.: `thumbnails/`) estejam cobertos por policies explícitas.

---

## 9. CORS e integrações

- Como SSR chama Supabase server-side, CORS é menos problemático do que SPA.
- Ainda assim:
  - Defina domínios permitidos no Supabase (redirect URLs e allowed origins).
  - Em produção, **não** use curingas (`*`) em origens para endpoints sensíveis.

---

## 10. Observabilidade e auditoria

Produção pública deve ter:
- Logs estruturados (request id, user id, status, latency)
- Redação de segredos em logs (nunca logar keys/tokens)
- Auditoria de eventos críticos:
  - login/logout
  - reset de senha
  - upload
  - mudanças de perfil e permissões

---

## 11. Segredos e operação

- `.env` não versionado; usar secret manager quando possível.
- Rotacionar `SESSION_SECRET` com plano de invalidação de sessões.
- Rotacionar keys do Supabase se houver suspeita de vazamento.
- Restringir `SUPABASE_SERVICE_ROLE_KEY` somente ao runtime server (nunca para o cliente).

---

## 12. Checklist de “produção pública” (pronto para PR)

1) TLS obrigatório + redirect HTTP→HTTPS  
2) HSTS habilitado (após validação)  
3) CSP com nonce por request (ou CSP estrita sem inline scripts)  
4) Cookies: HttpOnly + Secure + SameSite adequado + expiração controlada  
5) CSRF em actions mutantes  
6) Rate limiting (login, signup, upload, signed URL)  
7) Redação de segredos em logs + request IDs  
8) Validações server-side (input, mime, tamanho, paths)  
9) Monitoramento básico (latência, erros 4xx/5xx, volume por endpoint)  

---

## 13. Notas sobre aderência ao código atual

Este documento foi elaborado para produção pública e **pode exigir pequenos ajustes no código** para:
- injetar **CSP nonce** (se você optar por nonce)
- centralizar headers no Remix (root/entry server) ou no Nginx
- implementar CSRF token em forms SSR
- configurar rate limiting no reverse proxy
- revisar policies de Storage sempre que novos prefixes/variants (ex.: thumbnails) forem introduzidos

A recomendação é implementar por etapas, com PRs pequenos e testes manuais em ambiente de staging.
