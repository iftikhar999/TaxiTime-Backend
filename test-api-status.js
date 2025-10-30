const axios = require('axios');
const jwt = require('jsonwebtoken');

async function testVehicleAPI() {
    try {
        // Create a token for owner5 (Elite Taxi)
        const token = jwt.sign(
            { userId: 'cmgi14jcf000g9k0ndq5zfkvh', companyId: 'cmgi14j9y000f9k0nfslciyvw' },
            'your-secret-key-change-this-in-production'
        );

        console.log('🔍 Testing Vehicle API...\n');

        // Test GET /api/owner/vehicles
        const response = await axios.get('http://localhost:3001/api/owner/vehicles', {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('✅ API Response:');
        console.log(`   Total vehicles: ${response.data.vehicles.length}\n`);

        response.data.vehicles.forEach(v => {
            console.log(`📋 ${v.make} ${v.model}:`);
            console.log(`   License Plate: ${v.licensePlate}`);
            console.log(`   isActive: ${v.isActive}, isAvailable: ${v.isAvailable}`);
            console.log(`   Status returned by API: ${v.status}`);
            console.log(`   Fuel Type: ${v.fuelType || 'N/A'}`);
            console.log(`   Transmission: ${v.transmission || 'N/A'}`);
            console.log(`   Registration: ${v.registrationNumber || 'N/A'}`);
            console.log(`   Expected Status: ${v.isActive ? 'ACTIVE' : 'INACTIVE'}`);
            console.log(`   ✅ ${v.status === (v.isActive ? 'ACTIVE' : 'INACTIVE') ? 'CORRECT' : '❌ WRONG'}\n`);
        });

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

testVehicleAPI();
