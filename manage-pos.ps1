#!/usr/bin/env powershell
# YMC-POS Management Script

Write-Host "YMC POS System Management" -ForegroundColor Green
Write-Host "=========================" -ForegroundColor Green

# Function to check if a port is in use
function Test-Port {
    param($Port)
    $result = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue
    return $result.TcpTestSucceeded
}

# Function to start backend
function Start-Backend {
    Write-Host "Starting Backend Server..." -ForegroundColor Yellow
    if (Test-Port 5000) {
        Write-Host "Backend already running on port 5000" -ForegroundColor Green
    } else {
        Start-Process cmd -ArgumentList "/c", "cd /d `"e:\YMC-POS\YMC-POS\ymc-pos\backend`" && node server.js"
        Start-Sleep -Seconds 3
        if (Test-Port 5000) {
            Write-Host "✅ Backend started successfully on port 5000" -ForegroundColor Green
        } else {
            Write-Host "❌ Backend failed to start" -ForegroundColor Red
        }
    }
}

# Function to start frontend
function Start-Frontend {
    Write-Host "Starting Frontend..." -ForegroundColor Yellow
    if (Test-Port 3000) {
        Write-Host "Frontend already running on port 3000" -ForegroundColor Green
    } else {
        Start-Process cmd -ArgumentList "/c", "cd /d `"e:\YMC-POS\YMC-POS\ymc-pos\frontend`" && npm start"
        Write-Host "✅ Frontend starting... (will open in browser)" -ForegroundColor Green
    }
}

# Function to test API connections
function Test-APIs {
    Write-Host "Testing API Connections..." -ForegroundColor Yellow
    
    # Test backend health
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:5000/test" -Method Get
        Write-Host "✅ Backend Health: OK" -ForegroundColor Green
    } catch {
        Write-Host "❌ Backend Health: Failed" -ForegroundColor Red
    }
    
    # Test inventory endpoint
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:5000/inventory" -Method Get
        Write-Host "✅ GoHighLevel Inventory: Connected ($($response.Count) items)" -ForegroundColor Green
    } catch {
        Write-Host "❌ GoHighLevel Inventory: Failed - $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Test Stripe connection token
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:5000/connection_token" -Method Post
        Write-Host "✅ Stripe Terminal: Connected" -ForegroundColor Green
    } catch {
        Write-Host "❌ Stripe Terminal: Failed - $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Function to check system status
function Show-Status {
    Write-Host "System Status:" -ForegroundColor Cyan
    Write-Host "=============" -ForegroundColor Cyan
    
    if (Test-Port 5000) {
        Write-Host "Backend (Port 5000): ✅ Running" -ForegroundColor Green
    } else {
        Write-Host "Backend (Port 5000): ❌ Not running" -ForegroundColor Red
    }
    
    if (Test-Port 3000) {
        Write-Host "Frontend (Port 3000): ✅ Running" -ForegroundColor Green
    } else {
        Write-Host "Frontend (Port 3000): ❌ Not running" -ForegroundColor Red
    }
}

# Main menu
function Show-Menu {
    Write-Host "`nChoose an option:" -ForegroundColor Cyan
    Write-Host "1. Start Backend" -ForegroundColor White
    Write-Host "2. Start Frontend" -ForegroundColor White
    Write-Host "3. Start Both" -ForegroundColor White
    Write-Host "4. Show Status" -ForegroundColor White
    Write-Host "5. Test APIs" -ForegroundColor White
    Write-Host "6. Open Frontend in Browser" -ForegroundColor White
    Write-Host "7. Exit" -ForegroundColor White
    Write-Host ""
}

# Main loop
do {
    Show-Menu
    $choice = Read-Host "Enter your choice (1-7)"
    
    switch ($choice) {
        "1" { Start-Backend }
        "2" { Start-Frontend }
        "3" { Start-Backend; Start-Frontend }
        "4" { Show-Status }
        "5" { Test-APIs }
        "6" { Start-Process "http://localhost:3000" }
        "7" { Write-Host "Goodbye!" -ForegroundColor Green; break }
        default { Write-Host "Invalid choice. Please try again." -ForegroundColor Red }
    }
    
    Write-Host ""
} while ($choice -ne "7")
