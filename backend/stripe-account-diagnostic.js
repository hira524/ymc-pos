// Stripe Account Diagnostic Tool
// Run this to check if the client's Stripe account is properly configured for Terminal

const Stripe = require('stripe');
require('dotenv').config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

async function diagnosticStripeAccount() {
  console.log('🔍 Running Stripe Account Diagnostic...\n');
  
  try {
    // 1. Check account capabilities
    console.log('1️⃣ Checking Account Information...');
    const account = await stripe.accounts.retrieve();
    console.log(`   Account ID: ${account.id}`);
    console.log(`   Country: ${account.country}`);
    console.log(`   Business Type: ${account.business_type || 'Not specified'}`);
    console.log(`   Charges Enabled: ${account.charges_enabled}`);
    console.log(`   Payouts Enabled: ${account.payouts_enabled}`);
    console.log(`   Details Submitted: ${account.details_submitted}`);
    
    // 2. Check Terminal capabilities
    console.log('\n2️⃣ Checking Terminal Capabilities...');
    try {
      // Try to create a connection token - this will fail if Terminal isn't enabled
      const connectionToken = await stripe.terminal.connectionTokens.create();
      console.log('   ✅ Terminal is enabled and working');
      console.log(`   Connection Token: ${connectionToken.secret.substring(0, 20)}...`);
    } catch (error) {
      console.log('   ❌ Terminal Error:', error.message);
      if (error.message.includes('not enabled')) {
        console.log('   📝 Action Required: Enable Terminal in Stripe Dashboard');
      }
    }
    
    // 3. Check payment methods and capabilities
    console.log('\n3️⃣ Checking Payment Capabilities...');
    const capabilities = account.capabilities || {};
    console.log(`   Card Payments: ${capabilities.card_payments || 'unknown'}`);
    console.log(`   Transfers: ${capabilities.transfers || 'unknown'}`);
    
    // 4. Check if account is in test mode or live mode
    console.log('\n4️⃣ Checking Mode...');
    const keyType = process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'TEST' : 'LIVE';
    console.log(`   Current Key Type: ${keyType}`);
    console.log(`   Live Mode: ${!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')}`);
    
    // 5. Try to create a test payment intent
    console.log('\n5️⃣ Testing Payment Intent Creation...');
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 100, // $1.00 AUD
        currency: 'aud', // Changed to Australian Dollars
        payment_method_types: ['card_present'],
        capture_method: 'automatic'
      });
      console.log('   ✅ Payment Intent creation successful');
      console.log(`   Payment Intent ID: ${paymentIntent.id}`);
      console.log(`   Amount: ${paymentIntent.amount / 100} AUD`);
    } catch (error) {
      console.log('   ❌ Payment Intent Error:', error.message);
      if (error.message.includes('card_present')) {
        console.log('   📝 Action Required: Check Terminal setup or country restrictions');
      }
      if (error.message.includes('currency')) {
        console.log('   📝 Currency Issue: Your account may not support AUD transactions');
      }
    }
    
    // 6. Check webhook endpoints
    console.log('\n6️⃣ Checking Webhook Configuration...');
    try {
      const webhooks = await stripe.webhookEndpoints.list({ limit: 10 });
      console.log(`   Configured Webhooks: ${webhooks.data.length}`);
      webhooks.data.forEach((webhook, index) => {
        console.log(`   ${index + 1}. ${webhook.url} - ${webhook.enabled_events.length} events`);
      });
    } catch (error) {
      console.log('   ⚠️  Could not retrieve webhooks:', error.message);
    }
    
    // 7. Check for Terminal readers
    console.log('\n7️⃣ Checking Terminal Readers...');
    try {
      const readers = await stripe.terminal.readers.list({ limit: 10 });
      console.log(`   Registered Readers: ${readers.data.length}`);
      readers.data.forEach((reader, index) => {
        console.log(`   ${index + 1}. ${reader.device_type} - ${reader.status} - ${reader.location || 'No location'}`);
      });
      
      if (readers.data.length === 0) {
        console.log('   📝 No physical readers registered. This is normal for first-time setup.');
      }
    } catch (error) {
      console.log('   ❌ Readers Error:', error.message);
    }
    
    // 8. Check Terminal locations
    console.log('\n8️⃣ Checking Terminal Locations...');
    try {
      const locations = await stripe.terminal.locations.list({ limit: 10 });
      console.log(`   Configured Locations: ${locations.data.length}`);
      locations.data.forEach((location, index) => {
        console.log(`   ${index + 1}. ${location.display_name} - ${location.address.city}, ${location.address.country}`);
      });
      
      if (locations.data.length === 0) {
        console.log('   📝 Action Required: Create a Terminal location in Stripe Dashboard');
        console.log('   🔗 Go to: https://dashboard.stripe.com/terminal/locations');
      }
    } catch (error) {
      console.log('   ❌ Locations Error:', error.message);
    }
    
    console.log('\n✅ Diagnostic Complete!');
    console.log('\n📋 Summary of Required Actions for LIVE Production Setup:');
    console.log('1. ✅ Ensure Terminal is enabled in Stripe Dashboard (LIVE mode)');
    console.log('2. ✅ Create at least one Terminal location for your business');
    console.log('3. 🔧 For physical readers: Register your BBPOS/WisePad device');
    console.log('4. ✅ Ensure live account is fully activated and verified');
    console.log('5. 💳 Test with real cards (small amounts) to verify end-to-end flow');
    console.log('6. 🌐 Ensure your business location supports Terminal (check country/region)');
    console.log('\n🔗 Important Links:');
    console.log('   Dashboard: https://dashboard.stripe.com/terminal/locations');
    console.log('   Readers: https://dashboard.stripe.com/terminal/readers');
    console.log('   Account: https://dashboard.stripe.com/account');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
    
    if (error.type === 'StripeAuthenticationError') {
      console.log('\n🔑 Authentication Error - Check your LIVE Stripe key:');
      console.log('- Ensure the LIVE secret key is correct and not expired');
      console.log('- Verify you\'re using sk_live_... not sk_test_...');
      console.log('- Check if your live account is fully activated');
      console.log('- Ensure Terminal is enabled for your live account');
    }
    
    if (error.type === 'StripePermissionError') {
      console.log('\n🔒 Permission Error:');
      console.log('- Your live account may not have Terminal enabled');
      console.log('- Contact Stripe support to enable Terminal for live mode');
    }
  }
}

// Run the diagnostic
diagnosticStripeAccount().catch(console.error);
