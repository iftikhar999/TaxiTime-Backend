// Test script to verify mobile app login works with backend
const axios = require('axios');

async function testDriverLogin() {
    try {
        console.log('🔍 Testing Driver Login from Mobile App Perspective...\n');

        // Test with localhost (for our test script)
        const API_BASE_URL = 'http://localhost:3000/api'; const loginData = {
            email: 'driver1@citycabs.com',
            password: 'driver123'
        };

        console.log(`📱 Testing login with: ${loginData.email}`);
        console.log(`🌐 API Endpoint: ${API_BASE_URL}/auth/login`);

        const response = await axios.post(`${API_BASE_URL}/auth/login`, loginData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 5000
        });

        console.log('\n✅ Login Response:');
        console.log('Status:', response.status);
        console.log('Message:', response.data.message);
        console.log('Token exists:', !!response.data.token);
        console.log('User ID:', response.data.user?.id);
        console.log('User Role:', response.data.user?.role);
        console.log('Company:', response.data.user?.company?.brandName);

        if (response.data.token && response.data.user?.role === 'DRIVER') {
            console.log('\n🎉 SUCCESS: Driver login works correctly!');
            console.log('\nCredentials for mobile app:');
            console.log(`📧 Email: ${loginData.email}`);
            console.log(`🔒 Password: ${loginData.password}`);
        } else {
            console.log('\n❌ ERROR: Login response missing token or user is not a driver');
        }

    } catch (error) {
        console.log('\n❌ ERROR: Login failed');
        console.log('Error:', error.response?.data || error.message);

        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Backend server is not running on localhost:3000');
            console.log('Make sure to start the backend server first.');
        }
    }
}

testDriverLogin();