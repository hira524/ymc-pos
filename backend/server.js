const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');
const Stripe = require('stripe');
const fs = require('fs'); // For token storage
const qs = require('qs'); // For form-urlencoded
require('dotenv').config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
app.use(cors());
app.use(express.json());

// Configuration from environment variables
const CLIENT_ID = process.env.GHL_CLIENT_ID;
const CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;
const REDIRECT_URI = process.env.GHL_REDIRECT_URI;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const BASE_URL = process.env.GHL_BASE_URL || 'https://services.leadconnectorhq.com';
const PORT = process.env.PORT || 5000;

// Fallback demo inventory
const DEMO_INVENTORY = [
  { id: 'demo-1', name: 'Sample Product 1', price: 1.00, quantity: 10, priceId: 'price-1', description: 'Demo product for testing', image: null },
  { id: 'demo-2', name: 'Sample Product 2', price: 2.50, quantity: 15, priceId: 'price-2', description: 'Demo product for testing', image: null },
  { id: 'demo-3', name: 'Sample Product 3', price: 2.00, quantity: 20, priceId: 'price-3', description: 'Demo product for testing', image: null },
  { id: 'demo-4', name: 'Sample Product 4', price: 4.50, quantity: 8, priceId: 'price-4', description: 'Demo product for testing', image: null },
  { id: 'demo-5', name: 'Sample Product 5', price: 2.50, quantity: 12, priceId: 'price-5', description: 'Demo product for testing', image: null }
];

