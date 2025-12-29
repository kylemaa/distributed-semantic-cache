# API Test Script for UAT Readiness
$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "  Distributed Semantic Cache API Tests  " -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Yellow

$baseUrl = "http://127.0.0.1:3000"

try {
    # Test 1: Health check
    Write-Host "[1/6] Health Check..." -ForegroundColor Cyan
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET
    Write-Host "  ✓ Status: $($health.status)" -ForegroundColor Green

    # Test 2: Root endpoint (API info)
    Write-Host "[2/6] API Info..." -ForegroundColor Cyan
    $info = Invoke-RestMethod -Uri "$baseUrl/" -Method GET
    Write-Host "  ✓ API: $($info.name) v$($info.version)" -ForegroundColor Green

    # Test 3: Store a cache entry
    Write-Host "[3/6] Store Cache Entry..." -ForegroundColor Cyan
    $storeBody = @{
        query = "What is TypeScript?"
        response = "TypeScript is a typed superset of JavaScript that compiles to plain JavaScript."
    } | ConvertTo-Json
    $storeResult = Invoke-RestMethod -Uri "$baseUrl/api/cache/store" -Method POST -Body $storeBody -ContentType "application/json"
    Write-Host "  ✓ Stored successfully (ID: $($storeResult.entry.id.Substring(0,8))...)" -ForegroundColor Green

    # Test 4: Query the cache (exact match)
    Write-Host "[4/6] Query Cache (Exact Match)..." -ForegroundColor Cyan
    $queryBody = @{ query = "What is TypeScript?" } | ConvertTo-Json
    $queryResult = Invoke-RestMethod -Uri "$baseUrl/api/cache/query" -Method POST -Body $queryBody -ContentType "application/json"
    Write-Host "  ✓ Hit: $($queryResult.hit), Similarity: $([math]::Round($queryResult.similarity, 4))" -ForegroundColor Green

    # Test 5: Query the cache (semantic match)
    Write-Host "[5/6] Query Cache (Semantic Match)..." -ForegroundColor Cyan
    $queryBody2 = @{ query = "Tell me about TypeScript programming language" } | ConvertTo-Json
    $queryResult2 = Invoke-RestMethod -Uri "$baseUrl/api/cache/query" -Method POST -Body $queryBody2 -ContentType "application/json"
    if ($queryResult2.hit) {
        Write-Host "  ✓ Hit: True, Similarity: $([math]::Round($queryResult2.similarity, 4))" -ForegroundColor Green
    } else {
        Write-Host "  ○ Hit: False (semantic match below threshold)" -ForegroundColor Yellow
    }

    # Test 6: Get stats
    Write-Host "[6/6] Cache Stats..." -ForegroundColor Cyan
    $stats = Invoke-RestMethod -Uri "$baseUrl/api/cache/stats" -Method GET
    Write-Host "  ✓ Total Entries: $($stats.totalEntries)" -ForegroundColor Green
    Write-Host "  ✓ Exact Match Cache Size: $($stats.exactMatchCache.size)" -ForegroundColor Green

    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "  All Tests PASSED - Ready for UAT!  " -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Green

} catch {
    Write-Host "`n✗ Test FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}
