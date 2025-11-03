# AWS Lightsail Deployment Guide

Complete guide to deploy TaxiTime Backend on AWS Lightsail with PostgreSQL database.

---

## 📋 Prerequisites

- AWS Lightsail account created ✅
- Domain name (optional, for production)
- This backend code ready to deploy

---

## 🗄️ STEP 1: Create PostgreSQL Database on AWS Lightsail

### 1.1 Navigate to Lightsail Console

1. Go to https://lightsail.aws.amazon.com/
2. Click "Databases" in the left menu
3. Click "Create database"

### 1.2 Configure Database

**Choose your instance location:**

- Region: `US East (N. Virginia)` or closest to your users

**Database engine:**

- Select: `PostgreSQL 15` or latest version

**Choose your database plan:**

- **Development**: Standard plan - $15/month (1 GB RAM, 40 GB SSD)
- **Production**: High availability - $30/month (2 GB RAM, 80 GB SSD)

**Identify your database:**

- Name: `taxitime-db`

**Create database**

- Click "Create database" button
- ⏱️ Wait 5-10 minutes for database to be ready

### 1.3 Get Database Connection Details

Once created, click on database name to see:

- **Endpoint**: `ls-xxx.us-east-1.rds.amazonaws.com`
- **Port**: `5432`
- **Username**: `dbmasteruser`
- **Password**: Click "Show" to reveal
- **Database name**: `postgres`

### 1.4 Configure Public Mode (for development)

1. Go to database → Networking tab
2. Enable "Public mode"
3. This allows connection from your local machine for testing

**⚠️ For Production**: Keep private and use VPC peering or SSH tunnel

---

## 🖥️ STEP 2: Create Node.js Server Instance

### 2.1 Create Instance

1. In Lightsail console, click "Instances"
2. Click "Create instance"

### 2.2 Configure Instance

**Choose your instance location:**

- Same region as your database

**Pick your instance image:**

- Platform: `Linux/Unix`
- Blueprint: Select `OS Only` → `Ubuntu 22.04 LTS`

**Choose your instance plan:**

- **Development/Testing**: $5/month (1 GB RAM, 1 vCPU, 40 GB SSD)
- **Production**: $10/month (2 GB RAM, 1 vCPU, 60 GB SSD)
- **High Traffic**: $20/month (4 GB RAM, 2 vCPU, 80 GB SSD)

**Identify your instance:**

- Name: `taxitime-backend`

**Create instance**

- Click "Create instance"
- ⏱️ Wait 1-2 minutes for instance to be ready

### 2.3 Configure Networking

1. Click on instance → Networking tab
2. Add custom firewall rules:
   - **Application**: Custom
   - **Protocol**: TCP
   - **Port**: `3000` (Backend API)
   - Click "Create"

---

## 🔧 STEP 3: Connect to Server and Install Dependencies

### 3.1 Connect via SSH

Option A - Browser-based SSH:

1. Click "Connect using SSH" in instance details

Option B - Local SSH:

```bash
# Download SSH key from Lightsail
ssh -i LightsailDefaultKey-us-east-1.pem ubuntu@YOUR_INSTANCE_IP
```

### 3.2 Install Node.js 20.x

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x
npm --version
```

### 3.3 Install PostgreSQL Client

```bash
sudo apt install postgresql-client -y
```

### 3.4 Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

### 3.5 Install Nginx (Reverse Proxy)

```bash
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## 📦 STEP 4: Deploy Backend Code

### 4.1 Create Application Directory

```bash
sudo mkdir -p /var/www/taxitime-backend
sudo chown ubuntu:ubuntu /var/www/taxitime-backend
cd /var/www/taxitime-backend
```

### 4.2 Clone or Upload Code

Option A - Using Git (Recommended):

```bash
# Install git
sudo apt install git -y

# Clone repository
git clone https://github.com/iftikhar999/TaxiTime-Backend.git .
git checkout development
```

Option B - Upload Files:

```bash
# From your local machine, run:
cd /Applications/A_B_TAXI/backend
rsync -avz -e "ssh -i ~/path/to/LightsailDefaultKey.pem" \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'uploads' \
  ./ ubuntu@YOUR_INSTANCE_IP:/var/www/taxitime-backend/
```

### 4.3 Install Dependencies

```bash
cd /var/www/taxitime-backend
npm install --production
```

---

## 🔐 STEP 5: Configure Environment Variables

### 5.1 Create Production .env File

```bash
cd /var/www/taxitime-backend
nano .env
```

### 5.2 Add Configuration

```bash
# Database - AWS Lightsail PostgreSQL
DATABASE_URL="postgresql://dbmasteruser:YOUR_DB_PASSWORD@YOUR_DB_ENDPOINT:5432/postgres"

# JWT
JWT_SECRET=your_super_secure_random_string_here_change_this

# Server
PORT=3000
NODE_ENV=production

# Frontend URLs (Update with your actual domains)
FRONTEND_URLS=https://yourdomain.com,https://admin.yourdomain.com,https://dispatch.yourdomain.com

# Google Maps API
GOOGLE_MAPS_API_KEY=AIzaSyBhcA7J8ZefAwlzhuYUNDIf_W3Yzy_16gA

# Payment Gateways
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key

# Email Service
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-specific-password

# File Upload
UPLOAD_PATH=/var/www/taxitime-backend/uploads/
MAX_FILE_SIZE=5MB

# Redis (Optional - for caching)
REDIS_URL=redis://localhost:6379
```

**Save**: Press `Ctrl+X`, then `Y`, then `Enter`