const TOKEN_FILE = './tokens.json';
function getTokens() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
}
function saveTokens(tok) {  
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tok, null, 2));
}
async function refreshAccessToken() {
  const tok = getTokens();
  if (!tok || !tok.refresh_token) throw new Error('No refresh token – please re-authorize via /auth');
  const res = await axios.post(
    'https://services.leadconnectorhq.com/oauth/token',
    qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: tok.refresh_token,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  saveTokens(res.data);
  return res.data.access_token;
}
async function getAccessToken() {
  const tok = getTokens();
  if (!tok) throw new Error('No tokens – visit /auth to authorize');
  return tok.access_token;
}

// OAuth Endpoints
app.get('/auth', (req, res) => {
  const url = `https://marketplace.leadconnectorhq.com/oauth/chooselocation?response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_id=${CLIENT_ID}&scope=payments%2Forders.readonly+payments%2Forders.write+payments%2Fintegration.readonly+payments%2Fintegration.write+payments%2Ftransactions.readonly+products.write+products.readonly+products%2Fprices.readonly+products%2Fprices.write+products%2Fcollection.readonly+products%2Fcollection.write`;
  res.redirect(url);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');
  try {
    const response = await axios.post(
      'https://services.leadconnectorhq.com/oauth/token',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    saveTokens(response.data);
    res.send('✅ GHL OAuth successful – tokens saved.');
  } catch (err) {
    console.error('OAuth error:', err.response?.data || err.message);
    res.status(500).send('OAuth Exchange failed: ' + JSON.stringify(err.response?.data || err.message));
  }
});

// MongoDB & Payment Schema
mongoose.connect(process.env.MONGODB_URI);
const Payment = mongoose.model('Payment', new mongoose.Schema({
  date: { type: Date, default: Date.now },
  items: Array,
  total: Number,
  method: String
}));

// /inventory
app.get('/inventory', async (req, res) => {
  console.log('🔍 Inventory request received');
  
  try {
    // First, try to use the local ghl-items.json file with actual product data
    const fs = require('fs');
    const path = require('path');
    const ghlItemsPath = path.join(__dirname, 'ghl-items.json');
    
    if (fs.existsSync(ghlItemsPath)) {
      console.log('📋 Using local ghl-items.json file with real prices');
      const localItems = JSON.parse(fs.readFileSync(ghlItemsPath, 'utf8'));
      
      // Add default quantities if not present and ensure proper formatting
      const inventory = localItems.map((item, index) => ({
        id: item.productId || item.id || `product-${index}`,
        name: item.name || `Product ${index + 1}`,
        price: parseFloat(item.price) || 0,
        quantity: item.quantity || 20, // Default quantity
        priceId: item.priceId || `price-${index}`,
        description: item.description || `Product: ${item.name || 'Unnamed'}`,
        image: item.image || null
      }));
      
      console.log('✅ Local inventory loaded successfully');
      console.log(`📊 Found ${inventory.length} products with correct prices`);
      if (inventory.length > 0) {
        console.log('💰 Sample prices:', inventory.slice(0, 3).map(p => `${p.name}: $${p.price.toFixed(2)}`));
      }
      return res.json(inventory);
    }
    
    // If no local file, try to get token for GHL API
    let token;
    try {
      token = await getAccessToken();
    } catch (tokenErr) {
      console.error('❌ Token error:', tokenErr.message);
      // Return empty inventory with error info instead of crashing
      return res.json({
        error: 'Authentication required',
        needsAuth: true,
        authUrl: 'http://localhost:5000/auth',
        inventory: []
      });
    }
    
    console.log('📋 Using location ID:', LOCATION_ID);
    
    // Updated API endpoint based on GoHighLevel documentation
    const apiUrl = `https://services.leadconnectorhq.com/products/?locationId=${LOCATION_ID}`;
    console.log('🌐 API URL:', apiUrl);
    
    const resp = await axios.get(apiUrl, { 
      headers: { 
        Authorization: `Bearer ${token}`, 
        'Version': '2021-04-15',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });
    
    console.log('✅ GHL API Response Status:', resp.status);
    console.log('📦 Response data structure:', Object.keys(resp.data));
    
    // Handle different response structures
    let products = [];
    if (resp.data.products && Array.isArray(resp.data.products)) {
      products = resp.data.products;
    } else if (resp.data.data && Array.isArray(resp.data.data)) {
      products = resp.data.data;
    } else if (Array.isArray(resp.data)) {
      products = resp.data;
    } else {
      console.log('⚠️ Unexpected response structure:', resp.data);
      // Return empty inventory instead of error
      return res.json([]);
    }
    
    console.log(`📊 Found ${products.length} products from GHL API`);
    
    const inventory = products.map((p, index) => {
      const price = p.prices && p.prices[0] ? p.prices[0] : { amount: 0, availableQuantity: 0, id: `no-price-${index}` };
      return {
        id: p.id || `ghl-product-${index}`,
        name: p.name || `Product ${index + 1}`,
        price: parseFloat(price.amount) || 0,
        quantity: parseInt(price.availableQuantity) || 0,
        priceId: price.id || `no-price-${index}`,
        description: p.description || `GHL Product: ${p.name || 'Unnamed'}`,
        image: p.image || null
      };
    });
    
    console.log('✅ GHL inventory processed successfully');
    res.json(inventory);
    
  } catch (err) {
    console.error('❌ Inventory fetch failed:');
    console.error('Status:', err.response?.status);
    console.error('Data:', err.response?.data);
    console.error('Message:', err.message);
    
    // Handle authentication errors
    if (err.response?.status === 401 || err.response?.status === 403) {
      console.log('🔄 Attempting token refresh...');
      try {
        const newToken = await refreshAccessToken();
        console.log('✅ Token refreshed, retrying request...');
        
        const retry = await axios.get(
          `https://services.leadconnectorhq.com/products/?locationId=${LOCATION_ID}`, 
          {
            headers: { 
              Authorization: `Bearer ${newToken}`, 
              'Version': '2021-04-15',
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        
        let products = [];
        if (retry.data.products && Array.isArray(retry.data.products)) {
          products = retry.data.products;
        } else if (retry.data.data && Array.isArray(retry.data.data)) {
          products = retry.data.data;
        } else if (Array.isArray(retry.data)) {
          products = retry.data;
        }
        
        const inventory = products.map((p, index) => {
          const price = p.prices && p.prices[0] ? p.prices[0] : { amount: 0, availableQuantity: 0, id: `no-price-${index}` };
          return {
            id: p.id || `ghl-product-${index}`,
            name: p.name || `Product ${index + 1}`,
            price: parseFloat(price.amount) || 0,
            quantity: parseInt(price.availableQuantity) || 0,
            priceId: price.id || `no-price-${index}`,
            description: p.description || `GHL Product: ${p.name || 'Unnamed'}`,
            image: p.image || null
          };
        });
        
        console.log('✅ Retry successful after token refresh');
        return res.json(inventory);
        
      } catch (refreshErr) {
        console.error('❌ Token refresh failed:', refreshErr.response?.data || refreshErr.message);
        console.log('🔄 Falling back to demo inventory');
        return res.json(DEMO_INVENTORY);
      }
    }
    
    // For other errors, fall back to demo inventory
    console.log('🔄 Falling back to demo inventory due to API error');
    console.log('💡 To use real products, ensure your .env file has correct GHL credentials');
    res.json(DEMO_INVENTORY);
  }
});

// /update-inventory
app.post('/update-inventory', async (req, res) => {
  const { cart } = req.body;
  let token = await getAccessToken();
  try {
    for (const item of cart) {
      const priceResp = await axios.get(`${BASE_URL}/products/${item.id}/prices/${item.priceId}`, {
        headers: { Authorization: `Bearer ${token}`, 'Version': '2021-04-15' }
      });
      const newQty = priceResp.data.availableQuantity - item.quantity;
      await axios.put(`${BASE_URL}/products/${item.id}/prices/${item.priceId}`, {
        availableQuantity: newQty
      }, {
        headers: { Authorization: `Bearer ${token}`, 'Version': '2021-04-15' }
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Update-inventory failed:', err.response?.data || err.message, err.stack);
    if (err.response?.status === 401) {
      try {
        token = await refreshAccessToken();
        for (const item of cart) {
          const pr = await axios.get(`${BASE_URL}/products/${item.id}/prices/${item.priceId}`, {
            headers: { Authorization: `Bearer ${token}`, 'Version': '2021-04-15' }
          });
          const newQty = pr.data.availableQuantity - item.quantity;
          await axios.put(`${BASE_URL}/products/${item.id}/prices/${item.priceId}`, {
            availableQuantity: newQty
          }, {
            headers: { Authorization: `Bearer ${token}`, 'Version': '2021-04-15' }
          });
        }
        return res.json({ success: true });
      } catch (_) {
        console.error('Refresh+update failed');
      }
    }
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Stripe Terminal
app.post('/connection_token', async (req, res) => {
  try {
    const { secret } = await stripe.terminal.connectionTokens.create();
    res.json({ secret });
  } catch (err) {
    console.error('Conn token error:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});
app.post('/create_payment_intent', async (req, res) => {
  const { amount } = req.body;
  try {
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: 'aud',
      payment_method_types: ['card_present'],
      capture_method: 'automatic'
    });
    res.json({ client_secret: intent.client_secret });
  } catch (err) {
    console.error('Create PI error:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

// Log payment in Mongo
app.post('/log-payment', async (req, res) => {
  const { items, total, method } = req.body;
  try {
    await Payment.create({ items, total, method });
    res.json({ success: true });
  } catch (err) {
    console.error('Log payment error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Healthcheck & Launch
app.get('/test', (_, res) => res.json({ 
  status: 'OK', 
  time: new Date().toISOString(),
  environment: {
    hasGhlCredentials: !!(CLIENT_ID && CLIENT_SECRET && LOCATION_ID),
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    hasMongoUri: !!process.env.MONGODB_URI
  }
}));

// Simple status endpoint
app.get('/status', (_, res) => {
  const fs = require('fs');
  const path = require('path');
  
  const status = {
    server: 'running',
    timestamp: new Date().toISOString(),
    ghlItemsExists: fs.existsSync(path.join(__dirname, 'ghl-items.json')),
    tokensExist: fs.existsSync('./tokens.json'),
    configuration: {
      ghlConfigured: !!(CLIENT_ID && CLIENT_SECRET && LOCATION_ID),
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
      mongoConfigured: !!process.env.MONGODB_URI
    }
  };
  
  res.json(status);
});

// Debug endpoint for GoHighLevel API testing
app.get('/debug/ghl', async (req, res) => {
  try {
    const tokens = getTokens();
    const config = {
      CLIENT_ID: CLIENT_ID ? '✅ Set' : '❌ Missing',
      CLIENT_SECRET: CLIENT_SECRET ? '✅ Set' : '❌ Missing',
      LOCATION_ID: LOCATION_ID ? '✅ Set' : '❌ Missing',
      BASE_URL: BASE_URL || 'Default',
      tokensExist: tokens ? '✅ Yes' : '❌ No'
    };
    
    if (tokens) {
      const tokenInfo = {
        hasAccessToken: tokens.access_token ? '✅ Yes' : '❌ No',
        hasRefreshToken: tokens.refresh_token ? '✅ Yes' : '❌ No',
        locationId: tokens.locationId || 'Not found in token',
        userType: tokens.userType || 'Unknown',
        scopes: tokens.scope ? tokens.scope.split(' ') : []
      };
      config.tokenInfo = tokenInfo;
    }
    
    res.json({
      message: 'GoHighLevel Debug Information',
      config,
      endpoints: {
        auth: '/auth',
        callback: '/callback',
        inventory: '/inventory',
        testConnection: '/debug/ghl/test'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test GHL API connection
app.get('/debug/ghl/test', async (req, res) => {
  try {
    const token = await getAccessToken();
    
    // Try different API endpoints to find the correct one
    const testUrls = [
      `${BASE_URL}/products/?locationId=${LOCATION_ID}`,
      `${BASE_URL}/products?locationId=${LOCATION_ID}`,
      `${BASE_URL}/locations/${LOCATION_ID}/products`,
      `${BASE_URL}/locations/${LOCATION_ID}/products/`,
      `https://rest.gohighlevel.com/v1/products/?locationId=${LOCATION_ID}`,
      `https://services.leadconnectorhq.com/products/?locationId=${LOCATION_ID}`
    ];
    
    const results = [];
    
    for (const url of testUrls) {
      try {
        console.log(`Testing URL: ${url}`);
        const response = await axios.get(url, {
          headers: { 
            Authorization: `Bearer ${token}`, 
            'Version': '2021-04-15',
            'Accept': 'application/json'
          },
          timeout: 5000
        });
        
        results.push({
          url,
          status: 'SUCCESS',
          responseStatus: response.status,
          dataStructure: {
            topLevelKeys: Object.keys(response.data),
            hasProducts: !!response.data.products,
            hasData: !!response.data.data,
            isArray: Array.isArray(response.data),
            productCount: response.data.products ? response.data.products.length : 
                         response.data.data ? response.data.data.length :
                         Array.isArray(response.data) ? response.data.length : 'N/A'
          }
        });
        
        // If we found a working endpoint, break
        break;
        
      } catch (err) {
        results.push({
          url,
          status: 'ERROR',
          error: {
            status: err.response?.status,
            message: err.response?.data?.msg || err.message
          }
        });
      }
    }
    
    res.json({
      message: 'GoHighLevel API Endpoint Test',
      results,
      recommendation: results.find(r => r.status === 'SUCCESS') ? 
        'Found working endpoint!' : 'No working endpoints found - may need re-authorization'
    });
    
  } catch (err) {
    res.json({
      status: 'TOKEN_ERROR',
      error: {
        message: err.message,
        suggestion: 'Visit /auth to re-authorize'
      }
    });
  }
});

app.listen(PORT, () => console.log(`🟢 Backend listening on port ${PORT}`));