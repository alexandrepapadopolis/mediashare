# ambiente.ps1
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("up", "down", "reset", "restart")]
  [string]$acao,

  [Parameter(Mandatory = $true, Position = 1)]
  [ValidateSet("dev", "prod")]
  [string]$perfil
  ,
  [switch]$Trace
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ================
# Output/Encoding
# ================
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
}
catch { }

# ==========================
# TRACE (step-by-step)
# ==========================
if ($Trace) {
  Set-PSDebug -Trace 1
  $ts = Get-Date -Format "yyyyMMdd-HHmmss"
  $logDir = Join-Path $PSScriptRoot "logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $transcriptPath = Join-Path $logDir ("ambiente-{0}-{1}-{2}.log" -f $acao, $perfil, $ts)
  Start-Transcript -Path $transcriptPath -Append | Out-Null
  Write-Host ("[TRACE] Transcript: {0}" -f $transcriptPath)
}

# ==========================
# Helpers (logging/robust)
# ==========================
function Write-Section {
  param([Parameter(Mandatory = $true)][string]$Title)
  Write-Host ""
  Write-Host "============================================"
  Write-Host $Title
  Write-Host "============================================"
}

function Write-Info {
  param([Parameter(Mandatory = $true)][string]$Message)
  Write-Host ("[INFO]  {0}" -f $Message)
}

function Write-Warn {
  param([Parameter(Mandatory = $true)][string]$Message)
  Write-Host ("[WARN]  {0}" -f $Message)
}

function Test-CommandExists {
  param([Parameter(Mandatory = $true)][string]$Name)
  try { Get-Command $Name -ErrorAction Stop | Out-Null; return $true }
  catch { return $false }
}

function Ensure-Tools {
  if (-not (Test-CommandExists "docker")) { throw "Docker not found in PATH." }
  try { docker --version | Out-Null } catch { throw "Docker CLI is not functional." }

  try { docker compose version | Out-Null } catch { throw "Docker Compose v2 not available." }

  if (-not (Test-CommandExists "npx")) { throw "npx not found in PATH. Install Node.js (includes npx)." }
  # Use -y to avoid interactive prompt ("Ok to proceed?") that can hang execution
  try { & npx -y supabase --version | Out-Null } catch { throw "Supabase CLI not available via 'npx -y supabase'." }
}

function Import-DotEnv {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw ("File .env not found at: {0}" -f $Path)
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    if ($line -notmatch "^[A-Za-z_][A-Za-z0-9_]*=") { return }

    $name, $value = $line.Split("=", 2)
    $name = $name.Trim()
    $value = $value.Trim()

    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    Set-Item -Path ("env:{0}" -f $name) -Value $value
  }
}

function Get-EnvVar {
  param([Parameter(Mandatory = $true)][string]$Name)
  return (Get-Item -Path ("Env:{0}" -f $Name) -ErrorAction SilentlyContinue).Value
}

function Require-EnvVar {
  param([Parameter(Mandatory = $true)][string]$Name)
  $v = Get-EnvVar $Name
  if (-not $v -or ($v.Trim().Length -eq 0)) {
    throw ("Required var missing in .env: {0}" -f $Name)
  }
}

function Validate-Env {
  Require-EnvVar "SUPABASE_URL"
  Require-EnvVar "SUPABASE_ANON_KEY"
  Require-EnvVar "SESSION_SECRET"
  Require-EnvVar "MEDIA_PATH"
  # Service role pode ser exigida dependendo de rotas/features; valide se quiser tornar obrigatoria:
  # Require-EnvVar "SUPABASE_SERVICE_ROLE_KEY"
}

function Test-PortInUse {
  param([Parameter(Mandatory = $true)][int]$Port)
  try {
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    return ($listeners.Count -gt 0)
  }
  catch {
    cmd /c "netstat -ano | findstr /R /C:":$Port[ ]" | findstr /I LISTENING" > $null
    return ($LASTEXITCODE -eq 0)
  }
}

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$AllowFail
  )

  Write-Info $Title

  $cmdLine = $FilePath + " " + ($Arguments | ForEach-Object {
      if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ }
    } | Out-String).Trim()

  Write-Host ("[CMD]   {0}" -f $cmdLine)

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $global:LASTEXITCODE = 0
  try {
    & $FilePath @Arguments
  }
  catch {
    if ($AllowFail) {
      Write-Warn ("{0} threw an exception (tolerated): {1}" -f $Title, $_.Exception.Message)
      return
    }
    throw
  }
  finally {
    $sw.Stop()
    Write-Host ("[TIME]  {0} ms" -f $sw.ElapsedMilliseconds)
  }

  $code = $LASTEXITCODE
  if (-not $AllowFail -and $code -ne 0) {
    throw ("Failed: {0} (exit code: {1})" -f $Title, $code)
  }
  if ($AllowFail -and $code -ne 0) {
    Write-Warn ("{0} failed (exit code: {1}) but tolerated." -f $Title, $code)
  }
}

# ==========================
# App (docker compose)
# ==========================
function App-Up {
  param([Parameter(Mandatory = $true)][string]$Profile)
  $args = @("compose", "--profile", $Profile, "up", "--build")
  if (-not $Trace) { $args += @("-d") }
  Invoke-External -Title ("App up ({0})" -f $Profile) -FilePath "docker" -Arguments $args
}

function App-Down {
  param([Parameter(Mandatory = $true)][string]$Profile)
  # non-destructive: no --volumes
  Invoke-External -Title ("App down ({0}) non-destructive" -f $Profile) -FilePath "docker" -Arguments @("compose", "--profile", $Profile, "down", "--remove-orphans") -AllowFail
}

