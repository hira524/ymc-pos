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
let tokenRefreshInterval = null;
let tokenHealthCheckInterval = null;

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

// Enhanced Auto-Refresh Token Management System
function getTokenExpiryTime(token) {
  try {
    if (!token) return null;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.exp ? payload.exp * 1000 : null; // Convert to milliseconds
  } catch (error) {
    console.error('Failed to parse token expiry:', error);
    return null;
  }
}

function getRefreshTokenExpiryTime() {
  try {
    const tokens = getTokens();
    if (!tokens || !tokens.refresh_token) return null;
    
    const payload = JSON.parse(Buffer.from(tokens.refresh_token.split('.')[1], 'base64').toString());
    return payload.exp ? payload.exp * 1000 : null; // Convert to milliseconds
  } catch (error) {
    console.error('Failed to parse refresh token expiry:', error);
    return null;
  }
}

function calculateRefreshSchedule() {
  const tokens = getTokens();
  if (!tokens || !tokens.access_token) return null;
  
  const expiryTime = getTokenExpiryTime(tokens.access_token);
  if (!expiryTime) return null;
  
  const now = Date.now();
  const timeUntilExpiry = expiryTime - now;
  
  // Refresh when 80% of the token lifetime has passed, but at least 5 minutes before expiry
  const refreshTime = Math.min(
    now + (timeUntilExpiry * 0.8), // 80% of lifetime
    expiryTime - (5 * 60 * 1000)   // 5 minutes before expiry
  );
  
  return Math.max(refreshTime - now, 30000); // At least 30 seconds from now
}

async function proactiveTokenRefresh() {
  try {
    console.log('🔄 Proactive token refresh initiated...');
    
    const tokens = getTokens();
    if (!tokens) {
      console.log('❌ No tokens found for proactive refresh');
      return false;
    }
    
    // Check if refresh token is about to expire
    const refreshExpiryTime = getRefreshTokenExpiryTime();
    if (refreshExpiryTime) {
      const timeUntilRefreshExpiry = refreshExpiryTime - Date.now();
      const daysUntilExpiry = Math.floor(timeUntilRefreshExpiry / (24 * 60 * 60 * 1000));
      
      console.log(`🕒 Refresh token expires in ${daysUntilExpiry} days`);
      
      // If refresh token expires in less than 7 days, send warning
      if (daysUntilExpiry < 7) {
        console.warn(`⚠️ WARNING: Refresh token expires in ${daysUntilExpiry} days! Please re-authorize soon.`);
        await sendTokenExpiryWarning(daysUntilExpiry);
      }
      
      // If refresh token expires in less than 1 day, don't attempt refresh
      if (daysUntilExpiry < 1) {
        console.error('❌ Refresh token expires soon. Manual re-authorization required.');
        return false;
      }
    }
    
    // Attempt to refresh access token
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      console.log('✅ Proactive token refresh successful');
      scheduleNextRefresh();
      return true;
    } else {
      console.error('❌ Proactive token refresh failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Proactive token refresh error:', error.message);
    
    // If refresh fails due to invalid grant, schedule re-authorization reminder
    if (error.response?.data?.error === 'invalid_grant') {
      console.log('🔑 Scheduling re-authorization reminder...');
      scheduleReauthorizationReminder();
    }
    
    return false;
  }
}

function scheduleNextRefresh() {
  // Clear existing schedule
  if (tokenRefreshInterval) {
    clearTimeout(tokenRefreshInterval);
    tokenRefreshInterval = null;
  }
  
  const nextRefreshIn = calculateRefreshSchedule();
  if (nextRefreshIn && nextRefreshIn > 0) {
    console.log(`⏰ Next token refresh scheduled in ${Math.round(nextRefreshIn / 60000)} minutes`);
    
    tokenRefreshInterval = setTimeout(async () => {
      await proactiveTokenRefresh();
    }, nextRefreshIn);
  } else {
    console.log('⚠️ Cannot schedule next refresh - token expiry unknown');
  }
}

function startTokenHealthMonitoring() {
  console.log('🏥 Starting token health monitoring...');
  
  // Check token health every 30 minutes
  tokenHealthCheckInterval = setInterval(async () => {
    try {
      const tokens = getTokens();
      if (!tokens) {
        console.log('💔 No tokens found during health check');
        return;
      }
      
      const accessExpiryTime = getTokenExpiryTime(tokens.access_token);
      const refreshExpiryTime = getRefreshTokenExpiryTime();
      const now = Date.now();
      
      console.log('🏥 Token health check:');
      
      if (accessExpiryTime) {
        const accessMinutesLeft = Math.floor((accessExpiryTime - now) / 60000);
        console.log(`   Access token: ${accessMinutesLeft} minutes remaining`);
        
        // If access token expires in less than 10 minutes, refresh immediately
        if (accessMinutesLeft < 10 && accessMinutesLeft > 0) {
          console.log('🚨 Access token expires soon - refreshing immediately');
          await proactiveTokenRefresh();
        }
      }
      
      if (refreshExpiryTime) {
        const refreshDaysLeft = Math.floor((refreshExpiryTime - now) / (24 * 60 * 60 * 1000));
        console.log(`   Refresh token: ${refreshDaysLeft} days remaining`);
      }
      
    } catch (error) {
      console.error('❌ Token health check failed:', error.message);
    }
  }, 30 * 60 * 1000); // Every 30 minutes
}

async function sendTokenExpiryWarning(daysRemaining) {
  try {
    if (!process.env.EMAIL_USER || !emailTransporter) {
      console.log('📧 Email not configured - skipping token expiry warning');
      return;
    }
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ALERT_EMAIL || process.env.EMAIL_USER,
      subject: `🚨 GoHighLevel Token Expiring Soon - ${daysRemaining} Days Left`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ff6b35;">🚨 Token Expiry Warning</h2>
          <div style="background: #fff3cd; padding: 20px; border-radius: 8px; border-left: 4px solid #ff6b35;">
            <h3 style="margin-top: 0; color: #333;">GoHighLevel Refresh Token Expiring</h3>
            <p><strong>Days Remaining:</strong> ${daysRemaining}</p>
            <p><strong>System:</strong> YMC POS - Product Sync</p>
            <p style="color: #ff6b35;"><strong>Action Required:</strong> Re-authorize before expiration to maintain automatic sync.</p>
          </div>
          <div style="margin-top: 20px; padding: 15px; background: #e3f2fd; border-radius: 8px;">
            <h4 style="margin-top: 0;">How to Re-authorize:</h4>
            <ol>
              <li>Visit: <strong>http://your-server:5000/auth</strong></li>
              <li>Complete GoHighLevel OAuth flow</li>
              <li>Grant all required permissions</li>
              <li>Verify product sync resumes</li>
            </ol>
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #666;">
            This warning is sent automatically when refresh tokens are approaching expiration.
            The system will continue attempting automatic refresh until manual re-authorization is required.
          </p>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(`📧 Token expiry warning sent - ${daysRemaining} days remaining`);
  } catch (error) {
    console.error('Failed to send token expiry warning:', error);
  }
}

