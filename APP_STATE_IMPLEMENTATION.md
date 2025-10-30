# 📱 APP STATE TRACKING - Backend Implementation Guide

## 🎯 **WHAT WE'RE ADDING**

The mobile driver app now sends app state changes to the dispatcher:
- `ACTIVE` - App is in foreground (driver actively using it)
- `BACKGROUND` - App is minimized (still running, location tracking active)
- `INACTIVE` - App is transitioning

This allows dispatchers to see if a driver's app is minimized vs actively being used.

---

## 📡 **SOCKET EVENT FROM MOBILE APP**

The mobile app emits this event when app state changes:

```javascript
Event: 'driver:app:state'

Payload:
{
  driverId: "cmgt7lmqs000ymxarz2f1edxx",
  appState: "BACKGROUND",  // or "ACTIVE" or "INACTIVE"
  timestamp: 1761668160115
}
```

---

## 🔧 **BACKEND IMPLEMENTATION**

### **Step 1: Add Socket Event Handler**

In your socket handler file (wherever you handle driver events), add:

```javascript
// Listen for app state changes
driverSocket.on('driver:app:state', async (data) => {
  try {
    console.log(`📱 Driver app state changed: ${data.driverId} → ${data.appState}`);
    
    const { driverId, appState, timestamp } = data;
    
    // Update driver's app state in memory (or cache)
    // You can store this in Redis, in-memory cache, or database
    
    // Broadcast to dispatchers
    const broadcastPayload = {
      driverId,
      appState,
      timestamp: timestamp || Date.now(),
    };
    
    // Emit to dispatch namespace
    dispatchNamespace
      .to(`dispatch_${driverSocket.companyId}`)
      .emit('driver:app:state:update', broadcastPayload);
    
    // Also emit to company-wide room
    dispatchNamespace
      .to(`company_${driverSocket.companyId}`)
      .emit('driver:app:state:update', broadcastPayload);
    
    console.log(`✅ App state broadcasted to dispatchers: ${driverId} is ${appState}`);
    
  } catch (error) {
    console.error('❌ Error handling driver app state:', error);
  }
});
```

---

### **Step 2: Include App State in Location Updates**

Update your `driver:location:update` handler to include app state:

```javascript
driverSocket.on('driver:location:update', async (data) => {
  try {
    const { driverId, location, appState } = data;
    
    // Your existing location update logic...
    
    // Include app state in the broadcast
    const locationPayload = {
      driverId,
      latitude: location.latitude,
      longitude: location.longitude,
      speed: location.speed,
      heading: location.heading,
      accuracy: location.accuracy,
      timestamp: location.timestamp,
      appState: appState || 'ACTIVE', // ✨ NEW: Include app state
      // ... other fields
    };
    
    // Broadcast to dispatchers
    dispatchNamespace
      .to(`dispatch_${driverSocket.companyId}`)
      .emit('driver:location:update', locationPayload);
    
  } catch (error) {
    console.error('Error handling driver location:', error);
  }
});
```

---

### **Step 3: Store App State (Optional)**

If you want to persist app state, you can:

**Option A: In-Memory Cache (Recommended)**
```javascript
// Store in memory
const driverAppStates = new Map();

driverSocket.on('driver:app:state', async (data) => {
  driverAppStates.set(data.driverId, {
    appState: data.appState,
    timestamp: data.timestamp,
  });
  
  // ... broadcast logic
});
```

**Option B: Redis (If Using Redis)**
```javascript
driverSocket.on('driver:app:state', async (data) => {
  await redis.setex(
    `driver:appstate:${data.driverId}`,
    300, // Expire after 5 minutes
    JSON.stringify({
      appState: data.appState,
      timestamp: data.timestamp,
    })
  );
  
  // ... broadcast logic
});
```

**Option C: Database (Not Recommended - Too Slow)**
```javascript
// Only if you really need long-term tracking
await prisma.driver.update({
  where: { id: data.driverId },
  data: {
    appState: data.appState,
    appStateUpdatedAt: new Date(data.timestamp),
  },
});
```

---

## 🎨 **DISPATCH PORTAL IMPLEMENTATION**

### **Step 1: Listen to App State Updates**

In your dispatch React component:

```typescript
// Listen for app state updates
useEffect(() => {
  if (!socket) return;
  
  socket.on('driver:app:state:update', (data) => {
    console.log(`📱 Driver ${data.driverId} app state: ${data.appState}`);
    
    // Update driver in state
    setDrivers((prev) =>
      prev.map((driver) =>
        driver.id === data.driverId
          ? { ...driver, appState: data.appState, appStateUpdatedAt: data.timestamp }
          : driver
      )
    );
  });
  
  return () => {
    socket.off('driver:app:state:update');
  };
}, [socket]);
```

---

### **Step 2: Display App State in Driver Table**

Add app state indicator to the driver table:

