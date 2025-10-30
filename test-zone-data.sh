#!/bin/bash

# Quick Owner Panel Zone Test Script

echo "🧪 Testing Owner Panel Zone API..."

# Test if owner panel backend is running
echo "1️⃣ Testing if owner zones API is accessible..."
curl -s http://localhost:3000/api/owner/zones -H "Authorization: Bearer test" || echo "❌ API not accessible"

# Test direct database query for zones
echo -e "\n2️⃣ Direct database query for zones..."
cd /Applications/A_B_TAXI/backend

# Create a quick test script
cat > test-zone-data.js << 'EOF'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testZoneData() {
    try {
        console.log('🔍 Checking zone data in database...');
        
        const zones = await prisma.zone.findMany({
            include: {
                zoneTariffs: {
                    include: {
                        tariff: true
                    }
                }
            },
            take: 3 // Just get first 3 zones
        });
        
        console.log(`\n📊 Found ${zones.length} zones in database`);
        
        zones.forEach((zone, index) => {
            console.log(`\n🏷️ Zone ${index + 1}:`);
            console.log(`  - ID: ${zone.id}`);
            console.log(`  - Name: ${zone.name}`);
            console.log(`  - Type: ${zone.type}`);
            console.log(`  - Active: ${zone.isActive}`);
            console.log(`  - Company: ${zone.companyId}`);
            console.log(`  - Boundaries Type:`, typeof zone.boundaries);
            
            if (zone.boundaries) {
                try {
                    const boundaries = typeof zone.boundaries === 'string' 
                        ? JSON.parse(zone.boundaries) 
                        : zone.boundaries;
                    
                    console.log(`  - Geometry Type: ${boundaries.geometryType || 'Not set'}`);
                    console.log(`  - Has Coordinates: ${!!(boundaries.coordinates && boundaries.coordinates.length > 0)}`);
                    if (boundaries.coordinates && boundaries.coordinates.length > 0) {
                        console.log(`  - Coordinates Count: ${boundaries.coordinates.length}`);
                        console.log(`  - First Coordinate:`, boundaries.coordinates[0]);
                    }
                    console.log(`  - Has Center Point: ${!!boundaries.centerPoint}`);
                    console.log(`  - Has Bounds: ${!!boundaries.bounds}`);
                    console.log(`  - Radius: ${boundaries.radius || 'N/A'}`);
                } catch (e) {
                    console.log(`  - ❌ Error parsing boundaries: ${e.message}`);
                }
            } else {
                console.log(`  - ❌ No boundaries data`);
            }
        });
        
        if (zones.length === 0) {
            console.log('\n💡 No zones found. You may need to create some zones first.');
        }
        
    } catch (error) {
        console.error('❌ Database error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

testZoneData();
EOF

echo "Running zone data test..."
node test-zone-data.js

# Clean up
rm test-zone-data.js

echo -e "\n✅ Zone data test complete!"