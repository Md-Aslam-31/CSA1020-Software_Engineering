param([switch]$Build)
$ErrorActionPreference = 'Stop'
$morrowRoot = Split-Path -Parent $PSScriptRoot
$morrowDocker = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
if (-not $morrowDocker) {
    $morrowDocker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
}
if (-not (Test-Path -LiteralPath $morrowDocker)) {
    throw 'Docker Desktop is required. Install and start Docker Desktop, then run this script again.'
}
& $morrowDocker info --format '{{.ServerVersion}}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    $morrowDesktop = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/Docker Desktop.exe'
    if (-not (Test-Path -LiteralPath $morrowDesktop)) {
        $morrowDesktop = Join-Path $env:ProgramFiles 'Docker/Docker/Docker Desktop.exe'
    }
    if (-not (Test-Path -LiteralPath $morrowDesktop)) { throw 'Open Docker Desktop and retry.' }
    Start-Process -FilePath $morrowDesktop -WindowStyle Hidden
    Write-Host 'Waiting for Docker Desktop to become ready...'
    $morrowReady = $false
    for ($attempt = 0; $attempt -lt 36; $attempt++) {
        & $morrowDocker info --format '{{.ServerVersion}}' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $morrowReady = $true; break }
        Start-Sleep -Seconds 5
    }
    if (-not $morrowReady) { throw 'Docker did not become ready within three minutes. Check Docker Desktop.' }
}
Push-Location -LiteralPath $morrowRoot
try {
    if ($Build) { & $morrowDocker compose up -d --build }
    else { & $morrowDocker compose up -d }
    if ($LASTEXITCODE -ne 0) { throw 'The Morrow container could not start.' }
    $morrowHealthy = $false
    for ($attempt = 0; $attempt -lt 24; $attempt++) {
        try {
            $result = Invoke-RestMethod 'http://127.0.0.1:8096/readyz' -TimeoutSec 5
            if ($result.status -eq 'ready') { $morrowHealthy = $true; break }
        } catch { }
        Start-Sleep -Seconds 5
    }
    if (-not $morrowHealthy) { throw 'Morrow started but readiness was not confirmed. Run docker compose logs.' }
    Write-Host 'Morrow Task Studio is ready at http://127.0.0.1:8096'
    Write-Host 'Tasks are kept in the named Docker volume when the container stops.'
    Start-Process 'http://127.0.0.1:8096'
} finally { Pop-Location }
