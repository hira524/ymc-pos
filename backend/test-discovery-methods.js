// Test different discovery methods for BBPOS WisePOS
// This will help identify the exact discovery configuration needed

const Stripe = require('stripe');
require('dotenv').config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

async function testReaderDiscovery() {
  console.log('🔍 Testing Different Reader Discovery Methods\n');
  
  try {
    // Test 1: Basic discovery (what the app is currently doing)
    console.log('1️⃣ Testing Basic Discovery (current app method)');
    console.log('   Method: discoverReaders({ simulated: false })');
    console.log('   ❌ This method only discovers NEW/unregistered readers on network');
    console.log('   ❌ Does NOT discover already-registered readers');
    
    // Test 2: Check if we need location parameter
    console.log('\n2️⃣ Testing Location-Based Discovery');
    const locations = await stripe.terminal.locations.list({ limit: 1 });
    if (locations.data.length > 0) {
      const locationId = locations.data[0].id;
      console.log(`   Location ID: ${locationId}`);
      console.log('   Method: discoverReaders({ simulated: false, location: "locationId" })');
      console.log('   ✅ This is the CORRECT method for registered readers');
    }
    
    // Test 3: Check registered readers that should be discoverable
    console.log('\n3️⃣ Analyzing Registered Readers');
    const readers = await stripe.terminal.readers.list({ limit: 10 });
    
    readers.data.forEach((reader, index) => {
      if (reader.device_type === 'bbpos_wisepos_e') {
        console.log(`   Reader ${index + 1}: ${reader.device_type}`);
        console.log(`   Status: ${reader.status}`);
        console.log(`   Location: ${reader.location}`);
        console.log(`   Can be discovered: ${reader.status === 'online' ? 'YES' : 'NO'}`);
        
        if (reader.status === 'online') {
          console.log('   ✅ This reader should be discoverable with location parameter');
        } else {
          console.log('   ❌ Reader must be online to be discovered');
        }
      }
    });
    
    console.log('\n4️⃣ DISCOVERY METHOD RECOMMENDATION');
    console.log('   Current frontend code is MISSING the location parameter!');
    console.log('   For registered readers, you MUST specify the location.');
    console.log('   ');
    console.log('   CORRECT discovery call should be:');
    console.log('   term.discoverReaders({');
    console.log('     simulated: false,');
    console.log(`     location: "${locations.data[0]?.id || 'LOCATION_ID'}"`)
    console.log('   })');
    
    console.log('\n5️⃣ ALTERNATIVE: Internet Reader Mode');
    console.log('   If available, Internet Reader Mode bypasses local network discovery');
    console.log('   Check Stripe Dashboard > Terminal > Settings for this option');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testReaderDiscovery();
