const axios = require('axios');

async function testLogin() {
    try {
        console.log('🧪 Testing Login API...\n');

        const baseURL = 'http://localhost:3000/api';

        // Test 1: Login as SUPER_ADMIN
        console.log('1️⃣ Testing SUPER_ADMIN login...');
        try {
            const adminResponse = await axios.post(`${baseURL}/auth/login`, {
                email: 'admin@abtaxi.com',
                password: 'admin123'
            });
            console.log('✅ SUPER_ADMIN login successful!');
            console.log(`   Token: ${adminResponse.data.token.substring(0, 20)}...`);
            console.log(`   User: ${adminResponse.data.user.firstName} ${adminResponse.data.user.lastName}`);
            console.log(`   Role: ${adminResponse.data.user.role}\n`);
        } catch (error) {
            console.log('❌ SUPER_ADMIN login failed:', error.response?.data?.message || error.message);
            console.log('');
        }

        // Test 2: Login as OWNER
        console.log('2️⃣ Testing OWNER login...');
        try {
            const ownerResponse = await axios.post(`${baseURL}/auth/login`, {
                email: 'jobowner@test.com',
                password: 'owner123'
            });
            console.log('✅ OWNER login successful!');
            console.log(`   Token: ${ownerResponse.data.token.substring(0, 20)}...`);
            console.log(`   User: ${ownerResponse.data.user.firstName} ${ownerResponse.data.user.lastName}`);
            console.log(`   Role: ${ownerResponse.data.user.role}\n`);
        } catch (error) {
            console.log('❌ OWNER login failed:', error.response?.data?.message || error.message);
            console.log('');
        }

        // Test 3: Login with wrong password
        console.log('3️⃣ Testing wrong password...');
        try {
            await axios.post(`${baseURL}/auth/login`, {
                email: 'admin@abtaxi.com',
                password: 'wrongpassword'
            });
            console.log('❌ Should have failed but succeeded!\n');
        } catch (error) {
            console.log('✅ Correctly rejected wrong password');
            console.log(`   Error: ${error.response?.data?.message || error.message}\n`);
        }

        console.log('✅ All login tests completed!\n');

        console.log('📋 Valid Login Credentials:\n');
        console.log('SUPER_ADMIN:');
        console.log('  admin@abtaxi.com / admin123\n');
        console.log('OWNERS:');
        console.log('  jobowner@test.com / owner123');
        console.log('  testowner@usertest.com / owner123');
        console.log('  owner.testcompan187@testcompanyforerror.com / owner123');

    } catch (error) {
        console.error('❌ Test error:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('\n⚠️  Backend server is not running!');
            console.log('Start it with: cd /Applications/A_B_TAXI/backend && npm start');
        }
    }
}

testLogin();
