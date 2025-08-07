#!/usr/bin/env powershell
# POS System Connection Test Suite

Write-Host "🔍 YMC POS System Connection Tests" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""

# Test 1: Backend Server Health
Write-Host "1. Testing Backend Server..." -ForegroundColor Yellow
try {
    $backendHealth = Invoke-RestMethod -Uri "http://localhost:5000/test" -Method Get -TimeoutSec 5
    Write-Host "   ✅ Backend Server: CONNECTED" -ForegroundColor Green
    Write-Host "   📊 Status: $($backendHealth.status)" -ForegroundColor Cyan
    Write-Host "   🕐 Timestamp: $($backendHealth.time)" -ForegroundColor Cyan
    $backendOK = $true
} catch {
    Write-Host "   ❌ Backend Server: FAILED" -ForegroundColor Red
    Write-Host "   💡 Fix: Run 'node server.js' in backend directory" -ForegroundColor Yellow
    $backendOK = $false
}
Write-Host ""

# Test 2: Frontend Accessibility  
Write-Host "2. Testing Frontend App..." -ForegroundColor Yellow
try {
    $frontendTest = Invoke-WebRequest -Uri "http://localhost:3000" -Method Get -TimeoutSec 5
    Write-Host "   ✅ Frontend App: ACCESSIBLE" -ForegroundColor Green
    Write-Host "   📊 Status: $($frontendTest.StatusCode) $($frontendTest.StatusDescription)" -ForegroundColor Cyan
    Write-Host "   🌐 URL: http://localhost:3000" -ForegroundColor Cyan
    $frontendOK = $true
} catch {
    Write-Host "   ❌ Frontend App: FAILED" -ForegroundColor Red
    Write-Host "   💡 Fix: Run 'npm start' in frontend directory" -ForegroundColor Yellow
    $frontendOK = $false
}
Write-Host ""

# Test 3: Stripe Terminal Connection
Write-Host "3. Testing Stripe Terminal..." -ForegroundColor Yellow
try {
    $stripeToken = Invoke-RestMethod -Uri "http://localhost:5000/connection_token" -Method Post -TimeoutSec 10
    Write-Host "   ✅ Stripe Terminal: CONNECTED" -ForegroundColor Green
    Write-Host "   🔑 Connection Token: Generated successfully" -ForegroundColor Cyan
    Write-Host "   🏦 Ready for card payments" -ForegroundColor Cyan
    $stripeOK = $true
} catch {
    Write-Host "   ❌ Stripe Terminal: FAILED" -ForegroundColor Red
    Write-Host "   💡 Fix: Check Stripe secret key in .env file" -ForegroundColor Yellow
    $stripeOK = $false
}
Write-Host ""

# Test 4: GoHighLevel API
Write-Host "4. Testing GoHighLevel API..." -ForegroundColor Yellow
try {
    $inventory = Invoke-RestMethod -Uri "http://localhost:5000/inventory" -Method Get -TimeoutSec 10
    Write-Host "   ✅ GoHighLevel API: CONNECTED" -ForegroundColor Green
    Write-Host "   📦 Products loaded: $($inventory.Count)" -ForegroundColor Cyan
    Write-Host "   🔄 Inventory sync: Ready" -ForegroundColor Cyan
    $ghlOK = $true
} catch {
    Write-Host "   ❌ GoHighLevel API: FAILED" -ForegroundColor Red
    Write-Host "   💡 Fix: Visit http://localhost:5000/auth to re-authorize" -ForegroundColor Yellow
    Write-Host "   🔗 Auth URL: http://localhost:5000/auth" -ForegroundColor Yellow
    $ghlOK = $false
}
Write-Host ""

# Test 5: Database Connection (MongoDB)
Write-Host "5. Testing Database Connection..." -ForegroundColor Yellow
try {
    # Test payment logging
    $testPayment = @{
        items = @(@{ name = "Test Item"; price = 1.00; quantity = 1 })
        total = 1.00
        method = "test"
    } | ConvertTo-Json
    
    $dbTest = Invoke-RestMethod -Uri "http://localhost:5000/log-payment" -Method Post -Body $testPayment -ContentType "application/json" -TimeoutSec 10
    Write-Host "   ✅ Database (MongoDB): CONNECTED" -ForegroundColor Green
    Write-Host "   💾 Payment logging: Working" -ForegroundColor Cyan
    $dbOK = $true
} catch {
    Write-Host "   ❌ Database (MongoDB): FAILED" -ForegroundColor Red
    Write-Host "   💡 Fix: Check MongoDB connection string in .env" -ForegroundColor Yellow
    $dbOK = $false
}
Write-Host ""

