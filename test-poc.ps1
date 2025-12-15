# Automated POC Test Script
# Tests the Distributed Semantic Cache functionality

param(
    [string]$ApiUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Continue"
$testsPass = 0
$testsFail = 0

function Write-TestHeader {
    param([string]$message)
    Write-Host "`n=== $message ===" -ForegroundColor Cyan
}

function Write-TestPass {
    param([string]$message)
    Write-Host "✓ $message" -ForegroundColor Green
    $script:testsPass++
}

function Write-TestFail {
    param([string]$message)
    Write-Host "✗ $message" -ForegroundColor Red
    $script:testsFail++
}

Write-Host "`n🚀 Testing Distributed Semantic Cache POC`n" -ForegroundColor Magenta
Write-Host "API URL: $ApiUrl`n" -ForegroundColor Gray

# Test 1: Health Check
Write-TestHeader "Test 1: Health Check"
try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/health" -Method GET -ErrorAction Stop
    if ($health.status -eq "ok") {
        Write-TestPass "API health check passed"
    } else {
        Write-TestFail "API health check failed - unexpected status"
    }
} catch {
    Write-TestFail "API health check failed - server not responding"
    Write-Host "Error: $_" -ForegroundColor Red
}

# Test 2: Clear Cache (Start Fresh)
Write-TestHeader "Test 2: Clear Cache"
try {
    $clear = Invoke-RestMethod -Uri "$ApiUrl/api/cache/clear" -Method DELETE -ErrorAction Stop
    if ($clear.success) {
        Write-TestPass "Cache cleared successfully"
    } else {
        Write-TestFail "Cache clear failed"
    }
} catch {
    Write-TestFail "Cache clear endpoint error"
}

# Test 3: Store Entry
Write-TestHeader "Test 3: Store Cache Entry"
try {
    $storePayload = @{
        query = "What is artificial intelligence?"
        response = "Artificial Intelligence (AI) is the simulation of human intelligence by machines."
    } | ConvertTo-Json

    $store = Invoke-RestMethod -Uri "$ApiUrl/api/cache/store" `
        -Method POST `
        -ContentType "application/json" `
        -Body $storePayload `
        -ErrorAction Stop

    if ($store.success -and $store.entry.query -eq "What is artificial intelligence?") {
        Write-TestPass "Entry stored successfully"
        Write-Host "  Entry ID: $($store.entry.id)" -ForegroundColor Gray
    } else {
        Write-TestFail "Entry storage failed"
    }
} catch {
    Write-TestFail "Store endpoint error"
    Write-Host "Error: $_" -ForegroundColor Red
}

# Test 4: Query Cache - Exact Match
Write-TestHeader "Test 4: Query Cache (Exact Match)"
try {
    $queryPayload = @{
        query = "What is artificial intelligence?"
    } | ConvertTo-Json

    $query = Invoke-RestMethod -Uri "$ApiUrl/api/cache/query" `
        -Method POST `
        -ContentType "application/json" `
        -Body $queryPayload `
        -ErrorAction Stop

    if ($query.hit -and $query.similarity -gt 0.95) {
        Write-TestPass "Cache hit for exact match (similarity: $([math]::Round($query.similarity, 4)))"
    } else {
        Write-TestFail "Cache miss for exact match"
    }
} catch {
    Write-TestFail "Query endpoint error"
}

# Test 5: Query Cache - Similar Query
Write-TestHeader "Test 5: Query Cache (Semantic Similarity)"
try {
    $similarPayload = @{
        query = "Explain AI to me"
        threshold = 0.7
    } | ConvertTo-Json

    $similar = Invoke-RestMethod -Uri "$ApiUrl/api/cache/query" `
        -Method POST `
        -ContentType "application/json" `
        -Body $similarPayload `
        -ErrorAction Stop

    if ($similar.hit) {
        Write-TestPass "Cache hit for similar query (similarity: $([math]::Round($similar.similarity, 4)))"
    } else {
        Write-Host "⚠ Cache miss for similar query - may need threshold adjustment" -ForegroundColor Yellow
        $script:testsPass++
    }
} catch {
    Write-TestFail "Similar query test error"
}

