# Job Status Flow Testing Suite

Complete testing infrastructure for job lifecycle and status transitions.

## 📁 Files Overview

### Setup & Data

- **`setupTestData.js`** - Seeds test data (driver, customer, vehicle)
- **`runAllTests.js`** - Orchestrates all tests and displays manual checklist

### Automated Tests

- **`jobStatusFlowSimulator.js`** - Database-level automated tests (8 lifecycle steps)
- **`socketEventSimulator.js`** - Real-time socket event tests (requires credentials)

### Interactive Web Testing

- **`simulator.html`** - Visual web-based testing interface (standalone)
- **`simulatorServer.js`** - API server for real database testing (integrates HTML + backend)

---

## 🚀 Quick Start

### Option 1: Database Tests Only

```bash
# Run automated database tests
cd /Applications/A_B_TAXI/backend
node tests/statusFlow/runAllTests.js
```

### Option 2: Web Simulator (Mock Mode)

```bash
# Open in browser - no server required
open tests/statusFlow/simulator.html
```

- Click through job lifecycle interactively
- Visual status tracking and timeline
- Automated test scenarios available
- **Perfect for understanding flows before coding**

### Option 3: Web Simulator + Real Backend (RECOMMENDED)

```bash
# Terminal 1: Start the API server
cd /Applications/A_B_TAXI/backend
node tests/statusFlow/simulatorServer.js

# Terminal 2: Run test data setup (first time only)
node tests/statusFlow/setupTestData.js

# Browser: Open the simulator
open http://localhost:3001
```

- Toggle "Use Real Backend" checkbox in the UI
- All actions write to real database
- Verify changes persist across sessions
- **Best for validating actual backend behavior**

---

## 🎯 Testing Modes Comparison

| Feature             | Database Tests    | Mock Simulator   | Real Backend Simulator   |
| ------------------- | ----------------- | ---------------- | ------------------------ |
| **Requires Server** | ❌                | ❌               | ✅                       |
| **Visual UI**       | ❌                | ✅               | ✅                       |
| **Real Database**   | ✅                | ❌               | ✅                       |
| **Interactive**     | ❌                | ✅               | ✅                       |
| **API Testing**     | ❌                | ❌               | ✅                       |
| **Automated Tests** | ✅                | ✅               | ✅                       |
| **Best For**        | CI/CD, Validation | Learning, Design | Full Integration Testing |

---

## 📖 Web Simulator Guide

### Features

1. **Job Control Panel**

   - Create jobs with custom pickup/dropoff
   - Offer jobs to drivers
   - Accept/reject offers
   - Track job and driver status in real-time

2. **Driver Progress Panel**

   - Proceed to Pickup (enables when ASSIGNED)
   - Mark Arrived (enables when ON_THE_WAY)
   - Start Ride (enables when ARRIVED)
   - Complete Ride (enables when STARTED/IN_PROGRESS)
   - Cancel Job (enables during active jobs)

3. **Live Metrics**

   - Appears ONLY when ride is STARTED or IN_PROGRESS
   - Simulates speed, distance, duration
   - Matches real app requirement

4. **Timeline View**

   - Shows all status transitions chronologically
   - Color-coded for quick scanning

5. **Activity Log**

   - Console-style logging
   - Info, success, error, warning categories
   - API call tracking when using real backend

6. **Automated Test Scenarios**
   - **Complete Flow**: Full lifecycle from create → complete
   - **Rejection Flow**: Test driver rejection logic
   - **Cancellation Flow**: Test job cancellation
   - **Race Condition**: Test immediate OFFERED status

### Testing Workflow

#### Mock Mode (Default)

```
1. Open simulator.html in browser
2. Click "Create Job" → Job gets ID
3. Click "Offer to Driver" → Status: OFFERED
4. Click "Accept Job" → Status: ASSIGNED, Driver: ROGER
5. Click "Proceed to Pickup" → Status: ON_THE_WAY
6. Click "Mark Arrived" → Status: ARRIVED
7. Click "Start Ride" → Status: STARTED, Live Metrics appear ✅
8. Watch metrics simulate (speed, distance, duration)
9. Click "Complete Ride" → Status: COMPLETED, Driver: AVAILABLE
```

**Validation Points:**

