$ErrorActionPreference = 'Stop'
$swiftBusNode = Get-Command node -ErrorAction SilentlyContinue
if ($swiftBusNode) {
    $swiftBusNodePath = $swiftBusNode.Source
} else {
    $swiftBusNodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (-not (Test-Path -LiteralPath $swiftBusNodePath)) {
        throw 'Node.js 20 or newer is required. Install Node.js, then run this launcher again.'
    }
}
Write-Host 'Starting SwiftBus for local testing at http://127.0.0.1:4817'
Write-Host 'Open that URL after the server reports ready. Press Ctrl+C here to stop it.'
& $swiftBusNodePath (Join-Path $PSScriptRoot 'server.cjs')
