const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const BASE_URL = 'https://services.leadconnectorhq.com';
const CLIENT_ID = process.env.GHL_CLIENT_ID;
const CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;

const items = [
  // Existing products
  { name: '250 ml Bottled Water', price: 1, quantity: 20 },
  { name: '250ml Pop Top - Apple & Blackcurrant', price: 2.5, quantity: 20 },
  { name: '250ml Pop Top - Apple', price: 2.5, quantity: 20 },
  { name: '250ml Soft Drink Can - Sprite', price: 2, quantity: 20 },
  { name: '250ml Soft Drink Can - Coke', price: 2, quantity: 20 },
  { name: '250ml Soft Drink Can - Coke Zero', price: 2, quantity: 20 },
  { name: '250ml Soft Drink Can - Fanta', price: 2, quantity: 20 },
  { name: 'Slushie 12 oz - Coke', price: 2.5, quantity: 20 },
  { name: 'Slushie 12 oz - Berry Blast', price: 2.5, quantity: 20 },
  { name: 'Slushie 12 oz - Mixed', price: 2.5, quantity: 20 },
  { name: 'Slushie 16 oz - Coke', price: 4.5, quantity: 20 },
  { name: 'Slushie 16 oz - Berry Blast', price: 4.5, quantity: 20 },
  { name: 'Slushie 16 oz - Mixed', price: 4.5, quantity: 20 },
  
  // Walk-in Passes - Full Price
  { name: 'Walk-in Pass - Adult (Full Price)', price: 15, quantity: 100 },
  { name: 'Walk-in Pass - Child (Full Price)', price: 10, quantity: 100 },
  { name: 'Walk-in Pass - Senior (Full Price)', price: 12, quantity: 100 },
  { name: 'Walk-in Pass - Student (Full Price)', price: 12, quantity: 100 },
  { name: 'Walk-in Pass - Family (2 Adults + 2 Kids)', price: 45, quantity: 50 },
  
  // Walk-in Passes - Half Price
  { name: 'Walk-in Pass - Adult (Half Price)', price: 7.5, quantity: 100 },
  { name: 'Walk-in Pass - Child (Half Price)', price: 5, quantity: 100 },
  { name: 'Walk-in Pass - Senior (Half Price)', price: 6, quantity: 100 },
  { name: 'Walk-in Pass - Student (Half Price)', price: 6, quantity: 100 },
  { name: 'Walk-in Pass - Family (Half Price)', price: 22.5, quantity: 50 },
  
  // Walk-in Passes - Staff Discount (10% off full price)
  { name: 'Walk-in Pass - Adult (Staff Discount)', price: 13.5, quantity: 100 },
  { name: 'Walk-in Pass - Child (Staff Discount)', price: 9, quantity: 100 },
  { name: 'Walk-in Pass - Senior (Staff Discount)', price: 10.8, quantity: 100 },
  { name: 'Walk-in Pass - Student (Staff Discount)', price: 10.8, quantity: 100 },
  { name: 'Walk-in Pass - Family (Staff Discount)', price: 40.5, quantity: 50 },
  
  // Day Passes
  { name: 'Day Pass - Adult', price: 25, quantity: 50 },
  { name: 'Day Pass - Child', price: 15, quantity: 50 },
  { name: 'Day Pass - Senior/Student', price: 20, quantity: 50 },
  
  // Special Event Passes
  { name: 'Special Event - Adult', price: 20, quantity: 30 },
  { name: 'Special Event - Child', price: 12, quantity: 30 },
  { name: 'Special Event - Family Package', price: 55, quantity: 20 },
];

function getAccessToken() {
  const tokens = JSON.parse(fs.readFileSync('backend/tokens.json', 'utf8'));
  return tokens.access_token;
}

function saveTokens(tokenData) {
  fs.writeFileSync('backend/tokens.json', JSON.stringify(tokenData, null, 2));
}

