# AWS Lightsail - Complete TaxiTime Platform Setup

## PostgreSQL + Backend + All Frontend Portals on ONE Server

**Cost: $20-40/month** (Everything on one server!)

---

## 🎯 Complete Architecture

```
┌──────────────────────────────────────────────────────────────┐
│          AWS Lightsail Ubuntu VM ($20-40/mo)                 │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ PostgreSQL Database (port 5432 - localhost only)       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Node.js Backend API (port 3000 - localhost only)       │ │
│  │ - Express REST API                                      │ │
│  │ - Socket.io (real-time)                                │ │
│  │ - All backend routes                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Frontend Applications:                                  │ │
│  │                                                         │ │
│  │  📱 Website           (port 3001 - Next.js)           │ │
│  │  👑 Super Admin Panel (port 3002 - React)             │ │
│  │  🏢 Owner Panel       (port 3003 - React)             │ │
│  │  📡 Dispatch System   (port 3004 - React)             │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Nginx Reverse Proxy (ports 80/443 - public)           │ │
│  │                                                         │ │
│  │  yourdomain.com           → Website (3001)            │ │
│  │  api.yourdomain.com       → Backend API (3000)        │ │
│  │  admin.yourdomain.com     → Super Admin (3002)        │ │
│  │  owner.yourdomain.com     → Owner Panel (3003)        │ │
│  │  dispatch.yourdomain.com  → Dispatch (3004)           │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                         ↑
                    Internet Access
```

---

## 📦 Server Requirements

### Recommended Instance Plans:

| What You're Running         | Instance Size | RAM      | CPU   | Storage    | Price      | Use Case                     |
| --------------------------- | ------------- | -------- | ----- | ---------- | ---------- | ---------------------------- |
| Backend Only                | Small         | 2 GB     | 1     | 60 GB      | $10/mo     | Development                  |
| Backend + 1-2 Frontends     | Medium        | 4 GB     | 2     | 80 GB      | $20/mo     | Testing                      |
| **Backend + All Frontends** | **Large**     | **8 GB** | **2** | **160 GB** | **$40/mo** | **Production (Recommended)** |
| High Traffic + Analytics    | Extra Large   | 16 GB    | 4     | 320 GB     | $80/mo     | Enterprise                   |

**Choose: $40/month plan** for running everything smoothly!

---

## 🚀 Complete Setup Guide

Follow the **LIGHTSAIL_SINGLE_SERVER_SETUP.md** guide for Steps 1-11 (Backend setup).

Then continue with this guide to add all frontend portals.

---

## 📱 STEP 12: Deploy Frontend Applications

### 12.1 Install Build Dependencies on Server

**SSH into your server:**

```bash
ssh -i ~/Downloads/LightsailDefaultKey.pem ubuntu@YOUR_INSTANCE_IP
```

**Install build tools:**

```bash
# Install yarn (optional, but recommended)
sudo npm install -g yarn

# Create frontends directory
sudo mkdir -p /var/www/frontends
sudo chown ubuntu:ubuntu /var/www/frontends
```

---

## 🌐 STEP 13: Deploy Website (Next.js)

### 13.1 Upload Website Code

**On your Mac terminal:**

```bash
cd /Applications/A_B_TAXI/frontend/website

# Create production .env
echo "NEXT_PUBLIC_API_URL=http://YOUR_INSTANCE_IP/api
NEXT_PUBLIC_SOCKET_URL=http://YOUR_INSTANCE_IP
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIzaSyBhcA7J8ZefAwlzhuYUNDIf_W3Yzy_16gA" > .env.production

# Build website
npm run build

# Upload to server
rsync -avz -e "ssh -i ~/Downloads/LightsailDefaultKey.pem" \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next/cache' \
  ./ ubuntu@YOUR_INSTANCE_IP:/var/www/frontends/website/
```

### 13.2 Install & Start Website (on server)

```bash
cd /var/www/frontends/website
npm install --production

# Start with PM2
pm2 start npm --name "website" -- start
pm2 save
```

**✅ Website running on port 3000 (Next.js default)**

---

## 👑 STEP 14: Deploy Super Admin Panel (React)

### 14.1 Upload Super Admin Code

**On your Mac:**

```bash
cd /Applications/A_B_TAXI/frontend/super-admin

# Create production .env
echo "REACT_APP_API_URL=http://YOUR_INSTANCE_IP/api
REACT_APP_SOCKET_URL=http://YOUR_INSTANCE_IP" > .env.production

# Build admin panel
npm run build

# Upload build folder
rsync -avz -e "ssh -i ~/Downloads/LightsailDefaultKey.pem" \
  build/ ubuntu@YOUR_INSTANCE_IP:/var/www/frontends/super-admin/
```