function scheduleReauthorizationReminder() {
  // Send periodic reminders every 6 hours when re-authorization is needed
  const reminderInterval = setInterval(async () => {
    console.log('🔔 REMINDER: GoHighLevel re-authorization required');
    console.log('👉 Visit http://localhost:5000/auth to restore product sync');
    
    // Try to send email reminder if configured
    try {
      await sendTokenExpiryWarning(0); // 0 days = expired
    } catch (error) {
      // Ignore email errors during reminders
    }
  }, 6 * 60 * 60 * 1000); // Every 6 hours
  
  // Stop reminders after 3 days
  setTimeout(() => {
    clearInterval(reminderInterval);
    console.log('🔕 Stopping re-authorization reminders after 3 days');
  }, 3 * 24 * 60 * 60 * 1000);
}

async function initializeTokenManagement() {
  console.log('🔧 Initializing enhanced token management...');
  
  const tokens = getTokens();
  if (!tokens) {
    console.log('❌ No tokens found - visit /auth to authorize');
    return false;
  }
  
  // Validate current tokens
  try {
    await getValidAccessToken();
    console.log('✅ Current tokens are valid');
    
    // Schedule proactive refresh
    scheduleNextRefresh();
    
    // Start health monitoring
    startTokenHealthMonitoring();
    
    console.log('🚀 Enhanced token management initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Token validation failed:', error.message);
    
    if (error.message.includes('invalid_grant')) {
      console.log('🔑 Tokens expired - manual re-authorization required');
      scheduleReauthorizationReminder();
    }
    
    return false;
  }
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
    
    // First, get all products
    const productsUrl = `${BASE_URL}/products/?locationId=${LOCATION_ID}`;
    const productsResponse = await axios.get(productsUrl, {
      headers: { 
        Authorization: `Bearer ${token}`, 
        'Version': '2021-04-15',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    let products = [];
    if (productsResponse.data.products && Array.isArray(productsResponse.data.products)) {
      products = productsResponse.data.products;
    } else if (productsResponse.data.data && Array.isArray(productsResponse.data.data)) {
      products = productsResponse.data.data;
    } else if (Array.isArray(productsResponse.data)) {
      products = productsResponse.data;
    }

    console.log(`📦 Found ${products.length} products`);

    // For now, let's use fallback pricing based on the pattern I saw in your screenshots
    // This is a temporary solution while we figure out the correct API approach
    const priceMapping = {
      "Slushie 16 oz - Mixed": 4.50,
      "Slushie 16 oz - Berry Blast": 4.50,
      "Slushie 16 oz - Coke": 4.50,
      "Slushie 12 oz - Mixed": 2.50,
      "Slushie 12 oz - Berry Blast": 2.50,
      "Slushie 12 oz - Coke": 2.50,
      "250ml Soft Drink Can - Fanta": 2.00,
      "250ml Soft Drink Can - Coke Zero": 2.00,
      "250ml Soft Drink Can - Coke": 2.00,
      "250ml Soft Drink Can - Sprite": 2.00,
      "250ml Pop Top - Apple": 2.50,
      "250ml Pop Top - Apple & Blackcurrant": 2.50,
      "250 ml Bottled Water": 1.50
    };

    const quantityMapping = {
      "Slushie 16 oz - Mixed": 20,
      "Slushie 16 oz - Berry Blast": 20,
      "Slushie 16 oz - Coke": 20,
      "Slushie 12 oz - Mixed": 20,
      "Slushie 12 oz - Berry Blast": 20,
      "Slushie 12 oz - Coke": 20,
      "250ml Soft Drink Can - Fanta": 20,
      "250ml Soft Drink Can - Coke Zero": 20,
      "250ml Soft Drink Can - Coke": 20,
      "250ml Soft Drink Can - Sprite": 20,
      "250ml Pop Top - Apple": 20,
      "250ml Pop Top - Apple & Blackcurrant": 20,
      "250 ml Bottled Water": 20
    };

    // Try to get individual product details to see if we can extract pricing
    const detailedProducts = [];
    for (let i = 0; i < Math.min(products.length, 3); i++) { // Test first 3 products
      const product = products[i];
      try {
        console.log(`🔍 Getting details for ${product.name}...`);
        const detailUrl = `${BASE_URL}/products/${product._id}?locationId=${LOCATION_ID}`;
        const detailResponse = await axios.get(detailUrl, {
          headers: { 
            Authorization: `Bearer ${token}`, 
            'Version': '2021-04-15',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        console.log(`📝 Product ${product.name} fields:`, Object.keys(detailResponse.data));
        
        // Look for ANY possible pricing fields in the detailed response
        const data = detailResponse.data;
        const possiblePriceFields = ['price', 'amount', 'cost', 'basePrice', 'unitPrice', 'value'];
        const possibleQuantityFields = ['quantity', 'stock', 'inventory', 'available', 'availableQuantity', 'inStock'];
        
        let foundPrice = null;
        let foundQuantity = null;
        
        // Search through all possible price and quantity fields
        for (const field of possiblePriceFields) {
          if (data[field] !== undefined && data[field] !== null) {
            foundPrice = parseFloat(data[field]);
            console.log(`💰 Found price in field '${field}': ${foundPrice}`);
            break;
          }
        }
        
        for (const field of possibleQuantityFields) {
          if (data[field] !== undefined && data[field] !== null) {
            foundQuantity = parseInt(data[field]);
            console.log(`📦 Found quantity in field '${field}': ${foundQuantity}`);
            break;
          }
        }
        
        detailedProducts.push({
          ...product,
          detectedPrice: foundPrice,
          detectedQuantity: foundQuantity
        });
      } catch (detailError) {
        console.log(`⚠️ Could not fetch details for ${product.name}:`, detailError.response?.status);
        detailedProducts.push(product);
      }
    }

    const inventory = products.map((p, index) => {
      // Use detected pricing if available, otherwise fallback to manual mapping
      const detailedProduct = detailedProducts.find(dp => dp._id === p._id);
      
      let price = detailedProduct?.detectedPrice || priceMapping[p.name] || 0;
      let quantity = detailedProduct?.detectedQuantity || quantityMapping[p.name] || 0;
      
      // If no pricing found through API or mapping, set to 0 but log it
      if (price === 0 && !priceMapping[p.name]) {
        console.log(`⚠️ No pricing found for: ${p.name}`);
      }

      return {
        id: p._id || `ghl-product-${index}`,
        name: p.name || `Product ${index + 1}`,
        price: price,
        quantity: quantity,
        priceId: p._id || `no-price-${index}`,
        description: p.description || `GHL Product: ${p.name || 'Unnamed'}`,
        image: p.image || p.medias?.[0]?.url || null,
        lastSynced: new Date().toISOString(),
        source: 'ghl',
        productType: p.productType || 'PHYSICAL',
        availableInStore: p.availableInStore || false,
        // Add debug info
        pricingMethod: detailedProduct?.detectedPrice ? 'api' : (priceMapping[p.name] ? 'manual' : 'none')
      };
    });

    const productsWithPricing = inventory.filter(p => p.price > 0).length;
    console.log(`✅ Successfully fetched ${inventory.length} products from GHL`);
    console.log(`💰 Products with pricing: ${productsWithPricing}`);
    console.log(`🔧 Pricing methods: API=${inventory.filter(p => p.pricingMethod === 'api').length}, Manual=${inventory.filter(p => p.pricingMethod === 'manual').length}, None=${inventory.filter(p => p.pricingMethod === 'none').length}`);
    
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

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'YMC POS Backend',
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

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
    
    // Initialize enhanced token management with fresh tokens
    console.log('🔧 Initializing enhanced token management with fresh tokens...');
    await initializeTokenManagement();
    
    res.send(`
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #28a745;">✅ GHL OAuth Successful!</h2>
        <p><strong>Tokens saved successfully.</strong></p>
        <p>🕒 <strong>Valid until:</strong> ${new Date(tokenData.expires_at).toLocaleString()}</p>
        <p>Your POS system will now automatically sync products from GoHighLevel every 5 minutes.</p>
        <p>🔄 <strong>Automatic token refresh:</strong> ✅ Enabled</p>
        <p>🏥 <strong>Token health monitoring:</strong> ✅ Active</p>
        <p>📧 <strong>Expiry notifications:</strong> ✅ Configured</p>
        <hr style="margin: 20px 0;">
        <p><small>You can close this window and return to your POS system. 
        Tokens will automatically refresh before expiration!</small></p>
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
// Enhanced token status endpoint
app.get('/tokens/status', (req, res) => {
  try {
    const tokens = getTokens();
    
    if (!tokens) {
      return res.json({
        status: 'missing',
        message: 'No tokens found',
        action: 'Visit /auth to authorize',
        authUrl: '/auth',
        autoRefresh: {
          enabled: false,
          scheduled: false,
          healthMonitoring: false
        }
      });
    }
    
    const isExpired = isTokenExpired(tokens.access_token);
    const hasRefreshToken = !!tokens.refresh_token;
    
    // Check refresh token expiry
    const refreshExpiryTime = getRefreshTokenExpiryTime();
    const refreshDaysLeft = refreshExpiryTime ? 
      Math.floor((refreshExpiryTime - Date.now()) / (24 * 60 * 60 * 1000)) : null;
    
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
    } else if (refreshDaysLeft !== null && refreshDaysLeft < 7) {
      status = 'refresh_token_expiring';
      message = `Refresh token expires in ${refreshDaysLeft} days`;
      action = refreshDaysLeft < 1 ? 'Manual re-authorization required immediately' : 
               'Consider re-authorizing soon to prevent service interruption';
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
        refreshedAt: tokens.refreshed_at ? new Date(tokens.refreshed_at).toLocaleString() : 'Never',
        refreshTokenExpiresIn: refreshDaysLeft !== null ? `${refreshDaysLeft} days` : 'Unknown'
      },
      autoRefresh: {
        enabled: !!tokenRefreshInterval,
        scheduled: !!tokenRefreshInterval,
        healthMonitoring: !!tokenHealthCheckInterval,
        nextRefreshIn: tokenRefreshInterval ? 
          Math.round(calculateRefreshSchedule() / 60000) + ' minutes' : 'Not scheduled'
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

// MongoDB Connection & Schemas
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('🟢 Connected to MongoDB');
    // Initialize default products on startup
    initializeInventory();
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err);
  });

const Payment = mongoose.model('Payment', new mongoose.Schema({
  date: { type: Date, default: Date.now },
  items: Array,
  total: Number,
  method: String
}));

// Import Product Service and Model
const ProductService = require('./services/ProductService');
const FolderService = require('./services/FolderService');
const Product = require('./models/Product');
const Folder = require('./models/Folder');

// Initialize MongoDB inventory
async function initializeInventory() {
  try {
    console.log('🔄 Initializing MongoDB inventory system...');
    await ProductService.initializeDefaultProducts();
    console.log('✅ MongoDB inventory system initialized');
  } catch (error) {
    console.error('❌ Failed to initialize inventory:', error);
  }
}

// /inventory
// /inventory - MongoDB-based endpoint
app.get('/inventory', async (req, res) => {
  console.log('🔍 MongoDB Inventory request received');
  
  try {
    const useGHL = req.query.source === 'ghl';
    const forceRefresh = req.query.refresh === 'true';
    
    if (useGHL) {
      // Fallback to GHL sync if specifically requested
      console.log('🔄 GHL inventory requested, attempting sync...');
      try {
        const maxCacheAge = 5 * 60 * 1000; // 5 minutes
        const needsRefresh = forceRefresh || !lastSyncTime || 
                            (Date.now() - lastSyncTime.getTime()) > maxCacheAge;
        
        if (needsRefresh || !cachedInventory) {
          const products = await syncProducts();
          return res.json(products);
        }
        
        if (cachedInventory) {
          console.log('📦 Returning cached GHL inventory');
          return res.json(cachedInventory);
        }
      } catch (syncError) {
        console.error('❌ GHL sync failed, falling back to MongoDB:', syncError);
      }
    }

    // Primary: Use MongoDB inventory
    console.log('� Fetching inventory from MongoDB...');
    const products = await ProductService.getAllProducts();
    
    // Convert to expected format
    const inventory = products.map(product => ({
      id: product.productId,
      name: product.name,
      price: product.price,
      quantity: product.quantity,
      priceId: product.priceId,
      description: product.description,
      image: product.image,
      source: product.source,
      productType: product.productType,
      availableInStore: product.availableInStore,
      category: product.category,
      sku: product.sku,
      lastSynced: product.lastSynced,
      _id: product._id
    }));

    console.log(`✅ Retrieved ${inventory.length} products from MongoDB`);
    res.json(inventory);

  } catch (error) {
    console.error('❌ MongoDB inventory fetch failed:', error);
    
    // Ultimate fallback: try cached data, then file-based, then demo
    if (cachedInventory) {
      console.log('📦 Emergency fallback to cached inventory');
      return res.json(cachedInventory);
    }
    
    // Try local ghl-items.json file
    const ghlItemsPath = path.join(__dirname, 'ghl-items.json');
    if (fs.existsSync(ghlItemsPath)) {
      console.log('📋 Emergency fallback to local file');
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
      
      return res.json(inventory);
    }
    
    // Last resort: demo inventory
    console.log('🔄 Ultimate fallback to demo inventory');
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

// /update-inventory - MongoDB-first endpoint
app.post('/update-inventory', async (req, res) => {
  const { cart } = req.body;
  console.log('📦 Inventory update request received');
  console.log('🛒 Cart data:', JSON.stringify(cart, null, 2));
  
  // Try MongoDB first
  const useMongoDB = req.query.source !== 'ghl' && req.query.source !== 'local';
  
  if (useMongoDB) {
    console.log('📦 Using MongoDB for inventory updates');
    try {
      // Process sale using MongoDB
      const updates = await ProductService.processSale(cart);
      const lowStockItems = [];
      const LOW_STOCK_THRESHOLD = 5;
      
      // Check for low stock items
      for (const update of updates) {
        if (update.newQuantity <= LOW_STOCK_THRESHOLD && update.newQuantity > 0) {
          lowStockItems.push({
            name: update.product.name,
            quantity: update.newQuantity,
            threshold: LOW_STOCK_THRESHOLD
          });
        }
        
        console.log(`📦 Updated ${update.product.name}: ${update.oldQuantity} → ${update.newQuantity} units (sold: ${update.soldQuantity})`);
      }
      
      // Send low stock alerts
      for (const lowStockItem of lowStockItems) {
        await sendLowStockAlert(lowStockItem.name, lowStockItem.quantity, lowStockItem.threshold);
      }
      
      console.log(`✅ MongoDB inventory updated successfully. ${updates.length} products processed.`);
      
      return res.json({ 
        success: true, 
        method: 'mongodb',
        updatedProducts: updates.length,
        lowStockAlerts: lowStockItems.length,
        updates: updates.map(u => ({
          name: u.product.name,
          oldQuantity: u.oldQuantity,
          newQuantity: u.newQuantity,
          soldQuantity: u.soldQuantity
        })),
        message: lowStockItems.length > 0 ? 
          `MongoDB inventory updated. ${lowStockItems.length} low stock alert(s) sent.` : 
          'MongoDB inventory updated successfully.'
      });
      
    } catch (mongoError) {
      console.error('❌ MongoDB inventory update failed:', mongoError.message);
      console.log('🔄 Falling back to file-based inventory...');
      // Continue to file-based fallback
    }
  }
  
  // Check if we're using local inventory file (for offline mode)
  const ghlItemsPath = path.join(__dirname, 'ghl-items.json');
  const useLocalInventory = fs.existsSync(ghlItemsPath) && (req.query.source === 'local' || !req.query.forceGhl);
  
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

// MongoDB-based update-inventory endpoint
app.post('/update-inventory-mongodb', async (req, res) => {
  const { cart } = req.body;
  console.log('📦 MongoDB Inventory update request received');
  console.log('🛒 Cart data:', JSON.stringify(cart, null, 2));
  
  try {
    // Process sale using MongoDB
    const updates = await ProductService.processSale(cart);
    const lowStockItems = [];
    const LOW_STOCK_THRESHOLD = 5; // Configurable threshold
    
    // Check for low stock items
    for (const update of updates) {
      if (update.newQuantity <= LOW_STOCK_THRESHOLD && update.newQuantity > 0) {
        lowStockItems.push({
          name: update.product.name,
          quantity: update.newQuantity,
          threshold: LOW_STOCK_THRESHOLD
        });
      }
      
      console.log(`📦 Updated ${update.product.name}: ${update.oldQuantity} → ${update.newQuantity} units (sold: ${update.soldQuantity})`);
    }
    
    // Send low stock alerts
    for (const lowStockItem of lowStockItems) {
      await sendLowStockAlert(lowStockItem.name, lowStockItem.quantity, lowStockItem.threshold);
    }
    
    console.log(`✅ MongoDB inventory updated successfully. ${updates.length} products processed.`);
    
    res.json({ 
      success: true, 
      method: 'mongodb',
      updatedProducts: updates.length,
      lowStockAlerts: lowStockItems.length,
      updates: updates.map(u => ({
        name: u.product.name,
        oldQuantity: u.oldQuantity,
        newQuantity: u.newQuantity,
        soldQuantity: u.soldQuantity
      })),
      message: lowStockItems.length > 0 ? 
        `MongoDB inventory updated. ${lowStockItems.length} low stock alert(s) sent.` : 
        'MongoDB inventory updated successfully.'
    });
    
  } catch (error) {
    console.error('❌ MongoDB inventory update failed:', error.message);
    res.status(400).json({ 
      error: error.message,
      method: 'mongodb',
      suggestion: 'Check product availability and try again'
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

// MongoDB-based Inventory Management Endpoints

// Get all products from MongoDB
app.get('/mongodb/inventory', async (req, res) => {
  try {
    console.log('🔍 MongoDB Inventory request received');
    console.log('📦 Fetching inventory from MongoDB...');
    
    const products = await ProductService.getAllProducts();
    
    console.log(`✅ Retrieved ${products.length} products from MongoDB`);
    res.json(products);
  } catch (error) {
    console.error('❌ Error fetching MongoDB inventory:', error);
    res.status(500).json({ 
      error: 'Failed to fetch inventory from MongoDB',
      details: error.message 
    });
  }
});

// Search products - must come before /:id route
app.get('/mongodb/inventory/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    console.log(`🔍 MongoDB: Searching products for: ${query}`);
    
    const products = await ProductService.searchProducts(query);
    
    const results = products.map(product => ({
      id: product.productId,
      name: product.name,
      price: product.price,
      quantity: product.quantity,
      priceId: product.priceId,
      description: product.description,
      category: product.category,
      _id: product._id
    }));
    
    res.json({ 
      success: true,
      query,
      results,
      count: results.length
    });
    
  } catch (error) {
    console.error('MongoDB search error:', error);
    res.status(500).json({ error: 'Failed to search products in MongoDB' });
  }
});

// Get products by category - must come before /:id route
app.get('/mongodb/inventory/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    console.log(`🔍 MongoDB: Getting products for category: ${category}`);
    
    const products = await ProductService.getProductsByCategory(category);
    
    const results = products.map(product => ({
      id: product.productId,
      name: product.name,
      price: product.price,
      quantity: product.quantity,
      priceId: product.priceId,
      description: product.description,
      category: product.category,
      _id: product._id
    }));
    
    res.json({ 
      success: true,
      category,
      results,
      count: results.length
    });
    
  } catch (error) {
    console.error('MongoDB category search error:', error);
    res.status(500).json({ error: 'Failed to get products by category from MongoDB' });
  }
});

// Get low stock products - must come before /:id route
app.get('/mongodb/inventory/low-stock', async (req, res) => {
  try {
    const threshold = 5; // Default threshold
    console.log(`🔍 MongoDB: Getting low stock products (threshold: ${threshold})`);
    
    const products = await ProductService.getLowStockProducts(threshold);
    
    const results = products.map(product => ({
      id: product.productId,
      name: product.name,
      price: product.price,
      quantity: product.quantity,
      priceId: product.priceId,
      description: product.description,
      category: product.category,
      _id: product._id
    }));
    
    res.json({ 
      success: true,
      threshold,
      results,
      count: results.length
    });
    
  } catch (error) {
    console.error('MongoDB low stock error:', error);
    res.status(500).json({ error: 'Failed to get low stock products from MongoDB' });
  }
});

// Get low stock products with custom threshold - must come before /:id route
app.get('/mongodb/inventory/low-stock/:threshold', async (req, res) => {
  try {
    const threshold = parseInt(req.params.threshold) || 5;
    console.log(`🔍 MongoDB: Getting low stock products (threshold: ${threshold})`);
    
    const products = await ProductService.getLowStockProducts(threshold);
    
    const results = products.map(product => ({
      id: product.productId,
      name: product.name,
      price: product.price,
      quantity: product.quantity,
      priceId: product.priceId,
      description: product.description,
      category: product.category,
      _id: product._id
    }));
    
    res.json({ 
      success: true,
      threshold,
      results,
      count: results.length
    });
    
  } catch (error) {
    console.error('MongoDB low stock error:', error);
    res.status(500).json({ error: 'Failed to get low stock products from MongoDB' });
  }
});

// Add new product - specific route before /:id
app.post('/mongodb/inventory/add-product', async (req, res) => {
  try {
    const { name, price, quantity, description, category, productType } = req.body;
    
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
    
    const productData = {
      name: name.trim(),
      price: parseFloat(price),
      quantity: parseInt(quantity),
      description: description?.trim() || `Product: ${name.trim()}`,
      category: category?.trim() || 'General',
      productType: productType || 'PHYSICAL'
    };
    
    const newProduct = await ProductService.createProduct(productData);
    
    console.log(`➕ MongoDB: New product added: ${newProduct.name} - ${newProduct.formattedPrice} (${newProduct.quantity} units)`);
    
    res.json({ 
      success: true, 
      product: {
        id: newProduct.productId,
        name: newProduct.name,
        price: newProduct.price,
        quantity: newProduct.quantity,
        priceId: newProduct.priceId,
        description: newProduct.description,
        category: newProduct.category,
        _id: newProduct._id
      },
      message: `Successfully added "${newProduct.name}" to MongoDB inventory` 
    });
    
  } catch (error) {
    console.error('MongoDB add product error:', error);
    if (error.code === 11000) {
      res.status(400).json({ 
        error: 'Product with this name already exists. Use a different name or update the existing product.' 
      });
    } else {
      res.status(500).json({ error: 'Failed to add product to MongoDB' });
    }
  }
});

// Bulk update quantities - specific route before /:id
app.put('/mongodb/inventory/bulk-update', async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'Updates must be an array' });
    }
    
    console.log(`📦 MongoDB: Bulk updating ${updates.length} products`);
    
    const results = await ProductService.bulkUpdateQuantities(updates);
    
    res.json({ 
      success: true,
      updatedCount: results.length,
      results: results.map(product => ({
        id: product.productId,
        name: product.name,
        quantity: product.quantity
      })),
      message: `Successfully bulk updated ${results.length} products in MongoDB`
    });
    
  } catch (error) {
    console.error('MongoDB bulk update error:', error);
    res.status(500).json({ error: 'Failed to bulk update products in MongoDB' });
  }
});

// Get single product details - this route must come AFTER all specific routes
app.get('/mongodb/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 MongoDB: Getting product details for ID: ${id}`);
    
    const product = await ProductService.getProductById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({
      id: product.productId,
      name: product.name,
      price: product.price,
      quantity: product.quantity,
      priceId: product.priceId,
      description: product.description,
      image: product.image,
      source: product.source,
      productType: product.productType,
      category: product.category,
      sku: product.sku,
      _id: product._id,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Update product quantity
app.put('/mongodb/inventory/:id/quantity', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    
    if (typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ 
        error: 'Quantity must be a non-negative number.' 
      });
    }
    
    const oldProduct = await ProductService.getProductById(id);
    if (!oldProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const updatedProduct = await ProductService.updateQuantity(id, quantity);
    
    console.log(`📦 MongoDB: Quantity updated for ${updatedProduct.name}: ${oldProduct.quantity} → ${updatedProduct.quantity} units`);
    
    res.json({ 
      success: true, 
      product: {
        id: updatedProduct.productId,
        name: updatedProduct.name,
        oldQuantity: oldProduct.quantity,
        newQuantity: updatedProduct.quantity
      },
      message: `Updated ${updatedProduct.name} quantity from ${oldProduct.quantity} to ${updatedProduct.quantity}` 
    });
    
  } catch (error) {
    console.error('MongoDB update quantity error:', error);
    res.status(500).json({ error: 'Failed to update quantity in MongoDB' });
  }
});

// Move product to folder
app.put('/mongodb/inventory/:id/move-folder', async (req, res) => {
  try {
    const { id } = req.params;
    const { folderId } = req.body;
    
    console.log(`📁 MongoDB: Moving product ${id} to folder ${folderId}`);
    
    const product = await ProductService.getProductById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Get folder name if folderId is provided
    let folderName = null;
    if (folderId) {
      const folder = await FolderService.getFolderById(folderId);
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }
      folderName = folder.name;
    }
    
    // Update product folder assignment
    const updatedProduct = await product.updateFolder(folderId, folderName);
    
    console.log(`📁 MongoDB: Product "${product.name}" moved to folder "${folderName || 'Unassigned'}"`);
    
    res.json({ 
      success: true,
      product: {
        id: updatedProduct._id,
        name: updatedProduct.name,
        folderId: updatedProduct.folderId,
        folderName: updatedProduct.folderName
      },
      message: `Successfully moved "${updatedProduct.name}" to folder "${folderName || 'Unassigned'}"` 
    });
    
  } catch (error) {
    console.error('MongoDB move product to folder error:', error);
    res.status(500).json({ error: 'Failed to move product to folder' });
  }
});

// Delete product (soft delete)
app.delete('/mongodb/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await ProductService.getProductById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    await ProductService.deleteProduct(id);
    
    console.log(`🗑️ MongoDB: Product soft deleted: ${product.name}`);
    
    res.json({ 
      success: true, 
      message: `Successfully deleted "${product.name}" from MongoDB inventory` 
    });
    
  } catch (error) {
    console.error('MongoDB delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product from MongoDB' });
  }
});

// Update product details
app.put('/mongodb/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, quantity, description, category, productType } = req.body;
    
    const oldProduct = await ProductService.getProductById(id);
    if (!oldProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (price !== undefined) updateData.price = parseFloat(price);
    if (quantity !== undefined) updateData.quantity = parseInt(quantity);
    if (description !== undefined) updateData.description = description.trim();
    if (category !== undefined) updateData.category = category.trim();
    if (productType !== undefined) updateData.productType = productType;
    
    const updatedProduct = await ProductService.updateProduct(id, updateData);
    
    console.log(`📝 MongoDB: Product updated: ${updatedProduct.name}`);
    
    res.json({ 
      success: true, 
      product: {
        id: updatedProduct.productId,
        name: updatedProduct.name,
        price: updatedProduct.price,
        quantity: updatedProduct.quantity,
        priceId: updatedProduct.priceId,
        description: updatedProduct.description,
        category: updatedProduct.category,
        _id: updatedProduct._id
      },
      message: `Successfully updated "${updatedProduct.name}" in MongoDB inventory` 
    });
    
  } catch (error) {
    console.error('MongoDB update product error:', error);
    if (error.code === 11000) {
      res.status(400).json({ 
        error: 'Product with this name already exists. Use a different name.' 
      });
    } else {
      res.status(500).json({ error: 'Failed to update product in MongoDB' });
    }
  }
});

// Bulk update quantities
app.put('/mongodb/inventory/bulk-update', async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'Updates must be an array' });
    }
    
    console.log(`📦 MongoDB: Bulk updating ${updates.length} products`);
    
    const results = await ProductService.bulkUpdateQuantities(updates);
    
    res.json({ 
      success: true,
      updatedCount: results.length,
      results: results.map(product => ({
        id: product.productId,
        name: product.name,
        quantity: product.quantity
      })),
      message: `Successfully bulk updated ${results.length} products in MongoDB`
    });
    
  } catch (error) {
    console.error('MongoDB bulk update error:', error);
    res.status(500).json({ error: 'Failed to bulk update products in MongoDB' });
  }
});