function App-Down-WithVolumes {
  param([Parameter(Mandatory = $true)][string]$Profile)
  Invoke-External -Title ("App down ({0}) removing volumes (DESTRUCTIVE)" -f $Profile) -FilePath "docker" -Arguments @("compose", "--profile", $Profile, "down", "--remove-orphans", "--volumes") -AllowFail
}

function App-Restart-Rebuild {
  param([Parameter(Mandatory = $true)][string]$Profile)

  # Best-effort stop first (non-destructive). Then force recreate with build.
  App-Down $Profile

  $args = @("compose", "--profile", $Profile, "up", "--build", "--force-recreate")
  if (-not $Trace) { $args += @("-d") }
  Invoke-External -Title ("App restart ({0}) with rebuild/recreate" -f $Profile) -FilePath "docker" -Arguments $args
}

# ==========================
# Supabase (npx supabase)
# ==========================
function Supabase-Start {
  Invoke-External -Title "Supabase start" -FilePath "npx" -Arguments @("-y", "supabase", "start")
}

function Supabase-Stop {
  # non-destructive
  Invoke-External -Title "Supabase stop (non-destructive)" -FilePath "npx" -Arguments @("-y", "supabase", "stop") -AllowFail
}

function Supabase-Reset-Destructive {
  Write-Section "Supabase RESET (DESTRUCTIVE) - volumes + DB"

  Invoke-External -Title "Supabase stop --no-backup (DESTRUCTIVE)" -FilePath "npx" -Arguments @("-y", "supabase", "stop", "--no-backup")

  Supabase-Start

  Invoke-External -Title "Supabase db reset (recreate DB/migrations/seed)" -FilePath "npx" -Arguments @("-y", "supabase", "db", "reset")
}

# ==========================
# Misc
# ==========================
function Cleanup-Network {
  # Keep tolerant; never fail the workflow because of prune/network issues
  Write-Info "Cleanup docker networks (tolerant)"
  Write-Host ("[CMD]   docker network ls --format ""{{.Name}}""")
  try {
    $net = docker network ls --format "{{.Name}}" | Where-Object { $_ -eq "phosio_default" }
    if ($net) {
      Write-Host ("[CMD]   docker network rm phosio_default")
      docker network rm phosio_default | Out-Null
    }
    Write-Host ("[CMD]   docker network prune -f")
    docker network prune -f | Out-Null
  } catch {
    Write-Warn ("Cleanup docker networks failed but tolerated: {0}" -f $_.Exception.Message)
  }
}

function Print-Status {
  Write-Section "STATUS (docker ps)"
  try {
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
  } catch {
    Write-Warn "Could not run 'docker ps'."
  }
}

function Open-Url {
  param([Parameter(Mandatory = $true)][string]$Url)
  try {
    Write-Info ("Opening browser: {0}" -f $Url)
    Start-Process $Url | Out-Null
  } catch {
    Write-Warn ("Could not open browser automatically. Open manually: {0}" -f $Url)
  }
}

# ==========================
# MAIN
# ==========================
try {
  Ensure-Tools

  $dotenvPath = Join-Path $PSScriptRoot ".env"
  Import-DotEnv -Path $dotenvPath
  Validate-Env

  # Ports/URLs: dev on 3000; prod external 8080 (container 3000)
  $port = if ($perfil -eq "dev") { 3000 } else { 8080 }
  $url = if ($perfil -eq "dev") { "http://jupiter.local:3000" } else { "http://jupiter.local:8080" }

  if (($acao -eq "up" -or $acao -eq "restart") -and (Test-PortInUse -Port $port)) {
    Write-Warn ("Port {0} seems in use. Bind may fail or environment may already be running." -f $port)
  }

  switch ($acao) {
    "down" {
      Write-Section ("DOWN (non-destructive) - profile: {0}" -f $perfil)

      App-Down $perfil
      Supabase-Stop

      Cleanup-Network
      Print-Status

      Write-Host ""
      Write-Host "DOWN completed."
      exit 0
    }

    "reset" {
      Write-Section ("RESET (DESTRUCTIVE) - profile: {0}" -f $perfil)
      Write-Warn "This will remove app volumes for the selected profile AND reset Supabase volumes/DB."

      # Same behavior as down
      App-Down $perfil
      Supabase-Stop

      # Remove ONLY app volumes for the selected profile
      App-Down-WithVolumes $perfil

      # Destructive supabase reset (global in local supabase)
      Supabase-Reset-Destructive

      Cleanup-Network
      Print-Status

      Write-Host ""
      Write-Host "RESET completed."
      exit 0
    }

    "restart" {
      Write-Section ("RESTART (app only) - profile: {0}" -f $perfil)

      App-Restart-Rebuild $perfil

      Write-Host ""
      Write-Host ("App restarted: {0}" -f $perfil)
      Write-Host ("Open: {0}" -f $url)

      Open-Url $url
      Print-Status

      Write-Host ""
      Write-Host "RESTART completed."
      exit 0
    }

    "up" {
      Write-Section ("UP - starting environment ({0})" -f $perfil)

      Supabase-Start
      App-Up $perfil

      Write-Host ""
      Write-Host ("Environment active: {0}" -f $perfil)
      Write-Host ("Open: {0}" -f $url)

      Open-Url $url
      Print-Status

      Write-Host ""
      Write-Host "UP completed."
      exit 0
    }
  }

} catch {
  Write-Host ""
  Write-Host "[ERROR] Unhandled failure:"
  Write-Host ("        {0}" -f $_.Exception.Message)
  exit 1
} finally {
  if ($Trace) {
    try { Stop-Transcript | Out-Null } catch {}
    try { Set-PSDebug -Off } catch {}
  }
}
