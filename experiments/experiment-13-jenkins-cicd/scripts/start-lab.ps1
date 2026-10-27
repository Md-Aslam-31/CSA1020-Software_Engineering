param([string]$SecretsDirectory = (Join-Path $env:LOCALAPPDATA 'ReleaseHarborLab/secrets'))
$ErrorActionPreference = 'Stop'
$labProject = Split-Path $PSScriptRoot -Parent
$labSecretPath = [IO.Path]::GetFullPath($SecretsDirectory)
if ($labSecretPath.StartsWith([IO.Path]::GetFullPath($labProject), [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Keep the secret directory outside the experiment and Git repository.'
}
New-Item -ItemType Directory -Path $labSecretPath -Force | Out-Null
$labIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $labSecretPath /inheritance:r /grant:r ('*'+$labIdentity+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the secret-directory permissions' }
$labAdminFile = Join-Path $labSecretPath 'jenkins_admin_password'
if (-not (Test-Path -LiteralPath $labAdminFile)) {
    $labExistingHome = docker volume ls --filter 'name=^releaseharbor-exp13_jenkins-home$' --format '{{.Name}}'
    if ($LASTEXITCODE -ne 0) { throw 'Docker must be running before this lab can start' }
    if ($labExistingHome) {
        throw 'Existing Jenkins data was found. Run this script with -SecretsDirectory pointing to the private directory originally used for this lab.'
    }
    $labRandom = New-Object byte[] 30
    $labRng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $labRng.GetBytes($labRandom) } finally { $labRng.Dispose() }
    [IO.File]::WriteAllText($labAdminFile, [Convert]::ToBase64String($labRandom), (New-Object Text.UTF8Encoding($false)))
}
$labSeedFile = Join-Path $labSecretPath 'seed_credentials.json'
if (-not (Test-Path -LiteralPath $labSeedFile)) {
    [IO.File]::WriteAllText($labSeedFile, '{}', (New-Object Text.UTF8Encoding($false)))
}
$env:JENKINS_SECRETS_DIR = $labSecretPath.Replace('\','/')
Push-Location $labProject
try {
    docker compose build
    if ($LASTEXITCODE -ne 0) { throw 'Jenkins image build failed' }
    docker compose up -d
    if ($LASTEXITCODE -ne 0) { throw 'Jenkins startup failed' }
    Write-Host 'Jenkins: http://127.0.0.1:8090/  |  Administrator username: emad'
    Write-Host ('Administrator password is stored privately in: '+$labAdminFile)
    Write-Host 'Read the report to configure Jenkins credentials before publishing or deploying.'
} finally { Pop-Location }
