const mongoose = require('mongoose');
require('dotenv').config();

// Import Product Service and Model
const Product = require('./models/Product');

async function cleanDatabase() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Checking database indexes...');
    const collection = mongoose.connection.db.collection('products');
    const indexes = await collection.indexes();
    
    console.log('📋 Current indexes:');
    indexes.forEach((index, i) => {
      console.log(`${i + 1}. ${JSON.stringify(index.key)} - Name: ${index.name}`);
    });

    console.log('\n🧹 Dropping problematic ghlProductId index if it exists...');
    try {
      await collection.dropIndex('ghlProductId_1');
      console.log('✅ Successfully dropped ghlProductId_1 index');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ️ ghlProductId_1 index does not exist');
      } else {
        console.log('⚠️ Error dropping index:', error.message);
      }
    }

    console.log('\n🗑️ Clearing all existing products...');
    const deleteResult = await Product.deleteMany({});
    console.log(`🧹 Deleted ${deleteResult.deletedCount} existing products`);

    console.log('\n✅ Database cleaned successfully!');
    
  } catch (error) {
    console.error('❌ Error during database cleanup:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  cleanDatabase();
}

module.exports = { cleanDatabase };
