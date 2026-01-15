param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("up", "down")]
  [string]$acao,

  [Parameter(Mandatory = $true, Position = 1)]
  [ValidateSet("dev", "prod")]
  [string]$perfil
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# =====================================================
# Utilidades
# =====================================================

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "============================================"
  Write-Host $Title
  Write-Host "============================================"
}

function Ensure-Docker {
  try { docker --version | Out-Null }
  catch { throw "Docker não encontrado no PATH." }

  try { docker compose version | Out-Null }
  catch { throw "Docker Compose v2 não encontrado." }
}

function Import-DotEnv {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    throw "Arquivo .env não encontrado em: $Path"
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()

    if ($line -eq "" -or $line.StartsWith("#")) { return }

    # aceita apenas KEY=VALUE
    if ($line -notmatch "^[A-Za-z_][A-Za-z0-9_]*=") { return }

    $name, $value = $line.Split("=", 2)
    $name  = $name.Trim()
    $value = $value.Trim()

    # remove aspas simples/dobras se existirem
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    # define env var com nome dinamico (forma correta no PowerShell)
    Set-Item -Path ("env:{0}" -f $name) -Value $value
  }
}

function Test-PortInUse {
  param([int]$Port)

  try {
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    return ($listeners.Count -gt 0)
  }
  catch {
    cmd /c "netstat -ano | findstr /R /C:":$Port[ ]" | findstr /I LISTENING" > $null
    return ($LASTEXITCODE -eq 0)
  }
}

function Compose-Up {
  param([string]$Profile)

  # 1. Inicia o Supabase primeiro (necessário para gerar o arquivo .temp usado no include)
  Write-Section "Iniciando Infraestrutura Supabase"
  & npx supabase start
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao iniciar o Supabase CLI."
  }

  # 2. Sobe a aplicação (o include no docker-compose.yml fará o resto)
  Write-Section "Subindo Aplicação MediaShare ($Profile)"
  & docker compose --profile $Profile up -d --build
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao subir o ambiente ($Profile)."
  }
}

function Compose-Down {
  param([string]$Profile)

  Write-Section "Encerrando Tudo (App + Supabase)"
  
  # 1. Para a aplicação e remove volumes do Compose
  & docker compose --profile $Profile down --remove-orphans --volumes

  # 2. Para a infraestrutura do Supabase e APAGA os dados (Full Reset)
  Write-Host "Limpando infraestrutura do Supabase..."
  & npx supabase stop --no-backup
}

function Print-Status {
  Write-Section "STATUS (containers ativos)"
  & docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
}

# =====================================================
# MAIN
# =====================================================

Ensure-Docker

# --- BLINDAGEM CONTRA VARIÁVEIS DO WINDOWS (override de sessão) ---
Remove-Item Env:VITE_SUPABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:VITE_SUPABASE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue

# --- IMPORTA .env DO PROJETO ---
$dotenvPath = Join-Path $PSScriptRoot ".env"
Import-DotEnv -Path $dotenvPath

# --- define porta e URL ---
$port = if ($perfil -eq "dev") { 5173 } else { 8080 }
$url  = if ($perfil -eq "dev") { "http://jupiter.local:5173" } else { "http://jupiter.local:8080" }

# =====================================================
# DOWN (limpa tudo)
# =====================================================
if ($acao -eq "down") {
  Write-Section "Encerrando ambientes DEV e PROD (limpeza total)"

  Compose-Down "dev"
  Compose-Down "prod"

  Write-Host ""
  Write-Host "Limpando networks remanescentes do projeto..."

  # remove a network somente se existir (evita erro "not found")
  $net = docker network ls --format "{{.Name}}" | Where-Object { $_ -eq "mediashare_default" }
  if ($net) {
    docker network rm mediashare_default | Out-Null
  }

  # prune defensivo (não derruba o script se falhar)
  try { docker network prune -f | Out-Null } catch { }
  exit 0
}

# =====================================================
# UP
# =====================================================
Write-Section "Subindo ambiente $perfil"

if (Test-PortInUse -Port $port) {
  Write-Host ""
  Write-Host "[AVISO] A porta $port parece estar em uso."
  Write-Host "        Isso pode impedir o bind do container (ou indicar que o ambiente já está rodando)."
}

Compose-Up $perfil

Write-Host ""
Write-Host "Ambiente $perfil ativo."
Write-Host "Acesse: $url"

Write-Host ""
Write-Host "Abrindo navegador em: $url"
Start-Process $url | Out-Null

Print-Status

Write-Host ""
Write-Host "Operação concluída."
