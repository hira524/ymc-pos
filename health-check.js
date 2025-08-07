const axios = require('axios');

console.log('🔍 YMC POS Health Check');
console.log('========================\n');

async function checkBackend() {
    try {
        const response = await axios.get('http://localhost:5000/test');
        console.log('✅ Backend Server: Connected');
        return true;
    } catch (error) {
        console.log('❌ Backend Server: Not running or error');
        console.log('   Error:', error.message);
        return false;
    }
}

async function checkGoHighLevel() {
    try {
        const response = await axios.get('http://localhost:5000/inventory');
        console.log(`✅ GoHighLevel API: Connected (${response.data.length} products)`);
        return true;
    } catch (error) {
        console.log('❌ GoHighLevel API: Failed');
        if (error.response) {
            console.log('   Status:', error.response.status);
            console.log('   Message:', error.response.data);
        } else {
            console.log('   Error:', error.message);
        }
        return false;
    }
}

async function checkStripe() {
    try {
        const response = await axios.post('http://localhost:5000/connection_token');
        console.log('✅ Stripe Terminal: Connected');
        return true;
    } catch (error) {
        console.log('❌ Stripe Terminal: Failed');
        if (error.response) {
            console.log('   Status:', error.response.status);
            console.log('   Message:', error.response.data);
        } else {
            console.log('   Error:', error.message);
        }
        return false;
    }
}

async function checkFrontend() {
    try {
        const response = await axios.get('http://localhost:3000');
        console.log('✅ Frontend: Running');
        return true;
    } catch (error) {
        console.log('❌ Frontend: Not running');
        console.log('   Start with: npm start (in frontend directory)');
        return false;
    }
}

async function runHealthCheck() {
    const checks = [
        await checkBackend(),
        await checkGoHighLevel(), 
        await checkStripe(),
        await checkFrontend()
    ];
    
    const passed = checks.filter(Boolean).length;
    const total = checks.length;
    
    console.log(`\n📊 Health Check Results: ${passed}/${total} services healthy`);
    
    if (passed === total) {
        console.log('🎉 All systems operational!');
        console.log('\n🌐 Access your POS at: http://localhost:3000');
    } else {
        console.log('⚠️  Some services need attention. Check the errors above.');
        console.log('\n💡 Common fixes:');
        console.log('   - Restart backend: node server.js (in backend directory)');
        console.log('   - Restart frontend: npm start (in frontend directory)');
        console.log('   - Re-authorize GHL: visit http://localhost:5000/auth');
    }
}

runHealthCheck().catch(console.error);
