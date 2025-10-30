# Complete Backend Shift API Fixes

## Date: October 12, 2025

## Critical Issues Fixed

### ❌ Original Errors:

1. `Invalid value for argument 'status'. Expected ShiftStatus` - Using 'ACTIVE' instead of 'ONLINE'
2. `Invalid fields in Shift model` - Using fields that don't exist in database
3. `Invalid fields in User model` - Trying to update non-existent fields
4. `Vehicle relation doesn't exist` - Trying to include vehicle data on Shift

---

## Database Schema (Actual)

### Shift Model

```prisma
model Shift {
  id            String      @id @default(cuid())
  driverId      String
  companyId     String
  startTime     DateTime
  endTime       DateTime?
  status        ShiftStatus @default(OFFLINE)
  startLocation Json?
  endLocation   Json?
  totalEarnings Decimal?    @db.Decimal(10, 2)
  totalTrips    Int         @default(0)    // NOT totalRides!
  totalDistance Float?      @default(0)
  // NO vehicleId field
  // NO duration field
  // NO shiftData field
  @@map("shifts")
}

enum ShiftStatus {
  OFFLINE
  ONLINE
  BUSY
  BREAK
  // NO 'ACTIVE', 'COMPLETED', 'AVAILABLE', etc.
}
```

### User Model

```prisma
model User {
  id        String   @id
  firstName String
  lastName  String
  email     String   @unique
  phone     String   @unique
  role      UserRole @default(PASSENGER)
  isActive  Boolean  @default(true)
  // NO status field
  // NO lastLocationUpdate field
  @@map("users")
}
```

---

## Fixes Applied

### 1. ✅ Fixed Status Values

**Changed:** All incorrect shift status values

| ❌ Wrong           | ✅ Correct  | Usage                        |
| ------------------ | ----------- | ---------------------------- |
| `'ACTIVE'`         | `'ONLINE'`  | Active shift                 |
| `'COMPLETED'`      | `'OFFLINE'` | Ended shift                  |
| ~~`'AVAILABLE'`~~  | Removed     | Was for User (doesn't exist) |
| ~~`'IN_SERVICE'`~~ | Removed     | Was for Vehicle              |

### 2. ✅ Removed Invalid Fields from Shift Operations

**Start Shift - Removed:**

```javascript
// ❌ These don't exist in schema
vehicleId: vehicle?.id,
shiftData: { ... }

// ❌ User doesn't have these fields
await prisma.user.update({
  data: {
    status: 'AVAILABLE',
    lastLocationUpdate: new Date()
  }
});
```

**End Shift - Fixed:**

```javascript
// ❌ Wrong
status: 'COMPLETED',
duration: shiftDuration,
totalRides: count,
shiftData: { ... }

// ✅ Correct
status: 'OFFLINE',
totalTrips: count  // Note: totalTrips not totalRides
// duration calculated in response, not stored
```

### 3. ✅ Removed Vehicle Relations

**Before:**

```javascript
include: {
  vehicle: { ... }  // ❌ Relation doesn't exist
}
```

**After:**

```javascript
// ✅ No include, just fetch shift
prisma.shift.findFirst({ where: {...} })
```

### 4. ✅ Fixed buildShiftPayload Function

Removed all references to `shift.vehicle` since the relation doesn't exist.

### 5. ✅ Fixed Shift History Query

```javascript
// ❌ Before
where: {
  status: 'COMPLETED'  // Invalid status
}

// ✅ After
where: {
  status: 'OFFLINE',
  endTime: { not: null }  // Only completed shifts
}
```

---

## Files Modified

### `/backend/src/routes/mobile/driverShift.js`

**Changes:**

1. Line ~91: Changed `status: 'ACTIVE'` → `status: 'ONLINE'`
2. Line ~168-177: Removed `vehicleId` and `shiftData` from shift creation
3. Line ~183-189: Removed invalid User.update with status
4. Line ~218-226: Removed invalid Vehicle.update
5. Line ~305-313: Fixed shift.update to use correct fields
6. Line ~315-326: Removed vehicle status update on shift end
7. Line ~402: Changed `status: 'COMPLETED'` → `status: 'OFFLINE'` + added `endTime: { not: null }`
8. Line ~415-435: Removed vehicle include and fixed field references
9. Line ~50-62: Removed vehicle from buildShiftPayload

---

## Testing the Fixed API

### Start Shift

```bash
POST /api/mobile/driver/shift/start
{
  "vehicleId": "xxx",
  "tariffId": "yyy",  # Added in previous fix
  "location": {
    "latitude": 25.2854,
    "longitude": 51.531
  }
}

# ✅ Should return 200 with shift data
```

### Get Current Shift

```bash
GET /api/mobile/driver/shift/current

# ✅ Should return 200 (not 500)
```

### End Shift

```bash
POST /api/mobile/driver/shift/end
{
  "location": {
    "latitude": 25.2854,
    "longitude": 51.531
  }
}

# ✅ Should return 200 with shift summary
```

### Shift History

```bash
GET /api/mobile/driver/shift/history?limit=20

# ✅ Should return list of completed shifts
```

---

## Summary of All Status Values Fixed

| Location                | Line | Before        | After                       |
| ----------------------- | ---- | ------------- | --------------------------- |
| existingShift query     | 91   | `'ACTIVE'`    | `'ONLINE'`                  |
| shift create            | 175  | `'ACTIVE'`    | `'ONLINE'`                  |
| activeShift query (end) | 286  | `'ACTIVE'`    | `'ONLINE'`                  |
| shift update (end)      | 310  | `'COMPLETED'` | `'OFFLINE'`                 |
| shift history query     | 402  | `'COMPLETED'` | `'OFFLINE'` + endTime check |
| currentShift query      | 399  | `'ACTIVE'`    | `'ONLINE'`                  |

---

## Important Notes

### Database Design Limitations

1. **No Vehicle Tracking on Shifts**

   - Shifts don't store which vehicle was used
   - If needed, schema migration required to add `vehicleId`

2. **No Driver Status**

   - User model doesn't have a `status` field
   - Driver availability should be inferred from active shift
   - To add this, need schema migration

3. **Duration Not Stored**
   - `duration` is calculated on-the-fly
   - Not stored in database (only startTime/endTime)

### If You Need These Fields

Add to `schema.prisma`:

```prisma
model Shift {
  // ... existing fields
  vehicleId String?
  vehicle   Vehicle? @relation(fields: [vehicleId], references: [id])
}

model User {
  // ... existing fields
  status              DriverStatus?
  lastLocationUpdate  DateTime?
}

enum DriverStatus {
  AVAILABLE
  BUSY
  OFFLINE
}
```

Then run:

```bash
npx prisma migrate dev --name add_vehicle_and_status_fields
npx prisma generate
```

---

## ✅ All Fixed!

The shift API should now work without 500 errors. All fields match the actual database schema.

**Backend is ready to test!** 🎉