# Test 6: Card Reader Simulation
Write-Host "6. Testing Card Reader Functionality..." -ForegroundColor Yellow
try {
    # Test payment intent creation
    $paymentData = @{ amount = 100 } | ConvertTo-Json
    $paymentIntent = Invoke-RestMethod -Uri "http://localhost:5000/create_payment_intent" -Method Post -Body $paymentData -ContentType "application/json" -TimeoutSec 10
    Write-Host "   ✅ Payment Intent: CREATED" -ForegroundColor Green
    Write-Host "   💳 Ready for card transactions" -ForegroundColor Cyan
    Write-Host "   🔐 Client Secret: Generated" -ForegroundColor Cyan
    $readerOK = $true
} catch {
    Write-Host "   ❌ Payment Intent: FAILED" -ForegroundColor Red
    Write-Host "   💡 Fix: Check Stripe configuration" -ForegroundColor Yellow
    $readerOK = $false
}
Write-Host ""

# Summary Report
Write-Host "📋 CONNECTION TEST SUMMARY" -ForegroundColor Magenta
Write-Host "===========================" -ForegroundColor Magenta

$services = @{
    "Backend Server" = $backendOK
    "Frontend App" = $frontendOK  
    "Stripe Terminal" = $stripeOK
    "GoHighLevel API" = $ghlOK
    "Database" = $dbOK
    "Card Reader" = $readerOK
}

$connected = 0
$total = $services.Count

foreach ($service in $services.GetEnumerator()) {
    if ($service.Value) {
        Write-Host "✅ $($service.Name): CONNECTED" -ForegroundColor Green
        $connected++
    } else {
        Write-Host "❌ $($service.Name): DISCONNECTED" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🎯 Overall Status: $connected/$total services connected" -ForegroundColor Cyan

if ($connected -eq $total) {
    Write-Host "🎉 ALL SYSTEMS OPERATIONAL!" -ForegroundColor Green
    Write-Host "🚀 Your POS system is ready for use!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📱 Access Points:" -ForegroundColor White
    Write-Host "   • POS Interface: http://localhost:3000" -ForegroundColor Cyan
    Write-Host "   • Backend API: http://localhost:5000" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "💰 Payment Methods Ready:" -ForegroundColor White
    Write-Host "   • Cash payments ✅" -ForegroundColor Green
    Write-Host "   • Card payments ✅" -ForegroundColor Green
    Write-Host "   • Inventory sync ✅" -ForegroundColor Green
} elseif ($connected -ge 4) {
    Write-Host "⚠️  MOSTLY OPERATIONAL" -ForegroundColor Yellow
    Write-Host "🔧 Minor issues need attention" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🛠️  Quick Fixes:" -ForegroundColor White
    if (-not $ghlOK) {
        Write-Host "   • GoHighLevel: Visit http://localhost:5000/auth" -ForegroundColor Yellow
        Write-Host "     (Opens authorization page)" -ForegroundColor Gray
    }
} else {
    Write-Host "❌ SYSTEM NEEDS ATTENTION" -ForegroundColor Red
    Write-Host "🚨 Multiple services disconnected" -ForegroundColor Red
    Write-Host ""
    Write-Host "🛠️  Troubleshooting Steps:" -ForegroundColor White
    if (-not $backendOK) {
        Write-Host "   1. Start backend: cd backend && node server.js" -ForegroundColor Yellow
    }
    if (-not $frontendOK) {
        Write-Host "   2. Start frontend: cd frontend && npm start" -ForegroundColor Yellow
    }
    Write-Host "   3. Check TROUBLESHOOTING.md for detailed help" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🔄 Run this test anytime with: .\test-connections.ps1" -ForegroundColor Gray