// Export products data
app.get('/mongodb/inventory/export', async (req, res) => {
  try {
    console.log('📤 MongoDB: Exporting products data');
    
    const exportData = await ProductService.exportProducts();
    
    res.json({ 
      success: true,
      count: exportData.length,
      data: exportData,
      exportedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('MongoDB export error:', error);
    res.status(500).json({ error: 'Failed to export products from MongoDB' });
  }
});

// ==================== FOLDER MANAGEMENT ENDPOINTS ====================

// Get all folders
app.get('/mongodb/folders', async (req, res) => {
  try {
    console.log('📁 MongoDB: Getting all folders');
    
    const folders = await FolderService.getAllFolders();
    
    res.json({ 
      success: true,
      count: folders.length,
      folders: folders.map(folder => ({
        id: folder._id,
        name: folder.name,
        description: folder.description,
        color: folder.color,
        icon: folder.icon,
        order: folder.order,
        productCount: folder.productCount,
        isDefault: folder.isDefault,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt
      }))
    });
    
  } catch (error) {
    console.error('MongoDB get folders error:', error);
    res.status(500).json({ error: 'Failed to get folders from MongoDB' });
  }
});

// Create new folder
app.post('/mongodb/folders', async (req, res) => {
  try {
    const { name, description, color, icon } = req.body;
    
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ 
        error: 'Folder name is required and must be a non-empty string.' 
      });
    }
    
    console.log(`📁 MongoDB: Creating new folder: ${name.trim()}`);
    
    const folder = await FolderService.createFolder({
      name: name.trim(),
      description: description?.trim() || '',
      color: color || '#667eea',
      icon: icon || '📁'
    });
    
    res.json({ 
      success: true,
      folder: {
        id: folder._id,
        name: folder.name,
        description: folder.description,
        color: folder.color,
        icon: folder.icon,
        order: folder.order,
        productCount: folder.productCount,
        isDefault: folder.isDefault
      },
      message: `Successfully created folder "${folder.name}"`
    });
    
  } catch (error) {
    console.error('MongoDB create folder error:', error);
    if (error.message.includes('already exists')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to create folder in MongoDB' });
    }
  }
});

