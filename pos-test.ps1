#!/usr/bin/env powershell
# POS System Testing Guide - Interactive Version

Write-Host "🎯 POS SYSTEM TESTING GUIDE" -ForegroundColor Green
Write-Host "============================" -ForegroundColor Green
Write-Host ""

function Test-Connection {
    param($Name, $TestFunction, $SuccessMessage, $FailMessage)
    Write-Host "Testing $Name..." -ForegroundColor Yellow
    try {
        $result = & $TestFunction
        if ($result) {
            Write-Host "   ✅ $SuccessMessage" -ForegroundColor Green
            return $true
        }
    } catch {
        Write-Host "   ❌ $FailMessage" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    return $false
}

function Test-Backend {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/test" -Method Get -TimeoutSec 5
    return $response.status -eq "OK"
}

function Test-Frontend {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -Method Get -TimeoutSec 5
    return $response.StatusCode -eq 200
}

function Test-Stripe {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/connection_token" -Method Post -TimeoutSec 10
    return $response.secret -ne $null
}

function Test-GoHighLevel {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/inventory" -Method Get -TimeoutSec 10
    return $response.Count -gt 0
}

function Test-Database {
    $testPayment = @{
        items = @(@{name="Connection Test"; price=0.01; quantity=1})
        total = 0.01
        method = "test"
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "http://localhost:5000/log-payment" -Method Post -Body $testPayment -ContentType "application/json" -TimeoutSec 10
    return $response.success -eq $true
}

function Test-PaymentIntent {
    $paymentData = @{amount = 100} | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "http://localhost:5000/create_payment_intent" -Method Post -Body $paymentData -ContentType "application/json" -TimeoutSec 10
    return $response.client_secret -ne $null
}

Write-Host "🔍 Running Connection Tests..." -ForegroundColor Cyan
Write-Host ""

# Test each component
$tests = @{
    "Backend Server" = { Test-Backend }
    "Frontend App" = { Test-Frontend }
    "Stripe Terminal" = { Test-Stripe }
    "GoHighLevel API" = { Test-GoHighLevel }
    "Database Connection" = { Test-Database }
    "Payment Processing" = { Test-PaymentIntent }
}

$results = @{}
foreach ($test in $tests.GetEnumerator()) {
    $results[$test.Name] = Test-Connection -Name $test.Name -TestFunction $test.Value -SuccessMessage "CONNECTED" -FailMessage "FAILED"
}

Write-Host ""
Write-Host "📊 TEST RESULTS SUMMARY" -ForegroundColor Magenta
Write-Host "========================" -ForegroundColor Magenta

$passed = 0
$total = $results.Count

foreach ($result in $results.GetEnumerator()) {
    if ($result.Value) {
        Write-Host "✅ $($result.Name): WORKING" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "❌ $($result.Name): FAILED" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🎯 Overall Status: $passed/$total tests passed" -ForegroundColor Cyan

if ($passed -eq $total) {
    Write-Host ""
    Write-Host "🎉 ALL TESTS PASSED - SYSTEM FULLY OPERATIONAL!" -ForegroundColor Green
    Write-Host ""
    Write-Host "💰 Your POS is ready for:" -ForegroundColor White
    Write-Host "   • Processing cash payments" -ForegroundColor Green
    Write-Host "   • Processing card payments" -ForegroundColor Green  
    Write-Host "   • Managing inventory" -ForegroundColor Green
    Write-Host "   • Recording transactions" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Access your POS at: http://localhost:3000" -ForegroundColor Cyan
} elseif ($passed -ge 4) {
    Write-Host ""
    Write-Host "⚠️  MOSTLY WORKING - Minor issues need fixing" -ForegroundColor Yellow
    Write-Host ""
    if (-not $results["GoHighLevel API"]) {
        Write-Host "🔧 To fix GoHighLevel:" -ForegroundColor White
        Write-Host "   1. Open: http://localhost:5000/auth" -ForegroundColor Yellow
        Write-Host "   2. Complete OAuth authorization" -ForegroundColor Yellow
        Write-Host "   3. Return to POS app" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "❌ SYSTEM NEEDS ATTENTION" -ForegroundColor Red
    Write-Host ""
    Write-Host "🛠️  Troubleshooting steps:" -ForegroundColor White
    
    if (-not $results["Backend Server"]) {
        Write-Host "   • Start backend: cd backend && node server.js" -ForegroundColor Yellow
    }
    if (-not $results["Frontend App"]) {
        Write-Host "   • Start frontend: cd frontend && npm start" -ForegroundColor Yellow
    }
    if (-not $results["Stripe Terminal"]) {
        Write-Host "   • Check Stripe secret key in .env file" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "🔄 Run this test anytime with: .\pos-test.ps1" -ForegroundColor Gray
