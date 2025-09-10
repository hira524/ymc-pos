const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');
const Stripe = require('stripe');
const fs = require('fs'); // For token storage
const path = require('path'); // For file paths
const qs = require('qs'); // For form-urlencoded
const nodemailer = require('nodemailer'); // For email notifications
require('dotenv').config();

// Debug: Check if Stripe key is loaded
console.log('STRIPE_SECRET_KEY loaded:', process.env.STRIPE_SECRET_KEY ? 'YES' : 'NO');
console.log('STRIPE_SECRET_KEY length:', process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.length : 0);
console.log('PORT from env:', process.env.PORT);
console.log('PORT parsed:', parseInt(process.env.PORT) || 5000);

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();

// Enhanced CORS configuration for cloud deployment
const corsOptions = {
  origin: [
    'http://localhost:3000', // Local development
    'http://localhost:3001', // Local development (alternative port)
    'http://localhost:3002', // Local development (alternative port)
    'https://localhost:3000', // Local HTTPS
    /^https:\/\/.*\.netlify\.app$/, // Netlify deployments
    /^https:\/\/.*\.vercel\.app$/, // Vercel deployments (alternative)
    process.env.FRONTEND_URL // Custom domain
  ].filter(Boolean), // Remove undefined values
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Configuration from environment variables
const CLIENT_ID = process.env.GHL_CLIENT_ID;
const CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;
const REDIRECT_URI = process.env.GHL_REDIRECT_URI;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const BASE_URL = process.env.GHL_BASE_URL || 'https://services.leadconnectorhq.com';
// For Render deployment, ensure PORT is a valid number
const PORT = parseInt(process.env.PORT) || 5000;

// Email configuration for stock alerts
const emailTransporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER, // Add this to your environment variables
    pass: process.env.EMAIL_PASS  // Add this to your environment variables
  }
});

