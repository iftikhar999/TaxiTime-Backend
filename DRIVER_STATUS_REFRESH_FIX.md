# Driver Status Refresh Bug Fix

## Issue

After completing a walk-in job from the driver application:

1. Driver shows BUSY → Opens walk-in job ✅
2. Job completes → Driver shows AVAILABLE ✅
3. **Refresh dispatch → Driver shows BUSY again** ❌ (BUG)

## Root Causes

### 1. Dispatch Endpoint Reading Wrong Status Source

**File**: `routes/dispatch.js`

The `/drivers` endpoint was reading driver status from `shift.status` instead of from driver preferences:

**Before (Line 2642):**

```javascript
status: shift.status,  // ❌ Reading from shift table (not updated on job completion)
```

**After:**

```javascript
// ✅ FIXED: Get status from driver preferences, not shift
const driverStatus =
  shift.driver.preferences?.driverStatus ||
  shift.driver.preferences?.dispatch?.status ||
  shift.status;

status: driverStatus,
```

### 2. Driver List Endpoint Also Using Shift Status

**File**: `routes/dispatch.js` (Line 1037)

The main driver list endpoint had similar issue:

**Before:**

```javascript
let statusHint = dispatchMeta.status || null;
if (!statusHint && latestShift?.status) {
  statusHint = latestShift.status;
}
```

**After:**

```javascript
// ✅ FIXED: Check preferences.driverStatus first
let statusHint = preferences.driverStatus || dispatchMeta.status || null;
if (!statusHint && latestShift?.status) {
  statusHint = latestShift.status;
}
```

### 3. Stale currentJobId Not Cleared on Job Completion

**File**: `server.js`

When a job completes, the `currentJobId` in `preferences.dispatch` was not being cleared, leaving a stale reference to the completed job.

**Before (Lines 1270-1288):**

```javascript
const updatedPrefs = {
  ...currentPrefs,
  driverStatus: "AVAILABLE",
  lastStatusChange: new Date().toISOString(),
  // ❌ dispatch.currentJobId not cleared!
};
```

**After (Lines 1270-1296):**

```javascript
const dispatchPrefs =
  currentPrefs.dispatch && typeof currentPrefs.dispatch === "object"
    ? { ...currentPrefs.dispatch }
    : {};
dispatchPrefs.currentJobId = null; // ✅ Clear the completed job ID
dispatchPrefs.status = "AVAILABLE"; // ✅ Update dispatch status too

const updatedPrefs = {
  ...currentPrefs,
  driverStatus: "AVAILABLE",
  lastStatusChange: new Date().toISOString(),
  dispatch: dispatchPrefs, // ✅ Include updated dispatch preferences
};
```

Applied the same fix for NO_SHOW and RECALLED job statuses (Lines 1387-1415).

## Priority of Status Sources

The fix establishes a clear priority order for determining driver status:

1. **`preferences.driverStatus`** - Primary source (updated on job completion)
2. **`preferences.dispatch.status`** - Secondary source (dispatch-specific status)
3. **`shift.status`** - Fallback only (not reliably updated)
4. **Active assignment check** - If driver has active job, override to BUSY

## Verification

### Before Fix:

```json
{
  "id": "cmhevs557000b9ky461vhx8f9",
  "status": "ONLINE", // ❌ From shift.status (stale)
  "preferences": {
    "driverStatus": "AVAILABLE", // ✅ Correct status in preferences
    "dispatch": {
      "currentJobId": "11a93145-6289-4a4a-8200-21e81071d2c2", // ❌ Stale job ID
      "status": "AVAILABLE"
    }
  }
}
```

### After Fix:

```json
{
  "id": "cmhevs557000b9ky461vhx8f9",
  "status": "AVAILABLE", // ✅ From preferences.driverStatus
  "preferences": {
    "driverStatus": "AVAILABLE",
    "dispatch": {
      "currentJobId": null, // ✅ Cleared on job completion
      "status": "AVAILABLE"
    }
  }
}
```

## Files Modified

1. `/Applications/A_B_TAXI/backend/routes/dispatch.js`

   - Line 2638-2643: Fixed `/drivers` endpoint to read from preferences
   - Line 1037: Fixed driver list endpoint to prioritize preferences.driverStatus

2. `/Applications/A_B_TAXI/backend/server.js`
   - Lines 1270-1296: Clear `dispatch.currentJobId` on COMPLETED status
   - Lines 1387-1415: Clear `dispatch.currentJobId` on NO_SHOW/RECALLED status

## Testing Steps

1. ✅ Driver starts shift → Shows AVAILABLE
2. ✅ Driver opens walk-in job → Shows BUSY
3. ✅ Driver completes job → Shows AVAILABLE
4. ✅ **Refresh dispatch → Still shows AVAILABLE** (BUG FIXED)
5. ✅ Check `preferences.dispatch.currentJobId` → Should be `null`

## Impact

This fix ensures that:

- Driver status is always read from the authoritative source (`preferences.driverStatus`)
- Completed job IDs are properly cleaned up
- Dispatch panels show accurate real-time status even after refresh
- No state desync between driver app and dispatch panel
