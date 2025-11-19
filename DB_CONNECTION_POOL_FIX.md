# Database Connection Pool Fix

## Problem

The application was experiencing "too many clients already" errors from PostgreSQL due to connection pool exhaustion.

## Root Causes

1. **No Connection Pooling Limits**: Prisma Client was created without connection pool limits
2. **Multiple Prisma Instances**: Hot-reloading in development was creating new Prisma instances on each reload
3. **No Graceful Shutdown**: Connections weren't properly closed when the server stopped
4. **Default Pool Size**: Prisma default is `num_cpus * 2 + 1`, which can be too high

## Fixes Applied

### 1. Singleton Pattern in Prisma Client (`lib/prisma.js`)

**Before:**

```javascript
const prisma = new PrismaClient({ ... });
```

**After:**

```javascript
let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({ ... });
} else {
  // Use global to prevent multiple instances during hot-reload
  if (!globalThis.prisma) {
    globalThis.prisma = new PrismaClient({ ... });
  }
  prisma = globalThis.prisma;
}
```

**Impact**: Prevents multiple Prisma instances during development hot-reload

### 2. Connection Pool Limits in DATABASE_URL (`.env`)

**Before:**

```
DATABASE_URL="postgresql://postgres@localhost:5431/taxitime_local"
```

**After:**

```
DATABASE_URL="postgresql://postgres@localhost:5431/taxitime_local?connection_limit=10&pool_timeout=10"
```

**Parameters:**

- `connection_limit=10`: Maximum 10 concurrent connections from this app
- `pool_timeout=10`: Wait up to 10 seconds for an available connection

**Impact**: Limits connections to 10 per Prisma instance, preventing pool exhaustion

### 3. Enhanced Graceful Shutdown (`server.js`)

**Added:**

```javascript
const gracefulShutdown = async (signal) => {
  // Stop HTTP server
  server.close();

  // Stop cron jobs
  stopAllCronJobs();

  // Close Socket.IO
  io.close();

  // Disconnect Prisma
  await prisma.$disconnect();

  process.exit(0);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
process.on("uncaughtException", gracefulShutdown);
```

**Impact**: Properly closes all database connections when server stops

### 4. Connection Monitoring Tool (`check-db-connections.js`)

**Added scripts:**

```bash
npm run db:connections      # Check current connection status
npm run db:kill-idle        # Kill idle connections older than 5 minutes
```

**Impact**: Provides visibility into connection pool usage and health

## PostgreSQL Connection Limits

Default PostgreSQL `max_connections` is usually **100**.

**Current allocation strategy:**

- Prisma Client: 10 connections max
- Leave ~90 connections for:
  - Other Prisma instances (if any)
  - Manual database tools (pgAdmin, psql)
  - Connection poolers (PgBouncer, etc.)
  - Other applications

## Best Practices

### ✅ DO:

- Use a single Prisma Client instance across your application
- Set appropriate `connection_limit` in DATABASE_URL
- Implement graceful shutdown handlers
- Monitor connection pool usage regularly
- Close Prisma Client when application exits

### ❌ DON'T:

- Create new `PrismaClient()` in every module/route
- Set `connection_limit` too high (> 20 for most apps)
- Leave connections open after application crashes
- Ignore "too many clients" warnings

## Monitoring

### Check current connections:

```bash
npm run db:connections
```

**Output:**

```
📊 Connection Statistics:
   Total Connections: 7
   Active: 1
   Idle: 6
   Available: 93
   Max Allowed: 100
```

### Kill old idle connections:

```bash
npm run db:kill-idle
```

## Troubleshooting

### Error: "too many clients already"

**Immediate fix:**

```bash
# 1. Stop the server
Ctrl+C

# 2. Kill idle connections
npm run db:kill-idle

# 3. Restart server
npm run dev
```

### Connection pool still exhausted?

1. **Check for connection leaks:**

   ```bash
   npm run db:connections
   ```

   Look for many idle connections

2. **Reduce connection_limit:**
   Edit `.env` and reduce from 10 to 5:

   ```
   DATABASE_URL="...?connection_limit=5&pool_timeout=10"
   ```

3. **Increase PostgreSQL max_connections:**

   ```bash
   # Edit postgresql.conf
   max_connections = 200

   # Restart PostgreSQL
   brew services restart postgresql@14
   ```

4. **Check for orphaned Prisma instances:**
   ```bash
   # Search for multiple PrismaClient creations
   grep -r "new PrismaClient" backend/
   ```

## Performance Tips

1. **Use connection pooling** (already implemented)
2. **Reuse Prisma Client** across requests (singleton pattern)
3. **Batch queries** when possible with `Promise.all()`
4. **Set query timeout** to prevent long-running queries
5. **Monitor slow queries** with Prisma logging

## Production Recommendations

For production deployment:

1. **Use PgBouncer** for connection pooling:

   ```
   DATABASE_URL="postgresql://user:pass@pgbouncer:6432/db?connection_limit=20"
   ```

2. **Increase connection_limit** for production:

   ```
   connection_limit=20  # Production
   connection_limit=10  # Development
   ```

3. **Monitor with metrics**:

   - Database connection count
   - Connection wait time
   - Query duration
   - Pool utilization %

4. **Set up alerts** for:
   - Connection pool > 80% utilization
   - Queries taking > 5 seconds
   - Connection wait timeouts

## References

- [Prisma Connection Pool](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-prismaclient/connection-pool)
- [PostgreSQL Connection Limits](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [Node.js Graceful Shutdown](https://blog.heroku.com/best-practices-nodejs-errors)
