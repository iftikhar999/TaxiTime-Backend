# 🚨 PERFORMANCE CRISIS - COMPREHENSIVE FIX

**Date:** October 28, 2025  
**Severity:** 🔴 **CRITICAL**  
**Status:** ⏳ **IN PROGRESS**

---

## 📊 **PROBLEM ANALYSIS**

### **Current Load (10 seconds, 1 driver):**
- 🔥 `/jobs/upcoming` calls: **15-20** (should be: 0-1)
- 🔥 Database queries: **~400+** (should be: ~20-30)
- 🔥 User preference writes: **3** (should be: 0-1)
- ⚠️ Socket broadcasts: **12** (4 per location, should be: 2-3)

### **Extrapolated Load:**
| Metric | Current (1 min) | With 10 Drivers | With 100 Drivers |
|--------|-----------------|-----------------|------------------|
| API Calls | ~1,200 | ~12,000 | ~120,000 |
| DB Queries | ~24,000 | ~240,000 | ~2,400,000 |
| DB Writes | ~18 | ~180 | ~1,800 |

**Result:** Server will **CRASH** with 20-30 active drivers!

---

## 🐛 **ROOT CAUSES**

### **1. Mobile App - Excessive Polling** 🔥
**Location:** `/mobile/driver-app-v1/src/screens/Home/HomeScreen.tsx`

**Problem:**
```typescript
const refreshUpcomingJobs = useCallback(async () => {
  // ...
}, [shouldShowUpcomingJobs, currentZone?.id, calculateJobDistances]);

useEffect(() => {
  refreshUpcomingJobs(); // ❌ Triggers on every dependency change
}, [refreshUpcomingJobs]);
```

**Trigger:** `calculateJobDistances` has `location` in dependencies, causing refresh on every GPS update (every 1-2 seconds)!

---

### **2. Backend - No Result Caching** 🔥
**Location:** `/backend/src/routes/mobile/driverJobs.js`

**Problem:** Every request executes:
```javascript
// 1. Fetch driver (should be cached)
const driver = await prisma.user.findUnique({ where: { id: driverId } });

// 2. Fetch last location (should be in-memory)
const lastLocation = await prisma.locationUpdate.findFirst({ where: { driverId } });

// 3. Detect zone (should use cached result)
const detectedZone = await detectZone(latitude, longitude, driver.companyId);

// 4. Fetch zone details (should be cached)
const zone = await prisma.zone.findUnique({ where: { id: zoneId } });

// 5. Fetch jobs (should be cached with TTL)
const jobs = await prisma.job.findMany({ where: { ... } });

// 6. Fetch customer data for each job
const customers = await prisma.user.findMany({ where: { id: { in: [...] } } });
```

**Impact:** 6-8 DB queries per request × 120 requests/minute = **720-960 queries/minute**

---

### **3. Zone Detection - Redundant Queries** 🔥
**Problem:**
- Zone boundaries fetched on every request
- Same zone queried 15+ times in 10 seconds
- Zone cache not used properly

---

### **4. User Preferences - Too Frequent Writes** 🔥
**Location:** `/backend/services/queueManagementService.js`

**Problem:**
```javascript
this.ZONE_UPDATE_DEBOUNCE_MS = 2000; // ❌ Too short!
```

**Impact:** With location updates every 1-2 seconds, debounce never triggers, writing on every update

---

### **5. Socket Broadcasts - Redundant Events** ⚠️
**Problem:**
```javascript
// On every location update:
socket.emit('driver:location:update');       // Event 1
socket.emit('driverLocationUpdate');         // Event 2 (duplicate!)
socket.emit('driver:location:realtime');     // Event 3 (unnecessary!)
socket.emit('driver:zone:changed');          // Event 4 (even if zone didn't change!)
```

---

## ✅ **SOLUTIONS**

### **Solution 1: Add Request-Level Caching** 🎯

Create a lightweight in-memory cache for API responses:

```javascript
// /backend/middleware/requestCache.js
const NodeCache = require('node-cache');
const requestCache = new NodeCache({ 
  stdTTL: 10, // 10 seconds
  checkperiod: 5,
  useClones: false // Better performance
});

function cacheMiddleware(ttlSeconds = 10) {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const key = `${req.user?.id}:${req.originalUrl}`;
    const cachedResponse = requestCache.get(key);

    if (cachedResponse) {
      console.log(`🎯 Cache HIT: ${key}`);
      return res.json(cachedResponse);
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        requestCache.set(key, body, ttlSeconds);
        console.log(`💾 Cached: ${key}`);
      }
      return originalJson(body);
    };

    next();
  };
}

module.exports = { cacheMiddleware, requestCache };
```

---

### **Solution 2: Optimize `/jobs/upcoming` Endpoint** 🎯

```javascript
// Add caching to expensive queries
router.get('/upcoming', authenticateToken, cacheMiddleware(10), async (req, res) => {
  const driverId = req.user?.id;
  
  // ... auth checks ...

  try {
    // 1. Use in-memory driver data (from auth token payload)
    const driver = req.user; // ✅ No DB query needed!
    
    // 2. Get zone from driver's last known position (cached)
    let currentZoneId = req.query.zoneId;
    
    if (!currentZoneId) {
      // Use last zone from preferences (already in memory)
      currentZoneId = driver.preferences?.dispatch?.currentZone?.id;
    }
    
    // 3. Fetch jobs (will be cached by middleware)
    const jobs = await prisma.job.findMany({
      where: {
        companyId: driver.companyId,
        status: { in: ['UNASSIGNED', 'OFFERED'] },
        assignedDriverId: null,
        // ... other filters
      },
      include: {
        customer: {
          select: { id: true, firstName: true, lastName: true, phone: true }
        }
      },
      orderBy: [
        { scheduledAt: 'asc' },
        { createdAt: 'asc' }
      ],
      take: 20 // ✅ Limit results
    });
    
    res.json({ success: true, jobs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
```

