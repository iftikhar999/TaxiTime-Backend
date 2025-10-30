#!/bin/bash
# Helper script to get authentication token
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@abtaxi.com","password":"admin123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4
