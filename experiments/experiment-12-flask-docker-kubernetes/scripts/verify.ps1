param([string]$BaseUrl = 'http://127.0.0.1:30088')
$ErrorActionPreference = 'Stop'
$labBase = $BaseUrl.TrimEnd('/')
$labHealth = Invoke-RestMethod "$labBase/healthz"
if ($labHealth.status -ne 'healthy') { throw 'Health check failed' }
$labReady = Invoke-RestMethod "$labBase/readyz"
if ($labReady.status -ne 'ready') { throw 'Readiness check failed' }
$labServices = Invoke-RestMethod "$labBase/api/v1/services"
if ($labServices.data.count -ne 3) { throw 'Expected three delivery services' }
$labBody = @{origin='Chennai';destination='Bengaluru';distance_km=350;weight_kg=2.5;service='express'}
$labQuote = Invoke-WebRequest "$labBase/api/v1/quotes" -Method Post -ContentType application/json -Body ($labBody | ConvertTo-Json)
$labQuoteData = $labQuote.Content | ConvertFrom-Json
if ($labQuote.StatusCode -ne 201 -or $labQuoteData.data.total -ne 760) { throw 'Quote calculation failed' }
$labBody.Remove('service')
$labCompare = Invoke-RestMethod "$labBase/api/v1/compare" -Method Post -ContentType application/json -Body ($labBody | ConvertTo-Json)
if ($labCompare.data.quotes.Count -ne 3 -or $labCompare.data.cheapest -ne 'economy' -or $labCompare.data.fastest -ne 'priority') { throw 'Service comparison failed' }
$labStatus = Invoke-RestMethod "$labBase/api/v1/status"
Write-Output ([ordered]@{health=$labHealth.status;readiness=$labReady.status;quote_http=$labQuote.StatusCode;quote_total=$labQuoteData.data.total;compared_services=$labCompare.data.quotes.Count;runtime=$labStatus.data.mode;instance=$labStatus.data.instance} | ConvertTo-Json)
