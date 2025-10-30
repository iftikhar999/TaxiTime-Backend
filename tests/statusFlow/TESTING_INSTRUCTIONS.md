# Testing Instructions - Updated Simulator & Driver App

## ✅ What Was Fixed

### 1. **Test Simulator** - Now Uses Real Tariff Calculations

**File**: `/Applications/A_B_TAXI/backend/tests/statusFlow/simulator.html`

**Changes Made**:

- ✅ Added tariff configuration with all rate components
- ✅ Implemented correct fare calculation: `base + distance + time + waiting`
- ✅ Added live fare display in metrics panel
- ✅ Shows tariff details (base fare, per km, per minute, minimum)
- ✅ Logs fare breakdown every 10 seconds during ride
- ✅ Applies minimum fare check
- ✅ Added toggle for Real Backend vs Mock Mode

**Tariff Display**:

```
Base Fare:    $3.50
Per km:       $1.20/km
Per minute:   $0.30/min
Minimum Fare: $6.00
Waiting:      $0.15/min
```

### 2. **Driver App v1** - Fixed Missing Time-Based Fare

**File**: `/Applications/A_B_TAXI/mobile/driver-app-v1/src/screens/Jobs/JobProgressScreen.tsx`

**Bug Fixed**:

- ❌ **Before**: Only calculated `base + distance + waiting` (missing ~30% of fare!)
- ✅ **After**: Now calculates `base + distance + time + waiting` (CORRECT)

**Changes Made**:

1. Added `timeFare` calculation: `perMinuteRate × (elapsedSeconds / 60)`
2. Updated `fareDisplay` to include `timeFare` in total
3. Added "Time" line to fare breakdown display
4. Added `timer.elapsedSeconds` and `perMinuteRate` to dependencies

---

## 🧪 Testing Instructions

### Test 1: Simulator with Mock Mode (Quick Test)

1. **Open the simulator**:

   ```bash
   open /Applications/A_B_TAXI/backend/tests/statusFlow/simulator.html
   ```

2. **Run through complete flow**:

   - Click "Create Job"
   - Click "Offer to Driver"
   - Click "Accept Job"
   - Click "Proceed to Pickup"
   - Click "Mark Arrived"
   - Click "Start Ride" ← **Live Metrics appear here**
   - **Watch the fare calculation update every second**
   - Check activity log every 10 seconds for fare breakdown
   - Click "Complete Ride"

3. **Verify**:
   - ✅ Live Metrics shows: Speed, Distance, Duration, **Current Fare**
   - ✅ Tariff details displayed below metrics
   - ✅ Fare increases based on distance AND time
   - ✅ Activity log shows breakdown: `Base: $X + Distance: $Y + Time: $Z`

### Test 2: Simulator with Real Backend (Full Test)

1. **Start the server** (if not running):

   ```bash
   cd /Applications/A_B_TAXI/backend
   node tests/statusFlow/simulatorServer.js
   ```

2. **Open simulator and toggle Real Backend**:

   - Open `simulator.html`
   - Check the "Use Real Backend" checkbox at the top
   - Should see: 🟢 Real Backend Mode

3. **Run same flow as Test 1**:

   - All actions will now hit the database
   - Jobs are created in PostgreSQL
   - Status updates are persisted
   - Check console for "API: POST /job/create - Success" messages

4. **Verify in database** (optional):
   ```bash
   cd /Applications/A_B_TAXI/backend
   npx prisma studio
   ```
   - Open Jobs table
   - Find jobs with `jobId` starting with "TEST-JOB-"
   - Verify status changes are saved

### Test 3: Driver App v1 (Real Device Test)

1. **Rebuild the app**:

   ```bash
   cd /Applications/A_B_TAXI/mobile/driver-app-v1
   npx react-native run-android
   # or
   npx react-native run-ios
   ```

2. **Start a real ride**:

   - Login as driver
   - Accept a job
   - Start the ride

3. **Watch the Live Metrics**:

   - **Before fix**: Showed only `Base + Distance + Waiting`
   - **After fix**: Shows `Base + Distance + Time + Waiting`

4. **Verify breakdown display**:

   ```
   Total Fare: $XX.XX

   Start: $3.50
   Distance: $X.XX
   Time: $X.XX     ← THIS WAS MISSING BEFORE
   Waiting: $X.XX
   ```

---

## 📊 Expected Calculations

### Example: 5km ride, 15 minutes, 2 minutes waiting

**Simulator** (during ride):

```
Speed: 45 km/h (varies)
Distance: 5.00 km
Duration: 15:00
Current Fare: $14.30

Breakdown:
  Base:     $3.50
  Distance: $6.00  (5 km × $1.20/km)
  Time:     $4.50  (15 min × $0.30/min) ← KEY COMPONENT
  Waiting:  $0.30  (2 min × $0.15/min)
  ─────────────────
  Total:    $14.30
```

**Driver App v1** (after fix):

```
Total Fare: $14.30

Start: $3.50
Distance: $6.00
Time: $4.50      ← NOW INCLUDED
Waiting: $0.30
```

---

## ✅ Confirmation Checklist

### Simulator

- [ ] Tariff details displayed correctly
- [ ] Live Metrics show all 4 values (Speed, Distance, Duration, Fare)
- [ ] Fare increases during ride
- [ ] Activity log shows fare breakdown every 10 seconds
- [ ] "Time: $X.XX" component is included
- [ ] Mock mode works without server
- [ ] Real backend mode connects to server (port 3001)

### Driver App v1

- [ ] Fare breakdown shows "Time: $X.XX" line
- [ ] Total fare matches expected calculation
- [ ] Fare increases both when moving (distance) AND when stopped (time)
- [ ] Waiting time is tracked separately
- [ ] All fare components add up to total

---

## 🐛 What Was Wrong

**Driver App v1 Bug (FIXED)**:

```typescript
// ❌ BEFORE (INCORRECT)
const total = base + distanceFare + waitingFare;
// Missing: timeFare = perMinuteRate × (elapsedSeconds / 60)
// Result: Drivers saw 30-40% LESS fare than they should earn!

// ✅ AFTER (CORRECT)
const total = base + distanceFare + timeFare + waitingFare;
// Now includes all 4 components matching database schema
```

**Impact**:

- A 15-minute ride was missing ~$4.50 in time-based charges
- Drivers were seeing inaccurate earnings
- Customers would be surprised by final fare at completion
- **Simulator now matches the CORRECT calculation**

---

## 🎯 Summary

**Both systems now use the same calculation**:

```
Fare = baseFare + (distance × perKmRate) + (duration × perMinuteRate) + (waiting × waitingRate)
FinalFare = max(Fare, minimumFare)
```

**Test the simulator first** to verify calculations, then **test the driver app** to confirm the fix works in production.

---

**Files Changed**:

1. ✅ `/Applications/A_B_TAXI/backend/tests/statusFlow/simulator.html`
2. ✅ `/Applications/A_B_TAXI/mobile/driver-app-v1/src/screens/Jobs/JobProgressScreen.tsx`
3. ✅ `/Applications/A_B_TAXI/backend/tests/statusFlow/TARIFF_CALCULATION_ANALYSIS.md`

**Date**: October 23, 2025
