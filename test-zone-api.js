// Test Zone API Endpoints
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3001/api';

async function testZoneAPIs() {
    console.log('🧪 Testing Zone API Endpoints...\n');

    try {
        // Test 1: Get zones for CityCabs company
        console.log('1️⃣ Testing: GET /companies/:companyId/zones');
        const zonesResponse = await axios.get(`${API_BASE_URL}/companies/1/zones`);
        console.log('✅ Zones Response:', JSON.stringify(zonesResponse.data, null, 2));

        // Test 2: Zone detection
        console.log('\n2️⃣ Testing: POST /zones/detect');
        const detectResponse = await axios.post(`${API_BASE_URL}/zones/detect`, {
            latitude: 43.6532,
            longitude: -79.3832,
            companyId: 1
        });
        console.log('✅ Detection Response:', JSON.stringify(detectResponse.data, null, 2));

        // Test 3: Update driver location
        console.log('\n3️⃣ Testing: POST /drivers/location/zone-update');
        const locationResponse = await axios.post(`${API_BASE_URL}/drivers/location/zone-update`, {
            driverId: 1,
            zoneId: 1,
            latitude: 43.6532,
            longitude: -79.3832,
            timestamp: new Date().toISOString()
        });
        console.log('✅ Location Update Response:', JSON.stringify(locationResponse.data, null, 2));

        // Test 4: Get driver locations for dispatch
        console.log('\n4️⃣ Testing: GET /drivers/locations?companyId=1');
        const driversResponse = await axios.get(`${API_BASE_URL}/drivers/locations?companyId=1`);
        console.log('✅ Driver Locations Response:', JSON.stringify(driversResponse.data, null, 2));

    } catch (error) {
        console.error('❌ Error testing APIs:', error.response?.data || error.message);
    }
}

// Run tests
testZoneAPIs();