### 5.3 Generate JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Copy this and use it as JWT_SECRET in .env
```

---

## 🗃️ STEP 6: Setup Database

### 6.1 Test Database Connection

```bash
cd /var/www/taxitime-backend
psql "$DATABASE_URL" -c "SELECT version();"
```

### 6.2 Generate Prisma Client

```bash
npx prisma generate
```

### 6.3 Push Database Schema

```bash
npx prisma db push --accept-data-loss
```

### 6.4 Run Seeder

```bash
# Run the complete seeder with test data
node prisma/seed-complete.js
```

**Expected Output:**

```
✅ Super Admin created: admin@abtaxi.com / admin123
✅ Company Owner created: owner@citytaxi.com / owner123
✅ Drivers created: driver1@city001.com / 123123123
✅ Vehicles created
✅ Zones created
✅ Tariffs created
```

---

## 🚀 STEP 7: Start Backend Server

### 7.1 Start with PM2

```bash
cd /var/www/taxitime-backend
pm2 start server.js --name taxitime-backend
pm2 save
pm2 startup
# Follow the command it shows you
```

### 7.2 Check Server Status

```bash
pm2 status
pm2 logs taxitime-backend
```

### 7.3 Test Backend

```bash
curl http://localhost:3000/api/health
# Should return: {"status":"ok"}
```

---

## 🌐 STEP 8: Configure Nginx Reverse Proxy

### 8.1 Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/taxitime-backend
```

### 8.2 Add Configuration

```nginx
server {
    listen 80;
    server_name YOUR_INSTANCE_IP;  # Replace with your domain or IP

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

    # Socket.io for real-time features
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3000;
    }

    # Uploads
    location /uploads {
        alias /var/www/taxitime-backend/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

**Save**: `Ctrl+X`, `Y`, `Enter`

### 8.3 Enable Configuration

```bash
sudo ln -s /etc/nginx/sites-available/taxitime-backend /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

---

## ✅ STEP 9: Verify Deployment

### 9.1 Get Your Server IP

```bash
curl ifconfig.me
```

### 9.2 Test API Endpoints

```bash
# Health check
curl http://YOUR_IP/health

# Login test
curl -X POST http://YOUR_IP/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"driver1@city001.com","password":"123123123"}'
```

### 9.3 Update Mobile App & Frontend URLs

Update these files with your new backend URL:

- `/Applications/A_B_TAXI/mobile/driver-app-v1/src/config/api.ts`
- All frontend `.env` files

---

## 🔒 STEP 10: Setup SSL Certificate (Optional but Recommended)

### 10.1 Point Domain to Lightsail

1. Go to your domain registrar
2. Add A record: `api.yourdomain.com` → `YOUR_LIGHTSAIL_IP`

### 10.2 Install Certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 10.3 Get SSL Certificate

```bash
sudo certbot --nginx -d api.yourdomain.com
```

Follow prompts to:

- Enter email
- Agree to terms
- Auto-configure redirect HTTP → HTTPS

### 10.4 Auto-renewal Setup

```bash
sudo certbot renew --dry-run
```

---

## 📊 Monitoring & Maintenance

### Check Server Status

```bash
pm2 status
pm2 logs taxitime-backend --lines 100
```

### Check Nginx Status

```bash
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### Check Database Connection

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"User\";"
```

### Restart Services

```bash
# Restart backend
pm2 restart taxitime-backend

# Restart nginx
sudo systemctl restart nginx
```

### Update Code

```bash
cd /var/www/taxitime-backend
git pull origin development
npm install --production
npx prisma generate
pm2 restart taxitime-backend
```

---

## 💰 Monthly Costs

### Minimal Setup (Development/Testing)

- Database: $15/month (Standard 1GB)
- Server: $5/month (512MB RAM)
- **Total: $20/month**

### Production Setup (Recommended)

- Database: $30/month (High availability 2GB)
- Server: $10/month (1GB RAM)
- **Total: $40/month**

### High Traffic Setup

- Database: $30/month (High availability 2GB)
- Server: $20/month (4GB RAM, 2 vCPU)
- **Total: $50/month**

---

## 🆘 Troubleshooting

### Backend won't start

```bash
cd /var/www/taxitime-backend
npm install
pm2 restart taxitime-backend
pm2 logs taxitime-backend
```

### Database connection error

```bash
# Test connection
psql "$DATABASE_URL" -c "SELECT 1;"

# Check if database is in public mode (Lightsail console)
# Check firewall rules on database
```

### Port 3000 not accessible

```bash
# Check if process is running
sudo netstat -tlnp | grep 3000

# Check firewall
sudo ufw status
sudo ufw allow 3000
```

### Nginx errors

```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
sudo systemctl status nginx
```

---

## 📝 Important Credentials

**Super Admin:**

- Email: `admin@abtaxi.com`
- Password: `admin123`

**Company Owner:**

- Email: `owner@citytaxi.com`
- Password: `owner123`

**Test Driver:**

- Email: `driver1@city001.com`
- Password: `123123123`

**⚠️ IMPORTANT**: Change these passwords in production!

---

## 🎉 Next Steps

1. ✅ Test all API endpoints
2. ✅ Update mobile app API URLs
3. ✅ Update frontend .env files
4. ✅ Test complete flow (login → create ride → etc)
5. ✅ Setup monitoring (optional: AWS CloudWatch)
6. ✅ Setup backups (Lightsail automatic snapshots)
7. ✅ Change default passwords

---

## 📞 Support

If you encounter issues:

1. Check PM2 logs: `pm2 logs taxitime-backend`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Check database connectivity
4. Review this guide step by step
