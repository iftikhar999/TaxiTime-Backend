# AWS Lightsail - Single Server Setup Guide

## PostgreSQL + Node.js Backend on ONE Ubuntu VM

**Cost: Only $10-20/month** (Everything on one server)

---

## 🎯 Architecture

```
┌─────────────────────────────────────┐
│   AWS Lightsail Ubuntu VM ($10/mo)  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   PostgreSQL Database        │  │
│  │   Port: 5432 (local only)    │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   Node.js Backend            │  │
│  │   Port: 3000 (local)         │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   Nginx Reverse Proxy        │  │
│  │   Port: 80/443 (public)      │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
         ↑
    Internet Access
```

---

## 📦 STEP 1: Create AWS Lightsail Instance

### 1.1 Login to AWS Lightsail

Go to: https://lightsail.aws.amazon.com/

### 1.2 Create Instance

1. Click **"Create instance"**
2. **Instance location**: Choose closest region to your users
   - Example: `US East (N. Virginia)`

### 1.3 Select Platform & Blueprint

- **Platform**: Linux/Unix
- **Blueprint**: Select **"OS Only"** → **"Ubuntu 22.04 LTS"**

### 1.4 Choose Instance Plan

**Recommended Options:**

| Plan   | RAM  | CPU    | Storage | Price      | Use Case                 |
| ------ | ---- | ------ | ------- | ---------- | ------------------------ |
| Small  | 2 GB | 1 vCPU | 60 GB   | **$10/mo** | Development/Testing      |
| Medium | 4 GB | 2 vCPU | 80 GB   | **$20/mo** | Production (Recommended) |
| Large  | 8 GB | 2 vCPU | 160 GB  | $40/mo     | High Traffic             |

**Choose: $20/month plan** (Production ready)

### 1.5 Name Your Instance

- Name: `taxitime-server`

### 1.6 Create Instance

- Click **"Create instance"**
- ⏱️ Wait 1-2 minutes for instance to start

---

## 🔥 STEP 2: Configure Firewall

### 2.1 Add Custom Firewall Rules

1. Click on your instance → **Networking** tab
2. Scroll to **Firewall** section
3. Click **"+ Add rule"** for each:

| Application | Protocol | Port Range |
| ----------- | -------- | ---------- |
| HTTP        | TCP      | 80         |
| HTTPS       | TCP      | 443        |
| Custom      | TCP      | 3000       |

4. Click **"Create"** after adding each rule

---

## 💻 STEP 3: Connect to Server

### 3.1 Connect via Browser SSH

1. Go to your instance in Lightsail
2. Click **"Connect using SSH"** button
3. A terminal window will open in your browser

OR

### 3.2 Connect via Your Mac Terminal

```bash
# Download SSH key from Lightsail (Account → SSH Keys)
# Save it as ~/Downloads/LightsailDefaultKey.pem

# Set permissions
chmod 400 ~/Downloads/LightsailDefaultKey.pem

# Connect (replace with your instance IP)
ssh -i ~/Downloads/LightsailDefaultKey.pem ubuntu@YOUR_INSTANCE_IP
```

---

## 🛠️ STEP 4: Install PostgreSQL on Ubuntu

### 4.1 Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 4.2 Install PostgreSQL

```bash
# Install PostgreSQL 15
sudo apt install postgresql postgresql-contrib -y

# Check if running
sudo systemctl status postgresql
```

### 4.3 Configure PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# Inside PostgreSQL prompt, run:
CREATE DATABASE taxitime_db;
CREATE USER taxitime_user WITH ENCRYPTED PASSWORD 'YourSecurePassword123!';
GRANT ALL PRIVILEGES ON DATABASE taxitime_db TO taxitime_user;
ALTER DATABASE taxitime_db OWNER TO taxitime_user;
\q
```

### 4.4 Test Connection

```bash
psql -h localhost -U taxitime_user -d taxitime_db -c "SELECT version();"
# Enter password when prompted
```

**✅ PostgreSQL is now running on your server!**

---

## 📦 STEP 5: Install Node.js

### 5.1 Install Node.js 20.x

```bash
# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 5.2 Install PM2 (Process Manager)

