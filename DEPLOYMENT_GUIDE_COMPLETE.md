# 🚀 TAXITIME V2 - COMPLETE LIGHTSAIL DEPLOYMENT GUIDE

**Deployment Date:** November 2025  
**Server:** AWS Lightsail  
**SSH Key:** `~/Downloads/LightsailDefaultKey-ap-southeast-2.pem`  
**Region:** Asia Pacific (Sydney) - ap-southeast-2

---

## 📋 TABLE OF CONTENTS

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Server Access & Setup](#server-access--setup)
3. [Database Migration](#database-migration)
4. [Backend Deployment](#backend-deployment)
5. [Frontend Deployments](#frontend-deployments)
6. [Mobile App Configuration](#mobile-app-configuration)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 PRE-DEPLOYMENT CHECKLIST

### Local Preparation

- [ ] All code committed to `development` branch
- [ ] All database migrations tested locally
- [ ] Environment variables configured
- [ ] SSH key permissions set correctly
- [ ] Backup existing production database (if applicable)

### Server Information Needed

- [ ] Server IP address
- [ ] Domain names configured
- [ ] SSL certificates ready
- [ ] Database credentials
- [ ] Stripe API keys (production)
- [ ] Google Maps API key

---

## 🔐 SERVER ACCESS & SETUP

### Step 1: Set SSH Key Permissions

```bash
chmod 400 ~/Downloads/LightsailDefaultKey-ap-southeast-2.pem
```

### Step 2: Connect to Lightsail Server

```bash
# Replace YOUR_SERVER_IP with actual IP address
ssh -i ~/Downloads/LightsailDefaultKey-ap-southeast-2.pem ubuntu@YOUR_SERVER_IP
```

### Step 3: Verify Server Setup

Once connected, verify the following services are running:

```bash
# Check PostgreSQL
sudo systemctl status postgresql

# Check Node.js version
node --version  # Should be v18 or higher

# Check PM2
pm2 --version

# Check Nginx
sudo systemctl status nginx

# Check disk space
df -h

# Check memory
free -h
```

---

## 💾 DATABASE MIGRATION

### Step 1: Backup Existing Database (if applicable)

```bash
# On Lightsail server
sudo -u postgres pg_dump taxitime > ~/backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Apply Prisma Migrations

```bash
cd /var/www/taxitime-backend

# Generate Prisma client
npx prisma generate

# Apply all migrations
npx prisma migrate deploy

# Verify migrations
npx prisma migrate status
```

### Step 3: Run Production Seeder

```bash
# Only run this on a FRESH database or if you need to reset master data
node seed-final-production.js
```

**Expected Output:**

```
✅ Super Admin created
✅ Vehicle Types seeded
✅ Payment Methods seeded
✅ Global Configuration created
✅ Database Indexes created
✅ Schema verified
```

### Step 4: Verify Database State

```bash
# Connect to PostgreSQL
sudo -u postgres psql taxitime

# Check tables
\dt

# Check recent migrations
SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;

# Check super admin
SELECT id, email, role, "isActive" FROM users WHERE role = 'SUPER_ADMIN';

# Check vehicle types
SELECT id, name, capacity FROM vehicle_types;

# Exit psql
\q
```

---

## 🖥️ BACKEND DEPLOYMENT

### Step 1: Pull Latest Code

```bash
cd /var/www/taxitime-backend

# Stash any local changes
git stash

# Pull latest from development branch
git checkout development
git pull origin development
```

### Step 2: Install Dependencies

```bash
npm install --production

# Or if you need dev dependencies for build
npm install
```

### Step 3: Configure Environment Variables

```bash
nano .env.production
```

**Critical environment variables to verify:**

```bash
# Database
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/taxitime"

# Server
PORT=3000
NODE_ENV=production

# JWT
JWT_SECRET=YOUR_SECURE_JWT_SECRET_HERE

# Frontend URLs (update with actual domains)
FRONTEND_URLS=https://taxitime.com,https://api.taxitime.com,https://admin.taxitime.com,https://owner.taxitime.com,https://dispatch.taxitime.com

# Google Maps
GOOGLE_MAPS_API_KEY=YOUR_PRODUCTION_GOOGLE_MAPS_KEY

# Stripe (PRODUCTION KEYS!)
STRIPE_SECRET_KEY=sk_live_YOUR_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_PUBLISHABLE_KEY

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=noreply@taxitime.com
EMAIL_PASS=YOUR_EMAIL_PASSWORD
```

### Step 4: Build & Start Backend

```bash
# Generate Prisma client
npx prisma generate

# Stop existing process
pm2 stop taxitime-backend

# Start with production config
pm2 start server.js --name taxitime-backend --env production

# Save PM2 configuration
pm2 save

# View logs
pm2 logs taxitime-backend
```

### Step 5: Verify Backend is Running

```bash
# Check PM2 status
pm2 status

# Test API endpoint
curl http://localhost:3000/api/health

# Check logs for errors
pm2 logs taxitime-backend --lines 50
```

---

## 🌐 FRONTEND DEPLOYMENTS

### Super Admin Panel

```bash
cd /var/www/taxitime-super-admin

# Pull latest code
git checkout development
git pull origin development

# Install dependencies
npm install

# Update API URL in config
nano src/config/api.js
# Change to: const API_URL = 'https://api.taxitime.com'

# Build production bundle
npm run build

# Stop existing process
pm2 stop taxitime-super-admin

# Start with serve
pm2 start "npx serve -s build -l 3002" --name taxitime-super-admin

pm2 save
```

### Owner Panel

```bash
cd /var/www/taxitime-owner-panel

git checkout development
git pull origin development

npm install

# Update API URL
nano src/config/api.js
# Change to: const API_URL = 'https://api.taxitime.com'

npm run build

pm2 stop taxitime-owner-panel
pm2 start "npx serve -s build -l 3003" --name taxitime-owner-panel
pm2 save
```

### Dispatch Portal

```bash
cd /var/www/taxitime-dispatch

git checkout development
git pull origin development

npm install

# Update API URL
nano src/config/api.js
# Change to: const API_URL = 'https://api.taxitime.com'

npm run build

pm2 stop taxitime-dispatch
pm2 start "npx serve -s build -l 3004" --name taxitime-dispatch
pm2 save
```

### Verify All Services Running

```bash
pm2 status

# Expected output:
# taxitime-backend        │ online
# taxitime-super-admin    │ online
# taxitime-owner-panel    │ online
# taxitime-dispatch       │ online
```

---

## 📱 MOBILE APP CONFIGURATION

### Driver App - Update Base URL

```bash
# On your local machine
cd /Applications/A_B_TAXI/mobile/driver-app-v1

# Update API configuration
nano src/config/api.ts
```

**Update the following:**

```typescript
// BEFORE (local)
export const API_BASE_URL = "http://10.0.2.2:3000";

// AFTER (production)
export const API_BASE_URL = "https://api.taxitime.com";

// WebSocket URL
export const SOCKET_URL = "https://api.taxitime.com";
```

### Build Production APK

```bash
cd /Applications/A_B_TAXI/mobile/driver-app-v1

# Clean previous builds
cd android
./gradlew clean
cd ..

# Build release APK
cd android
./gradlew assembleRelease

# APK will be at:
# android/app/build/outputs/apk/release/app-release.apk
```

### Sign APK (if not already signed)

```bash
# Generate keystore (if you don't have one)
keytool -genkey -v -keystore taxitime-driver.keystore -alias taxitime -keyalg RSA -keysize 2048 -validity 10000

# Sign the APK
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore taxitime-driver.keystore android/app/build/outputs/apk/release/app-release.apk taxitime

# Verify signature
jarsigner -verify -verbose -certs android/app/build/outputs/apk/release/app-release.apk
```

### Align APK

```bash
zipalign -v 4 android/app/build/outputs/apk/release/app-release.apk taxitime-driver-v2.0.apk
```

**Final APK:** `taxitime-driver-v2.0.apk`

---

## ✅ POST-DEPLOYMENT VERIFICATION

### Backend Health Checks

```bash
# Health endpoint
curl https://api.taxitime.com/api/health

# Database connectivity
curl https://api.taxitime.com/api/health/db

# Super admin login
curl -X POST https://api.taxitime.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@taxitime.com","password":"TaxiTime2025!@#"}'
```

### Frontend Accessibility

- [ ] Super Admin: https://admin.taxitime.com
- [ ] Owner Panel: https://owner.taxitime.com
- [ ] Dispatch: https://dispatch.taxitime.com

### Database Verification

```bash
# On Lightsail server
sudo -u postgres psql taxitime

-- Check recent jobs
SELECT id, status, "createdAt" FROM jobs ORDER BY "createdAt" DESC LIMIT 5;

-- Check active shifts
SELECT COUNT(*) FROM shifts WHERE status = 'ACTIVE';

-- Check driver locations
SELECT COUNT(*) FROM driver_locations WHERE "isActive" = true AND "createdAt" > NOW() - INTERVAL '5 minutes';

-- Check earnings data
SELECT COUNT(*) FROM driver_earnings;

\q
```

### Mobile App Testing

1. **Install APK on test device**
2. **Login as driver**
3. **Start shift**
4. **Verify location updates** (check backend logs)
5. **Accept test job**
6. **Complete trip**
7. **Check earnings displayed**

### Real-time Features

1. **Open Dispatch Portal**
2. **Start driver shift from mobile app**
3. **Verify driver appears on dispatch map**
4. **Create job from dispatch**
5. **Verify driver receives job notification**

---

## 🐛 TROUBLESHOOTING

### Issue: Backend not starting

```bash
# Check logs
pm2 logs taxitime-backend --lines 100

# Common issues:
# 1. Database connection
sudo -u postgres psql -c "SELECT 1"

# 2. Port already in use
sudo lsof -i :3000

# 3. Missing environment variables
cat .env.production | grep -E "DATABASE_URL|JWT_SECRET"

# Restart with verbose logging
pm2 delete taxitime-backend
NODE_ENV=production DEBUG=* pm2 start server.js --name taxitime-backend
```

### Issue: Database migration failed

```bash
# Reset migrations (⚠️ DESTRUCTIVE!)
npx prisma migrate reset

# Or manually fix
sudo -u postgres psql taxitime
-- Check migration table
SELECT * FROM _prisma_migrations WHERE success = false;
-- Fix issues and re-run
\q

npx prisma migrate deploy
```

### Issue: Frontend 502 Bad Gateway

```bash
# Check if app is running
pm2 status

# Check nginx config
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx

# Check app logs
pm2 logs taxitime-super-admin
```

### Issue: Mobile app can't connect

```bash
# On mobile app, check:
# 1. API URL is correct (https://api.taxitime.com)
# 2. Device has internet connection
# 3. Server firewall allows connections

# On server:
# Check backend is accessible
curl http://localhost:3000/api/health

# Check nginx is proxying correctly
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Issue: Location updates not working

```bash
# Check driver app logs (logcat)
adb logcat | grep "LocationTracking"

# Check backend logs
pm2 logs taxitime-backend | grep "location"

# Verify company settings
sudo -u postgres psql taxitime
SELECT id, "legalName", "locationUpdateInterval" FROM company_settings;
```

---

## 📊 MONITORING

### PM2 Monitoring Dashboard

```bash
pm2 monit
```

### Check Resource Usage

```bash
# CPU and Memory
htop

# Disk usage
df -h

# Database size
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('taxitime'));"
```

### Application Logs

```bash
# Backend
pm2 logs taxitime-backend --lines 100

# Super Admin
pm2 logs taxitime-super-admin --lines 50

# All services
pm2 logs --lines 200
```

---

## 🔄 ROLLBACK PROCEDURE

If deployment fails and you need to rollback:

```bash
# 1. Restore database
sudo -u postgres psql taxitime < ~/backup_YYYYMMDD_HHMMSS.sql

# 2. Checkout previous commit
cd /var/www/taxitime-backend
git log --oneline -10  # Find previous working commit
git checkout COMMIT_HASH

# 3. Restart services
pm2 restart all

# 4. Verify
curl http://localhost:3000/api/health
```

---

## 📝 DEPLOYMENT SUMMARY TEMPLATE

After successful deployment, document:

```
Deployment Date: ___________
Deployed By: ___________
Branch: development
Commit: ___________

Components Deployed:
- [x] Backend API
- [x] Database migrations
- [x] Super Admin Panel
- [x] Owner Panel
- [x] Dispatch Portal
- [x] Driver App APK

Changes Included:
- GPS interval configuration fix
- Driver earnings tracking
- Job metrics (distance, duration, startedAt)
- Database indexes optimization
- New seeder for production

Issues Encountered:
- None / [List any issues]

Rollback Plan:
- Database backup: ~/backup_YYYYMMDD.sql
- Previous commit: HASH

Post-Deployment Verification:
- [x] Super admin can login
- [x] Driver app connects to server
- [x] Location updates working
- [x] Jobs can be created
- [x] Real-time updates functioning

Notes:
___________
```

---

## ⚠️ IMPORTANT SECURITY REMINDERS

1. **Change Super Admin Password** immediately after first login
2. **Rotate JWT_SECRET** regularly
3. **Use HTTPS only** in production
4. **Enable firewall** - only allow ports 80, 443, 22
5. **Regular database backups** - set up automated backups
6. **Monitor logs** for suspicious activity
7. **Keep dependencies updated** - run `npm audit fix` regularly

---

## 🎉 SUCCESS CRITERIA

Deployment is successful when:

- ✅ All PM2 processes show "online"
- ✅ Super admin can login to admin panel
- ✅ Company owner can login to owner panel
- ✅ Dispatcher can login to dispatch portal
- ✅ Driver can login via mobile app
- ✅ Driver location updates every 10 seconds (configurable)
- ✅ Jobs can be created and assigned
- ✅ Real-time updates visible in dispatch
- ✅ Driver earnings calculated correctly
- ✅ No errors in PM2 logs
- ✅ Database queries performing well

---

**Need Help?**

- Check logs: `pm2 logs`
- Review troubleshooting section above
- Contact: dev@taxitime.com

---

**Last Updated:** November 2025
