# Digital Banking System - Local Startup Script
# Prerequisites: Java 17, Docker Desktop (must be running)
# Optional: Maven (uses existing JARs in target/ if Maven is missing)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Digital Banking System - Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Check Docker
Write-Host "`n[1/3] Starting infrastructure (MySQL, Redis, Kafka)..." -ForegroundColor Yellow
try {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Docker not running" }
} catch {
    Write-Host "ERROR: Docker Desktop is not running!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and run this script again." -ForegroundColor Red
    exit 1
}

Set-Location $Root

# Only start infra locally — app images are private ECR and need AWS login.
docker compose up -d redis mysql zookeeper kafka
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: docker compose failed" -ForegroundColor Red
    exit 1
}

Write-Host "Waiting for MySQL healthy..." -ForegroundColor Gray
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    $h = docker inspect --format='{{.State.Health.Status}}' mysql 2>$null
    if ($h -eq 'healthy') { $ready = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    Write-Host "WARNING: MySQL not healthy yet. Services may fail to connect." -ForegroundColor Yellow
} else {
    Write-Host "Infrastructure ready!" -ForegroundColor Green
}

# Step 2: Build (optional)
Write-Host "`n[2/3] Preparing services..." -ForegroundColor Yellow
$services = @(
    "account-service",
    "transaction-service",
    "payment-service",
    "fraud-detection-service",
    "notification-service",
    "api-gateway"
)

$mvn = Get-Command mvn -ErrorAction SilentlyContinue
if ($mvn) {
    foreach ($svc in $services) {
        Write-Host "  Building $svc..." -ForegroundColor Gray
        Set-Location "$Root\$svc"
        mvn -q -DskipTests package
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Build failed for $svc" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "  Maven not found — using existing JARs in target/" -ForegroundColor Gray
}

# Step 3: Start services
Write-Host "`n[3/3] Starting microservices..." -ForegroundColor Yellow

$commonEnv = @{
    SPRING_DATASOURCE_URL          = "jdbc:mysql://localhost:3306/account_db?createDatabaseIfNotExist=true"
    SPRING_DATASOURCE_USERNAME     = "root"
    SPRING_DATASOURCE_PASSWORD     = "root"
    SPRING_KAFKA_BOOTSTRAP_SERVERS = "localhost:9092"
    SPRING_DATA_REDIS_HOST         = "localhost"
    SPRING_DATA_REDIS_PORT         = "6379"
    ACCOUNT_SERVICE_URL            = "http://localhost:8081"
}

$startOrder = @(
    @{ Name = "account-service";         Port = 8081; Extra = @() },
    @{ Name = "fraud-detection-service"; Port = 8084; Extra = @("--account.service.url=http://localhost:8081") },
    @{ Name = "notification-service";    Port = 8085; Extra = @() },
    @{ Name = "payment-service";         Port = 8083; Extra = @() },
    @{ Name = "transaction-service";     Port = 8082; Extra = @("--account.service.url=http://localhost:8081") },
    @{
        Name  = "api-gateway"
        Port  = 8080
        Extra = @(
            "--spring.data.redis.host=localhost",
            "--spring.cloud.gateway.routes[0].id=account-service",
            "--spring.cloud.gateway.routes[0].uri=http://localhost:8081",
            "--spring.cloud.gateway.routes[0].predicates[0]=Path=/api/v1/accounts/**",
            "--spring.cloud.gateway.routes[1].id=transaction-service",
            "--spring.cloud.gateway.routes[1].uri=http://localhost:8082",
            "--spring.cloud.gateway.routes[1].predicates[0]=Path=/api/v1/transactions/**",
            "--spring.cloud.gateway.routes[2].id=payment-service",
            "--spring.cloud.gateway.routes[2].uri=http://localhost:8083",
            "--spring.cloud.gateway.routes[2].predicates[0]=Path=/api/v1/payments/**"
        )
    }
)

foreach ($svc in $startOrder) {
    $jar = Get-ChildItem "$Root\$($svc.Name)\target\*-SNAPSHOT.jar" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch "original" } |
        Select-Object -First 1
    if (-not $jar) {
        Write-Host "ERROR: No JAR found for $($svc.Name). Install Maven and rebuild." -ForegroundColor Red
        exit 1
    }

    Write-Host "  Starting $($svc.Name) on port $($svc.Port)..." -ForegroundColor Gray

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "java"
    $psi.Arguments = "-jar `"$($jar.FullName)`" $($svc.Extra -join ' ')"
    $psi.WorkingDirectory = "$Root\$($svc.Name)"
    $psi.UseShellExecute = $false
    foreach ($key in $commonEnv.Keys) {
        $psi.EnvironmentVariables[$key] = $commonEnv[$key]
    }
    [System.Diagnostics.Process]::Start($psi) | Out-Null
    Start-Sleep -Seconds 5
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host " All services starting!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Wait ~45 seconds, then verify:" -ForegroundColor Cyan
Write-Host "  Gateway:       http://localhost:8080/actuator/health" -ForegroundColor White
Write-Host "  Account:       http://localhost:8081/actuator/health" -ForegroundColor White
Write-Host "  Transaction:   http://localhost:8082/actuator/health" -ForegroundColor White
Write-Host "  Payment:       http://localhost:8083/actuator/health" -ForegroundColor White
Write-Host "  Fraud:         http://localhost:8084/actuator/health" -ForegroundColor White
Write-Host "  Notification:  http://localhost:8085/actuator/health" -ForegroundColor White
Write-Host ""
Write-Host "API base URL: http://localhost:8080" -ForegroundColor Cyan
Write-Host '  POST /api/v1/accounts' -ForegroundColor White
Write-Host '  Body: {"accountHolderName":"Alice","email":"alice@test.com","phone":"9876543210","accountType":"SAVINGS","initialDeposit":50000}' -ForegroundColor Gray
