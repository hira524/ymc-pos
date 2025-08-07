# YMC POS Troubleshooting Guide

## System Overview
Your POS system consists of:
- **Backend**: Express.js server (Port 5000) - handles API calls to GoHighLevel and Stripe
- **Frontend**: React app (Port 3000) - user interface for the POS system
- **Database**: MongoDB Atlas - stores payment records
- **APIs**: GoHighLevel (inventory), Stripe Terminal (payments)

## Quick Start Commands

### Start Backend:
```powershell
cd "e:\YMC-POS\YMC-POS\ymc-pos\backend"
node server.js
```

### Start Frontend:
```powershell
cd "e:\YMC-POS\YMC-POS\ymc-pos\frontend"  
npm start
```

### Or use the management script:
```powershell
.\manage-pos.ps1
```

## Common Issues & Solutions

### 1. Backend Won't Start
**Symptoms**: Error messages about missing modules or connection issues

**Solutions**:
- Ensure all dependencies are installed: `npm install` in backend folder
- Check if .env file has all required variables
- Verify MongoDB connection string is correct
- Make sure port 5000 is not in use by another application

### 2. Frontend Won't Start  
**Symptoms**: React compilation errors, port conflicts

**Solutions**:
- Run `npm install` in frontend folder
- Check if port 3000 is available
- Clear npm cache: `npm cache clean --force`
- Delete node_modules and reinstall: `rm -rf node_modules && npm install`

### 3. GoHighLevel API Issues
**Symptoms**: "No tokens" error, inventory not loading

**Solutions**:
- Visit `http://localhost:5000/auth` to re-authorize
- Check if access token has expired (tokens.json file)
- Verify CLIENT_ID and CLIENT_SECRET in .env file
- Ensure LOCATION_ID is correct

### 4. Stripe Terminal Connection Issues
**Symptoms**: Reader not found, connection errors

**Solutions**:
- Verify Stripe secret key is correct in .env
- Ensure card reader is powered on and within range
- Check if reader is connected to same network
- Try switching between real and simulated readers

### 5. Card Reader Not Connecting
**Steps to diagnose**:
1. Check reader power and WiFi connection
2. Verify reader is registered in Stripe Dashboard
3. Test with simulated reader first
4. Check browser console for JavaScript errors

## API Endpoints for Testing

### Backend Health Check:
```
GET http://localhost:5000/test
```

### Get Inventory from GoHighLevel:
```
GET http://localhost:5000/inventory
```

### Create Stripe Connection Token:
```
POST http://localhost:5000/connection_token
```

### Create Payment Intent:
```
POST http://localhost:5000/create_payment_intent
Body: { "amount": 1000 }
```

## Environment Variables (.env file)
Ensure these are set in `backend/.env`:
- GHL_CLIENT_ID
- GHL_CLIENT_SECRET  
- GHL_LOCATION_ID
- STRIPE_SECRET_KEY
- MONGODB_URI

## Logs and Debugging
- Backend logs appear in terminal where server.js runs
- Frontend logs appear in browser console (F12)
- Check network tab in browser for API call failures
- MongoDB connection errors will show in backend terminal

## Security Notes
- All API keys should be kept secure
- Never commit .env files to version control
- Use environment variables for production deployment
- Stripe live keys should only be used in production

## Production Deployment Tips
- Use PM2 or similar process manager for backend
- Build frontend for production: `npm run build`
- Set up reverse proxy (nginx) for both services  
- Use HTTPS in production
- Set up proper logging and monitoring
