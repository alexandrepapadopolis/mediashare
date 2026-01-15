# Documentação de Configuração: Acesso em Rede Local (jupiter)

Este documento descreve as configurações aplicadas para permitir que o ambiente de desenvolvimento **MediaShare**, hospedado no desktop **jupiter**, seja acessível por dispositivos externos (celulares e tablets) na rede local.

## 1. Infraestrutura de Rede (Roteador Deco)

Para garantir a acessibilidade constante do servidor na rede interna:
* **IP Estático:** O endereço IP `192.168.68.100` foi reservado para o host no roteador Deco.
* **Nome do Host:** O dispositivo é identificado na rede pelo nome **jupiter**.
* **Protocolo mDNS:** Dispositivos móveis (Android/iOS) utilizam o sufixo `.local` para resolução de nomes. O endereço padrão de acesso é `http://jupiter.local:5173`.

## 2. Configuração do Windows (Host jupiter)

O Windows foi configurado para "anunciar" sua presença e permitir tráfego de entrada nas portas da aplicação:

### Perfil e Serviços
* **Perfil de Rede:** A conexão Wi-Fi deve estar definida como **Privada**.
* **Serviço de Descoberta:** O serviço **Publicação de Recursos de Descoberta de Função (FDResPub)** deve estar em execução e configurado como automático.

### Firewall (PowerShell)
As seguintes regras de entrada foram autorizadas para permitir o tráfego de rede local:
* **Porta 5173 (Vite):** Permite o tráfego do servidor de desenvolvimento.
* **Porta 54321 (Supabase):** Permite a comunicação com a API local do Supabase.
* **Porta UDP 5353 (mDNS):** Permite que dispositivos encontrem o host pelo nome `jupiter.local`.

## 3. Configurações da Aplicação

Os arquivos do projeto foram sincronizados para suportar o acesso via rede local:

### Vite (`vite.config.ts`)
* **Exposição:** Configurado com `server.host: true` para ouvir em todas as interfaces de rede.
* **Porta:** Definida como `5173` para desenvolvimento.
* **Segurança:** O campo `allowedHosts` inclui `"jupiter.local"`, `"jupiter"` e `"localhost"`.

### Supabase (`config.toml`)
* **URLs de Auth:** O `site_url` e as URLs de redirecionamento foram ajustadas para `http://jupiter.local:5173` para suportar fluxos de autenticação no celular.

### Variáveis de Ambiente (`.env`)
* **Backend:** A variável `VITE_SUPABASE_URL` deve utilizar `http://jupiter.local:54321` para garantir que o navegador de qualquer dispositivo encontre a API no host.

### Script de Ambiente (`ambiente.ps1`)
* **URL de Inicialização:** A variável `$url` foi configurada para abrir o navegador em `http://jupiter.local:5173`.
* **Regras de Firewall Automáticas:** O script gerencia a abertura das portas necessárias no Windows.

---

## 4. Tabela de Referência de Acesso

| Dispositivo | Endereço URL |
| :--- | :--- |
| **Desktop Local** | `http://localhost:5173` ou `http://jupiter.local:5173` |
| **Dispositivos Móveis** | `http://jupiter.local:5173` |
| **API Supabase (Local)** | `http://jupiter.local:54321` |

> **Nota:** Se o acesso pelo nome falhar em dispositivos móveis, verifique se o **DNS Particular** do aparelho está desativado.