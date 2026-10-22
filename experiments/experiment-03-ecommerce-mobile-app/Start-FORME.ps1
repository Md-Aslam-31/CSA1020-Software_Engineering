$taskNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $taskNode)) { $taskNode = (Get-Command node -ErrorAction Stop).Source }
Write-Host 'Open http://127.0.0.1:4823/ after the server reports it is ready. Press Ctrl+C to stop.'
& $taskNode (Join-Path $PSScriptRoot 'server.cjs')
