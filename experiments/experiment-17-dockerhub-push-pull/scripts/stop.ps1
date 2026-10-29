$ErrorActionPreference = 'Stop'
$atlasDocker = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
if (-not $atlasDocker) { $atlasDocker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe' }
if (-not (Test-Path -LiteralPath $atlasDocker)) { throw 'Docker Desktop CLI was not found.' }
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    & $atlasDocker compose stop
    if ($LASTEXITCODE -ne 0) { throw 'The Meridian Atlas container could not be stopped.' }
    Write-Host 'Meridian Atlas stopped. Other experiments were not changed.'
} finally { Pop-Location }
