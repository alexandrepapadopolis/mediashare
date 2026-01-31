# Documentação de Configuração: Acesso em Rede Local (jupiter)

Este documento descreve as configurações aplicadas para permitir que o ambiente de desenvolvimento **Phosio**, hospedado no desktop **jupiter**, seja acessível por dispositivos externos (celulares e tablets) na rede local.

## 1. Infraestrutura de Rede (Roteador Deco)

Para garantir a acessibilidade constante do servidor na rede interna:
* **IP Estático:** O endereço IP `192.168.68.100` foi reservado para o host no roteador Deco.
* **Nome do Host:** O dispositivo é identificado na rede pelo nome **jupiter**.
* **Protocolo mDNS:** Dispositivos móveis (Android/iOS) utilizam o sufixo `.local` para resolução de nomes. O endereço padrão de acesso é `http://jupiter.local:3000`.

## 2. Configuração do Windows (Host jupiter)

O Windows foi configurado para "anunciar" sua presença e permitir tráfego de entrada nas portas da aplicação:

### Perfil e Serviços
* **Perfil de Rede:** A conexão Wi-Fi deve estar definida como **Privada**.
* **Serviço de Descoberta:** O serviço **Publicação de Recursos de Descoberta de Função (FDResPub)** deve estar em execução e configurado como automático.

### Firewall (PowerShell)
As seguintes regras de entrada foram autorizadas para permitir o tráfego de rede local:
* **Porta 3000 (Remix):** Permite o tráfego do servidor SSR.
* **Porta 65421 (Supabase Gateway/Kong):** Permite acesso à API local do Supabase.
* **Porta UDP 5353 (mDNS):** Permite que dispositivos encontrem o host pelo nome `jupiter.local`.

## 3. Configurações da Aplicação

Os arquivos do projeto foram sincronizados para suportar o acesso via rede local:

### Remix (SSR)
* **Exposição:** O servidor Remix é iniciado com `HOST=0.0.0.0`, permitindo acesso externo.
* **Porta:** Definida como `3000` no `docker-compose.yml`.
* **Dev Origin:** `REMIX_DEV_ORIGIN` configurado como `http://jupiter.local:3001`.

### Supabase (`config.toml`)
* **URLs de Auth:** `site_url` e `additional_redirect_urls` apontam para `http://jupiter.local:3000`, garantindo que fluxos de autenticação funcionem em dispositivos móveis.

### Variáveis de Ambiente (`.env`)
* **SUPABASE_URL:** Usada **internamente** pelo servidor (container → Supabase), normalmente `http://host.docker.internal:65421`.
* **SUPABASE_PUBLIC_URL:** URL **exposta ao browser**, ex.: `http://jupiter.local:65421`.
* **SUPABASE_ANON_KEY:** Chave pública injetada no browser via `env.js`.

### Injeção de variáveis no Browser (`/env.js`)
* O endpoint `/env.js` expõe apenas variáveis **explicitamente públicas** através de `window.__ENV`.
* O client Supabase no browser **não** acessa `process.env`.

### Script de Ambiente (`ambiente.ps1`)
* **URL de Inicialização:** O navegador é aberto automaticamente em `http://jupiter.local:3000`.
* **Regras de Firewall Automáticas:** O script gerencia a abertura das portas necessárias no Windows.

---

## 4. Tabela de Referência de Acesso

| Dispositivo | Endereço URL |
| :--- | :--- |
| **Desktop Local** | `http://localhost:3000` ou `http://jupiter.local:3000` |
| **Dispositivos Móveis** | `http://jupiter.local:3000` |
| **API Supabase (Local)** | `http://jupiter.local:65421` |

> **Nota:** Se o acesso pelo nome falhar em dispositivos móveis, verifique se o **DNS Particular** do aparelho está desativado.