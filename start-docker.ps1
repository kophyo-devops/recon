#Requires -Version 5.1
# Build and start the full CEIR stack with Docker Compose.
# Usage: .\start-docker.ps1

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
if (-not $Root) { $Root = (Get-Location).Path }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker not found. Install Docker Desktop and try again."
}

Write-Host "Building and starting CEIR (postgres + backend + frontend) ..." -ForegroundColor Cyan
Push-Location $Root
try {
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Stack is up." -ForegroundColor Green
Write-Host "  Frontend : http://localhost:3000"
Write-Host "  Backend  : http://localhost:8000"
Write-Host "  API docs : http://localhost:8000/docs"
Write-Host "  Postgres : localhost:5432"
Write-Host ""
Write-Host "Stop with:  docker compose down"
Write-Host "Wipe DB:    docker compose down -v"