// Update folder
app.put('/mongodb/folders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, icon, order } = req.body;
    
    console.log(`📁 MongoDB: Updating folder ${id}`);
    
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon;
    if (order !== undefined) updateData.order = parseInt(order);
    
    const folder = await FolderService.updateFolder(id, updateData);
    
    res.json({ 
      success: true,
      folder: {
        id: folder._id,
        name: folder.name,
        description: folder.description,
        color: folder.color,
        icon: folder.icon,
        order: folder.order,
        productCount: folder.productCount,
        isDefault: folder.isDefault
      },
      message: `Successfully updated folder "${folder.name}"`
    });
    
  } catch (error) {
    console.error('MongoDB update folder error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else if (error.message.includes('already exists')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to update folder in MongoDB' });
    }
  }
});

// Delete folder
app.delete('/mongodb/folders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { moveProducts, deleteProducts } = req.query;
    
    console.log(`📁 MongoDB: Deleting folder ${id}`);
    console.log(`📁 Options: moveProducts=${moveProducts}, deleteProducts=${deleteProducts}`);
    
    let result;
    
    if (deleteProducts === 'true') {
      // Delete folder and all products inside
      console.log(`📁 Deleting folder and all products inside`);
      result = await FolderService.deleteFolderAndProducts(id);
    } else {
      // Default behavior: delete folder only, move products to Unassigned
      console.log(`📁 Deleting folder only, moving products to Unassigned`);
      result = await FolderService.deleteFolder(id);
    }
    
    res.json({ 
      success: true,
      message: result.message,
      deletedProductsCount: result.deletedProductsCount || 0,
      movedProductsCount: result.movedProductsCount || 0
    });
    
  } catch (error) {
    console.error('MongoDB delete folder error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to delete folder from MongoDB' });
    }
  }
});

