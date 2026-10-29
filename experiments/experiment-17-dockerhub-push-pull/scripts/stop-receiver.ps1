$ErrorActionPreference = 'Stop'
$atlasDocker = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
if (-not $atlasDocker) { $atlasDocker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe' }
& $atlasDocker stop --time 30 meridian-receiver-exp17-b
if ($LASTEXITCODE -ne 0) { throw 'The receiver could not be stopped.' }
Write-Host 'Receiver stopped. Its named volume and pulled image are preserved.'
