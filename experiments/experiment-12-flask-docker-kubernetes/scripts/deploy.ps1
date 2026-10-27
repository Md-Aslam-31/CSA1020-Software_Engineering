param([string]$Context = 'kind-parcelpilot-lab')
$ErrorActionPreference = 'Stop'
$labProject = Split-Path $PSScriptRoot -Parent
Push-Location $labProject
try {
    kubectl --context $Context apply -f k8s/namespace.yaml
    if ($LASTEXITCODE -ne 0) { throw 'Namespace creation failed' }
    kubectl --context $Context apply -f k8s/configmap.yaml -f k8s/deployment.yaml -f k8s/service.yaml
    if ($LASTEXITCODE -ne 0) { throw 'Manifest application failed' }
    kubectl --context $Context -n parcelpilot-lab rollout status deployment/parcelpilot-api --timeout=180s
    if ($LASTEXITCODE -ne 0) { throw 'Deployment did not become ready' }
    kubectl --context $Context -n parcelpilot-lab get deployment,pods,service -o wide
    Write-Host 'Open http://127.0.0.1:30088/ when using the supplied kind cluster configuration.'
} finally { Pop-Location }