```bash
sudo npm install -g pm2

# Verify
pm2 --version
```

### 5.3 Install Nginx

```bash
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

**✅ All software installed!**

---

## 📁 STEP 6: Deploy Backend Code

### 6.1 Create Application Directory

```bash
sudo mkdir -p /var/www/taxitime-backend
sudo chown ubuntu:ubuntu /var/www/taxitime-backend
cd /var/www/taxitime-backend
```

### 6.2 Upload Code from Your Mac

**Open a NEW terminal on your Mac** and run:

```bash
cd /Applications/A_B_TAXI/backend

# Upload code to server (replace YOUR_INSTANCE_IP)
rsync -avz -e "ssh -i ~/Downloads/LightsailDefaultKey.pem" \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.env.backup' \
  --exclude 'uploads' \
  --exclude '.git' \
  --exclude 'coverage' \
  --exclude 'logs' \
  ./ ubuntu@YOUR_INSTANCE_IP:/var/www/taxitime-backend/
```

**This will upload all your backend code to the server!**

### 6.3 Install Dependencies (on server)

**Back in your server SSH terminal:**

```bash
cd /var/www/taxitime-backend
npm install --production
```

---

## 🔐 STEP 7: Configure Environment Variables

### 7.1 Create Production .env File

```bash
cd /var/www/taxitime-backend
nano .env
```

### 7.2 Add Configuration (Copy & Paste This)

```bash
# Database - Local PostgreSQL
DATABASE_URL="postgresql://taxitime_user:YourSecurePassword123!@localhost:5432/taxitime_db"

# JWT Secret (Generate a secure random string)
JWT_SECRET=uber_clone_secret_production_change_this_to_random_string

# Server
PORT=3000
NODE_ENV=production

# Frontend URLs (Update with your actual IP or domain)
FRONTEND_URLS=http://YOUR_INSTANCE_IP,http://YOUR_INSTANCE_IP:3001,http://YOUR_INSTANCE_IP:3002

# Google Maps API Key
GOOGLE_MAPS_API_KEY=AIzaSyBhcA7J8ZefAwlzhuYUNDIf_W3Yzy_16gA

# Payment Gateways (Optional - add later)
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here

# Email Service (Optional - add later)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# File Upload
UPLOAD_PATH=/var/www/taxitime-backend/uploads/
MAX_FILE_SIZE=5MB

# Redis (Optional - skip for now)
REDIS_URL=redis://localhost:6379
```

**Important Changes:**

1. Replace `YourSecurePassword123!` with your actual PostgreSQL password
2. Replace `YOUR_INSTANCE_IP` with your server's public IP
3. Generate a secure JWT_SECRET:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

**Save the file:**

- Press `Ctrl + X`
- Press `Y`
- Press `Enter`

---

## 🗃️ STEP 8: Setup Database Schema & Seed Data

### 8.1 Generate Prisma Client

```bash
cd /var/www/taxitime-backend
npx prisma generate
```

### 8.2 Create Database Tables

```bash
npx prisma db push --accept-data-loss
```

You should see:

```
✔ Schema pushed to database
```

### 8.3 Seed Database with Test Data

```bash
node prisma/seed-complete.js
```

**Expected output:**

```
🌱 Starting COMPLETE database seeding...

✅ Super Admin created: admin@abtaxi.com
✅ Subscription plans created
✅ Company Owners created: 2
✅ Companies created: 2
✅ Dispatchers created: 4
✅ Drivers created: 10
✅ Vehicles created: 10
✅ Zones created
✅ Tariffs created
✅ Sample rides created