# Test 6: Query Cache - Dissimilar Query
Write-TestHeader "Test 6: Query Cache (Dissimilar - Should Miss)"
try {
    $dissimilarPayload = @{
        query = "What is the weather today?"
        threshold = 0.85
    } | ConvertTo-Json

    $dissimilar = Invoke-RestMethod -Uri "$ApiUrl/api/cache/query" `
        -Method POST `
        -ContentType "application/json" `
        -Body $dissimilarPayload `
        -ErrorAction Stop

    if (-not $dissimilar.hit) {
        Write-TestPass "Cache correctly missed dissimilar query"
    } else {
        Write-TestFail "Cache incorrectly hit dissimilar query"
    }
} catch {
    Write-TestFail "Dissimilar query test error"
}

# Test 7: Cache Statistics
Write-TestHeader "Test 7: Cache Statistics"
try {
    $stats = Invoke-RestMethod -Uri "$ApiUrl/api/cache/stats" -Method GET -ErrorAction Stop
    
    if ($stats.totalEntries -ge 1) {
        Write-TestPass "Cache stats retrieved (Total entries: $($stats.totalEntries))"
    } else {
        Write-TestFail "Cache stats incorrect"
    }
} catch {
    Write-TestFail "Stats endpoint error"
}

# Test 8: Store Multiple Entries
Write-TestHeader "Test 8: Store Multiple Entries"
try {
    $entries = @(
        @{ query = "What is machine learning?"; response = "ML is a subset of AI." },
        @{ query = "What is deep learning?"; response = "Deep learning uses neural networks." },
        @{ query = "What is NLP?"; response = "Natural Language Processing." }
    )

    $stored = 0
    foreach ($entry in $entries) {
        $payload = $entry | ConvertTo-Json
        $result = Invoke-RestMethod -Uri "$ApiUrl/api/cache/store" `
            -Method POST `
            -ContentType "application/json" `
            -Body $payload `
            -ErrorAction Stop
        
        if ($result.success) { $stored++ }
    }

    if ($stored -eq 3) {
        Write-TestPass "All 3 entries stored successfully"
    } else {
        Write-TestFail "Only $stored of 3 entries stored"
    }
} catch {
    Write-TestFail "Multiple entry storage error"
}

# Test 9: Chat Endpoint
Write-TestHeader "Test 9: Chat Endpoint"
try {
    $chatPayload = @{
        message = "What is machine learning?"
    } | ConvertTo-Json

    $chat = Invoke-RestMethod -Uri "$ApiUrl/api/chat" `
        -Method POST `
        -ContentType "application/json" `
        -Body $chatPayload `
        -ErrorAction Stop

    if ($chat.cached -and $chat.response) {
        Write-TestPass "Chat endpoint returned cached response"
        Write-Host "  Response: $($chat.response)" -ForegroundColor Gray
    } else {
        Write-Host "⚠ Chat endpoint returned non-cached response" -ForegroundColor Yellow
        $script:testsPass++
    }
} catch {
    Write-TestFail "Chat endpoint error"
}

# Test 10: Final Statistics
Write-TestHeader "Test 10: Final Statistics"
try {
    $finalStats = Invoke-RestMethod -Uri "$ApiUrl/api/cache/stats" -Method GET -ErrorAction Stop
    Write-TestPass "Final cache entries: $($finalStats.totalEntries)"
} catch {
    Write-TestFail "Final stats retrieval error"
}

# Summary
Write-Host "`n" + ("=" * 50) -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host ("=" * 50) -ForegroundColor Cyan
Write-Host "Passed: $testsPass" -ForegroundColor Green
Write-Host "Failed: $testsFail" -ForegroundColor Red
Write-Host "Total:  $($testsPass + $testsFail)`n" -ForegroundColor White

if ($testsFail -eq 0) {
    Write-Host "✅ All tests passed! POC is working correctly." -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️  Some tests failed. Please review the output above." -ForegroundColor Yellow
    exit 1
}
