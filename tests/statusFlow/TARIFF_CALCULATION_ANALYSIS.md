# Tariff Calculation Analysis

## Database Schema (Correct Reference)

From `/Applications/A_B_TAXI/backend/prisma/schema.prisma`:

```prisma
model Tariff {
  baseFare            Decimal      @db.Decimal(10, 2)   # Starting price
  perKmRate           Decimal      @db.Decimal(10, 2)   # Per kilometer
  perMinuteRate       Decimal      @db.Decimal(10, 2)   # Per minute (TIME-BASED)
  minimumFare         Decimal      @db.Decimal(10, 2)   # Minimum charge
  waitingFee          Decimal?     @db.Decimal(10, 2)   # Optional waiting fee
}
```

## Correct Fare Calculation Formula

```javascript
baseFare = tariff.baseFare
distanceFare = tariff.perKmRate × (distanceMeters / 1000)
timeFare = tariff.perMinuteRate × (durationSeconds / 60)
waitingFare = tariff.waitingFee × (waitingSeconds / 60)

totalFare = baseFare + distanceFare + timeFare + waitingFare
finalFare = Math.max(totalFare, tariff.minimumFare)
```

## Implementation Status

### ✅ CORRECT: Old Driver App (TaxiTimeVersiontwo)

**File**: `/Applications/A_B_TAXI/TaxiTimeVersiontwo/src/utils/services/jobProcessor.js`

```javascript
const startingPrice = parseFloat(tariff.startingPrice || 0);
const distanceRate = parseFloat(tariff.distanceRate || 0);
const timeRate = parseFloat(tariff.timeRate || 0); // ✅ TIME-BASED FARE
const waitingRate = parseFloat(tariff.waitingRate || 0);

const distanceCost = (distanceMeters || 0) * distanceRate;
const durationCost = (elapsedSeconds || 0) * timeRate; // ✅ INCLUDED
const waitingCost = (waitingSeconds || 0) * waitingRate;

const totalCost = (
  startingPrice +
  distanceCost +
  durationCost +
  waitingCost
).toFixed(2);
```

**Status**: ✅ **CORRECT** - Includes all 4 components

### ❌ BUG: New Driver App v1 (driver-app-v1)

**File**: `/Applications/A_B_TAXI/mobile/driver-app-v1/src/screens/Jobs/JobProgressScreen.tsx`

```typescript
const fareDisplay = useMemo(() => {
  const base = selectedTariff?.baseFare ?? 0;
  const distanceFare =
    (selectedTariff?.perKmRate ?? 0) * (timer.distanceMeters / 1000);
  const waitingFare =
    (selectedTariff?.waitingTimeRate ?? 0) * (timer.waitingSeconds / 60);
  // ❌ MISSING: timeFare = perMinuteRate × (timer.elapsedSeconds / 60)
  const total = base + distanceFare + waitingFare;
  return { base, distanceFare, waitingFare, total };
}, [
  selectedTariff?.baseFare,
  selectedTariff?.perKmRate,
  selectedTariff?.waitingTimeRate,
  timer.distanceMeters,
  timer.waitingSeconds,
]);
```

**Status**: ❌ **BUG FOUND** - Missing `perMinuteRate` calculation

### ✅ CORRECT: Test Simulator (JUST FIXED)

**File**: `/Applications/A_B_TAXI/backend/tests/statusFlow/simulator.html`

```javascript
const baseFare = parseFloat(state.tariff.baseFare);
const distanceFare = parseFloat(state.tariff.perKmRate) * state.currentDistance;
const timeFare = parseFloat(state.tariff.perMinuteRate) * (duration / 60); // ✅ INCLUDED
const waitingFare =
  parseFloat(state.tariff.waitingTimeRate || 0) * (state.waitingTime / 60);

let totalFare = baseFare + distanceFare + timeFare + waitingFare;
totalFare = Math.max(totalFare, minimumFare);
```

**Status**: ✅ **CORRECT** - Includes all 4 components + minimum fare check

### ✅ CORRECT: Backend Service

**File**: `/Applications/A_B_TAXI/backend/services/jobService.js`

```javascript
const baseFare = 3.5;
const perKmRate = 1.2;
const perMinuteRate = 0.3; // ✅ TIME-BASED RATE
const minimumFare = 6.0;

const distanceFare = routeData.distance * perKmRate;
const timeFare = routeData.duration * perMinuteRate; // ✅ INCLUDED
const totalFare = Math.max(baseFare + distanceFare + timeFare, minimumFare);
```

**Status**: ✅ **CORRECT** - Includes all components

## Default Tariff Values (For Testing)

```javascript
const DEFAULT_TARIFF = {
  name: "Standard",
  baseFare: 3.5, // Starting price
  perKmRate: 1.2, // Per kilometer
  perMinuteRate: 0.3, // Per minute (TIME-BASED)
  minimumFare: 6.0, // Minimum fare
  waitingTimeRate: 0.15, // Waiting time per minute
};
```

## Example Calculation

For a 5km ride taking 15 minutes with 2 minutes waiting:

```
Base Fare:     $3.50
Distance Fare: 5 km × $1.20/km = $6.00
Time Fare:     15 min × $0.30/min = $4.50   ← THIS WAS MISSING IN DRIVER APP V1
Waiting Fare:  2 min × $0.15/min = $0.30
───────────────────────────────────────
Subtotal:      $14.30
Minimum Fare:  $6.00
───────────────────────────────────────
TOTAL FARE:    $14.30
```

**Without time-based fare (driver-app-v1 bug)**:

```
Base + Distance + Waiting = $3.50 + $6.00 + $0.30 = $9.80
MISSING: $4.50 (31% of the fare!)
```

## Action Required

### Critical Fix Needed

❌ **Fix `/Applications/A_B_TAXI/mobile/driver-app-v1/src/screens/Jobs/JobProgressScreen.tsx`**

Add the missing time-based fare calculation:

```typescript
const fareDisplay = useMemo(() => {
  const base = selectedTariff?.baseFare ?? 0;
  const distanceFare =
    (selectedTariff?.perKmRate ?? 0) * (timer.distanceMeters / 1000);
  const timeFare =
    (selectedTariff?.perMinuteRate ?? 0) * (timer.elapsedSeconds / 60); // ADD THIS
  const waitingFare =
    (selectedTariff?.waitingTimeRate ?? 0) * (timer.waitingSeconds / 60);
  const total = base + distanceFare + timeFare + waitingFare; // UPDATE THIS
  return {
    base,
    distanceFare,
    timeFare, // ADD THIS
    waitingFare,
    total,
  };
}, [
  selectedTariff?.baseFare,
  selectedTariff?.perKmRate,
  selectedTariff?.perMinuteRate, // ADD THIS
  selectedTariff?.waitingTimeRate,
  timer.distanceMeters,
  timer.elapsedSeconds, // ADD THIS
  timer.waitingSeconds,
]);
```

## Testing

1. **Simulator**: ✅ Ready to test with correct calculations
2. **Driver App v1**: ❌ Needs fix before testing
3. **Backend**: ✅ Already correct

Run simulator: `open /Applications/A_B_TAXI/backend/tests/statusFlow/simulator.html`
Compare fare calculations between simulator and driver app.

---

**Date**: October 23, 2025
**Discovered By**: Code analysis during simulator enhancement
**Severity**: HIGH - Drivers are not seeing accurate fare calculations
