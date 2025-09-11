const axios = require('axios');

const BACKEND_URL = 'http://localhost:5000';

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

async function addDayPasses() {
  console.log('🎫 Adding Day Pass products to MongoDB database...\n');
  
  try {
    for (let i = 0; i < dayPassProducts.length; i++) {
      const product = dayPassProducts[i];
      console.log(`📝 Adding: ${product.name} - $${product.price}`);
      
      try {
        const response = await axios.post(`${BACKEND_URL}/mongodb/inventory/add-product`, product);
        
        if (response.data && response.data.success) {
          console.log(`✅ Successfully added: ${product.name}`);
        } else {
          console.log(`❌ Failed to add: ${product.name}`);
        }
      } catch (error) {
        if (error.response && error.response.status === 400 && error.response.data.error.includes('already exists')) {
          console.log(`⚠️  Already exists: ${product.name}`);
        } else {
          console.log(`❌ Error adding ${product.name}:`, error.response?.data?.error || error.message);
        }
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n🎉 Day Pass products addition completed!');
    console.log('\n📋 Summary:');
    dayPassProducts.forEach(product => {
      console.log(`   • ${product.name}: $${product.price}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to add day passes:', error.message);
  }
}

// Run the script
addDayPasses();
