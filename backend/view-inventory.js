const mongoose = require('mongoose');
require('dotenv').config();

// Import Product Service
const ProductService = require('./services/ProductService');

async function viewInventory() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n📋 Current Inventory:');
    console.log('=====================');
    
    const products = await ProductService.getAllProducts();
    
    if (products.length === 0) {
      console.log('📦 No products found in inventory');
    } else {
      products.forEach((product, index) => {
        console.log(`${index + 1}. ${product.name}`);
        console.log(`   💰 Price: ${product.formattedPrice}`);
        console.log(`   📦 Quantity: ${product.quantity}`);
        console.log(`   🏷️ Category: ${product.category || 'Uncategorized'}`);
        console.log(`   🆔 ID: ${product.productId || product._id}`);
        console.log('   ---');
      });
      
      console.log(`\n📊 Total products: ${products.length}`);
      
      // Show categories
      const categories = [...new Set(products.map(p => p.category).filter(c => c))];
      console.log(`📂 Categories: ${categories.join(', ')}`);
      
      // Show total inventory value
      const totalValue = products.reduce((sum, p) => sum + (p.price * p.quantity), 0);
      console.log(`💎 Total inventory value: AU$${totalValue.toFixed(2)}`);
    }
    
  } catch (error) {
    console.error('❌ Error viewing inventory:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  viewInventory();
}

module.exports = { viewInventory };
