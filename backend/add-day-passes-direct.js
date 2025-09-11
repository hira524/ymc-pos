const mongoose = require('mongoose');
require('dotenv').config();

// Product Schema
const productSchema = new mongoose.Schema({
  productId: { type: String, unique: true, index: true },
  name: { type: String, required: true, unique: true, index: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  description: { type: String, required: true },
  category: { type: String, default: 'General' },
  productType: { type: String, default: 'PHYSICAL' },
  priceId: { type: String },
  formattedPrice: { type: String },
  pricingMethod: { type: String, default: 'Manual' },
  isManual: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

const dayPassProducts = [
  {
    name: 'Day Pass - Entry',
    price: 7.00,
    quantity: 100,
    description: 'Standard entry day pass - $7 per hour',
    category: 'Day Passes',
    productType: 'SERVICE'
  },
  {
    name: 'Day Pass - Students & Pensioners',
    price: 3.00,
    quantity: 100,
    description: 'Discounted day pass for students and pensioners - $3 per hour',
    category: 'Day Passes',
    productType: 'SERVICE'
  },
  {
    name: 'Day Pass - First Guardian',
    price: 2.50,
    quantity: 100,
    description: 'Non-participating first guardian day pass - $2.50',
    category: 'Day Passes',
    productType: 'SERVICE'
  },
  {
    name: 'Day Pass - Second Guardian',
    price: 1.00,
    quantity: 100,
    description: 'Non-participating second guardian day pass - $1.00',
    category: 'Day Passes',
    productType: 'SERVICE'
  },
  {
    name: 'Day Pass - Additional Child',
    price: 3.50,
    quantity: 100,
    description: 'Family entry additional children - $3.50 each',
    category: 'Day Passes',
    productType: 'SERVICE'
  }
];

async function addDayPassesToMongoDB() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('🎫 Adding Day Pass products to MongoDB database...\n');
    
    for (let i = 0; i < dayPassProducts.length; i++) {
      const productData = dayPassProducts[i];
      console.log(`📝 Adding: ${productData.name} - $${productData.price}`);
      
      try {
        // Generate unique product ID
        const productId = `DAY_PASS_${Date.now()}_${i}`;
        
        const newProduct = new Product({
          ...productData,
          productId,
          formattedPrice: `$${productData.price.toFixed(2)}`,
          pricingMethod: 'Manual',
          isManual: true
        });
        
        await newProduct.save();
        console.log(`✅ Successfully added: ${productData.name}`);
        
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⚠️  Already exists: ${productData.name}`);
        } else {
          console.log(`❌ Error adding ${productData.name}:`, error.message);
        }
      }
    }
    
    console.log('\n🎉 Day Pass products addition completed!');
    console.log('\n📋 Summary:');
    dayPassProducts.forEach(product => {
      console.log(`   • ${product.name}: $${product.price}`);
    });
    
    // Get total count
    const totalProducts = await Product.countDocuments();
    console.log(`\n📦 Total products in database: ${totalProducts}`);
    
  } catch (error) {
    console.error('❌ Failed to add day passes:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the script
addDayPassesToMongoDB();