- ✅ "Proceed to Pickup" button disabled until job is ASSIGNED
- ✅ Live Metrics only visible after "Start Ride" clicked
- ✅ Rejection returns job to UNASSIGNED, driver to AVAILABLE
- ✅ All status transitions follow correct flow

#### Real Backend Mode

```
1. Start server: node tests/statusFlow/simulatorServer.js
2. Open http://localhost:3001
3. Toggle "Use Real Backend" checkbox
4. Follow same steps as Mock Mode
5. Check logs for "API: POST /job/create - Success"
6. Verify database records:
   psql -d taxi_dispatch -c "SELECT jobId, status FROM \"Job\" WHERE \"jobId\" LIKE 'TEST-JOB-%' ORDER BY \"createdAt\" DESC LIMIT 5;"
```

**Additional Validation:**

- ✅ Jobs persist in database
- ✅ Assignment and Offer records created
- ✅ Status updates reflected in DB
- ✅ Rejection clears assignedDriverId
- ✅ Foreign key constraints respected

---

## 🔧 API Server Endpoints

When running `simulatorServer.js`, these endpoints are available:

### Status & Info

```bash
# Get simulator status and test data
GET http://localhost:3001/api/status
```

### Job Management

```bash
# Create new test job
POST http://localhost:3001/api/job/create
Body: { "pickupAddress": "...", "dropoffAddress": "...", "estimatedPrice": 24.73 }

# Offer job to driver
POST http://localhost:3001/api/job/:jobId/offer

# Update job status
POST http://localhost:3001/api/job/:jobId/status
Body: { "status": "ASSIGNED" }

# Get recent test jobs
GET http://localhost:3001/api/jobs/recent

# Clean up all test jobs
DELETE http://localhost:3001/api/jobs/cleanup
```

### Automated Tests

```bash
# Run complete lifecycle test through API
POST http://localhost:3001/api/test/complete-flow
```

---

## 🧪 Test Scenarios

### Scenario 1: Happy Path (Complete Flow)

```
UNASSIGNED → OFFERED → ASSIGNED → ON_THE_WAY → ARRIVED → STARTED → COMPLETED
Driver:   AVAILABLE → AVAILABLE → ROGER → ROGER → ROGER → BUSY → AVAILABLE
```

**Web Simulator:**

- Click "Run Complete Flow" button
- Watch automated progression
- Verify Live Metrics appear at STARTED step

**Database Test:**

```bash
node tests/statusFlow/jobStatusFlowSimulator.js
# Should pass all 8 lifecycle steps
```

### Scenario 2: Driver Rejects Job

```
UNASSIGNED → OFFERED → [REJECT] → UNASSIGNED
Driver:   AVAILABLE → AVAILABLE → [REJECT] → AVAILABLE
```

**Web Simulator:**

- Create job → Offer job
- Click "Reject Job" button
- Verify job returns to UNASSIGNED
- Verify driver returns to AVAILABLE

**Database Test:**

- Included in automated tests

### Scenario 3: Job Cancellation

```
ASSIGNED → ON_THE_WAY → [CANCEL] → CANCELLED
Driver: ROGER → ROGER → [CANCEL] → AVAILABLE
```

**Web Simulator:**

- Progress to ON_THE_WAY status
- Click "Cancel Job" button
- Verify driver status returns to AVAILABLE

### Scenario 4: Race Condition Prevention

```
Customer creates job → Immediately assigned to nearest driver
Expected: Job goes directly to OFFERED (not delayed)
```

**Web Simulator:**

- Click "Run Race Condition Test"
- Verify immediate OFFERED status
- Check logs for no UNASSIGNED delay

---

## 🐛 Troubleshooting

### Database Tests Fail

```bash
# Check Prisma client is up to date
npx prisma generate

# Verify database connection
npx prisma db pull

# Check test data exists
node tests/statusFlow/setupTestData.js
```

### Web Simulator - Real Backend Not Connecting

```bash
# Verify server is running
lsof -i :3001

# Check server logs for errors
node tests/statusFlow/simulatorServer.js
# Should show: "Ready to test! 🚀"

# Test API directly
curl http://localhost:3001/api/status
```

### Live Metrics Not Showing

**Expected Behavior:**

