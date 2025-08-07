// Comprehensive Stripe Terminal Connection Analysis
// This tool will help diagnose exactly why the reader is not connecting

const Stripe = require('stripe');
require('dotenv').config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

async function deepAnalysisReaderConnection() {
  console.log('🔍 DEEP ANALYSIS: Stripe Terminal Reader Connection Issues\n');
  console.log('=' .repeat(80));
  
  try {
    // 1. Verify Stripe Account & Key
    console.log('\n1️⃣ STRIPE ACCOUNT VERIFICATION');
    console.log('-'.repeat(40));
    
    const account = await stripe.accounts.retrieve();
    console.log(`✅ Account ID: ${account.id}`);
    console.log(`✅ Country: ${account.country}`);
    console.log(`✅ Charges Enabled: ${account.charges_enabled}`);
    console.log(`✅ Live Mode: ${!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')}`);
    
    // 2. Test Connection Token Generation
    console.log('\n2️⃣ CONNECTION TOKEN TEST');
    console.log('-'.repeat(40));
    
    try {
      const connectionToken = await stripe.terminal.connectionTokens.create();
      console.log('✅ Connection token generated successfully');
      console.log(`   Token: ${connectionToken.secret.substring(0, 30)}...`);
    } catch (error) {
      console.log('❌ Connection token failed:', error.message);
      return;
    }
    
    // 3. Check Terminal Locations
    console.log('\n3️⃣ TERMINAL LOCATIONS ANALYSIS');
    console.log('-'.repeat(40));
    
    const locations = await stripe.terminal.locations.list({ limit: 10 });
    console.log(`📍 Total locations: ${locations.data.length}`);
    
    if (locations.data.length === 0) {
      console.log('❌ NO LOCATIONS CONFIGURED!');
      console.log('   This is a common cause of reader connection failures.');
      console.log('   Action: Create a location in Stripe Dashboard > Terminal > Locations');
      return;
    }
    
    locations.data.forEach((location, index) => {
      console.log(`   ${index + 1}. ID: ${location.id}`);
      console.log(`      Name: ${location.display_name}`);
      console.log(`      Address: ${location.address.city}, ${location.address.country}`);
      console.log(`      Status: Active`);
    });
    
    // 4. Check Registered Readers
    console.log('\n4️⃣ REGISTERED READERS ANALYSIS');
    console.log('-'.repeat(40));
    
    const readers = await stripe.terminal.readers.list({ limit: 20 });
    console.log(`🖥️  Total registered readers: ${readers.data.length}`);
    
    if (readers.data.length === 0) {
      console.log('❌ NO READERS REGISTERED!');
      console.log('   Physical readers must be registered before they can be discovered.');
      console.log('   Action: Register BBPOS WisePOS in Stripe Dashboard > Terminal > Readers');
      return;
    }
    
    let bbposFound = false;
    readers.data.forEach((reader, index) => {
      console.log(`   ${index + 1}. ${reader.device_type} (${reader.id})`);
      console.log(`      Status: ${reader.status}`);
      console.log(`      Location: ${reader.location || 'No location assigned'}`);
      console.log(`      Serial: ${reader.serial_number || 'N/A'}`);
      console.log(`      Last Seen: ${reader.last_seen_at ? new Date(reader.last_seen_at * 1000).toLocaleString() : 'Never'}`);
      
      if (reader.device_type === 'bbpos_wisepos_e') {
        bbposFound = true;
        if (reader.status === 'online') {
          console.log(`      ✅ BBPOS WisePOS is ONLINE and ready`);
        } else {
          console.log(`      ❌ BBPOS WisePOS is ${reader.status.toUpperCase()}`);
          console.log(`      💡 Check: Power, Wi-Fi connection, network settings`);
        }
      }
      console.log('');
    });
    
    if (!bbposFound) {
      console.log('❌ BBPOS WisePOS NOT FOUND in registered readers!');
      console.log('   This explains why discovery fails.');
    }
    
    // 5. Test Payment Intent Creation
    console.log('\n5️⃣ PAYMENT INTENT TEST (AUD Currency)');
    console.log('-'.repeat(40));
    
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 100, // $1.00 AUD
        currency: 'aud',
        payment_method_types: ['card_present'],
        capture_method: 'automatic'
      });
      console.log('✅ Payment intent created successfully (AUD)');
      console.log(`   ID: ${paymentIntent.id}`);
      console.log(`   Amount: $${(paymentIntent.amount / 100).toFixed(2)} AUD`);
    } catch (error) {
      console.log('❌ Payment intent creation failed:', error.message);
      if (error.message.includes('card_present')) {
        console.log('   This suggests Terminal is not properly configured for your country');
      }
    }
    
    // 6. Network Connectivity Analysis
    console.log('\n6️⃣ NETWORK CONNECTIVITY INSIGHTS');
    console.log('-'.repeat(40));
    
    console.log('🌐 For physical reader discovery to work:');
    console.log('   ✓ Reader and computer must be on the SAME Wi-Fi network');
    console.log('   ✓ No VPN connections should be active');
    console.log('   ✓ Firewall should allow local network discovery');
    console.log('   ✓ Router should allow device-to-device communication');
    
    // 7. Common Error Analysis
    console.log('\n7️⃣ COMMON ERROR SCENARIOS');
    console.log('-'.repeat(40));
    
    console.log('🔍 "No Stripe reader connected" typically means:');
    console.log('   1. Reader discovery failed (no readers found on network)');
    console.log('   2. Reader connection failed (found but can\'t connect)');
    console.log('   3. Reader not registered in Stripe account');
    
    console.log('\n🔍 "Could not communicate with the Reader" typically means:');
    console.log('   1. Network connectivity issues (different networks)');
    console.log('   2. Reader is offline or powered off');
    console.log('   3. Firewall blocking communication');
    console.log('   4. Reader firmware needs updating');
    
    // 8. Recommended Actions
    console.log('\n8️⃣ RECOMMENDED TROUBLESHOOTING STEPS');
    console.log('-'.repeat(40));
    
    console.log('📋 IMMEDIATE ACTIONS:');
    console.log('   1. Verify BBPOS WisePOS shows "Online" status in Stripe Dashboard');
    console.log('   2. Ensure reader and computer are on same Wi-Fi network');
    console.log('   3. Check Windows Firewall settings');
    console.log('   4. Try disabling VPN if active');
    console.log('   5. Restart the BBPOS reader');
    console.log('   6. Update reader firmware if available');
    
    console.log('\n📋 IF STILL FAILING:');
    console.log('   1. Enable simulated mode for testing: simulated: true');
    console.log('   2. Use test keys instead of live keys for simulation');
    console.log('   3. Test payment flow with simulated reader first');
    console.log('   4. Contact Stripe support for hardware-specific issues');
    
  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    
    if (error.type === 'StripeAuthenticationError') {
      console.log('\n🔑 AUTHENTICATION ISSUE:');
      console.log('   - Verify Stripe secret key is correct');
      console.log('   - Check if key has Terminal permissions');
      console.log('   - Ensure account is not restricted');
    }
  }
  
  console.log('\n' + '=' .repeat(80));
  console.log('🏁 ANALYSIS COMPLETE');
  console.log('=' .repeat(80));
}

// Run the analysis
deepAnalysisReaderConnection().catch(console.error);
