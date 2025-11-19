# 🚀 TaxiTime Production Deployment Guide

**Server IP:** 54.252.241.150  
**SSH Key:** `LightsailDefaultKey-ap-southeast-2.pem`  
**Date:** November 16, 2025

---

## 📋 STEP 1: Deploy Backend

```bash
# SSH into server
ssh -i LightsailDefaultKey-ap-southeast-2.pem ubuntu@54.252.241.150

# Navigate to backend directory
cd /var/www/taxitime-backend

# Stash any local changes
git stash

# Pull latest code
git checkout development
git pull origin development

# Install dependencies
npm install --omit=dev

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Restart backend with PM2
pm2 restart taxitime-backend || pm2 start server.js --name taxitime-backend

# Save PM2 configuration
pm2 save

# Check status
pm2 status
pm2 logs taxitime-backend --lines 50
```

---

## 📋 STEP 2: Deploy Super Admin Panel

```bash
# Navigate to super admin directory
cd /var/www/taxitime-super-admin

# Stash and pull
git stash
git checkout development
git pull origin development

# Install and build
npm install
npm run build

# Restart with PM2
pm2 restart taxitime-super-admin || pm2 start "npx serve -s build -l 3002" --name taxitime-super-admin
pm2 save
```

---

## 📋 STEP 3: Deploy Owner Panel

```bash
# Navigate to owner panel directory
cd /var/www/taxitime-owner-panel

# Stash and pull
git stash
git checkout development
git pull origin development

# Install and build
npm install
npm run build

# Restart with PM2
pm2 restart taxitime-owner-panel || pm2 start "npx serve -s build -l 3003" --name taxitime-owner-panel
pm2 save
```

---

## 📋 STEP 4: Deploy Dispatch Portal

```bash
# Navigate to dispatch directory
cd /var/www/taxitime-dispatch

# Stash and pull
git stash
git checkout development
git pull origin development

# Install and build
npm install
npm run build

# Restart with PM2
pm2 restart taxitime-dispatch || pm2 start "npx vite preview --port 3004 --host" --name taxitime-dispatch
pm2 save
```

---

## 🔍 STEP 5: Verify Deployment

```bash
# Check all PM2 processes
pm2 status

# Check backend logs
pm2 logs taxitime-backend --lines 30

# Test API health endpoint
curl http://localhost:3000/api/health

# Check if all services are running
ps aux | grep node
```

---

## 📱 STEP 6: Build Driver App APK

**On your local machine:**

```bash
# Navigate to driver app
cd /Applications/A_B_TAXI/mobile/driver-app-v1

# Verify production URL is configured
cat src/config/environment.ts | grep "54.252.241.150"

# If not configured, update it:
code src/config/environment.ts
# Change API_BASE_URL to: http://54.252.241.150:3000/api
# Change SOCKET_BASE_URL to: http://54.252.241.150:3000

# Build APK
chmod +x build-apk.sh
./build-apk.sh
```

The APK will be generated at:
`/Applications/A_B_TAXI/mobile/driver-app-v1/android/app/build/outputs/apk/release/app-release.apk`

---

## 🌐 Access URLs

After deployment, access the applications at:

- **Backend API:** http://54.252.241.150:3000
- **Super Admin:** http://54.252.241.150:3002
- **Owner Panel:** http://54.252.241.150:3003
- **Dispatch:** http://54.252.241.150:3004

---

## 🧪 Post-Deployment Testing

### Test 1: Backend Health

```bash
curl http://54.252.241.150:3000/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Test 2: Login to Dispatch

1. Open: http://54.252.241.150:3004
2. Login with dispatcher credentials
3. Check driver list - should show drivers at correct GPS positions

### Test 3: Create Walk-in Job

1. In dispatch, create a new walk-in job
2. Assign to a driver
3. Verify driver status changes to BUSY
4. Complete job and collect payment
5. Verify driver status changes back to AVAILABLE within 1 second

### Test 4: Driver App

1. Install APK on Android device/emulator
2. Login with driver credentials
3. Verify job notifications work
4. Accept and complete a job
5. Verify sync with dispatch panel

---

## 🔧 Troubleshooting

### Backend not starting:

```bash
pm2 logs taxitime-backend --err
cd /var/www/taxitime-backend
npm install
npx prisma generate
pm2 restart taxitime-backend
```

### Database migration fails:

```bash
cd /var/www/taxitime-backend
npx prisma migrate status
npx prisma migrate resolve --applied 20251115120000_add_user_current_job
npx prisma migrate deploy
```

### Frontend not building:

```bash
# Clear node_modules and rebuild
rm -rf node_modules package-lock.json
npm install
npm run build
```

### PM2 processes not persisting:

```bash
pm2 save
pm2 startup
# Copy and run the command it outputs
```

---

## 📊 Monitor Logs

```bash
# Watch all logs
pm2 logs

# Watch backend only
pm2 logs taxitime-backend --lines 100 --raw

# Watch specific frontend
pm2 logs taxitime-dispatch --lines 50

# Save logs to file
pm2 logs taxitime-backend --lines 500 > backend-deployment-logs.txt
```

---

## 🆘 Emergency Rollback

If deployment fails:

```bash
# Backend rollback
cd /var/www/taxitime-backend
git log --oneline -5  # Find previous commit
git reset --hard <previous-commit-hash>
npm install
npx prisma generate
pm2 restart taxitime-backend

# Frontend rollback (similar process)
cd /var/www/taxitime-dispatch
git reset --hard <previous-commit-hash>
npm install
npm run build
pm2 restart taxitime-dispatch
```

---

## ✅ Deployment Checklist

- [ ] Backend deployed and running (PM2 status shows "online")
- [ ] Database migrations applied successfully
- [ ] Super Admin accessible at port 3002
- [ ] Owner Panel accessible at port 3003
- [ ] Dispatch accessible at port 3004
- [ ] Backend API health check passes
- [ ] Driver app APK built with production server URL
- [ ] Test login to all panels
- [ ] Test driver location display on map
- [ ] Test job creation and completion
- [ ] Verify driver status sync works
- [ ] Monitor logs for errors

---

## 📝 Notes

### Recent Fixes Deployed:

1. **Driver Location Fix** - Queries `location_updates` table instead of stale preferences
2. **Driver Status Fix** - Clears `currentJobId` on job completion
3. **Socket Events** - Emits `driver:status:updated` with `currentJobId: null`

### Environment Variables:

- Production database connection configured
- PM2 environment set to `production`
- All CORS origins properly configured

---

**Deployment Status:** Ready to deploy  
**Last Updated:** November 16, 2025  
**Deployed By:** [Your Name]
