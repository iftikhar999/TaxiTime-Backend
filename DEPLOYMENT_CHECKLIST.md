# 📋 TAXITIME V2 - DEPLOYMENT CHECKLIST

**Deployment Date:** ******\_******  
**Deployed By:** ******\_******  
**Server IP:** ******\_******

---

## ✅ PRE-DEPLOYMENT CHECKLIST

### Code & Repository

- [ ] All changes committed to `development` branch
- [ ] No uncommitted local changes
- [ ] Code pushed to remote repository
- [ ] All team members notified of deployment

### Database

- [ ] Database migrations tested locally
- [ ] Seeder script tested on local database
- [ ] Backup plan in place
- [ ] Migration rollback plan documented

### Environment Configuration

- [ ] `.env.production` file updated with production credentials
- [ ] Stripe production keys obtained (not test keys)
- [ ] Google Maps API key verified
- [ ] JWT_SECRET is secure and different from development
- [ ] Email SMTP credentials verified
- [ ] All sensitive data removed from code

### Infrastructure

- [ ] Lightsail server accessible via SSH
- [ ] SSH key permissions set (400)
- [ ] Domain names configured and pointing to server
- [ ] SSL certificates ready or Let's Encrypt configured
- [ ] Server has enough disk space (at least 10GB free)
- [ ] Server has enough memory (at least 2GB)

---

## 🗄️ DATABASE DEPLOYMENT

### Backup

- [ ] Connected to Lightsail server via SSH
- [ ] Created database backup
- [ ] Verified backup file exists
- [ ] Backup filename recorded: ************\_\_\_************

### Migration

- [ ] Prisma client generated: `npx prisma generate`
- [ ] Migrations deployed: `npx prisma migrate deploy`
- [ ] Migration status verified: `npx prisma migrate status`
- [ ] No pending migrations remain

### Seeding (if fresh database)

- [ ] Seeder script uploaded: `seed-final-production.js`
- [ ] Seeder executed: `node seed-final-production.js`
- [ ] Super admin account created
- [ ] Vehicle types seeded
- [ ] Payment methods seeded
- [ ] Global configuration created
- [ ] Database indexes created

### Verification

- [ ] Database connection tested
- [ ] All required tables exist
- [ ] New columns verified (actualDistanceKm, actualDurationSeconds, startedAt)
- [ ] Foreign key constraints working
- [ ] Indexes created successfully

---

## 🖥️ BACKEND DEPLOYMENT

### Code Deployment

- [ ] Latest code pulled from `development` branch
- [ ] Dependencies installed: `npm install --production`
- [ ] No npm errors or warnings
- [ ] `.env.production` file in place

### Service Management

- [ ] PM2 installed and configured
- [ ] Backend service started: `pm2 start server.js --name taxitime-backend`
- [ ] PM2 configuration saved: `pm2 save`
- [ ] PM2 startup script configured: `pm2 startup`

### Health Checks

- [ ] Backend running: `pm2 status`
- [ ] No errors in logs: `pm2 logs taxitime-backend --lines 50`
- [ ] Health endpoint responding: `curl http://localhost:3000/api/health`
- [ ] Database connectivity verified
- [ ] Socket.io server running

---

## 🌐 FRONTEND DEPLOYMENTS

### Super Admin Panel

- [ ] Code pulled from repository
- [ ] Dependencies installed: `npm install`
- [ ] API URL updated to production: `https://api.taxitime.com`
- [ ] Production build created: `npm run build`
- [ ] Build directory exists and has content
- [ ] PM2 service started on port 3002
- [ ] Accessible via browser: http://SERVER_IP:3002
- [ ] Can login with super admin credentials

### Owner Panel

- [ ] Code pulled from repository
- [ ] Dependencies installed
- [ ] API URL updated to production
- [ ] Production build created
- [ ] PM2 service started on port 3003
- [ ] Accessible via browser: http://SERVER_IP:3003
- [ ] Login page displays correctly