### 14.2 Install Serve & Start (on server)

```bash
# Install serve (static file server)
sudo npm install -g serve

# Create PM2 ecosystem file
cd /var/www/frontends
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'super-admin',
      script: 'serve',
      args: 'super-admin -l 3002 -s',
      cwd: '/var/www/frontends',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF

pm2 start ecosystem.config.js --only super-admin
pm2 save
```

**✅ Super Admin running on port 3002**

---

## 🏢 STEP 15: Deploy Owner Panel (React)

### 15.1 Upload Owner Panel

**On your Mac:**

```bash
cd /Applications/A_B_TAXI/frontend/owner-panel

# Create production .env
echo "REACT_APP_API_URL=http://YOUR_INSTANCE_IP/api
REACT_APP_SOCKET_URL=http://YOUR_INSTANCE_IP" > .env.production

# Build
npm run build

# Upload
rsync -avz -e "ssh -i ~/Downloads/LightsailDefaultKey.pem" \
  build/ ubuntu@YOUR_INSTANCE_IP:/var/www/frontends/owner-panel/
```

### 15.2 Start Owner Panel (on server)

```bash
# Update ecosystem config
cd /var/www/frontends
nano ecosystem.config.js
```

**Add to apps array:**

```javascript
{
  name: 'owner-panel',
  script: 'serve',
  args: 'owner-panel -l 3003 -s',
  cwd: '/var/www/frontends',
  env: {
    NODE_ENV: 'production'
  }
}
```

**Start:**

```bash
pm2 start ecosystem.config.js --only owner-panel
pm2 save
```

**✅ Owner Panel running on port 3003**

---

## 📡 STEP 16: Deploy Dispatch System (React)

### 16.1 Upload Dispatch

**On your Mac:**

```bash
cd /Applications/A_B_TAXI/frontend/dispatch

# Create production .env
echo "REACT_APP_API_URL=http://YOUR_INSTANCE_IP/api
REACT_APP_SOCKET_URL=http://YOUR_INSTANCE_IP
REACT_APP_GOOGLE_MAPS_KEY=AIzaSyBhcA7J8ZefAwlzhuYUNDIf_W3Yzy_16gA" > .env.production

# Build
npm run build

# Upload
rsync -avz -e "ssh -i ~/Downloads/LightsailDefaultKey.pem" \
  build/ ubuntu@YOUR_INSTANCE_IP:/var/www/frontends/dispatch/
```

### 16.2 Start Dispatch (on server)

**Add to ecosystem.config.js:**

```javascript
{
  name: 'dispatch',
  script: 'serve',
  args: 'dispatch -l 3004 -s',
  cwd: '/var/www/frontends',
  env: {
    NODE_ENV: 'production'
  }
}
```

**Start:**

```bash
pm2 start ecosystem.config.js --only dispatch
pm2 save
```

**✅ Dispatch running on port 3004**

---

## 🔧 STEP 17: Configure Nginx for All Applications

### 17.1 Create Complete Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/taxitime-complete
```

### 17.2 Add Configuration for All Services

```nginx
# API Backend
server {
    listen 80;
    server_name api.yourdomain.com YOUR_INSTANCE_IP;

    client_max_body_size 10M;

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
    }

    # Socket.io
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3000/health;
    }

    # Uploads
    location /uploads {
        alias /var/www/taxitime-backend/uploads;
        expires 30d;
    }
}