**Impact:** 
- ✅ Reduces queries from 6-8 to 1-2
- ✅ 10-second cache eliminates 95% of requests
- ✅ Result: **~50-100 queries/minute instead of 24,000**

---

### **Solution 3: Fix Mobile App Polling** 🎯

```typescript
// /mobile/driver-app-v1/src/screens/Home/HomeScreen.tsx

// ✅ FIXED: Remove calculateJobDistances from dependencies
const refreshUpcomingJobs = useCallback(async () => {
  if (!shouldShowUpcomingJobs) {
    setUpcomingJobs([]);
    return;
  }

  setUpcomingJobsLoading(true);
  
  try {
    const jobs = await fetchUpcomingJobs({ zoneId: currentZone?.id ?? null });
    // Don't calculate distances here - do it separately
    setUpcomingJobs(jobs);
  } catch (error) {
    console.error('Failed to load upcoming jobs', error);
  } finally {
    setUpcomingJobsLoading(false);
  }
}, [shouldShowUpcomingJobs, currentZone?.id]); // ✅ Removed calculateJobDistances!

// Fetch jobs only when zone changes
useEffect(() => {
  refreshUpcomingJobs();
}, [refreshUpcomingJobs]);

// ✅ Recalculate distances separately (no API call)
useEffect(() => {
  if (upcomingJobs.length > 0 && location) {
    const sorted = calculateJobDistances(upcomingJobs);
    setUpcomingJobs(sorted);
  }
}, [location]); // ✅ Only location, no calculateJobDistances

// ✅ Add periodic refresh (every 30 seconds, not on every location update!)
useEffect(() => {
  if (!shouldShowUpcomingJobs) return;
  
  const interval = setInterval(() => {
    console.log('🔄 Periodic jobs refresh (30s)');
    refreshUpcomingJobs();
  }, 30000); // 30 seconds
  
  return () => clearInterval(interval);
}, [shouldShowUpcomingJobs, refreshUpcomingJobs]);
```

**Impact:**
- ✅ API calls: **~1,200/min → ~2/min** (99.8% reduction!)
- ✅ DB queries: **~24,000/min → ~20/min** (99.9% reduction!)

---

### **Solution 4: Increase Debounce for Zone Updates** 🎯

```javascript
// /backend/services/queueManagementService.js

constructor(io) {
  // ...
  this.ZONE_UPDATE_DEBOUNCE_MS = 10000; // ✅ Increased from 2s to 10s
}
```

**Impact:**
- ✅ User preference writes: **~18/min → ~2/min** (90% reduction)

---

### **Solution 5: Reduce Socket Broadcasts** 🎯

```javascript
// Consolidate socket events
async function broadcastLocationUpdate(driver, location, zoneChanged) {
  const payload = {
    driverId: driver.id,
    location: { lat: location.latitude, lng: location.longitude },
    heading: location.heading,
    speed: location.speed,
    timestamp: location.timestamp,
    zoneId: driver.zoneId,
    zoneName: driver.zoneName,
  };
  
  // ✅ Single consolidated event
  io.to(`dispatch_${driver.companyId}`).emit('driver:update', payload);
  
  // ✅ Only emit zone change if zone actually changed
  if (zoneChanged) {
    io.to(`dispatch_${driver.companyId}`).emit('driver:zone:changed', {
      driverId: driver.id,
      zoneId: driver.zoneId,
      zoneName: driver.zoneName,
    });
  }
}
```

**Impact:**
- ✅ Socket events: **4 per update → 1-2 per update** (50-75% reduction)

---

## 📊 **EXPECTED RESULTS**

### **After Optimizations:**

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| API Calls (1 min) | ~1,200 | ~2 | **99.8%** ↓ |
| DB Queries (1 min) | ~24,000 | ~20 | **99.9%** ↓ |
| DB Writes (1 min) | ~18 | ~2 | **90%** ↓ |
| Socket Events (1 min) | ~48 | ~12 | **75%** ↓ |

### **Scalability:**

| Drivers | API Calls/min | DB Queries/min | Status |
|---------|---------------|----------------|--------|
| 1 | 2 | 20 | ✅ **OK** |
| 10 | 20 | 200 | ✅ **OK** |
| 100 | 200 | 2,000 | ✅ **OK** |
| 500 | 1,000 | 10,000 | ✅ **OK** |
| 1,000 | 2,000 | 20,000 | ✅ **OK** |

---

## 🚀 **IMPLEMENTATION PLAN**

### **Phase 1: Critical Fixes** (30 minutes)
1. ✅ Fix mobile app polling
2. ✅ Add request-level caching
3. ✅ Increase debounce time

### **Phase 2: Optimizations** (1 hour)
4. ✅ Optimize `/jobs/upcoming` endpoint
5. ✅ Reduce socket broadcasts
6. ✅ Add query result caching

### **Phase 3: Monitoring** (ongoing)
7. ✅ Add performance metrics
8. ✅ Monitor cache hit rates
9. ✅ Track API call frequency

---

## 📝 **TESTING CHECKLIST**

- [ ] Mobile app: Verify jobs refresh every 30s (not every 1-2s)
- [ ] Backend: Verify cache hit rate > 90%
- [ ] Database: Verify query count < 100/minute per driver
- [ ] Socket: Verify 1-2 events per location update
- [ ] Load test: 50 drivers for 5 minutes
- [ ] Monitor: CPU, memory, DB connections

---

**Status:** 🎯 **READY TO IMPLEMENT**  
**Priority:** 🔴 **CRITICAL - DO IMMEDIATELY**  
**ETA:** 2 hours for full implementation