### Dispatch Portal

- [ ] Code pulled from repository
- [ ] Dependencies installed
- [ ] API URL updated to production
- [ ] Production build created
- [ ] PM2 service started on port 3004
- [ ] Accessible via browser: http://SERVER_IP:3004
- [ ] Map loads correctly
- [ ] WebSocket connection established

### Public Website (if applicable)

- [ ] Code pulled from repository
- [ ] Dependencies installed
- [ ] Next.js production build created
- [ ] PM2 service started on port 3001
- [ ] Accessible via browser

---

## 🔒 NGINX & SSL CONFIGURATION

### Nginx Setup

- [ ] Nginx installed and running
- [ ] Configuration files created for all subdomains
- [ ] Reverse proxy configured for backend API
- [ ] Reverse proxy configured for all frontend apps
- [ ] WebSocket upgrade headers configured
- [ ] Nginx configuration tested: `sudo nginx -t`
- [ ] Nginx reloaded: `sudo systemctl reload nginx`

### SSL Certificates

- [ ] SSL certificates installed (Let's Encrypt or other)
- [ ] HTTPS working for all domains
- [ ] HTTP to HTTPS redirect configured
- [ ] SSL certificate auto-renewal configured

### Domain Verification

- [ ] `https://api.taxitime.com` - Backend API
- [ ] `https://admin.taxitime.com` - Super Admin
- [ ] `https://owner.taxitime.com` - Owner Panel
- [ ] `https://dispatch.taxitime.com` - Dispatch Portal
- [ ] `https://taxitime.com` - Public Website (if applicable)

---

## 📱 MOBILE APP CONFIGURATION

### API Configuration Update

- [ ] API base URL updated in driver app
- [ ] Socket URL updated
- [ ] Configuration file backed up
- [ ] Changes committed to repository

### APK Build

- [ ] Android dependencies installed
- [ ] Gradle build successful
- [ ] Release APK created
- [ ] APK signed with release keystore
- [ ] APK aligned with zipalign
- [ ] Final APK named with version: `taxitime-driver-v2.0-YYYYMMDD.apk`

### APK Distribution

- [ ] APK tested on at least one device
- [ ] Installation instructions created
- [ ] Testing checklist completed
- [ ] APK uploaded to distribution platform (Firebase, TestFlight, etc.)
- [ ] Drivers notified of new version

---

## ✅ POST-DEPLOYMENT VERIFICATION

### System Health

- [ ] All PM2 processes showing "online" status
- [ ] No errors in any application logs
- [ ] CPU usage normal (< 80%)
- [ ] Memory usage normal (< 80%)
- [ ] Disk space sufficient (> 20% free)

### Backend API Tests

- [ ] Health endpoint: `GET /api/health` ✅
- [ ] Auth login: `POST /api/auth/login` ✅
- [ ] Super admin can login ✅
- [ ] Database queries working ✅
- [ ] Socket.io connections working ✅

### Frontend Tests

- [ ] Super Admin login works
- [ ] Can create a company
- [ ] Can create an owner account
- [ ] Owner can login to owner panel
- [ ] Dispatcher can login to dispatch portal
- [ ] All maps load correctly
- [ ] Real-time updates working

### Mobile App Tests

- [ ] APK installs on Android device
- [ ] Login with driver credentials works
- [ ] Location permissions granted
- [ ] GPS location updates every X seconds (company setting)
- [ ] Driver appears on dispatch map
- [ ] Can start shift
- [ ] Can accept jobs
- [ ] Job notifications received
- [ ] Can complete trip
- [ ] Earnings calculated correctly
- [ ] Can end shift

### Real-Time Features

- [ ] Driver goes online → appears in dispatch
- [ ] Job assigned → driver receives notification
- [ ] Driver location updates → map updates in dispatch
- [ ] Job completed → status updates in all apps
- [ ] Chat/messaging works (if applicable)

### Database Integrity

- [ ] Jobs being created correctly
- [ ] Assignments table updating
- [ ] Driver locations recording
- [ ] Shifts tracking properly
- [ ] Earnings calculating accurately
- [ ] Audit logs capturing events

---

## 🔐 SECURITY VERIFICATION

### Access Control

- [ ] Super admin password changed from default
- [ ] Database password is strong and secure
- [ ] JWT_SECRET is cryptographically secure
- [ ] Firewall configured (only ports 22, 80, 443 open)
- [ ] SSH password authentication disabled
- [ ] Only SSH key authentication enabled

### Data Protection

- [ ] No sensitive data in logs
- [ ] API keys not exposed in client-side code
- [ ] HTTPS enforced on all endpoints
- [ ] CORS configured correctly
- [ ] Rate limiting enabled (if applicable)

### Compliance

- [ ] Database backups scheduled
- [ ] Log rotation configured
- [ ] Error tracking set up (Sentry, etc.)
- [ ] Monitoring alerts configured

---

## 📊 MONITORING SETUP

### Application Monitoring

- [ ] PM2 monitoring enabled
- [ ] Application logs centralized
- [ ] Error tracking tool configured
- [ ] Uptime monitoring set up

### Server Monitoring

- [ ] CPU usage monitoring
- [ ] Memory usage monitoring
- [ ] Disk space monitoring
- [ ] Network traffic monitoring

### Database Monitoring

- [ ] PostgreSQL slow query log enabled
- [ ] Connection pool monitoring
- [ ] Database size monitoring
- [ ] Backup verification automated

### Alerts Configured

- [ ] Server down alert
- [ ] High CPU/memory alert
- [ ] Disk space low alert
- [ ] Application error alert
- [ ] Database connection error alert

---

## 📝 DOCUMENTATION

### Updated Documentation

- [ ] Deployment date and time recorded
- [ ] Server credentials documented securely
- [ ] API endpoints documented
- [ ] Known issues documented
- [ ] Rollback procedure documented

### Handoff Documentation

- [ ] Super admin credentials provided to client
- [ ] How to create companies documented
- [ ] How to add drivers documented
- [ ] How to configure settings documented
- [ ] Support contact information provided

---

## 🚨 ROLLBACK PLAN

### If Deployment Fails

1. **Database Rollback**

   ```bash
   sudo -u postgres psql taxitime < ~/backup_YYYYMMDD_HHMMSS.sql
   ```

2. **Code Rollback**

   ```bash
   cd /var/www/taxitime-backend
   git log --oneline -10  # Find previous commit
   git checkout COMMIT_HASH
   pm2 restart all
   ```

3. **Verification**
   ```bash
   curl http://localhost:3000/api/health
   pm2 logs taxitime-backend
   ```

### Rollback Checklist

- [ ] Database backup location recorded: ************\_\_\_************
- [ ] Previous working commit hash: ************\_\_\_************
- [ ] Rollback tested and verified
- [ ] All stakeholders notified

---

## 📞 SUPPORT CONTACTS

**Technical Lead:** ************\_\_\_************  
**Server Admin:** ************\_\_\_************  
**Database Admin:** ************\_\_\_************  
**Emergency Contact:** ************\_\_\_************

---

## ✅ FINAL SIGN-OFF

- [ ] All checklist items completed
- [ ] All tests passing
- [ ] No critical errors
- [ ] Stakeholders notified
- [ ] Documentation updated
- [ ] Deployment considered successful

**Deployment Completed By:** ******\_******  
**Date & Time:** ******\_******  
**Signature:** ******\_******

---

## 📌 NOTES

**Issues Encountered:**

---

---

---

**Resolutions:**

---

---

---

**Follow-up Items:**

---

---

---

---

**Status:** ⬜ In Progress | ⬜ Completed | ⬜ Rolled Back
