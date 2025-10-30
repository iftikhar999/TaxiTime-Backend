# 🔧 SERVER INTEGRATION GUIDE - Performance Logging

**Quick integration guide for adding performance logging to server.js**

---

## 📝 **CHANGES TO MAKE**

### **File:** `/backend/server.js`

---

### **Step 1: Add Imports (Add after existing requires)**

```javascript
// ===== PERFORMANCE LOGGING =====
const { performanceLoggerMiddleware } = require('./middleware/performanceLogger');
const { createPrismaLoggingMiddleware } = require('./middleware/prismaLogger');
```

---

### **Step 2: Add Performance Middleware (After body parser, before routes)**

Find this section:
```javascript
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
```

Add right after it:
```javascript
// Performance logging middleware
app.use(performanceLoggerMiddleware);
console.log('📊 Performance logging enabled');
```

---

### **Step 3: Add Prisma Logging (Where Prisma is initialized)**

Find where Prisma client is created:
```javascript
const prisma = new PrismaClient();
```

Add right after:
```javascript
// Add Prisma query logging middleware
prisma.$use(createPrismaLoggingMiddleware());
console.log('🗄️  Database query logging enabled');
```

---

### **Step 4: Add Performance Config Routes (With other admin routes)**

Find admin routes section (or add new section):
```javascript
// Performance configuration routes (Super Admin)
const performanceConfigRouter = require('./routes/admin/performanceConfig');
app.use('/api/admin/performance', performanceConfigRouter);
console.log('🎛️  Performance config API enabled');
```

---

### **Step 5: Add Analysis Endpoint on Startup (Optional)**

At the end of server startup (after `server.listen`):
```javascript
// Schedule periodic performance analysis
const { generateAnalysisReport } = require('./middleware/performanceLogger');

// Generate report every 10 minutes
setInterval(() => {
  console.log('📊 Generating performance analysis report...');
  generateAnalysisReport();
}, 10 * 60 * 1000); // 10 minutes
```

---

## ✅ **COMPLETE EXAMPLE**

```javascript
// ===== EXISTING IMPORTS =====
const express = require('express');
const http = require('http');
const prisma = require('./lib/prisma');
// ... other imports ...

// ===== NEW: PERFORMANCE LOGGING IMPORTS =====
const { performanceLoggerMiddleware } = require('./middleware/performanceLogger');
const { createPrismaLoggingMiddleware } = require('./middleware/prismaLogger');

const app = express();

// ===== EXISTING MIDDLEWARE =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// ===== NEW: PERFORMANCE LOGGING MIDDLEWARE =====
app.use(performanceLoggerMiddleware);
console.log('📊 Performance logging enabled');

// ===== EXISTING: PRISMA SETUP =====
const prisma = new PrismaClient();

// ===== NEW: PRISMA QUERY LOGGING =====
prisma.$use(createPrismaLoggingMiddleware());
console.log('🗄️  Database query logging enabled');

// ===== EXISTING ROUTES =====
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
// ... other routes ...

// ===== NEW: PERFORMANCE CONFIG ROUTES =====
const performanceConfigRouter = require('./routes/admin/performanceConfig');
app.use('/api/admin/performance', performanceConfigRouter);
console.log('🎛️  Performance config API enabled');

// ===== EXISTING: SERVER START =====
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // ===== NEW: PERIODIC ANALYSIS (OPTIONAL) =====
  const { generateAnalysisReport } = require('./middleware/performanceLogger');
  setInterval(() => {
    console.log('📊 Auto-generating performance report...');
    generateAnalysisReport();
  }, 10 * 60 * 1000); // Every 10 minutes
});
```

---

## 🧪 **VERIFICATION**

After starting the server, you should see:
```
Server running on port 3000
📊 Performance logging enabled
🗄️  Database query logging enabled
🎛️  Performance config API enabled
```

And the `/backend/logs/` directory should be created automatically.

---

## 🚀 **THAT'S IT!**

Total time: **5 minutes**

Now:
1. Restart server
2. Wait 10 minutes
3. Run: `node scripts/analyze-performance.js`
4. Review recommendations
5. Optimize!