- Live Metrics ONLY visible when job status is STARTED or IN_PROGRESS
- Should be hidden for all other statuses

**If not working:**

1. Check browser console for errors
2. Verify `updateLiveMetrics()` is called after status changes
3. Confirm CSS class `active` is added to `#liveMetrics`

### Buttons Not Enabling/Disabling

**Check updateButtonStates() logic:**

```javascript
// Proceed to Pickup: ONLY enabled when job is ASSIGNED
document.getElementById("btnProceed").disabled = jobStatus !== "ASSIGNED";

// Start Ride: ONLY enabled when job is ARRIVED
document.getElementById("btnStart").disabled = jobStatus !== "ARRIVED";
```

---

## 📊 Status Flow Reference

### Job Status Transitions

```
UNASSIGNED ──→ OFFERED ──→ ASSIGNED ──→ ON_THE_WAY ──→ ARRIVED ──→ STARTED ──→ IN_PROGRESS ──→ COMPLETED
                    │           │             │            │
                    ↓           ↓             ↓            ↓
              UNASSIGNED    CANCELLED     CANCELLED    CANCELLED
              (rejected)
```

### Driver Status Transitions

```
AVAILABLE ──→ AVAILABLE ──→ ROGER ──→ ROGER ──→ ROGER ──→ BUSY ──→ AVAILABLE
(idle)       (offer sent)  (accepted) (en route) (arrived) (started) (completed)
```

### Key Requirements

1. **Proceed to Pickup button** works ONLY when job is ASSIGNED
2. **Live Metrics panel** appears ONLY when job is STARTED or IN_PROGRESS
3. **Driver rejection** returns job to UNASSIGNED and driver to AVAILABLE
4. **Job cancellation** returns driver to AVAILABLE
5. **Race condition** prevented by immediate OFFERED status

---

## 🎓 Usage Tips

### For Learning/Design

1. Start with **Mock Simulator** (simulator.html)
2. Click through entire flow manually
3. Run automated scenarios to see expected timing
4. Note when buttons enable/disable
5. Document any issues or improvements

### For Backend Validation

1. Use **Real Backend Simulator** (server + UI)
2. Create jobs and verify in database:
   ```sql
   SELECT "jobId", status, "assignedDriverId", "createdAt"
   FROM "Job"
   WHERE "jobId" LIKE 'TEST-JOB-%'
   ORDER BY "createdAt" DESC LIMIT 10;
   ```
3. Check Assignment and Offer tables
4. Verify foreign key relationships
5. Test edge cases (expired offers, duplicate accepts, etc.)

### For CI/CD

1. Use **Database Tests** (jobStatusFlowSimulator.js)
2. Run in automated pipeline
3. Check exit code: 0 = success, 1 = failure
4. Parse console output for step-by-step results

---

## 📝 Next Steps

### Before Implementing in Real App

- [ ] Run all 3 testing modes successfully
- [ ] Document any edge cases discovered
- [ ] Validate Live Metrics visibility timing
- [ ] Confirm button disabled states match requirements
- [ ] Test with real socket events (socketEventSimulator.js)

### Implementation Checklist

- [ ] JobProgressScreen button logic matches simulator
- [ ] Live Metrics conditional rendering matches simulator
- [ ] Backend status handlers produce same transitions
- [ ] Socket events trigger same UI updates
- [ ] Database schema supports all transitions

### Testing in Real App

1. Use simulator as reference for expected behavior
2. Test each status transition individually
3. Verify UI matches simulator timing
4. Check database records match simulator output
5. Validate socket synchronization

---

## 🤝 Contributing

Found an issue or edge case? Update the simulator first:

1. Reproduce issue in simulator
2. Document expected vs actual behavior
3. Fix simulator logic
4. Re-test in mock and real backend modes
5. Update this README with findings
6. Apply fix to real application

---

## 📚 Related Documentation

- [Backend API Integration](../../../docs/API_INTEGRATION_COMPLETE.md)
- [Driver App Implementation](../../../mobile/driver-app-v1/DRIVER_APP_V1_SUMMARY.md)
- [Admin Panel Status](../../../docs/ADMIN_FIXES_COMPLETE_STATUS.md)

---

**Last Updated:** January 2025  
**Simulator Version:** 2.0 (with Real Backend Integration)
