const mongoose = require('mongoose');
require('dotenv').config();

// Import Product Service and Model
const ProductService = require('./services/ProductService');
const Product = require('./models/Product');

async function resetAndInitializeInventory() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🗑️ Clearing existing inventory...');
    const deleteResult = await Product.deleteMany({});
    console.log(`🧹 Deleted ${deleteResult.deletedCount} existing products`);

    console.log('\n🚀 Creating fresh inventory with all 17 products...');
    
    const defaultProducts = [
      {
        name: '250ml Soft Drink Can - Coke Zero',
        price: 2.00,
        quantity: 20,
        description: 'Refreshing zero-calorie cola drink',
        category: 'Beverages'
      },
      {
        name: 'Slushie 12 oz - Coke',
        price: 2.50,
        quantity: 20,
        description: 'Frozen coke slushie, 12 oz size',
        category: 'Frozen Drinks'
      },
      {
        name: 'Slushie 12 oz - Berry Blast',
        price: 2.50,
        quantity: 20,
        description: 'Frozen berry flavored slushie, 12 oz size',
        category: 'Frozen Drinks'
      },
      {
        name: 'Slushie 12 oz - Mixed',
        price: 2.50,
        quantity: 20,
        description: 'Mixed flavor frozen slushie, 12 oz size',
        category: 'Frozen Drinks'
      },
      {
        name: 'Slushie 16 oz - Coke',
        price: 4.50,
        quantity: 20,
        description: 'Frozen coke slushie, 16 oz size',
        category: 'Frozen Drinks'
      },
      {
        name: 'Slushie 16 oz - Berry Blast',
        price: 4.50,
        quantity: 20,
        description: 'Frozen berry flavored slushie, 16 oz size',
        category: 'Frozen Drinks'
      },
      {
        name: 'Slushie 16 oz - Mixed',
        price: 4.50,
        quantity: 20,
        description: 'Mixed flavor frozen slushie, 16 oz size',
        category: 'Frozen Drinks'
      },
      {
        name: '250ml Soft Drink Can - Fanta',
        price: 2.00,
        quantity: 20,
        description: 'Orange flavored soft drink',
        category: 'Beverages'
      },
      {
        name: '250ml Soft Drink Can - Coke',
        price: 2.00,
        quantity: 20,
        description: 'Classic coca-cola soft drink',
        category: 'Beverages'
      },
      {
        name: '250ml Soft Drink Can - Sprite',
        price: 2.00,
        quantity: 20,
        description: 'Lemon-lime flavored soft drink',
        category: 'Beverages'
      },
      {
        name: '250ml Pop Top - Apple',
        price: 2.50,
        quantity: 20,
        description: 'Apple juice with pop top lid',
        category: 'Juices'
      },
      {
        name: '250ml Pop Top - Apple & Blackcurrant',
        price: 2.50,
        quantity: 20,
        description: 'Apple and blackcurrant juice with pop top lid',
        category: 'Juices'
      },
      {
        name: '250ml Bottled Water',
        price: 1.00,
        quantity: 20,
        description: 'Pure bottled water',
        category: 'Water'
      },
      {
        name: 'South Ripley',
        price: 0.00,
        quantity: 20,
        description: 'South Ripley location service',
        category: 'Services',
        productType: 'SERVICE'
      },
      {
        name: 'The Heights Estate in Pimpama',
        price: 0.00,
        quantity: 20,
        description: 'The Heights Estate in Pimpama location service',
        category: 'Services',
        productType: 'SERVICE'
      },
      {
        name: 'YM Community NDIS Housing',
        price: 0.00,
        quantity: 20,
        description: 'YM Community NDIS Housing service',
        category: 'Services',
        productType: 'SERVICE'
      },
      {
        name: 'Board Room Booking',
        price: 0.00,
        quantity: 20,
        description: 'Board room booking service with multiple pricing options',
        category: 'Services',
        productType: 'DIGITAL'
      }
    ];

    const createdProducts = [];
    for (let i = 0; i < defaultProducts.length; i++) {
      const productData = defaultProducts[i];
      const timestamp = Date.now();
      const productId = `mongodb-product-${timestamp}-${i}`;
      const priceId = `mongodb-price-${timestamp}-${i}`;

      const product = new Product({
        ...productData,
        productId,
        priceId,
        source: 'mongodb',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSyncAt: new Date(),
        metadata: {
          mongoInitialized: true,
          initializationDate: new Date()
        }
      });

      const savedProduct = await product.save();
      createdProducts.push(savedProduct);
      
      console.log(`✅ Created: ${savedProduct.name} - ${savedProduct.formattedPrice}`);
    }

    console.log('\n📊 Inventory Reset & Initialization Summary:');
    console.log('==========================================');
    
    createdProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} - ${product.formattedPrice} (Qty: ${product.quantity}) [${product.category}]`);
    });

    console.log(`\n✅ Successfully created ${createdProducts.length} products!`);
    
    // Show categories
    const categories = [...new Set(createdProducts.map(p => p.category).filter(c => c))];
    console.log(`📂 Categories: ${categories.join(', ')}`);
    
    // Show total inventory value
    const totalValue = createdProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0);
    console.log(`💎 Total inventory value: AU$${totalValue.toFixed(2)}`);
    
    console.log('\n🎉 Database reset and initialization completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during reset and initialization:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  resetAndInitializeInventory();
}

module.exports = { resetAndInitializeInventory };
