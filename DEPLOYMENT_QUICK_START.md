# 🚀 TAXITIME V2 - DEPLOYMENT QUICK START

**Last Updated:** November 10, 2025  
**Lightsail SSH Key:** `~/Downloads/LightsailDefaultKey-ap-southeast-2.pem`

---

## 📁 FILES CREATED FOR DEPLOYMENT

| File                           | Purpose                                | Location                          |
| ------------------------------ | -------------------------------------- | --------------------------------- |
| `seed-final-production.js`     | Database seeder with all master data   | `/Applications/A_B_TAXI/backend/` |
| `DEPLOYMENT_GUIDE_COMPLETE.md` | Complete step-by-step deployment guide | `/Applications/A_B_TAXI/backend/` |
| `DEPLOYMENT_CHECKLIST.md`      | Comprehensive deployment checklist     | `/Applications/A_B_TAXI/backend/` |
| `deploy-complete.sh`           | Automated deployment script            | `/Applications/A_B_TAXI/backend/` |
| `build-frontends.sh`           | Frontend build automation              | `/Applications/A_B_TAXI/backend/` |
| `build-driver-apk.sh`          | Driver app APK builder                 | `/Applications/A_B_TAXI/backend/` |

---

## ⚡ QUICK DEPLOYMENT (3 Commands)

### 1. Deploy Backend + Frontends to Lightsail

```bash
cd /Applications/A_B_TAXI/backend

# Replace YOUR_SERVER_IP with actual Lightsail IP
./deploy-complete.sh YOUR_SERVER_IP
```

**This script will:**

- ✅ Backup database
- ✅ Pull latest code
- ✅ Run database migrations
- ✅ Deploy backend API
- ✅ Deploy Super Admin, Owner Panel, Dispatch Portal
- ✅ Restart all services
- ✅ Verify deployment

### 2. Build Driver App APK

```bash
cd /Applications/A_B_TAXI/backend

# Replace with your production API URL
./build-driver-apk.sh https://api.taxitime.com
```

**This script will:**

- ✅ Update API configuration
- ✅ Install dependencies
- ✅ Build release APK
- ✅ Generate installation guide
- ✅ Restore dev configuration

**Output:** `taxitime-driver-v2.0-YYYYMMDD.apk`

### 3. Run Production Seeder (Fresh Database Only)

```bash
# SSH into Lightsail server
ssh -i ~/Downloads/LightsailDefaultKey-ap-southeast-2.pem ubuntu@YOUR_SERVER_IP

# Navigate to backend
cd /var/www/taxitime-backend

# Run seeder
node seed-final-production.js
```

**This will create:**

- ✅ Super Admin account (`admin@taxitime.com`)
- ✅ Vehicle Types (Sedan, SUV, Van, Wheelchair)
- ✅ Payment Methods (Cash, Card, EFTPOS, Account, Gift Card)
- ✅ Global Configuration
- ✅ Database Indexes

---

## 🔑 IMPORTANT CREDENTIALS

### Super Admin (Created by Seeder)

```
Email: admin@taxitime.com
Password: TaxiTime2025!@#
```

⚠️ **CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN!**

### SSH Access

```bash
ssh -i ~/Downloads/LightsailDefaultKey-ap-southeast-2.pem ubuntu@YOUR_SERVER_IP
```

---

## 📋 DATABASE CHANGES INCLUDED

### New Tables

- ✅ `driver_earnings` - Detailed earnings tracking
- ✅ `driver_earnings_summaries` - Daily/weekly/monthly aggregates

### New Columns on `jobs` Table

- ✅ `actualDistanceKm` - Real GPS-tracked distance
- ✅ `actualDurationSeconds` - Real trip duration
- ✅ `startedAt` - Trip start timestamp

### New Columns on `company_settings` Table

- ✅ `locationUpdateInterval` - GPS update frequency (1-60 seconds)
- ✅ `heartbeatInterval` - Driver heartbeat check

### New Indexes (Performance Optimization)

