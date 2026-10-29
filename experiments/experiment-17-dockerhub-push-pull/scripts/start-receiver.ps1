param([string]$Digest)
$ErrorActionPreference = 'Stop'
$atlasDocker = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
if (-not $atlasDocker) { $atlasDocker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe' }
if (-not (Test-Path -LiteralPath $atlasDocker)) { throw 'Install and start Docker Desktop first.' }
& $atlasDocker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop before running the receiver.' }
if ($Digest -and $Digest -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Digest must be a SHA256 registry digest.' }
$atlasRef = 'coastrider7/csa1020-exp17-meridian-atlas:1.0.0'
if ($Digest) { $atlasRef = "coastrider7/csa1020-exp17-meridian-atlas@$Digest" }
$atlasNames = & $atlasDocker ps -a --format '{{.Names}}'
if ('meridian-receiver-exp17-b' -notin $atlasNames) {
    & $atlasDocker run -d --name meridian-receiver-exp17-b --hostname meridian-receiver-b --privileged --restart unless-stopped --memory 384m --cpus 1 -e DOCKER_TLS_CERTDIR= -p 127.0.0.1:8098:8080 --mount type=volume,source=meridian-exp17-receiver-data,target=/var/lib/docker docker@sha256:9e79b879b177fbd72c34376a3dd3d91747da5db49e1f560f76aea59561471977 dockerd --host=unix:///var/run/docker.sock --storage-driver=overlay2
} else { & $atlasDocker start meridian-receiver-exp17-b | Out-Null }
if ($LASTEXITCODE -ne 0) { throw 'Receiver container could not start.' }
$atlasReady = $false
for ($attempt=0; $attempt -lt 45; $attempt++) {
    & $atlasDocker exec meridian-receiver-exp17-b docker info --format '{{.ID}}' 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $atlasReady=$true;break }
    Start-Sleep -Seconds 2
}
if (-not $atlasReady) { throw 'The receiver Docker engine did not become ready.' }
& $atlasDocker exec meridian-receiver-exp17-b docker pull $atlasRef
if ($LASTEXITCODE -ne 0) { throw 'Docker Hub pull failed.' }
$atlasInnerNames = & $atlasDocker exec meridian-receiver-exp17-b docker ps -a --format '{{.Names}}'
if ('meridian-atlas-exp17-b' -notin $atlasInnerNames) {
    & $atlasDocker exec meridian-receiver-exp17-b docker run -d --name meridian-atlas-exp17-b --restart unless-stopped --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --cap-drop ALL --security-opt no-new-privileges:true --memory 64m --cpus 0.5 -p 8080:8080 $atlasRef
} else {
    $atlasExpected = & $atlasDocker exec meridian-receiver-exp17-b docker image inspect $atlasRef --format '{{.Id}}'
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the requested image.' }
    $atlasExisting = & $atlasDocker exec meridian-receiver-exp17-b docker inspect meridian-atlas-exp17-b --format '{{.Image}}'
    if ($atlasExpected -ne $atlasExisting) { throw 'The existing receiver website uses a different image. It was preserved. Review it before replacing it.' }
    & $atlasDocker exec meridian-receiver-exp17-b docker start meridian-atlas-exp17-b | Out-Null
}
if ($LASTEXITCODE -ne 0) { throw 'Receiver website could not start.' }
Write-Host 'Receiver B simulates a second machine using an independent Docker engine on this laptop.'
Write-Host 'The engine has its own image store; its API is available only through its internal Unix socket.'
$atlasWebReady=$false
for ($attempt=0; $attempt -lt 30; $attempt++) {
    try { $atlasHealth=Invoke-WebRequest 'http://127.0.0.1:8098/healthz' -TimeoutSec 5; if($atlasHealth.StatusCode -eq 200){$atlasWebReady=$true;break} } catch { }
    Start-Sleep -Seconds 2
}
if (-not $atlasWebReady) { throw 'The receiver website did not become ready. Inspect its Docker logs.' }
Write-Host 'Receiver website is ready at http://127.0.0.1:8098/.'
Start-Process 'http://127.0.0.1:8098/'
