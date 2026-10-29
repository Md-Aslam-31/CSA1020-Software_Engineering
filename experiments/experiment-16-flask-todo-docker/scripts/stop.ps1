$ErrorActionPreference = 'Stop'
$morrowDocker = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
if (-not $morrowDocker) { $morrowDocker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe' }
if (-not (Test-Path -LiteralPath $morrowDocker)) { throw 'Docker Desktop was not found.' }
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    & $morrowDocker compose stop
    if ($LASTEXITCODE -ne 0) { throw 'The container could not be stopped. Check Docker Desktop.' }
    Write-Host 'Morrow stopped. The container and saved tasks are preserved.'
} finally { Pop-Location }