```tsx
// In your driver table component
<TableCell>
  <div className="flex items-center gap-2">
    {/* Existing status badge */}
    <StatusBadge status={driver.status} />
    
    {/* NEW: App state indicator */}
    {driver.appState === 'BACKGROUND' && (
      <Tooltip content="App minimized">
        <span className="flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
          <PhoneOff size={12} />
          BG
        </span>
      </Tooltip>
    )}
    
    {driver.appState === 'ACTIVE' && (
      <Tooltip content="App active">
        <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
          <Phone size={12} />
        </span>
      </Tooltip>
    )}
  </div>
</TableCell>
```

---

### **Step 3: Show in Driver Details Panel**

```tsx
<div className="driver-details">
  <h3>{driver.name}</h3>
  <p>Status: {driver.status}</p>
  
  {/* NEW: App state */}
  <p className="flex items-center gap-2">
    <span>App:</span>
    {driver.appState === 'BACKGROUND' ? (
      <span className="text-orange-600">📱 Minimized</span>
    ) : driver.appState === 'ACTIVE' ? (
      <span className="text-green-600">📱 Active</span>
    ) : (
      <span className="text-gray-500">📱 Unknown</span>
    )}
  </p>
</div>
```

---

## 📊 **EXPECTED LOGS**

### **Backend (when driver minimizes app):**
```
📱 Driver app state changed: cmgt7lmqs000ymxarz2f1edxx → BACKGROUND
✅ App state broadcasted to dispatchers: cmgt7lmqs000ymxarz2f1edxx is BACKGROUND
```

### **Backend (when driver returns to app):**
```
📱 Driver app state changed: cmgt7lmqs000ymxarz2f1edxx → ACTIVE
✅ App state broadcasted to dispatchers: cmgt7lmqs000ymxarz2f1edxx is ACTIVE
```

### **Dispatch Portal:**
```
📱 Driver cmgt7lmqs000ymxarz2f1edxx app state: BACKGROUND
```

---

## 🧪 **TESTING**

### **Test 1: App Minimization**
1. Driver starts shift
2. Minimize driver app (press home button)
3. **✅ Dispatcher should see "BG" badge next to driver**
4. **✅ Backend logs: "Driver app state changed → BACKGROUND"**

### **Test 2: App Return to Foreground**
1. Driver app is minimized
2. Open driver app again
3. **✅ Dispatcher should see badge change to active/removed**
4. **✅ Backend logs: "Driver app state changed → ACTIVE"**

### **Test 3: Location Updates Include App State**
1. Driver minimizes app
2. Check dispatcher
3. **✅ Driver location updates should include `appState: "BACKGROUND"`**

---

## 📝 **FILES TO MODIFY**

### **Backend:**
```
backend/socket-handlers/enhancedDriverStatusHandlers.js (or your socket handler file)
└── Add 'driver:app:state' event handler
└── Update 'driver:location:update' to include appState

backend/server.js
└── Ensure socket event is registered
```

### **Dispatch Portal:**
```
frontend/dispatch/src/components/DriverTable.tsx
└── Add app state badge

frontend/dispatch/src/hooks/useDriverSocket.ts
└── Listen to 'driver:app:state:update' event

frontend/dispatch/src/store/useDispatchStore.ts
└── Add appState to DispatchDriver interface
```

---

## 🎯 **BENEFITS**

1. ✅ **Dispatcher knows if driver is actively watching app**
2. ✅ **Can identify drivers who might miss job assignments**
3. ✅ **Better understanding of driver behavior**
4. ✅ **Helps with job assignment decisions**
5. ✅ **Debugging: Know if app is running in background**

---

## 💡 **USE CASES**

### **Use Case 1: Job Assignment Priority**
```
If driver.appState === 'ACTIVE':
  → Higher priority for job assignment (driver is watching)
Else if driver.appState === 'BACKGROUND':
  → Still assign, but expect slower response
```

### **Use Case 2: Driver Monitoring**
```
If driver.status === 'AVAILABLE' && driver.appState === 'BACKGROUND':
  → Show warning: "Driver may not see jobs immediately"
```

### **Use Case 3: Analytics**
```
Track:
- How often drivers minimize app during shift
- Average time in background vs foreground
- Correlation between app state and job acceptance rate
```

---

## ✅ **IMPLEMENTATION CHECKLIST**

- [ ] Add `driver:app:state` socket event handler in backend
- [ ] Update `driver:location:update` to include `appState`
- [ ] Add app state storage (memory/Redis)
- [ ] Broadcast app state changes to dispatchers
- [ ] Update dispatch portal to listen for app state updates
- [ ] Add app state badge to driver table
- [ ] Add app state to driver details panel
- [ ] Test app minimization flow
- [ ] Test app return to foreground flow
- [ ] Verify location updates include app state

---

**The mobile app is already sending the events. Just implement the backend handler and dispatch UI!** 🚀