// Function to send low stock alert
async function sendLowStockAlert(productName, currentStock, threshold = 20) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ALERT_EMAIL || process.env.EMAIL_USER, // Add ALERT_EMAIL to env vars
      subject: `🚨 Low Stock Alert - ${productName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc3545;">🚨 Low Stock Alert</h2>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #dc3545;">
            <h3 style="margin-top: 0; color: #333;">Product: ${productName}</h3>
            <p><strong>Current Stock:</strong> ${currentStock} units</p>
            <p><strong>Alert Threshold:</strong> ${threshold} units</p>
            <p style="color: #dc3545;"><strong>Action Required:</strong> Please restock this item soon.</p>
          </div>
          <div style="margin-top: 20px; padding: 15px; background: #e3f2fd; border-radius: 8px;">
            <h4 style="margin-top: 0;">What to do:</h4>
            <ul>
              <li>Check supplier availability</li>
              <li>Place restock order</li>
              <li>Update inventory in GHL system</li>
              <li>Monitor sales to prevent stockout</li>
            </ul>
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #666;">
            This alert was sent automatically by the YMC POS System when stock levels reached the threshold.
          </p>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(`📧 Low stock alert sent for ${productName} (${currentStock} units remaining)`);
  } catch (error) {
    console.error('Failed to send low stock alert:', error);
  }
}

// Fallback demo inventory
const DEMO_INVENTORY = [
  { id: 'demo-1', name: 'Sample Product 1', price: 1.00, quantity: 10, priceId: 'price-1', description: 'Demo product for testing', image: null },
  { id: 'demo-2', name: 'Sample Product 2', price: 2.50, quantity: 15, priceId: 'price-2', description: 'Demo product for testing', image: null },
  { id: 'demo-3', name: 'Sample Product 3', price: 2.00, quantity: 20, priceId: 'price-3', description: 'Demo product for testing', image: null },
  { id: 'demo-4', name: 'Sample Product 4', price: 4.50, quantity: 8, priceId: 'price-4', description: 'Demo product for testing', image: null },
  { id: 'demo-5', name: 'Sample Product 5', price: 2.50, quantity: 12, priceId: 'price-5', description: 'Demo product for testing', image: null }
];

const TOKEN_FILE = './tokens.json';
const SYNC_CACHE_FILE = './sync-cache.json';
let tokenRefreshInProgress = false;
let lastSyncTime = null;
let cachedInventory = null;
let syncInterval = null;

// Token management functions
function getTokens() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
}

function saveTokens(tok) {  
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tok, null, 2));
  console.log('🔑 Tokens saved successfully');
}

function isTokenExpired(token) {
  if (!token) return true;
  try {
    // Decode JWT payload (without verification)
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const now = Math.floor(Date.now() / 1000);
    const bufferTime = 300; // 5 minutes buffer before actual expiry
    return payload.exp && (payload.exp - bufferTime) < now;
  } catch (error) {
    console.error('Token expiry check failed:', error);
    return true; // Assume expired if we can't parse it
  }
}

async function refreshAccessToken() {
  if (tokenRefreshInProgress) {
    console.log('🔄 Token refresh already in progress, waiting...');
    // Wait for the refresh to complete
    while (tokenRefreshInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return getTokens()?.access_token;
  }

  tokenRefreshInProgress = true;
  try {
    const tok = getTokens();
    if (!tok || !tok.refresh_token) {
      throw new Error('No refresh token – please re-authorize via /auth');
    }

    console.log('🔄 Refreshing access token...');
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
    
    // Add timestamp for token tracking
    const tokenData = {
      ...res.data,
      refreshed_at: Date.now(),
      expires_at: Date.now() + (res.data.expires_in * 1000)
    };
    
    saveTokens(tokenData);
    console.log('✅ Access token refreshed successfully');
    console.log(`🕒 Token valid until: ${new Date(tokenData.expires_at).toLocaleString()}`);
    
    return res.data.access_token;
  } catch (error) {
    console.error('❌ Failed to refresh access token:', error.response?.data || error.message);
    
    // If refresh token is invalid, clear tokens and provide helpful message
    if (error.response?.data?.error === 'invalid_grant') {
      console.log('🔑 Refresh token expired. Clearing stored tokens.');
      console.log('👉 Visit http://localhost:5000/auth to re-authorize with GHL');
      
      // Clear invalid tokens
      try {
        if (fs.existsSync('./tokens.json')) {
          fs.unlinkSync('./tokens.json');
        }
      } catch (cleanupError) {
        console.error('Error clearing tokens:', cleanupError);
      }
    }
    
    throw error;
  } finally {
    tokenRefreshInProgress = false;
  }
}

async function getValidAccessToken() {
  const tok = getTokens();
  if (!tok) throw new Error('No tokens – visit /auth to authorize');
  
  // Check if token is expired or about to expire
  if (isTokenExpired(tok.access_token)) {
    console.log('🔄 Token expired, refreshing...');
    return await refreshAccessToken();
  }
  
  return tok.access_token;
}

// Legacy function for backward compatibility
async function getAccessToken() {
  return await getValidAccessToken();
}

// Product synchronization functions
function getSyncCache() {
  try {
    if (fs.existsSync(SYNC_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(SYNC_CACHE_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error reading sync cache:', error);
  }
  return { lastSync: null, products: [] };
}

function saveSyncCache(data) {
  try {
    fs.writeFileSync(SYNC_CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving sync cache:', error);
  }
}

async function fetchProductsFromGHL() {
  try {
    const token = await getValidAccessToken();
    console.log('🔍 Fetching products from GHL API...');
    
    const apiUrl = `${BASE_URL}/products/?locationId=${LOCATION_ID}`;
    const response = await axios.get(apiUrl, {
      headers: { 
        Authorization: `Bearer ${token}`, 
        'Version': '2021-04-15',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 15000 // 15 second timeout
    });

    let products = [];
    if (response.data.products && Array.isArray(response.data.products)) {
      products = response.data.products;
    } else if (response.data.data && Array.isArray(response.data.data)) {
      products = response.data.data;
    } else if (Array.isArray(response.data)) {
      products = response.data;
    }

    const inventory = products.map((p, index) => {
      const price = p.prices && p.prices[0] ? p.prices[0] : { 
        amount: 0, 
        availableQuantity: 0, 
        id: `no-price-${index}` 
      };
      return {
        id: p.id || `ghl-product-${index}`,
        name: p.name || `Product ${index + 1}`,
        price: parseFloat(price.amount) || 0,
        quantity: parseInt(price.availableQuantity) || 0,
        priceId: price.id || `no-price-${index}`,
        description: p.description || `GHL Product: ${p.name || 'Unnamed'}`,
        image: p.image || null,
        lastSynced: new Date().toISOString(),
        source: 'ghl'
      };
    });

    console.log(`✅ Successfully fetched ${inventory.length} products from GHL`);
    return inventory;
  } catch (error) {
    console.error('❌ Failed to fetch products from GHL:', error.response?.data || error.message);
    throw error;
  }
}

async function syncProducts() {
  try {
    console.log('🔄 Starting product synchronization...');
    const products = await fetchProductsFromGHL();
    
    // Update cached inventory
    cachedInventory = products;
    lastSyncTime = new Date();
    
    // Save to sync cache
    saveSyncCache({
      lastSync: lastSyncTime.toISOString(),
      products: products
    });
    
    // Update local ghl-items.json file for backward compatibility
    const ghlItemsPath = path.join(__dirname, 'ghl-items.json');
    const ghlItems = products.map(p => ({
      name: p.name,
      productId: p.id,
      priceId: p.priceId,
      price: p.price,
      quantity: p.quantity,
      description: p.description,
      lastSynced: p.lastSynced
    }));
    
    fs.writeFileSync(ghlItemsPath, JSON.stringify(ghlItems, null, 2));
    
    console.log(`✅ Product sync completed. ${products.length} products synchronized.`);
    return products;
  } catch (error) {
    console.error('❌ Product synchronization failed:', error);
    
    // Return cached data if available
    if (cachedInventory) {
      console.log('📦 Returning cached inventory due to sync failure');
      return cachedInventory;
    }
    
    // Load from sync cache as fallback
    const cache = getSyncCache();
    if (cache.products && cache.products.length > 0) {
      console.log('📂 Returning inventory from sync cache');
      cachedInventory = cache.products;
      return cache.products;
    }
    
    throw error;
  }
}

function startProductSync() {
  // Initial sync
  syncProducts().catch(error => {
    console.error('Initial product sync failed:', error);
  });
  
  // Set up periodic sync every 5 minutes
  if (syncInterval) {
    clearInterval(syncInterval);
  }
  
  syncInterval = setInterval(async () => {
    try {
      await syncProducts();
      console.log('🔄 Periodic product sync completed');
    } catch (error) {
      console.error('Periodic product sync failed:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  console.log('🚀 Product synchronization service started (5-minute intervals)');
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
    
    // Add timestamp for token tracking
    const tokenData = {
      ...response.data,
      obtained_at: Date.now(),
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };
    
    saveTokens(tokenData);
    console.log('✅ Fresh tokens obtained from GHL OAuth');
    console.log(`🕒 Tokens valid until: ${new Date(tokenData.expires_at).toLocaleString()}`);
    
    res.send(`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #28a745;">✅ GHL OAuth Successful!</h2>
        <p><strong>Tokens saved successfully.</strong></p>
        <p>🕒 <strong>Valid until:</strong> ${new Date(tokenData.expires_at).toLocaleString()}</p>
        <p>Your POS system will now automatically sync products from GoHighLevel every 5 minutes.</p>
        <p>🔄 <strong>Automatic token refresh:</strong> Enabled</p>
        <hr style="margin: 20px 0;">
        <p><small>You can close this window and return to your POS system.</small></p>
      </div>
    `);
    
    // Trigger an immediate product sync with fresh tokens
    setTimeout(() => {
      syncProducts().then(() => {
        console.log('🎉 Initial sync completed with fresh tokens!');
      }).catch(error => {
        console.error('Initial sync failed even with fresh tokens:', error);
      });
    }, 2000);
    
  } catch (err) {
    console.error('OAuth error:', err.response?.data || err.message);
    res.status(500).send('OAuth Exchange failed: ' + JSON.stringify(err.response?.data || err.message));
  }
});

// Token status endpoint
app.get('/tokens/status', (req, res) => {
  try {
    const tokens = getTokens();
    
    if (!tokens) {
      return res.json({
        status: 'missing',
        message: 'No tokens found',
        action: 'Visit /auth to authorize',
        authUrl: '/auth'
      });
    }
    
    const isExpired = isTokenExpired(tokens.access_token);
    const hasRefreshToken = !!tokens.refresh_token;
    
    let status = 'valid';
    let message = 'Tokens are valid and ready';
    let action = null;
    
    if (isExpired && !hasRefreshToken) {
      status = 'expired';
      message = 'Tokens expired and no refresh token available';
      action = 'Visit /auth to re-authorize';
    } else if (isExpired && hasRefreshToken) {
      status = 'refresh_needed';
      message = 'Access token expired but refresh token available';
      action = 'Automatic refresh will occur on next API call';
    }
    
    const response = {
      status,
      message,
      action,
      details: {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        accessTokenExpired: isExpired,
        obtainedAt: tokens.obtained_at ? new Date(tokens.obtained_at).toLocaleString() : 'Unknown',
        expiresAt: tokens.expires_at ? new Date(tokens.expires_at).toLocaleString() : 'Unknown',
        refreshedAt: tokens.refreshed_at ? new Date(tokens.refreshed_at).toLocaleString() : 'Never'
      }
    };
    
    if (status !== 'valid') {
      response.authUrl = '/auth';
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error checking token status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to check token status',
      error: error.message
    });
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
    // Check if we should force a refresh
    const forceRefresh = req.query.refresh === 'true';
    const maxCacheAge = 5 * 60 * 1000; // 5 minutes
    const needsRefresh = forceRefresh || !lastSyncTime || 
                        (Date.now() - lastSyncTime.getTime()) > maxCacheAge;
    
    if (needsRefresh || !cachedInventory) {
      console.log('� Refreshing inventory from GHL...');
      try {
        const products = await syncProducts();
        return res.json(products);
      } catch (syncError) {
        console.error('❌ Live sync failed, trying cached data:', syncError);
        
        // Try to return cached data
        if (cachedInventory) {
          console.log('� Returning cached inventory (live sync failed)');
          return res.json(cachedInventory);
        }
        
        // Try local ghl-items.json file
        const ghlItemsPath = path.join(__dirname, 'ghl-items.json');
        if (fs.existsSync(ghlItemsPath)) {
          console.log('📋 Using local ghl-items.json file (fallback)');
          const localItems = JSON.parse(fs.readFileSync(ghlItemsPath, 'utf8'));
          
          const inventory = localItems.map((item, index) => ({
            id: item.productId || item.id || `product-${index}`,
            name: item.name || `Product ${index + 1}`,
            price: parseFloat(item.price) || 0,
            quantity: item.quantity || 20,
            priceId: item.priceId || `price-${index}`,
            description: item.description || `Product: ${item.name || 'Unnamed'}`,
            image: item.image || null,
            source: 'local'
          }));
          
          cachedInventory = inventory; // Cache for next time
          return res.json(inventory);
        }
        
        // Return demo inventory as last resort
        console.log('🔄 Falling back to demo inventory');
        return res.json(DEMO_INVENTORY);
      }
    }
    
    // Return cached inventory
    if (cachedInventory) {
      console.log('📦 Returning cached inventory (fresh)');
      return res.json(cachedInventory);
    }
    
    // This shouldn't happen, but just in case
    console.log('⚠️ No inventory available, forcing sync...');
    const products = await syncProducts();
    return res.json(products);
    
  } catch (err) {
    console.error('❌ Inventory fetch failed:', err);
    
    // Return any available fallback data
    if (cachedInventory) {
      console.log('� Returning cached inventory (error fallback)');
      return res.json(cachedInventory);
    }
    
    console.log('🔄 Falling back to demo inventory (complete failure)');
    res.json(DEMO_INVENTORY);
  }
});

// Test inventory update endpoint
app.post('/test-inventory-update', async (req, res) => {
  try {
    // Test with the first item in inventory
    const { itemId, priceId, quantity } = req.body;
    console.log('🧪 Testing inventory update for:', { itemId, priceId, quantity });
    
    let token = await getAccessToken();
    const priceResp = await axios.get(`${BASE_URL}/products/${itemId}/prices/${priceId}`, {
      headers: { Authorization: `Bearer ${token}`, 'Version': '2021-04-15' }
    });
    
    console.log('📊 Current stock:', priceResp.data.availableQuantity);
    const newQty = priceResp.data.availableQuantity - quantity;
    console.log('📊 New stock will be:', newQty);
    
    await axios.put(`${BASE_URL}/products/${itemId}/prices/${priceId}`, {
      availableQuantity: newQty
    }, {
      headers: { Authorization: `Bearer ${token}`, 'Version': '2021-04-15' }
    });
    
    res.json({ success: true, oldQty: priceResp.data.availableQuantity, newQty });
  } catch (error) {
    console.error('Test update failed:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

// /update-inventory
app.post('/update-inventory', async (req, res) => {
  const { cart } = req.body;
  console.log('📦 Inventory update request received');
  console.log('🛒 Cart data:', JSON.stringify(cart, null, 2));
  
  // Check if we're using local inventory file (for offline mode)
  const ghlItemsPath = path.join(__dirname, 'ghl-items.json');
  const useLocalInventory = fs.existsSync(ghlItemsPath) && !req.query.forceGhl;
  
  if (useLocalInventory) {
    console.log('📁 Using local inventory file for updates');
    try {
      const ghlItems = JSON.parse(fs.readFileSync(ghlItemsPath, 'utf8'));
      const lowStockItems = [];
      
      // Update local inventory quantities
      for (const item of cart) {
        console.log(`🔍 Processing item: ${item.name} (ID: ${item.id}, PriceID: ${item.priceId}, Qty: ${item.quantity})`);
        
        const ghlItem = ghlItems.find(g => g.productId === item.id && g.priceId === item.priceId);
        if (ghlItem) {
          const oldQty = ghlItem.quantity || 20;
          const newQty = Math.max(0, oldQty - item.quantity);
          ghlItem.quantity = newQty;
          
          console.log(`📦 Updated ${item.name}: ${oldQty} → ${newQty} units`);
          
          // Check for low stock
          const LOW_STOCK_THRESHOLD = 20;
          if (newQty <= LOW_STOCK_THRESHOLD && newQty > 0) {
            lowStockItems.push({
              name: item.name,
              quantity: newQty,
              threshold: LOW_STOCK_THRESHOLD
            });
          }
        } else {
          console.warn(`⚠️ Item not found in local inventory: ${item.name}`);
        }
      }
      
      // Save updated inventory
      fs.writeFileSync(ghlItemsPath, JSON.stringify(ghlItems, null, 2));
      console.log('💾 Local inventory file updated');
      
      // Update cached inventory if it exists
      if (cachedInventory) {
        for (const item of cart) {
          const cachedItem = cachedInventory.find(c => c.id === item.id && c.priceId === item.priceId);
          if (cachedItem) {
            cachedItem.quantity = Math.max(0, cachedItem.quantity - item.quantity);
          }
        }
      }
      
      // Send low stock alerts
      for (const lowStockItem of lowStockItems) {
        await sendLowStockAlert(lowStockItem.name, lowStockItem.quantity, lowStockItem.threshold);
      }
      
      return res.json({ 
        success: true, 
        method: 'local',
        lowStockAlerts: lowStockItems.length,
        message: lowStockItems.length > 0 ? 
          `Local inventory updated. ${lowStockItems.length} low stock alert(s) sent.` : 
          'Local inventory updated successfully.'
      });
    } catch (localError) {
      console.error('❌ Local inventory update failed:', localError.message);
      return res.status(500).json({ error: 'Local inventory update failed', details: localError.message });
    }
  }
  
  // Update GHL inventory directly
  try {
    const token = await getValidAccessToken();
    const lowStockItems = [];
    
    for (const item of cart) {
      console.log(`🔍 Processing GHL item: ${item.name} (ID: ${item.id}, PriceID: ${item.priceId}, Qty: ${item.quantity})`);
      
      if (!item.id || !item.priceId) {
        console.error(`❌ Missing required fields for item: ${item.name}`, { id: item.id, priceId: item.priceId });
        continue;
      }
      
      // Get current stock
      const priceResp = await axios.get(`${BASE_URL}/products/${item.id}/prices/${item.priceId}`, {
        headers: { Authorization: `Bearer ${token}`, 'Version': '2021-04-15' }
      });
      
      console.log(`📊 Current GHL stock for ${item.name}: ${priceResp.data.availableQuantity}`);
      const newQty = priceResp.data.availableQuantity - item.quantity;
      console.log(`📊 New GHL stock for ${item.name}: ${newQty} (reduced by ${item.quantity})`);
      
      // Update stock in GHL
      await axios.put(`${BASE_URL}/products/${item.id}/prices/${item.priceId}`, {
        availableQuantity: newQty
      }, {
        headers: { Authorization: `Bearer ${token}`, 'Version': '2021-04-15' }
      });

      // Check if stock is low and needs alert
      const LOW_STOCK_THRESHOLD = 20;
      if (newQty <= LOW_STOCK_THRESHOLD && newQty > 0) {
        lowStockItems.push({
          name: item.name,
          quantity: newQty,
          threshold: LOW_STOCK_THRESHOLD
        });
      }
      
      // Update cached inventory if it exists
      if (cachedInventory) {
        const cachedItem = cachedInventory.find(c => c.id === item.id && c.priceId === item.priceId);
        if (cachedItem) {
          cachedItem.quantity = newQty;
        }
      }
      
      console.log(`📦 Updated GHL ${item.name}: ${priceResp.data.availableQuantity} → ${newQty} units`);
    }

    // Send low stock alerts for items that need them
    for (const lowStockItem of lowStockItems) {
      await sendLowStockAlert(lowStockItem.name, lowStockItem.quantity, lowStockItem.threshold);
    }

    // Force a sync after successful update to keep everything in sync
    setTimeout(() => {
      syncProducts().catch(error => {
        console.error('Post-update sync failed:', error);
      });
    }, 1000);

    res.json({ 
      success: true, 
      method: 'ghl',
      lowStockAlerts: lowStockItems.length,
      message: lowStockItems.length > 0 ? 
        `GHL inventory updated. ${lowStockItems.length} low stock alert(s) sent.` : 
        'GHL inventory updated successfully.'
    });
  } catch (err) {
    console.error('GHL Update-inventory failed:', err.response?.data || err.message);
    
    // Try to handle token expiry
    if (err.response?.status === 401 || err.response?.status === 403) {
      try {
        console.log('🔄 Token expired, refreshing and retrying...');
        const newToken = await refreshAccessToken();
        const lowStockItems = [];
        
        for (const item of cart) {
          const pr = await axios.get(`${BASE_URL}/products/${item.id}/prices/${item.priceId}`, {
            headers: { Authorization: `Bearer ${newToken}`, 'Version': '2021-04-15' }
          });
          const newQty = pr.data.availableQuantity - item.quantity;
          await axios.put(`${BASE_URL}/products/${item.id}/prices/${item.priceId}`, {
            availableQuantity: newQty
          }, {
            headers: { Authorization: `Bearer ${newToken}`, 'Version': '2021-04-15' }
          });

          // Check if stock is low and needs alert
          const LOW_STOCK_THRESHOLD = 20;
          if (newQty <= LOW_STOCK_THRESHOLD && newQty > 0) {
            lowStockItems.push({
              name: item.name,
              quantity: newQty,
              threshold: LOW_STOCK_THRESHOLD
            });
          }
          
          // Update cached inventory
          if (cachedInventory) {
            const cachedItem = cachedInventory.find(c => c.id === item.id && c.priceId === item.priceId);
            if (cachedItem) {
              cachedItem.quantity = newQty;
            }
          }
        }

        // Send low stock alerts
        for (const lowStockItem of lowStockItems) {
          await sendLowStockAlert(lowStockItem.name, lowStockItem.quantity, lowStockItem.threshold);
        }

        // Force a sync after successful retry
        setTimeout(() => {
          syncProducts().catch(error => {
            console.error('Post-retry sync failed:', error);
          });
        }, 1000);

        return res.json({ 
          success: true, 
          method: 'ghl_retry',
          lowStockAlerts: lowStockItems.length,
          message: lowStockItems.length > 0 ? 
            `Inventory updated after token refresh. ${lowStockItems.length} low stock alert(s) sent.` : 
            'Inventory updated successfully after token refresh.'
        });
      } catch (refreshErr) {
        console.error('❌ Token refresh and retry failed:', refreshErr.response?.data || refreshErr.message);
      }
    }
    
    res.status(500).json({ 
      error: err.response?.data || err.message,
      suggestion: 'Consider using local inventory mode or re-authorize GHL access'
    });
  }
});

// Stripe Terminal
app.post('/connection_token', async (req, res) => {
  console.log('🔑 Connection token request received');
  try {
    console.log('📡 Creating Stripe Terminal connection token...');
    const { secret } = await stripe.terminal.connectionTokens.create();
    console.log('✅ Connection token created successfully');
    res.json({ secret });
  } catch (err) {
    console.error('❌ Connection token error:', err.message);
    console.error('📋 Error details:', err.stack);
    res.status(500).json({ error: err.message });
  }
});
app.post('/create_payment_intent', async (req, res) => {
  const { amount } = req.body;
  try {
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: 'aud', // Changed back to AUD for Australian Stripe account
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

// Handle walk-in to membership upgrade (phone number conflict resolution)
app.post('/upgrade-walkin-to-membership', async (req, res) => {
  const { phoneNumber, customerData, membershipType } = req.body;
  let token = await getAccessToken();
  
  try {
    // First, search for existing contact with this phone number
    const searchResponse = await axios.get(`${BASE_URL}/contacts/search?query=${phoneNumber}`, {
      headers: { Authorization: `Bearer ${token}`, 'Version': '2021-04-15' }
    });

    let contactId = null;
    let existingContact = null;

    if (searchResponse.data.contacts && searchResponse.data.contacts.length > 0) {
      // Find exact phone match
      existingContact = searchResponse.data.contacts.find(contact => 
        contact.phone === phoneNumber || 
        contact.phone === phoneNumber.replace(/\D/g, '') || // Remove non-digits
        contact.phone.replace(/\D/g, '') === phoneNumber.replace(/\D/g, '')
      );
      
      if (existingContact) {
        contactId = existingContact.id;
        console.log(`📞 Found existing contact for ${phoneNumber}: ${existingContact.firstName} ${existingContact.lastName}`);
        
        // Update existing contact to membership status
        const updateData = {
          ...customerData,
          phone: phoneNumber,
          tags: [...(existingContact.tags || []), 'membership', membershipType],
          customFields: {
            ...(existingContact.customFields || {}),
            membershipType: membershipType,
            membershipStartDate: new Date().toISOString(),
            customerType: 'member',
            upgradeDate: new Date().toISOString(),
            previousType: 'walkin'
          }
        };

        await axios.put(`${BASE_URL}/contacts/${contactId}`, updateData, {
          headers: { Authorization: `Bearer ${token}`, 'Version': '2021-04-15' }
        });

        console.log(`✅ Successfully upgraded walk-in customer to ${membershipType} membership`);
        
        return res.json({
          success: true,
          message: 'Walk-in customer successfully upgraded to membership',
          contactId: contactId,
          membershipType: membershipType,
          action: 'upgraded_existing'
        });
      }
    }

    // If no existing contact found, create new membership contact
    const newContactData = {
      ...customerData,
      phone: phoneNumber,
      tags: ['membership', membershipType],
      customFields: {
        membershipType: membershipType,
        membershipStartDate: new Date().toISOString(),
        customerType: 'member'
      }
    };

    const createResponse = await axios.post(`${BASE_URL}/contacts`, newContactData, {
      headers: { Authorization: `Bearer ${token}`, 'Version': '2021-04-15' }
    });

    console.log(`✅ Created new membership contact for ${phoneNumber}`);
    
    res.json({
      success: true,
      message: 'New membership created successfully',
      contactId: createResponse.data.contact.id,
      membershipType: membershipType,
      action: 'created_new'
    });

  } catch (err) {
    console.error('Walk-in to membership upgrade failed:', err.response?.data || err.message);
    
    if (err.response?.status === 401) {
      try {
        token = await refreshAccessToken();
        // Retry the operation with refreshed token
        // ... (repeat the logic above)
        return res.status(500).json({ 
          error: 'Authentication failed. Please try again.',
          details: 'Token refresh attempted but operation still failed.'
        });
      } catch (refreshErr) {
        console.error('Token refresh failed during upgrade operation');
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to upgrade walk-in to membership',
      details: err.response?.data || err.message
    });
  }
});

// Check contact exists and get details (for preventing conflicts)
app.get('/check-contact/:phone', async (req, res) => {
  const { phone } = req.params;
  let token = await getAccessToken();
  
  try {
    const searchResponse = await axios.get(`${BASE_URL}/contacts/search?query=${phone}`, {
      headers: { Authorization: `Bearer ${token}`, 'Version': '2021-04-15' }
    });

    if (searchResponse.data.contacts && searchResponse.data.contacts.length > 0) {
      const contact = searchResponse.data.contacts.find(c => 
        c.phone === phone || 
        c.phone === phone.replace(/\D/g, '') || 
        c.phone.replace(/\D/g, '') === phone.replace(/\D/g, '')
      );
      
      if (contact) {
        return res.json({
          exists: true,
          contact: {
            id: contact.id,
            name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            phone: contact.phone,
            email: contact.email,
            tags: contact.tags || [],
            customerType: contact.customFields?.customerType || 'unknown',
            membershipType: contact.customFields?.membershipType || null
          }
        });
      }
    }

    res.json({ exists: false });
  } catch (err) {
    console.error('Contact check failed:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to check contact' });
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

// Manual sync endpoints
app.post('/sync/products', async (req, res) => {
  try {
    console.log('🔄 Manual product sync requested');
    const products = await syncProducts();
    res.json({
      success: true,
      message: `Successfully synchronized ${products.length} products`,
      products: products.length,
      lastSync: new Date().toISOString()
    });
  } catch (error) {
    console.error('Manual sync failed:', error);
    res.status(500).json({
      error: 'Sync failed',
      details: error.message,
      suggestion: 'Check GHL credentials and network connection'
    });
  }
});

app.get('/sync/status', (req, res) => {
  const cache = getSyncCache();
  res.json({
    lastSync: lastSyncTime?.toISOString() || cache.lastSync,
    cachedProducts: cachedInventory?.length || cache.products?.length || 0,
    syncActive: !!syncInterval,
    syncInterval: '5 minutes',
    tokenStatus: getTokens() ? 'available' : 'missing',
    backendBaseUrl: BASE_URL,
    locationId: LOCATION_ID
  });
});

app.post('/sync/start', (req, res) => {
  try {
    startProductSync();
    res.json({
      success: true,
      message: 'Product synchronization service started',
      interval: '5 minutes'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start sync service',
      details: error.message
    });
  }
});

app.post('/sync/stop', (req, res) => {
  try {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
      console.log('🛑 Product synchronization service stopped');
    }
    res.json({
      success: true,
      message: 'Product synchronization service stopped'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to stop sync service',
      details: error.message
    });
  }
});

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

// Stripe configuration endpoint
app.get('/stripe/config', (req, res) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    const isTestMode = stripeKey && stripeKey.startsWith('sk_test_');
    const isLiveMode = stripeKey && stripeKey.startsWith('sk_live_');
    
    res.json({
      testMode: isTestMode,
      liveMode: isLiveMode,
      configured: !!(stripeKey),
      publishableKey: publishableKey, // Frontend might need this
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Error getting Stripe config:', error);
    res.status(500).json({ 
      error: 'Failed to get Stripe configuration',
      testMode: true // Default to test mode on error
    });
  }
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

// Inventory Management Endpoints

// Get single item details
app.get('/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const ghlItemsPath = path.join(__dirname, 'ghl-items.json');
    
    if (fs.existsSync(ghlItemsPath)) {
      const ghlItems = JSON.parse(fs.readFileSync(ghlItemsPath, 'utf8'));
      const item = ghlItems.find(item => item.productId === id || item.priceId === id);
      
      if (item) {
        return res.json(item);
      } else {
        return res.status(404).json({ error: 'Item not found' });
      }
    }
    
    res.status(404).json({ error: 'Inventory not available' });
  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ error: 'Failed to get item details' });
  }
});

// Update item quantity
app.put('/inventory/:id/quantity', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    
    if (typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ error: 'Invalid quantity. Must be a non-negative number.' });
    }
    
    const ghlItemsPath = path.join(__dirname, 'ghl-items.json');
    
    if (fs.existsSync(ghlItemsPath)) {
      const ghlItems = JSON.parse(fs.readFileSync(ghlItemsPath, 'utf8'));
      const itemIndex = ghlItems.findIndex(item => item.productId === id || item.priceId === id);
      
      if (itemIndex !== -1) {
        const oldQuantity = ghlItems[itemIndex].quantity || 0;
        ghlItems[itemIndex].quantity = quantity;
        
        fs.writeFileSync(ghlItemsPath, JSON.stringify(ghlItems, null, 2));
        
        console.log(`📦 Manual quantity update: ${ghlItems[itemIndex].name} - ${oldQuantity} → ${quantity} units`);
        
        return res.json({ 
          success: true, 
          item: ghlItems[itemIndex],
          message: `Updated ${ghlItems[itemIndex].name} quantity from ${oldQuantity} to ${quantity}` 
        });
      } else {
        return res.status(404).json({ error: 'Item not found' });
      }
    }
    
    res.status(404).json({ error: 'Inventory not available' });
  } catch (error) {
    console.error('Update quantity error:', error);
    res.status(500).json({ error: 'Failed to update quantity' });
  }
});

// Add new product
app.post('/inventory/add-product', async (req, res) => {
  try {
    const { name, price, quantity, description } = req.body;
    
    if (!name || typeof price !== 'number' || typeof quantity !== 'number') {
      return res.status(400).json({ 
        error: 'Missing required fields. Name, price, and quantity are required.' 
      });
    }
    
    if (price < 0 || quantity < 0) {
      return res.status(400).json({ 
        error: 'Price and quantity must be non-negative numbers.' 
      });
    }
    
    const ghlItemsPath = path.join(__dirname, 'ghl-items.json');
    
    // Generate unique IDs
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const productId = `manual-${timestamp}-${randomSuffix}`;
    const priceId = `price-${timestamp}-${randomSuffix}`;
    
    const newProduct = {
      name: name.trim(),
      productId,
      priceId,
      price: parseFloat(price),
      quantity: parseInt(quantity),
      description: description?.trim() || `Manual product: ${name.trim()}`,
      isManual: true,
      createdAt: new Date().toISOString()
    };
    
    if (fs.existsSync(ghlItemsPath)) {
      const ghlItems = JSON.parse(fs.readFileSync(ghlItemsPath, 'utf8'));
      
      // Check for duplicate names
      const existingItem = ghlItems.find(item => 
        item.name.toLowerCase() === name.trim().toLowerCase()
      );
      
      if (existingItem) {
        return res.status(400).json({ 
          error: `Product "${name}" already exists. Use a different name or update the existing product.` 
        });
      }
      
      ghlItems.push(newProduct);
      fs.writeFileSync(ghlItemsPath, JSON.stringify(ghlItems, null, 2));
      
      console.log(`➕ New product added: ${newProduct.name} - $${newProduct.price} (${newProduct.quantity} units)`);
      
      return res.json({ 
        success: true, 
        product: newProduct,
        message: `Successfully added "${newProduct.name}" to inventory` 
      });
    }
    
    res.status(500).json({ error: 'Inventory file not accessible' });
  } catch (error) {
    console.error('Add product error:', error);
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// Delete product
app.delete('/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const ghlItemsPath = path.join(__dirname, 'ghl-items.json');
    
    if (fs.existsSync(ghlItemsPath)) {
      const ghlItems = JSON.parse(fs.readFileSync(ghlItemsPath, 'utf8'));
      const itemIndex = ghlItems.findIndex(item => item.productId === id || item.priceId === id);
      
      if (itemIndex !== -1) {
        const deletedItem = ghlItems[itemIndex];
        ghlItems.splice(itemIndex, 1);
        
        fs.writeFileSync(ghlItemsPath, JSON.stringify(ghlItems, null, 2));
        
        console.log(`🗑️ Product deleted: ${deletedItem.name}`);
        
        return res.json({ 
          success: true, 
          message: `Successfully deleted "${deletedItem.name}" from inventory` 
        });
      } else {
        return res.status(404).json({ error: 'Item not found' });
      }
    }
    
    res.status(404).json({ error: 'Inventory not available' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Update product details
app.put('/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, quantity, description } = req.body;
    
    const ghlItemsPath = path.join(__dirname, 'ghl-items.json');
    
    if (fs.existsSync(ghlItemsPath)) {
      const ghlItems = JSON.parse(fs.readFileSync(ghlItemsPath, 'utf8'));
      const itemIndex = ghlItems.findIndex(item => item.productId === id || item.priceId === id);
      
      if (itemIndex !== -1) {
        const item = ghlItems[itemIndex];
        const oldData = { ...item };
        
        // Update fields if provided
        if (name !== undefined) item.name = name.trim();
        if (price !== undefined) item.price = parseFloat(price);
        if (quantity !== undefined) item.quantity = parseInt(quantity);
        if (description !== undefined) item.description = description.trim();
        
        // Add update timestamp
        item.updatedAt = new Date().toISOString();
        
        fs.writeFileSync(ghlItemsPath, JSON.stringify(ghlItems, null, 2));
        
        console.log(`📝 Product updated: ${item.name}`, {
          name: oldData.name !== item.name ? `${oldData.name} → ${item.name}` : 'unchanged',
          price: oldData.price !== item.price ? `$${oldData.price} → $${item.price}` : 'unchanged',
          quantity: oldData.quantity !== item.quantity ? `${oldData.quantity} → ${item.quantity}` : 'unchanged'
        });
        
        return res.json({ 
          success: true, 
          item,
          message: `Successfully updated "${item.name}"` 
        });
      } else {
        return res.status(404).json({ error: 'Item not found' });
      }
    }
    
    res.status(404).json({ error: 'Inventory not available' });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.listen(PORT, () => {
  console.log(`🟢 Backend listening on port ${PORT}`);
  console.log('🔧 Environment:', process.env.NODE_ENV || 'development');
  console.log('📍 GHL Location ID:', LOCATION_ID || 'Not configured');
  
  // Initialize product synchronization
  if (CLIENT_ID && CLIENT_SECRET && LOCATION_ID) {
    console.log('🚀 Starting automatic product synchronization...');
    startProductSync();
  } else {
    console.log('⚠️ GHL credentials missing - sync service disabled');
    console.log('💡 Configure GHL_CLIENT_ID, GHL_CLIENT_SECRET, and GHL_LOCATION_ID to enable auto-sync');
  }
  
  // Graceful shutdown handling
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (syncInterval) {
      clearInterval(syncInterval);
      console.log('✅ Sync service stopped');
    }
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    if (syncInterval) {
      clearInterval(syncInterval);
      console.log('✅ Sync service stopped');
    }
    process.exit(0);
  });
});