// Reorder folders
app.put('/mongodb/folders/reorder', async (req, res) => {
  try {
    const { folderIds } = req.body;
    
    if (!Array.isArray(folderIds)) {
      return res.status(400).json({ error: 'folderIds must be an array' });
    }
    
    console.log(`📁 MongoDB: Reordering ${folderIds.length} folders`);
    
    const folders = await FolderService.reorderFolders(folderIds);
    
    res.json({ 
      success: true,
      count: folders.length,
      folders: folders.map(folder => ({
        id: folder._id,
        name: folder.name,
        order: folder.order
      })),
      message: `Successfully reordered ${folderIds.length} folders`
    });
    
  } catch (error) {
    console.error('MongoDB reorder folders error:', error);
    res.status(500).json({ error: 'Failed to reorder folders in MongoDB' });
  }
});

// Get folder statistics
app.get('/mongodb/folders/stats', async (req, res) => {
  try {
    console.log('📁 MongoDB: Getting folder statistics');
    
    const stats = await FolderService.getFolderStats();
    
    res.json({ 
      success: true,
      stats
    });
    
  } catch (error) {
    console.error('MongoDB get folder stats error:', error);
    res.status(500).json({ error: 'Failed to get folder statistics from MongoDB' });
  }
});

// Move product to folder
app.put('/mongodb/products/:productId/folder', async (req, res) => {
  try {
    const { productId } = req.params;
    const { folderId } = req.body;
    
    if (!folderId) {
      return res.status(400).json({ error: 'folderId is required' });
    }
    
    console.log(`📦 MongoDB: Moving product ${productId} to folder ${folderId}`);
    
    const product = await FolderService.moveProductToFolder(productId, folderId);
    
    res.json({ 
      success: true,
      product: {
        id: product.productId,
        name: product.name,
        folderId: product.folderId,
        folderName: product.folderName
      },
      message: `Successfully moved product "${product.name}" to folder "${product.folderName}"`
    });
    
  } catch (error) {
    console.error('MongoDB move product to folder error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to move product to folder in MongoDB' });
    }
  }
});

