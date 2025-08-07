const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'https://services.leadconnectorhq.com';

const items = [
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
];

function getAccessToken() {
  const tokens = JSON.parse(fs.readFileSync('backend/tokens.json', 'utf8'));
  return tokens.access_token; // Note: No refresh here for simplicity; if expired, reauthorize or add refresh logic
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createProduct(item) {
  try {
    const token = getAccessToken();
    const productResponse = await axios.post(`${BASE_URL}/products/`, {
      name: item.name,
      description: `Product: ${item.name}`,
      locationId: 'HlcwWUlcKeVL75aGRRS9',
      availableInStore: true,
      productType: 'PHYSICAL',
      // Keep as featured image; medias removed to avoid potential validation issues
      // "medias": [
      //   {
      //     "id": "12345000",
      //     "title": "",
      //     "url": "https://storage.googleapis.com/msgsndr/HlcwWUlcKeVL75aGRRS9/media/684aeb6cd5c55773d1684d26.svg",
      //     "type": "",
      //     "isFeatured": true,
      //     "priceIds": [""]
      //   }
      // ]
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        version: '2021-07-28'
      }
    });
    // console.log(productResponse)
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

    console.log(`Created: ${item.name} - Product ID: ${productId}, Price ID: ${priceId}`);

    return { name: item.name, productId, priceId, price: item.price };
  } catch (error) {
    console.error(`Error creating ${item.name}:`, error.response ? error.response.data : error.message);
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