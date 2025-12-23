$API = 'http://localhost:3000'
$queries = @('What is AI?', 'Explain ML', 'Tell me about AI', 'WHAT IS AI?', 'What is AI???', 'Describe AI', 'Weather today?', 'What is AI?', 'Explain ML')
foreach ($q in $queries) {
  Write-Host $q -ForegroundColor Cyan
  $r = Invoke-RestMethod -Uri "$API/api/chat" -Method POST -Body (@{message=$q}|ConvertTo-Json) -ContentType 'application/json'
  if ($r.cached) { Write-Host '   Cached' -ForegroundColor Green } else { Write-Host '   Fresh' -ForegroundColor Blue }
  Start-Sleep -Milliseconds 150
}
$s = Invoke-RestMethod -Uri "$API/api/cache/stats"
Write-Host "
Stats: Queries=$($s.totalQueries) Hits=$($s.cacheHits) Rate=$([math]::Round($s.hitRate*100,1))%" -ForegroundColor Yellow
Write-Host "L1:$($s.l1Hits) L2:$($s.l2Hits) L3:$($s.l3Hits)" -ForegroundColor Magenta
Write-Host "
View admin: http://localhost:5174" -ForegroundColor Cyan
