// Test Stripe Terminal Connection
// Open browser console and paste this code to check connection status

console.log('🔍 Testing Stripe Terminal Connection...');

// Check if Stripe Terminal is loaded
if (window.StripeTerminal) {
  console.log('✅ Stripe Terminal SDK loaded');
  
  // Check if terminal instance exists
  if (window.terminal) {
    console.log('✅ Terminal instance created');
    
    // Check reader status
    if (window.reader) {
      console.log('✅ Card reader connected:', window.reader.id);
      console.log('   Reader type:', window.reader.device_type);
      console.log('   Reader status:', window.reader.status);
    } else {
      console.log('⚠️ No card reader connected - checking discovery...');
      
      // Attempt manual reader discovery
      window.terminal.discoverReaders({ simulated: true })
        .then(({ discoveredReaders, error }) => {
          if (error) {
            console.log('❌ Reader discovery failed:', error.message);
          } else if (discoveredReaders.length > 0) {
            console.log('📱 Found simulated readers:', discoveredReaders.length);
            console.log('   Available readers:', discoveredReaders.map(r => r.id));
            
            // Try connecting to first reader
            return window.terminal.connectReader(discoveredReaders[0]);
          } else {
            console.log('⚠️ No readers discovered');
          }
        })
        .then(({ reader, error }) => {
          if (error) {
            console.log('❌ Reader connection failed:', error.message);
          } else if (reader) {
            console.log('✅ Successfully connected to reader:', reader.id);
            window.reader = reader;
          }
        });
    }
  } else {
    console.log('❌ Terminal instance not created');
  }
} else {
  console.log('❌ Stripe Terminal SDK not loaded');
}

// Test connection token endpoint
fetch('http://localhost:5000/connection_token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
})
.then(r => r.json())
.then(data => {
  if (data.secret) {
    console.log('✅ Connection token endpoint working');
    console.log('   Token preview:', data.secret.substring(0, 25) + '...');
  } else {
    console.log('❌ Connection token endpoint failed');
  }
})
.catch(e => console.log('❌ Connection token request failed:', e.message));
