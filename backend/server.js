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
  
  // Check if we're using local inventory file
  const ghlItemsPath = path.join(__dirname, 'ghl-items.json');
  const useLocalInventory = fs.existsSync(ghlItemsPath);
  
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
          const oldQty = ghlItem.quantity || 20; // Default quantity if not set
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
  
  // Fall back to GHL API update
  let token;
  try {
    token = await getAccessToken();
  } catch (tokenError) {
    console.error('❌ Token error:', tokenError.message);
    return res.status(401).json({ error: 'GHL authentication failed', needsAuth: true });
  }
  
  try {
    const lowStockItems = [];
    
    for (const item of cart) {
      console.log(`🔍 Processing GHL item: ${item.name} (ID: ${item.id}, PriceID: ${item.priceId}, Qty: ${item.quantity})`);
      
      if (!item.id || !item.priceId) {
        console.error(`❌ Missing required fields for item: ${item.name}`, { id: item.id, priceId: item.priceId });
        continue;
      }
      const priceResp = await axios.get(`${BASE_URL}/products/${item.id}/prices/${item.priceId}`, {
        headers: { Authorization: `Bearer ${token}`, 'Version': '2021-04-15' }
      });
      
      console.log(`📊 Current GHL stock for ${item.name}: ${priceResp.data.availableQuantity}`);
      const newQty = priceResp.data.availableQuantity - item.quantity;
      console.log(`📊 New GHL stock for ${item.name}: ${newQty} (reduced by ${item.quantity})`);
      
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
      
      console.log(`📦 Updated GHL ${item.name}: ${priceResp.data.availableQuantity} → ${newQty} units`);
    }

    // Send low stock alerts for items that need them
    for (const lowStockItem of lowStockItems) {
      await sendLowStockAlert(lowStockItem.name, lowStockItem.quantity, lowStockItem.threshold);
    }

    res.json({ 
      success: true, 
      method: 'ghl',
      lowStockAlerts: lowStockItems.length,
      message: lowStockItems.length > 0 ? 
        `GHL inventory updated. ${lowStockItems.length} low stock alert(s) sent.` : 
        'GHL inventory updated successfully.'
    });
  } catch (err) {
    console.error('GHL Update-inventory failed:', err.response?.data || err.message, err.stack);
    if (err.response?.status === 401) {
      try {
        token = await refreshAccessToken();
        const lowStockItems = []; // Track items that need alerts
        
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

          // Check if stock is low and needs alert
          const LOW_STOCK_THRESHOLD = 20;
          if (newQty <= LOW_STOCK_THRESHOLD && newQty > 0) {
            lowStockItems.push({
              name: item.name,
              quantity: newQty,
              threshold: LOW_STOCK_THRESHOLD
            });
          }
        }

        // Send low stock alerts for items that need them
        for (const lowStockItem of lowStockItems) {
          await sendLowStockAlert(lowStockItem.name, lowStockItem.quantity, lowStockItem.threshold);
        }

        return res.json({ 
          success: true, 
          lowStockAlerts: lowStockItems.length,
          message: lowStockItems.length > 0 ? 
            `Inventory updated. ${lowStockItems.length} low stock alert(s) sent.` : 
            'Inventory updated successfully.'
        });
      } catch (_) {
        console.error('Refresh+update failed');
      }
    }
    res.status(500).json({ error: err.response?.data || err.message });
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

app.listen(PORT, () => console.log(`🟢 Backend listening on port ${PORT}`));