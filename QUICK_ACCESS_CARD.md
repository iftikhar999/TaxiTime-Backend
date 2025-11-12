# 🚀 Quick Access Card - TaxiTime V2 Production

## Server Details

**IP:** `54.252.241.150`  
**Region:** Sydney (ap-southeast-2)  
**SSH:** `ssh -i /Applications/A_B_TAXI/backend/LightsailDefaultKey-ap-southeast-2.pem ubuntu@54.252.241.150`

## Backend Status

✅ **ONLINE** - `http://54.252.241.150:3000/health`

## Super Admin Login

📧 **Email:** `admin@taxitime.com`  
🔑 **Password:** `TaxiTime2025!@#`  
⚠️ **CHANGE THIS PASSWORD IMMEDIATELY!**

## Quick Commands

### Check Backend Status

```bash
ssh -i /Applications/A_B_TAXI/backend/LightsailDefaultKey-ap-southeast-2.pem ubuntu@54.252.241.150 "pm2 status"
```

### View Backend Logs

```bash
ssh -i /Applications/A_B_TAXI/backend/LightsailDefaultKey-ap-southeast-2.pem ubuntu@54.252.241.150 "pm2 logs taxitime-backend"
```

### Restart Backend

```bash
ssh -i /Applications/A_B_TAXI/backend/LightsailDefaultKey-ap-southeast-2.pem ubuntu@54.252.241.150 "pm2 restart taxitime-backend"
```

### Update Code from GitHub

```bash
ssh -i /Applications/A_B_TAXI/backend/LightsailDefaultKey-ap-southeast-2.pem ubuntu@54.252.241.150 "cd /var/www/taxitime-backend && git pull origin development && npm install && pm2 restart taxitime-backend"
```

## Next Steps

1. ⚠️ **Change super admin password**
2. 🌐 **Deploy frontend panels:** `./build-frontends.sh`
3. 📱 **Build driver app APK:** `./build-driver-apk.sh`
4. 🔒 **Configure firewall** to open ports 3000-3004
5. 🌍 **Setup domain** (optional)
6. 🔐 **Install SSL certificate** (recommended)

## Database Seeded

- ✅ 1 Super Admin
- ✅ 4 Vehicle Types (Sedan, SUV, Van, Wheelchair)
- ✅ 11 Global Configurations
- ✅ 50 Database Tables
- ✅ All migrations applied

---

**Status:** Production Ready ✅  
**Deployment Date:** November 11, 2025
