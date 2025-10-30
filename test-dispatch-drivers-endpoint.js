// Test script to verify the /api/dispatch/drivers endpoint works
const axios = require('axios');

async function testDispatchDriversEndpoint() {
    try {
        console.log('🧪 Testing /api/dispatch/drivers endpoint...');

        // You'll need to replace this with a valid JWT token from your system
        const testToken = 'YOUR_JWT_TOKEN_HERE';

        const response = await axios.get('http://localhost:3000/api/dispatch/drivers', {
            headers: {
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Success! Status:', response.status);
        console.log('📊 Data:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        if (error.response) {
            console.log('❌ Error Status:', error.response.status);
            console.log('📄 Error Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('❌ Network Error:', error.message);
        }
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    testDispatchDriversEndpoint();
}

module.exports = { testDispatchDriversEndpoint };