// Get products by folder
app.get('/mongodb/folders/:folderId/products', async (req, res) => {
  try {
    const { folderId } = req.params;
    
    console.log(`📦 MongoDB: Getting products for folder ${folderId}`);
    
    const products = await FolderService.getProductsByFolder(folderId);
    
    const results = products.map(product => ({
      id: product.productId,
      name: product.name,
      price: product.price,
      quantity: product.quantity,
      priceId: product.priceId,
      description: product.description,
      category: product.category,
      folderId: product.folderId,
      folderName: product.folderName,
      _id: product._id
    }));
    
    res.json({ 
      success: true,
      folderId,
      count: results.length,
      products: results
    });
    
  } catch (error) {
    console.error('MongoDB get products by folder error:', error);
    res.status(500).json({ error: 'Failed to get products by folder from MongoDB' });
  }
});

// Initialize default folders
app.post('/mongodb/folders/initialize', async (req, res) => {
  try {
    console.log('📁 MongoDB: Initializing default folders');
    
    const folders = await FolderService.initializeDefaultFolders();
    
    res.json({ 
      success: true,
      count: folders.length,
      folders: folders.map(folder => ({
        id: folder._id,
        name: folder.name,
        description: folder.description,
        color: folder.color,
        icon: folder.icon
      })),
      message: `Successfully initialized ${folders.length} default folders`
    });
    
  } catch (error) {
    console.error('MongoDB initialize folders error:', error);
    res.status(500).json({ error: 'Failed to initialize default folders in MongoDB' });
  }
});

