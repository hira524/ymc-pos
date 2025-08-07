# 🧪 POS System Testing Guide

## Quick Connection Tests

### 1. **Backend Server Test**
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/test" -Method Get
```
**Expected Result**: Should return `status: "OK"` and current timestamp

### 2. **Frontend Access Test**
Open your browser and go to: **http://localhost:3000**  
**Expected Result**: POS interface should load with product grid and cart

### 3. **Stripe Terminal Test**
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/connection_token" -Method Post
```
**Expected Result**: Should return a connection token starting with `pst_live_`

### 4. **GoHighLevel Inventory Test**
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/inventory" -Method Get
```
**Expected Result**: JSON array of products OR error message requiring re-auth

### 5. **Database Test**
```powershell
$testData = @{items=@(@{name="Test";price=1.00;quantity=1}); total=1.00; method="test"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5000/log-payment" -Method Post -Body $testData -ContentType "application/json"
```
**Expected Result**: `success: true`

### 6. **Payment Processing Test**
```powershell
$payment = @{amount=100} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5000/create_payment_intent" -Method Post -Body $payment -ContentType "application/json"
```
**Expected Result**: Returns `client_secret` for payment intent

---

## 📱 Frontend UI Testing

### Step 1: Open POS Interface
- Go to **http://localhost:3000**
- You should see the POS interface with:
  - Search bar at top
  - Product grid (may be empty if GHL not connected)
  - Shopping cart on the right
  - Payment buttons at bottom

### Step 2: Test Stripe Terminal Connection
- Look for card reader connection status
- Should see "✅ Connected to Stripe reader" in browser console (F12)
- If no physical reader, it will use simulated reader

### Step 3: Test Add to Cart (if products load)
- Click on any product
- Should add to cart on right side
- Total should update automatically

### Step 4: Test Payment Flow
- Add items to cart
- Click "Pay Cash" or "Pay Card" 
- Cash payment should log to database immediately
- Card payment should trigger Stripe Terminal flow

---

## 🔧 Troubleshooting Common Issues

### ❌ Backend Not Responding
```powershell
# Check if backend is running
Get-Process | Where-Object {$_.ProcessName -eq "node"}

# Restart backend if needed
cd "backend"
node server.js
```

### ❌ Frontend Not Loading
```powershell
# Check if frontend is running on port 3000
netstat -an | findstr :3000

# Restart frontend if needed
cd "frontend" 
npm start
```

### ❌ GoHighLevel "Not Found" Error
1. Visit: **http://localhost:5000/auth**
2. Complete OAuth authorization
3. Test again with: `Invoke-RestMethod -Uri "http://localhost:5000/inventory" -Method Get`

### ❌ Stripe Connection Issues
- Verify `STRIPE_SECRET_KEY` in `backend/.env`
- Check if key starts with `sk_live_` (live key) or `sk_test_` (test key)
- Ensure no extra spaces or quotes around the key

### ❌ Database Connection Failed
- Check `MONGODB_URI` in `backend/.env`
- Verify MongoDB Atlas connection string is correct
- Check if IP is whitelisted in MongoDB Atlas

---

## 🎯 End-to-End Test Scenario

### Complete Transaction Test:
1. **Start**: Open http://localhost:3000
2. **Search**: Look for products (search bar)
3. **Add**: Click products to add to cart
4. **Review**: Check cart total is correct
5. **Pay**: Click "Pay Cash" or "Pay Card"
6. **Verify**: Check if transaction is recorded

### Expected Flow:
- ✅ Products load from GoHighLevel
- ✅ Cart updates correctly  
- ✅ Cash payments record to database
- ✅ Card payments trigger Stripe Terminal
- ✅ Inventory updates after purchase
- ✅ Receipt/confirmation shown

---

## 🚀 Quick Test Commands

Run all tests in sequence:
```powershell
# Set execution policy first
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

# Run comprehensive test
.\pos-test.ps1

# Or run individual tests
echo "Backend:"; Invoke-RestMethod "http://localhost:5000/test"
echo "Stripe:"; Invoke-RestMethod "http://localhost:5000/connection_token" -Method Post  
echo "Frontend:"; Invoke-WebRequest "http://localhost:3000" | Select StatusCode
```

## 📊 Health Check Script
```powershell
node health-check.js
```
This runs all tests automatically and shows a summary report.
