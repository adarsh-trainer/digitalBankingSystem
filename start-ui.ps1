# Start Meridian banking UI (proxies API to localhost:8080)
$ErrorActionPreference = "Stop"
$Root = Join-Path $PSScriptRoot "banking-ui"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "ERROR: node is not installed / not on PATH." -ForegroundColor Red
    exit 1
}

Write-Host "Starting Meridian UI on http://localhost:3000 ..." -ForegroundColor Cyan
Write-Host "Make sure microservices are running (.\start-all.ps1)" -ForegroundColor Gray
Set-Location $Root
& node server.js