════════════════════════════════════════
📋 SEEDING COMPLETE!
════════════════════════════════════════
🔐 Super Admin: admin@abtaxi.com / admin123
👔 Company Owner: owner@citytaxi.com / owner123
🚗 Drivers: driver1@city001.com / 123123123
```

**✅ Database is ready!**

---

## 🚀 STEP 9: Start Backend with PM2

### 9.1 Create uploads directory

```bash
mkdir -p /var/www/taxitime-backend/uploads
```

### 9.2 Start Backend

```bash
cd /var/www/taxitime-backend
pm2 start server.js --name taxitime-backend --time
```

### 9.3 Save PM2 Configuration

```bash
pm2 save
pm2 startup
# Copy and run the command it shows you
```

### 9.4 Check Status

```bash
pm2 status
pm2 logs taxitime-backend --lines 50
```

### 9.5 Test Backend Locally

```bash
curl http://localhost:3000/health
```

**Expected response:**

```json
{ "status": "ok", "timestamp": "2025-11-01T..." }
```

**✅ Backend is running!**

---

## 🌐 STEP 10: Configure Nginx Reverse Proxy

### 10.1 Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/taxitime
```

### 10.2 Add This Configuration

```nginx
server {
    listen 80;
    server_name _;  # Accept all requests

    client_max_body_size 10M;

    # Root location
    location / {
        return 200 '{"status":"TaxiTime Backend Server","version":"1.0"}';
        add_header Content-Type application/json;
    }

    # API endpoints
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Socket.io for real-time features
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }

    # Uploads folder
    location /uploads {
        alias /var/www/taxitime-backend/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

**Save**: `Ctrl + X` → `Y` → `Enter`

### 10.3 Enable Configuration

```bash
# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Enable our configuration
sudo ln -s /etc/nginx/sites-available/taxitime /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

**✅ Nginx configured!**

---

## ✅ STEP 11: Test Your Deployment

### 11.1 Get Your Server IP

In Lightsail console, copy your instance's **Public IP address**

### 11.2 Test API Endpoints

**From your Mac terminal:**

```bash
# Replace YOUR_IP with your actual server IP

# Test health endpoint
curl http://YOUR_IP/health

# Test login
curl -X POST http://YOUR_IP/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "driver1@city001.com",
    "password": "123123123"
  }'
```

**Expected response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "email": "driver1@city001.com",
      "firstName": "Driver1",
      ...
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**✅ API is working!**

---

## 📱 STEP 12: Update Mobile App Configuration

### 12.1 Update API URL in Driver App

Open: `/Applications/A_B_TAXI/mobile/driver-app-v1/src/config/api.ts`

Find and update:

```typescript
const API_BASE_URL = __DEV__
  ? "http://localhost:3000/api"
  : "http://YOUR_LIGHTSAIL_IP/api"; // ← Change this

const SOCKET_URL = __DEV__
  ? "http://localhost:3000"
  : "http://YOUR_LIGHTSAIL_IP"; // ← Change this
```

### 12.2 Rebuild Mobile App

```bash
cd /Applications/A_B_TAXI/mobile/driver-app-v1
npx react-native run-android
```

**✅ Mobile app now connects to production server!**

---

## 🔒 OPTIONAL: Setup Domain & SSL

### If you have a domain (e.g., api.yourdomain.com):

### 1. Point Domain to Server

In your domain registrar (GoDaddy, Namecheap, etc.):

- Add **A Record**: `api.yourdomain.com` → `YOUR_LIGHTSAIL_IP`

### 2. Update Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/taxitime

# Change this line:
server_name _;
# To:
server_name api.yourdomain.com;

# Save and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Install SSL Certificate

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate (follow prompts)
sudo certbot --nginx -d api.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

**✅ Now your API has HTTPS!**

---

## 📊 Server Management Commands

### Check Backend Status

```bash
pm2 status
pm2 logs taxitime-backend
pm2 monit  # Real-time monitoring
```

### Restart Backend