// Sync products with folders
app.post('/mongodb/folders/sync-products', async (req, res) => {
  try {
    console.log('📁 MongoDB: Syncing products with folders');
    
    const result = await FolderService.syncProductsWithFolders();
    
    res.json({ 
      success: true,
      syncedCount: result.syncedCount,
      totalProducts: result.totalProducts,
      message: `Successfully synced ${result.syncedCount} products with folders`
    });
    
  } catch (error) {
    console.error('MongoDB sync products with folders error:', error);
    res.status(500).json({ error: 'Failed to sync products with folders in MongoDB' });
  }
});

// ==================== END FOLDER MANAGEMENT ENDPOINTS ====================

// Initialize/Reset MongoDB inventory with default products
app.post('/mongodb/inventory/initialize', async (req, res) => {
  try {
    console.log('🔄 MongoDB: Manual initialization requested');
    
    const products = await ProductService.initializeDefaultProducts();
    
    res.json({ 
      success: true,
      count: products.length,
      message: `Successfully initialized MongoDB inventory with ${products.length} products`,
      products: products.map(p => ({ name: p.name, price: p.formattedPrice, quantity: p.quantity }))
    });
    
  } catch (error) {
    console.error('MongoDB initialization error:', error);
    res.status(500).json({ error: 'Failed to initialize MongoDB inventory' });
  }
});

// =====================================
// MONGODB SYNC ENDPOINTS
// =====================================

// MongoDB sync endpoint - synchronizes data within MongoDB
app.post('/mongodb/sync', async (req, res) => {
  try {
    console.log('🔄 MongoDB sync requested - refreshing product data...');
    
    // Get all products from MongoDB
    const products = await ProductService.getAllProducts();
    
    // Update lastSynced timestamp for all products
    const updatedCount = await Product.updateMany(
      { isActive: true },
      { 
        lastSynced: new Date(),
        updatedAt: new Date()
      }
    );

    console.log(`✅ MongoDB sync completed - refreshed ${products.length} products`);
    
    res.json({
      success: true,
      message: `Successfully synchronized ${products.length} products in MongoDB`,
      products: products.length,
      lastSync: new Date().toISOString(),
      updatedProducts: updatedCount.modifiedCount
    });
  } catch (error) {
    console.error('❌ MongoDB sync failed:', error);
    res.status(500).json({
      error: 'MongoDB sync failed',
      details: error.message,
      suggestion: 'Check MongoDB connection and try again'
    });
  }
});

