param([switch]$Build)
$ErrorActionPreference = 'Stop'
$atlasRoot = Split-Path -Parent $PSScriptRoot
$atlasDocker = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
if (-not $atlasDocker) {
    $atlasDocker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
}
if (-not (Test-Path -LiteralPath $atlasDocker)) { throw 'Docker Desktop is required. Start Docker Desktop and retry.' }
& $atlasDocker info --format '{{.ServerVersion}}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    $atlasDesktop = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/Docker Desktop.exe'
    if (-not (Test-Path -LiteralPath $atlasDesktop)) { $atlasDesktop = Join-Path $env:ProgramFiles 'Docker/Docker/Docker Desktop.exe' }
    if (-not (Test-Path -LiteralPath $atlasDesktop)) { throw 'Open Docker Desktop and retry.' }
    Start-Process -FilePath $atlasDesktop -WindowStyle Hidden
    $atlasEngineReady = $false
    for ($attempt = 0; $attempt -lt 36; $attempt++) {
        & $atlasDocker info --format '{{.ServerVersion}}' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $atlasEngineReady = $true; break }
        Start-Sleep -Seconds 5
    }
    if (-not $atlasEngineReady) { throw 'Docker was not ready within three minutes. Inspect Docker Desktop.' }
}
Push-Location -LiteralPath $atlasRoot
try {
    if ($Build) { & $atlasDocker compose up -d --build }
    else { & $atlasDocker compose up -d }
    if ($LASTEXITCODE -ne 0) { throw 'The Meridian Atlas container could not start.' }
    $atlasHealthy = $false
    for ($attempt = 0; $attempt -lt 24; $attempt++) {
        try {
            $atlasResponse = Invoke-WebRequest 'http://127.0.0.1:8097/healthz' -TimeoutSec 5
            if ($atlasResponse.StatusCode -eq 200 -and $atlasResponse.Content.Trim() -eq 'healthy') { $atlasHealthy = $true; break }
        } catch { }
        Start-Sleep -Seconds 5
    }
    if (-not $atlasHealthy) { throw 'The container started but its health endpoint was not confirmed.' }
    Write-Host 'Meridian Atlas is ready at http://127.0.0.1:8097/'
    Start-Process 'http://127.0.0.1:8097/'
} finally { Pop-Location }
