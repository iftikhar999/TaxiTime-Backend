#!/bin/bash

# Test zone creation with proper authorization
echo "🧪 Testing zone creation with CUSTOM type..."

curl -s -X POST http://localhost:3000/api/owner/zones \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbWd0N2xtaW4wMDAzbXhhcjVqbmR3enM3Iiwicm9sZSI6Ik9XTkVSIiwiaWF0IjoxNzYwNzAxMTY4LCJleHAiOjE3NjEzMDU5Njh9.EfuxKGpvK-qolsYQH8vjKtOeYwNdSEC4lBMyusL9mog' \
  -d '{
    "zoneName": "doha",
    "zoneType": "CUSTOM",
    "description": "Test zone for Doha",
    "icon": "📍",
    "color": "#FD79A8",
    "centerPoint": {
      "lat": 25.222610217111672,
      "lng": 51.4752821546949
    },
    "geometryType": "POLYGON",
    "coordinates": [
      {"lat": 25.46362703509435, "lng": 51.399064503327715},
      {"lat": 25.33833332270615, "lng": 51.10106035293709},
      {"lat": 25.052527126652116, "lng": 51.000810108796465},
      {"lat": 24.98159339912899, "lng": 51.29606767715584},
      {"lat": 24.99279618528928, "lng": 51.75749345840584},
      {"lat": 25.24769361657072, "lng": 51.94975420059334},
      {"lat": 25.4276649315408, "lng": 51.893449268952715}
    ]
  }' | jq '.' 2>/dev/null || cat

echo -e "\n"
echo "✅ Zone creation test complete!"