```bash
pm2 restart taxitime-backend
```

### Check Database

```bash
psql -h localhost -U taxitime_user -d taxitime_db -c "SELECT COUNT(*) FROM \"User\";"
```

### Check Nginx

```bash
sudo systemctl status nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Update Code (Deploy New Changes)

```bash
# On your Mac, upload new code:
cd /Applications/A_B_TAXI/backend
rsync -avz -e "ssh -i ~/Downloads/LightsailDefaultKey.pem" \
  --exclude 'node_modules' \
  ./ ubuntu@YOUR_INSTANCE_IP:/var/www/taxitime-backend/

# On server, restart:
cd /var/www/taxitime-backend
npm install --production
npx prisma generate
pm2 restart taxitime-backend
```

### View System Resources

```bash
# CPU & Memory usage
htop

# Disk space
df -h

# Database size
sudo -u postgres psql -d taxitime_db -c "SELECT pg_size_pretty(pg_database_size('taxitime_db'));"
```

---

## 🔍 Troubleshooting

### Backend not starting

```bash
cd /var/www/taxitime-backend
pm2 delete taxitime-backend
npm install
pm2 start server.js --name taxitime-backend
pm2 logs taxitime-backend
```

### Database connection error

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check credentials in .env match database
cat .env | grep DATABASE_URL

# Test connection
psql -h localhost -U taxitime_user -d taxitime_db
```

### Can't access from internet

```bash
# Check firewall rules in Lightsail console
# Make sure ports 80, 443, 3000 are open

# Check nginx
sudo nginx -t
sudo systemctl status nginx

# Check if backend is running
curl http://localhost:3000/health
```

---

## 💰 Monthly Cost

**Total: $20/month** (One $20 Lightsail instance)

Includes:

- 4 GB RAM
- 2 vCPUs
- 80 GB SSD Storage
- 3 TB Data Transfer
- Static IP included
- PostgreSQL Database
- Node.js Backend
- Nginx
- Everything on one server!

**vs Separate Database:** $30-40/month (Database $15-30 + Server $10)

---

## 🎯 What We Built

```
Your AWS Lightsail Server:
├── PostgreSQL Database (port 5432)
│   └── taxitime_db (with all seeded data)
├── Node.js Backend (port 3000)
│   └── Express API + Socket.io
├── Nginx (port 80/443)
│   └── Reverse proxy to backend
└── PM2 Process Manager
    └── Keeps backend running 24/7
```

---

## 📝 Login Credentials

**Super Admin Panel:**

- URL: `http://YOUR_IP/admin` (if frontend deployed)
- Email: `admin@abtaxi.com`
- Password: `admin123`

**Company Owner:**

- Email: `owner@citytaxi.com`
- Password: `owner123`

**Test Driver (Mobile App):**

- Email: `driver1@city001.com`
- Password: `123123123`

**⚠️ Change these passwords in production!**

---

## 🎉 Success!

Your TaxiTime backend is now running on AWS Lightsail!

**API Endpoint:** `http://YOUR_LIGHTSAIL_IP/api`

**Next Steps:**

1. ✅ Test login from mobile app
2. ✅ Start a shift from mobile app
3. ✅ Test complete driver flow
4. ✅ Deploy frontend applications
5. ✅ Setup domain & SSL (optional)
6. ✅ Setup automated backups

---

## 📞 Quick Reference

```bash
# SSH to server
ssh -i ~/Downloads/LightsailDefaultKey.pem ubuntu@YOUR_IP

# Check backend
pm2 status
pm2 logs taxitime-backend

# Check database
psql -h localhost -U taxitime_user -d taxitime_db

# Restart everything
pm2 restart taxitime-backend
sudo systemctl restart nginx
sudo systemctl restart postgresql

# View logs
pm2 logs taxitime-backend --lines 100
sudo tail -f /var/log/nginx/error.log
```

**🚀 You're all set!**
