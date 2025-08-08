# Cloud Deployment Guide (Netlify + Render)

## Overview
Deploy your POS system to the cloud while maintaining card reader connectivity. The client's browser will connect to both the cloud frontend and local card readers.

## Architecture
```
[Card Reader] ←WiFi→ [Client Browser] →Internet→ [Netlify Frontend] → [Render Backend] → [Stripe API]
```

## ✅ How It Works
- **Client opens Netlify app** in their browser
- **Browser discovers card readers** on the same WiFi network
- **Frontend communicates** with Render backend for payments
- **No network issues** because browser and reader are local

## Deployment Steps

### 1. Backend Deployment (Render)

1. **Create Render Account**: https://render.com
2. **Create Web Service**:
   - Connect your GitHub repository
   - Root directory: `backend`
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment: Node

3. **Set Environment Variables** in Render:
   ```
   STRIPE_SECRET_KEY=sk_live_your_live_key_here
   STRIPE_PUBLISHABLE_KEY=pk_live_your_live_key_here
   MONGODB_URI=your_mongodb_connection_string
   NODE_ENV=production
   PORT=10000
   GHL_CLIENT_ID=your_ghl_client_id
   GHL_CLIENT_SECRET=your_ghl_client_secret
   GHL_LOCATION_ID=your_ghl_location_id
   ```

4. **Get your Render URL**: `https://your-app-name.onrender.com`

### 2. Frontend Deployment (Netlify)

1. **Update Backend URL**:
   - Create `frontend/.env.production`:
   ```
   REACT_APP_BACKEND_URL=https://your-render-app.onrender.com
   REACT_APP_STRIPE_LOCATION_ID=tml_your_stripe_location_id
   ```

2. **Create Netlify Account**: https://netlify.com
3. **Deploy**:
   - Connect GitHub repository
   - Build directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `build`

4. **Set Environment Variables** in Netlify:
   - Go to Site Settings > Environment Variables
   - Add your `.env.production` variables

### 3. Card Reader Setup

1. **Use Live Stripe Keys** (not test keys)
2. **Register Card Reader** in Stripe Dashboard:
   - Go to Terminal > Readers
   - Register your BBPOS device
   - Get the Location ID

3. **Update Location ID** in your environment variables

### 4. CORS Configuration

Update your backend to allow Netlify domain:

```javascript
// In backend/server.js
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://your-netlify-app.netlify.app',
    'https://your-custom-domain.com'
  ]
}));
```

## Network Requirements

### ✅ What Works:
- Client browser and card reader on same WiFi ✅
- Frontend hosted on Netlify ✅  
- Backend hosted on Render ✅
- Card reader discovery works locally ✅

### ⚠️ Important Notes:
- **Card reader must be on same network as client's device**
- **Use live Stripe keys for production**
- **Register card readers in Stripe Dashboard**
- **Set correct location ID in environment variables**

## Testing the Setup

1. **Local Test**:
   - Set `REACT_APP_BACKEND_URL` to your Render URL
   - Test locally first to verify backend connection

2. **Production Test**:
   - Access your Netlify URL from a device on the same WiFi as card reader
   - Verify card reader discovery works
   - Test payments with real cards (small amounts)

## Troubleshooting

### Reader Not Found:
- Ensure browser and reader on same WiFi
- Check Stripe location ID is correct
- Verify reader is registered in Stripe Dashboard

### Backend Connection Issues:
- Check CORS settings
- Verify Render app is running
- Check environment variables

### Payment Failures:
- Ensure using live Stripe keys in production
- Verify webhook endpoints if needed
- Check currency settings match your Stripe account

## Security Notes

- Never commit `.env` files with real keys
- Use environment variables for all secrets
- Enable HTTPS only in production
- Regularly rotate API keys