# Website (Public)
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Super Admin Panel
server {
    listen 80;
    server_name admin.yourdomain.com;

    root /var/www/frontends/super-admin;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# Owner Panel
server {
    listen 80;
    server_name owner.yourdomain.com;

    root /var/www/frontends/owner-panel;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# Dispatch System
server {
    listen 80;
    server_name dispatch.yourdomain.com;

    root /var/www/frontends/dispatch;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Save**: `Ctrl + X` → `Y` → `Enter`

### 17.3 Enable Configuration

```bash
# Remove old config if exists
sudo rm /etc/nginx/sites-enabled/taxitime

# Enable new complete config
sudo ln -s /etc/nginx/sites-available/taxitime-complete /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

---

## ✅ STEP 18: Verify All Applications

### 18.1 Check All Services Running

```bash
pm2 status
```

**Expected output:**

```
┌────┬──────────────────────┬─────────┬─────────┬──────┐
│ id │ name                 │ status  │ cpu     │ mem  │
├────┼──────────────────────┼─────────┼─────────┼──────┤
│ 0  │ taxitime-backend     │ online  │ 0.3%    │ 85mb │
│ 1  │ website              │ online  │ 0.1%    │ 120mb│
│ 2  │ super-admin          │ online  │ 0%      │ 45mb │
│ 3  │ owner-panel          │ online  │ 0%      │ 45mb │
│ 4  │ dispatch             │ online  │ 0%      │ 45mb │
└────┴──────────────────────┴─────────┴─────────┴──────┘
```

### 18.2 Test Each Service

**From your Mac:**

```bash
# Backend API
curl http://YOUR_IP/api/health

# Website
curl http://YOUR_IP:3001

# Super Admin (static files)
curl -I http://YOUR_IP:3002

# Owner Panel
curl -I http://YOUR_IP:3003

# Dispatch
curl -I http://YOUR_IP:3004
```

---

## 🌍 STEP 19: Setup Domains (Optional but Recommended)

### 19.1 Add DNS Records

In your domain registrar (GoDaddy, Namecheap, etc.), add these A records:

| Subdomain | Type | Value (Points to) |
| --------- | ---- | ----------------- |
| @         | A    | YOUR_LIGHTSAIL_IP |
| www       | A    | YOUR_LIGHTSAIL_IP |
| api       | A    | YOUR_LIGHTSAIL_IP |
| admin     | A    | YOUR_LIGHTSAIL_IP |
| owner     | A    | YOUR_LIGHTSAIL_IP |
| dispatch  | A    | YOUR_LIGHTSAIL_IP |

### 19.2 Update Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/taxitime-complete
```

**Replace all instances of:**

- `yourdomain.com` → `your-actual-domain.com`
- Keep `YOUR_INSTANCE_IP` as fallback

**Reload nginx:**

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔒 STEP 20: Setup SSL Certificates (Free with Let's Encrypt)

### 20.1 Install Certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 20.2 Get Certificates for All Domains

```bash
# Get certificate for all subdomains at once
sudo certbot --nginx -d yourdomain.com \
  -d www.yourdomain.com \
  -d api.yourdomain.com \
  -d admin.yourdomain.com \
  -d owner.yourdomain.com \
  -d dispatch.yourdomain.com
```

**Follow prompts:**

1. Enter your email
2. Agree to terms
3. Choose to redirect HTTP → HTTPS (recommended)

### 20.3 Test Auto-renewal

```bash
sudo certbot renew --dry-run
```

**✅ All domains now have HTTPS!**

---

## 📱 STEP 21: Update Mobile App Configuration

### Update API URLs

**Driver App:**
`/Applications/A_B_TAXI/mobile/driver-app-v1/src/config/api.ts`

```typescript
const API_BASE_URL = __DEV__
  ? "http://localhost:3000/api"
  : "https://api.yourdomain.com/api"; // With SSL

const SOCKET_URL = __DEV__
  ? "http://localhost:3000"
  : "https://api.yourdomain.com"; // With SSL
```

**Rebuild app:**

```bash
cd /Applications/A_B_TAXI/mobile/driver-app-v1
npx react-native run-android
```

---

## 📊 Final Server Status

### Check Everything

```bash
# All PM2 processes
pm2 status

# Memory usage
free -h

# Disk usage
df -h

# CPU usage
top

# Nginx status
sudo systemctl status nginx

# PostgreSQL status
sudo systemctl status postgresql
```

---

## 🌐 Your Complete Platform

### Public URLs (After Domain Setup):

| Service               | URL                             | Users                     |
| --------------------- | ------------------------------- | ------------------------- |
| 🌐 **Public Website** | https://yourdomain.com          | Passengers/General Public |
| 📱 **Mobile API**     | https://api.yourdomain.com/api  | Driver & Passenger Apps   |
| 👑 **Super Admin**    | https://admin.yourdomain.com    | Platform Administrator    |
| 🏢 **Owner Panel**    | https://owner.yourdomain.com    | Company Owners            |
| 📡 **Dispatch**       | https://dispatch.yourdomain.com | Dispatchers               |

### Login Credentials:

**Super Admin:**

- URL: https://admin.yourdomain.com
- Email: `admin@abtaxi.com`
- Password: `admin123`

**Company Owner:**

- URL: https://owner.yourdomain.com
- Email: `owner@citytaxi.com`
- Password: `owner123`

**Dispatcher:**

- URL: https://dispatch.yourdomain.com
- Email: `dispatcher1@city001.com`
- Password: `dispatcher123`

**Test Driver (Mobile):**

- Email: `driver1@city001.com`
- Password: `123123123`

---

## 💰 Complete Cost Breakdown

### Monthly Costs:

**Lightsail Instance (Recommended):**

- Instance: **$40/month** (8GB RAM, 2 vCPU, 160GB SSD)
- Domain: **$12/year** (~$1/month)
- SSL Certificates: **FREE** (Let's Encrypt)

**Total: ~$41/month**

### What You Get:

- ✅ PostgreSQL Database
- ✅ Node.js Backend API
- ✅ Public Website (Next.js)
- ✅ Super Admin Panel
- ✅ Owner Panel
- ✅ Dispatch System
- ✅ SSL Certificates
- ✅ Automated backups (Lightsail snapshots)
- ✅ 3TB monthly data transfer

---

## 🔄 Deployment Updates

### When You Update Backend Code:

```bash
# On Mac - upload new code
cd /Applications/A_B_TAXI/backend
rsync -avz -e "ssh -i ~/Downloads/LightsailDefaultKey.pem" \
  --exclude 'node_modules' \
  ./ ubuntu@YOUR_IP:/var/www/taxitime-backend/

# On server - restart
cd /var/www/taxitime-backend
npm install --production
npx prisma generate
pm2 restart taxitime-backend
```

### When You Update Frontend:

```bash
# Example: Update Super Admin
cd /Applications/A_B_TAXI/frontend/super-admin
npm run build

rsync -avz -e "ssh -i ~/Downloads/LightsailDefaultKey.pem" \
  build/ ubuntu@YOUR_IP:/var/www/frontends/super-admin/

# No restart needed! Changes are immediate
```

---

## 📈 Performance Optimization Tips

### 1. Enable Gzip Compression

```bash
sudo nano /etc/nginx/nginx.conf
```

**Add in http block:**

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript
           application/json application/javascript application/xml+rss
           application/rss+xml font/truetype font/opentype
           application/vnd.ms-fontobject image/svg+xml;
```

### 2. Setup PostgreSQL Optimization

```bash
sudo nano /etc/postgresql/15/main/postgresql.conf
```

**Adjust for 8GB RAM server:**

```
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 16MB
```

**Restart PostgreSQL:**

```bash
sudo systemctl restart postgresql
```

### 3. Setup Monitoring

```bash
# Install htop
sudo apt install htop -y

# Monitor in real-time
htop
```

### 4. Setup Automated Backups

**In Lightsail Console:**

1. Go to your instance → Snapshots tab
2. Enable automatic snapshots
3. Choose: Daily backups at 3:00 AM
4. Retention: 7 days

---

## 🆘 Complete Troubleshooting Guide

### Backend Issues

```bash
# Check logs
pm2 logs taxitime-backend --lines 100

# Restart backend
pm2 restart taxitime-backend

# Check if port 3000 is listening
sudo netstat -tlnp | grep 3000
```

### Frontend Not Loading

```bash
# Check if frontend apps are running
pm2 status

# Restart specific frontend
pm2 restart super-admin

# Check nginx errors
sudo tail -f /var/log/nginx/error.log
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -h localhost -U taxitime_user -d taxitime_db

# Check connections
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"
```

### High Memory Usage

```bash
# Check memory
free -h

# Find memory-hungry processes
ps aux --sort=-%mem | head -10

# Restart services
pm2 restart all
sudo systemctl restart nginx
```

### SSL Certificate Issues

```bash
# Renew certificates manually
sudo certbot renew

# Check certificate status
sudo certbot certificates

# Test configuration
sudo nginx -t
```

---

## 🎉 Success Checklist

- ✅ Backend API running (`pm2 status` shows online)
- ✅ Database accessible (`psql` connection works)
- ✅ Website loads at `http://YOUR_IP:3001`
- ✅ Super Admin loads at `http://YOUR_IP:3002`
- ✅ Owner Panel loads at `http://YOUR_IP:3003`
- ✅ Dispatch loads at `http://YOUR_IP:3004`
- ✅ Nginx proxying all services
- ✅ All PM2 processes auto-restart on reboot
- ✅ Domains pointing to server (if configured)
- ✅ SSL certificates active (if configured)
- ✅ Mobile app connects to backend
- ✅ Can login to all portals

---

## 📞 Quick Reference Commands

```bash
# View all running services
pm2 status

# View logs for specific service
pm2 logs taxitime-backend
pm2 logs website
pm2 logs super-admin

# Restart all services
pm2 restart all

# Check server resources
htop
df -h
free -h

# Check nginx
sudo nginx -t
sudo systemctl status nginx

# Check database
psql -h localhost -U taxitime_user -d taxitime_db -c "SELECT COUNT(*) FROM \"User\";"

# View nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Backup database
pg_dump -h localhost -U taxitime_user taxitime_db > backup_$(date +%Y%m%d).sql
```

---

## 🚀 You're All Set!

Your complete TaxiTime platform is now running on AWS Lightsail!

**Everything hosted:**

- ✅ Database
- ✅ Backend API
- ✅ Public Website
- ✅ Super Admin Panel
- ✅ Owner Panel
- ✅ Dispatch System
- ✅ Mobile API endpoints
- ✅ Real-time Socket.io

**All for $40/month!** 🎉