// MongoDB sync status endpoint
app.get('/mongodb/sync/status', async (req, res) => {
  try {
    // Get the most recent sync time from any product
    const latestProduct = await Product.findOne(
      { isActive: true },
      {},
      { sort: { lastSynced: -1 } }
    );
    
    // Get total product count
    const totalProducts = await Product.countDocuments({ isActive: true });
    
    res.json({
      lastSync: latestProduct?.lastSynced?.toISOString() || null,
      totalProducts: totalProducts,
      syncActive: true, // MongoDB is always "active"
      syncType: 'mongodb',
      databaseStatus: 'connected'
    });
  } catch (error) {
    console.error('❌ Failed to get MongoDB sync status:', error);
    res.status(500).json({
      error: 'Failed to get sync status',
      details: error.message
    });
  }
});

// MongoDB full refresh endpoint - rebuilds indexes and optimizes data
app.post('/mongodb/full-sync', async (req, res) => {
  try {
    console.log('🔄 MongoDB full sync requested - rebuilding indexes and optimizing...');
    
    // Get all products
    const products = await ProductService.getAllProducts();
    
    // Update all products with fresh timestamps and ensure data consistency
    const bulkOps = products.map(product => ({
      updateOne: {
        filter: { _id: product._id },
        update: {
          $set: {
            lastSynced: new Date(),
            updatedAt: new Date(),
            // Ensure required fields have proper defaults
            isActive: product.isActive !== false,
            availableInStore: product.availableInStore !== false,
            quantity: Math.max(0, product.quantity || 0),
            price: Math.max(0, product.price || 0)
          }
        }
      }
    }));

    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps);
    }

    console.log(`✅ MongoDB full sync completed - optimized ${products.length} products`);
    
    res.json({
      success: true,
      message: `Full synchronization completed for ${products.length} products`,
      products: products.length,
      lastSync: new Date().toISOString(),
      operations: bulkOps.length,
      optimized: true
    });
  } catch (error) {
    console.error('❌ MongoDB full sync failed:', error);
    res.status(500).json({
      error: 'MongoDB full sync failed',
      details: error.message,
      suggestion: 'Check MongoDB connection and data integrity'
    });
  }
});

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

// Debug endpoint to see raw GHL API response
app.get('/debug/ghl-raw', async (req, res) => {
  try {
    const token = await getValidAccessToken();
    console.log('🔍 Fetching raw GHL API response for debugging...');
    
    const apiUrl = `${BASE_URL}/products/?locationId=${LOCATION_ID}`;
    const response = await axios.get(apiUrl, {
      headers: { 
        Authorization: `Bearer ${token}`, 
        'Version': '2021-04-15',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    res.json({
      success: true,
      rawResponse: response.data,
      firstProduct: response.data.products?.[0] || response.data.data?.[0] || response.data[0] || null
    });
  } catch (error) {
    console.error('❌ Failed to fetch raw GHL data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// Debug endpoint to get individual product with all possible details
app.get('/debug/ghl-single-product/:productId', async (req, res) => {
  try {
    const token = await getValidAccessToken();
    const productId = req.params.productId;
    console.log(`🔍 Getting full details for product ${productId}...`);
    
    const endpoints = [
      `${BASE_URL}/products/${productId}?locationId=${LOCATION_ID}`,
      `${BASE_URL}/products/${productId}?locationId=${LOCATION_ID}&expand=all`,
      `${BASE_URL}/products/${productId}?locationId=${LOCATION_ID}&include=prices,inventory,stock`,
      `${BASE_URL}/products/${productId}/details?locationId=${LOCATION_ID}`,
      `${BASE_URL}/products/${productId}/pricing?locationId=${LOCATION_ID}`,
      `${BASE_URL}/products/${productId}/stock?locationId=${LOCATION_ID}`,
    ];

    const results = {};
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Testing: ${endpoint}`);
        const response = await axios.get(endpoint, {
          headers: { 
            Authorization: `Bearer ${token}`, 
            'Version': '2021-04-15',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });
        
        results[endpoint] = { 
          success: true, 
          dataKeys: Object.keys(response.data),
          allProperties: Object.keys(response.data).concat(
            response.data.product ? Object.keys(response.data.product) : []
          ),
          rawData: response.data
        };
        console.log(`✅ ${endpoint} - SUCCESS`);
      } catch (error) {
        results[endpoint] = { 
          success: false, 
          error: error.response?.status || error.message,
          details: error.response?.data
        };
        console.log(`❌ ${endpoint} - FAILED: ${error.response?.status}`);
      }
    }

    res.json({
      success: true,
      productId,
      results,
      workingEndpoints: Object.keys(results).filter(k => results[k].success)
    });
  } catch (error) {
    console.error('❌ Failed to get product details:', error);
    res.status(500).json({
      success: false,
      error: error.message
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

app.listen(PORT, async () => {
  console.log(`🟢 Backend listening on port ${PORT}`);
  console.log('🔧 Environment:', process.env.NODE_ENV || 'development');
  console.log('📍 GHL Location ID:', LOCATION_ID || 'Not configured');
  
  // Initialize enhanced token management first
  if (CLIENT_ID && CLIENT_SECRET && LOCATION_ID) {
    console.log('🔧 Initializing enhanced token management...');
    const tokenManagementReady = await initializeTokenManagement();
    
    if (tokenManagementReady) {
      console.log('🚀 Starting automatic product synchronization...');
      startProductSync();
    } else {
      console.log('⚠️ Token management initialization failed');
      console.log('👉 Visit http://localhost:5000/auth to authorize and enable auto-sync');
      
      // Still try to start basic sync (will handle token errors gracefully)
      setTimeout(() => {
        console.log('🔄 Attempting to start sync service anyway...');
        startProductSync();
      }, 5000);
    }
  } else {
    console.log('⚠️ GHL credentials missing - sync service disabled');
    console.log('💡 Configure GHL_CLIENT_ID, GHL_CLIENT_SECRET, and GHL_LOCATION_ID to enable auto-sync');
  }
  
  // Graceful shutdown handling
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    // Clean up intervals
    if (syncInterval) {
      clearInterval(syncInterval);
      console.log('✅ Sync service stopped');
    }
    if (tokenRefreshInterval) {
      clearTimeout(tokenRefreshInterval);
      console.log('✅ Token refresh scheduler stopped');
    }
    if (tokenHealthCheckInterval) {
      clearInterval(tokenHealthCheckInterval);
      console.log('✅ Token health monitoring stopped');
    }
    
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    
    // Clean up intervals
    if (syncInterval) {
      clearInterval(syncInterval);
      console.log('✅ Sync service stopped');
    }
    if (tokenRefreshInterval) {
      clearTimeout(tokenRefreshInterval);
      console.log('✅ Token refresh scheduler stopped');
    }
    if (tokenHealthCheckInterval) {
      clearInterval(tokenHealthCheckInterval);
      console.log('✅ Token health monitoring stopped');
    }
    
    process.exit(0);
  });
});