# Zone Name Undefined Fix

## Issue

Zone change events were being emitted with `zoneName: undefined` even though the zone ID existed:

```javascript
📍 Emitted zone change to mobile driver cmhevs557000b9ky461vhx8f9: {
  zoneId: 'aae7c901-467f-45e9-b02c-f001e47048ad',
  zoneName: undefined  // ❌ Missing!
}
```

## Root Cause

In `services/queueManagementService.js`, the `handleDriverStatusChange` function was emitting zone change events without including the `zoneName` field in the payload:

**Before (Line 653):**

```javascript
await this.emitDriverZoneChange(driver, {
  driverId,
  zoneId: currentZoneId,
  // ❌ zoneName was missing!
  status: newStatus,
  updatedAt: new Date().toISOString(),
});
```

## Fix Applied

Added logic to extract the zone name from driver preferences, and if missing, fetch it from the database:

**After (Lines 647-671):**

```javascript
// ✅ FIXED: Include zoneName from driver preferences, or fetch from DB if missing
let currentZoneName =
  dispatchMeta?.currentZone?.name ||
  driver.preferences?.dispatch?.currentZone?.name ||
  null;

// If we have zoneId but no name, fetch it from the database
if (currentZoneId && !currentZoneName) {
  try {
    const zone = await prisma.zones.findUnique({
      where: { id: currentZoneId },
      select: { name: true },
    });
    currentZoneName = zone?.name || null;
    console.log(
      `🔍 Fetched zone name for ${currentZoneId}: ${currentZoneName}`
    );
  } catch (error) {
    console.error(`❌ Error fetching zone name for ${currentZoneId}:`, error);
  }
}

await this.emitDriverZoneChange(driver, {
  driverId,
  zoneId: currentZoneId,
  zoneName: currentZoneName, // ✅ FIXED: Now included
  status: newStatus,
  updatedAt: new Date().toISOString(),
});
```

## Verification

After the fix, zone change events now include the zone name:

```javascript
📍 Emitted zone change to mobile driver cmhevs557000b9ky461vhx8f9: {
  zoneId: 'aae7c901-467f-45e9-b02c-f001e47048ad',
  zoneName: 'Rem tempora nulla et'  // ✅ Present!
}
```

## Related Context

The zone name is stored in driver preferences:

```json
"currentZone": {
  "id": "aae7c901-467f-45e9-b02c-f001e47048ad",
  "name": "Rem tempora nulla et",
  "updatedAt": "2025-11-18T05:12:53.888Z",
  "queuePosition": null
}
```

The fix ensures that when a driver's status changes (e.g., AVAILABLE → BUSY), the zone change event sent to the mobile app includes both the zone ID and the zone name, preventing UI inconsistencies.

## Files Modified

1. `/Applications/A_B_TAXI/backend/services/queueManagementService.js`
   - Added `zoneName` extraction logic in `handleDriverStatusChange` (lines 647-671)
   - Fallback database query if zone name is missing from preferences
