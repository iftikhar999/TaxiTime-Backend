# Job CRUD Test Documentation

## Overview

This test script validates the complete job creation and editing flow, ensuring all fields persist correctly to the database.

## What It Tests

1. **Job Creation** - Creates a job with all possible fields:
   - Customer information (name, phone, email)
   - Pickup and dropoff locations
   - Pricing and tariff
   - Schedule
   - Job requirements (passengers, bags, wheelchairs)
   - Payment method
   - Notes and special instructions

2. **Job Retrieval** - Fetches the created job from the database

3. **Job Editing** - Updates all editable fields:
   - Passenger information
   - Locations
   - Requirements
   - Payment method
   - Notes

4. **Field Persistence Verification** - Checks that all updated fields were saved correctly

## Prerequisites

1. Backend server running on `http://localhost:3000`
2. Valid authentication token (JWT)
3. Database with at least one tariff configured
4. Valid company setup

## Getting an Auth Token

### Option 1: Login via API
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dispatcher@example.com",
    "password": "your-password"
  }'
```

Copy the `token` from the response.

### Option 2: Extract from Browser
1. Open the dispatch app in your browser
2. Login as a dispatcher
3. Open DevTools (F12)
4. Go to Application > Local Storage
5. Find the `auth_token` or similar key
6. Copy the token value

## Running the Test

```bash
cd /Applications/A_B_TAXI/backend
node test-job-crud.js "YOUR_AUTH_TOKEN_HERE"
```

**Example:**
```bash
node test-job-crud.js "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Expected Output

```
🚀 Starting Job CRUD Test Suite
API Base URL: http://localhost:3000
Auth Token: eyJhbGciOiJIUzI1Ni...

📝 TEST 1: Creating job with all fields...
✅ Job created successfully
✅ Job created with ID: job_abc123

🔍 TEST 2: Retrieving job job_abc123...
✅ Job retrieved successfully

✏️  TEST 3: Editing job job_abc123...
✅ Job updated successfully

🔬 TEST 4: Verifying field persistence for job job_abc123...

📊 Field Verification Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Passenger Name: Updated Passenger Name
✅ Phone: +9876543210
✅ Email: updated@example.com
✅ Passengers: 3
✅ Bags: 1
✅ Wheelchairs: 1
✅ Vehicles Needed: 1
✅ Currency: USD
✅ Payment Method: card
✅ Notes: Updated notes - meet at back entrance
✅ Pickup Address: 789 Broadway, New York, NY
✅ Dropoff Address: 321 Fifth Ave, New York, NY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 Summary: 12/12 checks passed
🎉 All fields persisted correctly!

==================================================
✅ ALL TESTS PASSED
==================================================
```

## Customizing Test Data

Edit `test-job-crud.js` to customize the test data:

### Update Tariff ID
Replace `'default-tariff-id'` with an actual tariff ID from your database:

```javascript
const TEST_JOB_CREATE = {
  tariffId: 'your-actual-tariff-id',
  // ... rest of the fields
};
```

### Update Location Coordinates
Use real coordinates from your service area:

```javascript
pickup: {
  address: 'Your Pickup Address',
  lat: 40.7128,
  lng: -74.0060
},
```

### Change Payment Method
Test different payment methods:

```javascript
paymentMethod: 'card', // or 'cash'
```

## Troubleshooting

### Error: "Authentication token required"
Make sure you're passing the token as an argument:
```bash
node test-job-crud.js "YOUR_TOKEN"
```

### Error: "Tariff not found"
Update the `tariffId` in `TEST_JOB_CREATE` with a valid tariff ID from your database.

### Error: "Connection refused"
Ensure the backend server is running:
```bash
cd /Applications/A_B_TAXI/backend
npm start
```

### Error: "Invalid coordinates"
The backend validates pickup/dropoff coordinates. Make sure they are valid latitude/longitude values.

### Some Fields Failed Verification
This indicates a bug in the backend PATCH endpoint. Check:
1. Backend logs for errors
2. Database schema for missing fields
3. The `updateJobDetails` function in `jobService.js`

## What Was Fixed

### Backend Changes
1. **Extended PATCH /jobs/:jobId endpoint** to accept:
   - `passengerName`, `phone`, `email`
   - `passengers`, `bags`, `wheelchairs`, `vehiclesNeeded`
   - `paymentMethod`, `scheduledFor`, `validationCode`, `currency`

2. **Added socket event emission** on job cancellation:
   - Emits `job:cancelled` to driver room
   - Emits `job:data:updated` to dispatch room

### Frontend Changes
1. **Implemented editJob in store** - Was previously an empty function
2. **Updated UpdateJobPayload interface** - Added all new fields
3. **Added auto-refresh after cancel** - Calls `fetchJobs()` and `fetchJobCounters()`
4. **Updated zone stats display** - Shows zones count and AWAY drivers

## Database Schema Notes

Fields are stored in two places:

1. **Direct Job Table Columns:**
   - `customerId`, `pickupAddress`, `pickupLatitude`, `pickupLongitude`
   - `dropoffAddress`, `dropoffLatitude`, `dropoffLongitude`
   - `vehicleType`, `estimatedPrice`, `estimatedDistance`
   - `scheduledAt`, `instructions`, `paymentMethod`, `status`

2. **Requirements JSON Field:**
   - `passengerName`, `passengerPhone`, `passengerEmail`
   - `passengers`, `bags`, `wheelchairs`, `vehiclesNeeded`
   - `tariffId`, `currency`, `fareBreakdown`, `notes`, `validationCode`

This is why the test script parses `requirements` as JSON when verifying fields.
