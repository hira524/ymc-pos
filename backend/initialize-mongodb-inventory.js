const mongoose = require('mongoose');
require('dotenv').config();

// Import Product Service
const ProductService = require('./services/ProductService');

async function initializeInventory() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('🗄️ Initializing inventory with default products...');
    const products = await ProductService.initializeDefaultProducts();

    console.log('\n📊 Inventory Initialization Summary:');
    console.log('=====================================');
    
    products.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} - ${product.formattedPrice} (Qty: ${product.quantity}) [${product.category}]`);
    });

    console.log('\n✅ MongoDB inventory initialization completed successfully!');
    console.log(`📦 Total products: ${products.length}`);
    
    // Test fetching inventory
    console.log('\n🔍 Testing inventory retrieval...');
    const allProducts = await ProductService.getAllProducts();
    console.log(`📋 Retrieved ${allProducts.length} products from MongoDB`);
    
    // Show categories
    const categories = [...new Set(allProducts.map(p => p.category).filter(c => c))];
    console.log(`📂 Categories: ${categories.join(', ')}`);
    
    console.log('\n🎉 Initialization and testing completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during initialization:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  initializeInventory();
}

module.exports = { initializeInventory };
