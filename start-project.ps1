#Requires -Version 5.1
# Start CEIR project: Database (Docker) + Backend (FastAPI) + Frontend (Next.js)
# Usage: .\start-project.ps1

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
if (-not $Root) { $Root = (Get-Location).Path }

$DatabaseDir = Join-Path $Root "database"
$BackendDir  = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"

$DbPort  = 5432
$ApiPort = 8000
$WebPort = 3000

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host ("==> " + $Message) -ForegroundColor Cyan
}

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw ("'{0}' not found. Please install it and try again." -f $Name)
    }
}

function Wait-TcpPort {
    param(
        [string]$HostName = "127.0.0.1",
        [int]$Port,
        [int]$TimeoutSec = 60,
        [string]$Label = "service"
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $iar = $client.BeginConnect($HostName, $Port, $null, $null)
            $ok = $iar.AsyncWaitHandle.WaitOne(1000, $false)
            if ($ok -and $client.Connected) {
                $client.EndConnect($iar)
                $client.Close()
                return
            }
            $client.Close()
        } catch {
            # retry
        }
        Start-Sleep -Seconds 1
    }
    throw ("Timed out waiting for {0} on {1}:{2}" -f $Label, $HostName, $Port)
}

function Test-PortInUse {
    param([int]$Port)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(300, $false)
        $connected = $ok -and $client.Connected
        if ($connected) { $client.EndConnect($iar) }
        $client.Close()
        return $connected
    } catch {
        return $false
    }
}

Write-Host "CEIR project starter" -ForegroundColor Green
Write-Host ("Root: " + $Root)

Assert-Command "docker"
Assert-Command "npm"

if (-not (Test-Path (Join-Path $DatabaseDir "docker-compose.yml"))) {
    throw "Missing database/docker-compose.yml"
}
if (-not (Test-Path (Join-Path $BackendDir "app\main.py"))) {
    throw "Missing backend/app/main.py"
}
if (-not (Test-Path (Join-Path $FrontendDir "package.json"))) {
    throw "Missing frontend/package.json"
}

# 1) Database
Write-Step "Starting PostgreSQL (Docker)"
Push-Location $DatabaseDir
try {
    docker compose up -d
    if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }
} finally {
    Pop-Location
}

Write-Host ("Waiting for Postgres on port {0} ..." -f $DbPort)
Wait-TcpPort -Port $DbPort -TimeoutSec 90 -Label "PostgreSQL"
Write-Host "PostgreSQL is ready." -ForegroundColor Green

# 2) Backend venv / deps
Write-Step "Preparing backend"
$VenvPython  = Join-Path $BackendDir ".venv\Scripts\python.exe"
$VenvUvicorn = Join-Path $BackendDir ".venv\Scripts\uvicorn.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "Creating Python venv ..."
    Assert-Command "python"
    Push-Location $BackendDir
    try {
        python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw "python -m venv failed" }
        & ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
        & ".\.venv\Scripts\pip.exe" install -r requirements.txt
        if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path $VenvUvicorn)) {
    throw "uvicorn not found in backend/.venv. Run: pip install -r backend/requirements.txt"
}

# 3) Frontend deps
Write-Step "Preparing frontend"
$NodeModules = Join-Path $FrontendDir "node_modules"
if (-not (Test-Path $NodeModules)) {
    Write-Host "Installing npm packages ..."
    Push-Location $FrontendDir
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    } finally {
        Pop-Location
    }
}

# 4) Start backend window
Write-Step ("Starting backend (FastAPI :{0})" -f $ApiPort)
if (Test-PortInUse -Port $ApiPort) {
    Write-Host ("Port {0} already in use - skipping new backend window." -f $ApiPort) -ForegroundColor Yellow
} else {
    $backendCmd = "Set-Location -LiteralPath '$BackendDir'; Write-Host 'Backend: http://localhost:$ApiPort | Docs: http://localhost:$ApiPort/docs' -ForegroundColor Green; & '.\.venv\Scripts\uvicorn.exe' app.main:app --reload --host 0.0.0.0 --port $ApiPort"
    Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCmd) | Out-Null
}

# 5) Start frontend window
Write-Step ("Starting frontend (Next.js :{0})" -f $WebPort)
if (Test-PortInUse -Port $WebPort) {
    Write-Host ("Port {0} already in use - skipping new frontend window." -f $WebPort) -ForegroundColor Yellow
} else {
    $frontendCmd = "Set-Location -LiteralPath '$FrontendDir'; Write-Host 'Frontend: http://localhost:$WebPort' -ForegroundColor Green; npm run dev"
    Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $frontendCmd) | Out-Null
}

Write-Host ""
Write-Host "All services launched." -ForegroundColor Green
Write-Host ("  Database : localhost:{0}  (Docker: ceir-postgres)" -f $DbPort)
Write-Host ("  Backend  : http://localhost:{0}" -f $ApiPort)
Write-Host ("  Frontend : http://localhost:{0}" -f $WebPort)
Write-Host ("  API docs : http://localhost:{0}/docs" -f $ApiPort)
Write-Host ""
Write-Host "Close the Backend / Frontend PowerShell windows to stop those apps."
Write-Host "Stop database with:  cd database; docker compose down"