async function refreshAccessToken() {
  try {
    const tokens = JSON.parse(fs.readFileSync('backend/tokens.json', 'utf8'));
    const qs = require('qs');
    
    const response = await axios.post(`${BASE_URL}/oauth/token`, 
      qs.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    saveTokens(response.data);
    console.log('🔄 Tokens refreshed successfully');
    return response.data.access_token;
  } catch (error) {
    console.error('❌ Token refresh failed:', error.response?.data || error.message);
    console.log('Please re-authorize by visiting: http://localhost:5000/oauth');
    throw error;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createProduct(item) {
  let token = getAccessToken();
  
  try {
    const productResponse = await axios.post(`${BASE_URL}/products/`, {
      name: item.name,
      description: `Product: ${item.name}`,
      locationId: 'HlcwWUlcKeVL75aGRRS9',
      availableInStore: true,
      productType: 'PHYSICAL',
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        version: '2021-07-28'
      }
    });

    const productId = productResponse.data._id;

    const priceResponse = await axios.post(`${BASE_URL}/products/${productId}/price`, {
      product: productId,
      locationId: 'HlcwWUlcKeVL75aGRRS9',
      name: item.name,
      type: 'one_time',
      currency: 'AUD',
      amount: item.price,
      description: item.name,
      sku: item.name.replace(/\s/g, '-').toLowerCase(),
      isDigitalProduct: false,
      trackInventory: true,
      availableQuantity: item.quantity,
      allowOutOfStockPurchases: false
    }, {
      headers: { Authorization: `Bearer ${token}`, version: '2021-07-28' }
    });

    const priceId = priceResponse.data._id;
    console.log(`✅ Created: ${item.name} - Product ID: ${productId}, Price ID: ${priceId}`);
    return { name: item.name, productId, priceId, price: item.price };
    
  } catch (error) {
    // If token is invalid, try refreshing and retry once
    if (error.response?.status === 401) {
      console.log(`🔄 Token expired for ${item.name}, refreshing...`);
      try {
        token = await refreshAccessToken();
        
        // Retry with new token
        const productResponse = await axios.post(`${BASE_URL}/products/`, {
          name: item.name,
          description: `Product: ${item.name}`,
          locationId: 'HlcwWUlcKeVL75aGRRS9',
          availableInStore: true,
          productType: 'PHYSICAL',
        }, {
          headers: {
            Authorization: `Bearer ${token}`,
            version: '2021-07-28'
          }
        });

        const productId = productResponse.data._id;

        const priceResponse = await axios.post(`${BASE_URL}/products/${productId}/price`, {
          product: productId,
          locationId: 'HlcwWUlcKeVL75aGRRS9',
          name: item.name,
          type: 'one_time',
          currency: 'AUD',
          amount: item.price,
          description: item.name,
          sku: item.name.replace(/\s/g, '-').toLowerCase(),
          isDigitalProduct: false,
          trackInventory: true,
          availableQuantity: item.quantity,
          allowOutOfStockPurchases: false
        }, {
          headers: { Authorization: `Bearer ${token}`, version: '2021-07-28' }
        });

        const priceId = priceResponse.data._id;
        console.log(`✅ Created: ${item.name} - Product ID: ${productId}, Price ID: ${priceId} (after refresh)`);
        return { name: item.name, productId, priceId, price: item.price };
        
      } catch (refreshError) {
        console.error(`❌ Failed to create ${item.name} even after token refresh:`, refreshError.response?.data || refreshError.message);
      }
    } else {
      console.error(`❌ Error creating ${item.name}:`, error.response?.data || error.message);
    }
  }
}

async function main() {
  const createdItems = [];
  for (const item of items) {
    const result = await createProduct(item);
    if (result) createdItems.push(result);
    await delay(2000); // 2-second delay to avoid rate limits
  }
  fs.writeFileSync('ghl-items.json', JSON.stringify(createdItems, null, 2));
  console.log('All items added. IDs saved to ghl-items.json');
}

main();