- ✅ Jobs by status and company
- ✅ Driver locations with geospatial index
- ✅ Shifts by driver and date
- ✅ Assignments by job and driver
- ✅ Earnings by driver and date
- ✅ Users by company and role

---

## 🌐 EXPECTED URLS AFTER DEPLOYMENT

| Service         | URL                             | Port |
| --------------- | ------------------------------- | ---- |
| Backend API     | `https://api.taxitime.com`      | 3000 |
| Super Admin     | `https://admin.taxitime.com`    | 3002 |
| Owner Panel     | `https://owner.taxitime.com`    | 3003 |
| Dispatch Portal | `https://dispatch.taxitime.com` | 3004 |
| Public Website  | `https://taxitime.com`          | 3001 |

_(Or http://YOUR_SERVER_IP:PORT if domains not configured yet)_

---

## ✅ POST-DEPLOYMENT VERIFICATION

### 1. Check All Services Running

```bash
ssh -i ~/Downloads/LightsailDefaultKey-ap-southeast-2.pem ubuntu@YOUR_SERVER_IP

pm2 status
```

**Expected Output:**

```
┌─────┬────────────────────────┬─────────┬─────────┬──────────┐
│ id  │ name                   │ mode    │ status  │ restart  │
├─────┼────────────────────────┼─────────┼─────────┼──────────┤
│ 0   │ taxitime-backend       │ fork    │ online  │ 0        │
│ 1   │ taxitime-super-admin   │ fork    │ online  │ 0        │
│ 2   │ taxitime-owner-panel   │ fork    │ online  │ 0        │
│ 3   │ taxitime-dispatch      │ fork    │ online  │ 0        │
└─────┴────────────────────────┴─────────┴─────────┴──────────┘
```

### 2. Test Backend API

```bash
# From your local machine
curl https://api.taxitime.com/api/health

# Expected: {"status":"ok","timestamp":"..."}
```

### 3. Test Super Admin Login

1. Open `https://admin.taxitime.com`
2. Login with:
   - Email: `admin@taxitime.com`
   - Password: `TaxiTime2025!@#`
3. Should see admin dashboard

### 4. Test Driver App

1. Install APK on Android device
2. Open app
3. Login with test driver credentials
4. Start shift
5. Check dispatch portal - driver should appear on map

---

## 🐛 COMMON ISSUES & FIXES

### Issue: Port 5432 already in use

```bash
# Find what's using the port
sudo lsof -i :5432

# Stop the existing PostgreSQL
sudo systemctl stop postgresql

# Or use a different port in .env.production
```

### Issue: Backend won't start

```bash
# Check logs
pm2 logs taxitime-backend --lines 100

# Common fixes:
# 1. Check DATABASE_URL in .env.production
# 2. Verify database is running: sudo systemctl status postgresql
# 3. Check if port 3000 is free: sudo lsof -i :3000
```

### Issue: Driver app can't connect

**Check:**

1. API URL in app matches server URL
2. Server is accessible from internet
3. Firewall allows ports 80, 443
4. Backend is running: `pm2 status`

### Issue: Location updates not working

**Check:**

1. Company `locationUpdateInterval` setting in database
2. Driver app logs: `adb logcat | grep LocationTracking`
3. Backend logs: `pm2 logs taxitime-backend | grep location`
4. GPS permissions granted in app

---

## 📞 NEXT STEPS AFTER DEPLOYMENT

### 1. Secure the System

- [ ] Change super admin password
- [ ] Configure firewall rules
- [ ] Set up SSL certificates (Let's Encrypt)
- [ ] Configure automated backups

### 2. Configure First Company

- [ ] Login as super admin
- [ ] Create first company
- [ ] Set company settings (GPS interval, commission rate, etc.)
- [ ] Create owner account for company
- [ ] Add vehicle types to company
- [ ] Create zones and tariffs

### 3. Onboard First Driver

- [ ] Owner creates driver account
- [ ] Assign vehicle to driver
- [ ] Driver installs APK
- [ ] Driver logs in and starts shift
- [ ] Verify location updates in dispatch

### 4. Test Complete Flow

- [ ] Create test booking from dispatch
- [ ] Assign to online driver
- [ ] Driver accepts job
- [ ] Driver picks up passenger
- [ ] Driver completes trip
- [ ] Verify earnings calculated
- [ ] Check all real-time updates worked

### 5. Monitor & Optimize

- [ ] Watch PM2 logs for errors
- [ ] Monitor server resources (CPU, memory, disk)
- [ ] Check database performance
- [ ] Optimize slow queries if needed
- [ ] Set up error tracking (Sentry)

---

## 📚 DOCUMENTATION REFERENCE

For detailed information, refer to:

1. **[DEPLOYMENT_GUIDE_COMPLETE.md](./DEPLOYMENT_GUIDE_COMPLETE.md)**

   - Complete step-by-step deployment instructions
   - Troubleshooting guide
   - Server configuration details

2. **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)**

   - Comprehensive deployment checklist
   - Pre and post-deployment verification
   - Security checklist
   - Rollback procedures

3. **[seed-final-production.js](./seed-final-production.js)**

   - Production database seeder script
   - Master data definitions
   - Database verification logic

4. **[LIGHTSAIL_COMPLETE_PLATFORM_SETUP.md](./LIGHTSAIL_COMPLETE_PLATFORM_SETUP.md)**
   - Infrastructure setup guide
   - Server provisioning
   - Nginx configuration

---

## 🆘 NEED HELP?

### View Logs

```bash
# All services
pm2 logs

# Specific service
pm2 logs taxitime-backend --lines 100

# Follow logs in real-time
pm2 logs taxitime-backend --lines 0
```

### Restart Services

```bash
# Restart all
pm2 restart all

# Restart specific service
pm2 restart taxitime-backend
```

### Database Access

```bash
# Connect to PostgreSQL
sudo -u postgres psql taxitime

# Check tables
\dt

# Check recent jobs
SELECT id, status, "createdAt" FROM jobs ORDER BY "createdAt" DESC LIMIT 10;

# Exit
\q
```

### Server Resources

```bash
# Check CPU and memory
htop

# Check disk space
df -h

# Check database size
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('taxitime'));"
```

---

## ⚠️ CRITICAL REMINDERS

1. **ALWAYS backup database before deployment**

   ```bash
   sudo -u postgres pg_dump taxitime > ~/backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Test locally before deploying to production**

3. **Change default passwords immediately**

4. **Monitor logs after deployment**

   ```bash
   pm2 logs --lines 100
   ```

5. **Keep SSH key secure** - Never commit to repository

6. **Document any changes** made during deployment

---

## 📊 DEPLOYMENT SUMMARY TEMPLATE

After successful deployment, fill this out:

```
═══════════════════════════════════════════════════════════════
DEPLOYMENT SUMMARY
═══════════════════════════════════════════════════════════════

Date: _______________
Time: _______________
Deployed By: _______________

Server IP: _______________
Branch: development
Commit: _______________

Components Deployed:
✅ Backend API
✅ Database (migrations + seeder)
✅ Super Admin Panel
✅ Owner Panel
✅ Dispatch Portal
✅ Driver App APK

Database Changes:
✅ driver_earnings table
✅ driver_earnings_summaries table
✅ jobs.actualDistanceKm column
✅ jobs.actualDurationSeconds column
✅ jobs.startedAt column
✅ company_settings.locationUpdateInterval column
✅ All performance indexes

Issues Encountered:
[None / List any issues]

Rollback Plan:
Database backup: ~/backup_YYYYMMDD_HHMMSS.sql
Previous commit: [HASH]

Post-Deployment Tests:
✅ All PM2 processes online
✅ Backend API responding
✅ Super admin login works
✅ Driver app connects
✅ Location updates working
✅ Jobs can be created
✅ Earnings calculated correctly

Notes:
_______________

═══════════════════════════════════════════════════════════════
```

---

**Ready to deploy? Start with:** `./deploy-complete.sh YOUR_SERVER_IP`

Good luck! 🚀
