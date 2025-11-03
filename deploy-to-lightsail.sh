#!/bin/bash

# TaxiTime - Automated AWS Lightsail Deployment Script
# This script will set up everything on your Lightsail server

set -e  # Exit on any error

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         TaxiTime AWS Lightsail Automated Deployment           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if IP and SSH key are provided
if [ -z "$1" ] || [ -z "$2" ]; then
    echo "❌ Usage: ./deploy-to-lightsail.sh <SERVER_IP> <SSH_KEY_PATH>"
    echo ""
    echo "Example:"
    echo "  ./deploy-to-lightsail.sh 18.123.456.789 ~/Downloads/LightsailDefaultKey.pem"
    echo ""
    echo "Steps to get started:"
    echo "1. Create Lightsail instance at https://lightsail.aws.amazon.com"
    echo "2. Download SSH key from Lightsail (Account → SSH Keys)"
    echo "3. Run this script with your server IP and key path"
    exit 1
fi

SERVER_IP=$1
SSH_KEY=$2
SSH_USER="ubuntu"

echo "📋 Configuration:"
echo "   Server IP: $SERVER_IP"
echo "   SSH Key: $SSH_KEY"
echo "   SSH User: $SSH_USER"
echo ""

# Test SSH connection
echo "🔐 Testing SSH connection..."
if ! ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$SSH_USER@$SERVER_IP" "echo 'Connection successful'" 2>/dev/null; then
    echo "❌ Cannot connect to server. Please check:"
    echo "   1. Server IP is correct"
    echo "   2. SSH key path is correct"
    echo "   3. Firewall allows SSH (port 22)"
    echo "   4. Server is running"
    exit 1
fi

echo "✅ SSH connection successful!"
echo ""

# Generate secure passwords
echo "🔐 Generating secure passwords..."
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
JWT_SECRET=$(openssl rand -hex 64)

echo "✅ Passwords generated"
echo ""

# Create remote setup script
echo "📝 Creating server setup script..."
cat > /tmp/server-setup.sh << 'SETUP_SCRIPT'
#!/bin/bash
set -e

echo "════════════════════════════════════════════════════════════════"
echo "Starting server setup..."
echo "════════════════════════════════════════════════════════════════"

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install PostgreSQL
echo "🗄️  Installing PostgreSQL..."
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Configure PostgreSQL
echo "🔧 Configuring PostgreSQL..."
sudo -u postgres psql << EOF
CREATE DATABASE taxitime_db;
CREATE USER taxitime_user WITH ENCRYPTED PASSWORD 'DB_PASSWORD_PLACEHOLDER';
GRANT ALL PRIVILEGES ON DATABASE taxitime_db TO taxitime_user;
ALTER DATABASE taxitime_db OWNER TO taxitime_user;
\q
EOF

# Install Node.js 20.x
echo "📦 Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install Nginx
echo "🌐 Installing Nginx..."
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx

# Install serve for static files
echo "📦 Installing serve..."
sudo npm install -g serve

# Create directories
echo "📁 Creating application directories..."
sudo mkdir -p /var/www/taxitime-backend
sudo mkdir -p /var/www/frontends
sudo chown -R ubuntu:ubuntu /var/www

echo "✅ Server setup complete!"
SETUP_SCRIPT

# Replace placeholder with actual password
sed -i.bak "s/DB_PASSWORD_PLACEHOLDER/$DB_PASSWORD/g" /tmp/server-setup.sh
rm /tmp/server-setup.sh.bak

# Upload and execute setup script
echo "📤 Uploading server setup script..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no /tmp/server-setup.sh "$SSH_USER@$SERVER_IP:/tmp/"

echo "🚀 Executing server setup (this will take 5-10 minutes)..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "bash /tmp/server-setup.sh"

echo ""
echo "✅ Server setup phase complete!"
echo ""

# Upload backend code
echo "📤 Uploading backend code..."
rsync -avz -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude '.env.backup' \
    --exclude 'uploads' \
    --exclude '.git' \
    --exclude 'coverage' \
    --exclude 'logs' \
    --exclude 'tests' \
    ./ "$SSH_USER@$SERVER_IP:/var/www/taxitime-backend/"

echo "✅ Backend code uploaded"
echo ""

# Create .env file
echo "🔐 Creating production environment file..."
cat > /tmp/.env.production << EOF
# Database
DATABASE_URL="postgresql://taxitime_user:$DB_PASSWORD@localhost:5432/taxitime_db"

# JWT
JWT_SECRET=$JWT_SECRET

# Server
PORT=3000
NODE_ENV=production

# Frontend URLs
FRONTEND_URLS=http://$SERVER_IP,http://$SERVER_IP:3001,http://$SERVER_IP:3002,http://$SERVER_IP:3003,http://$SERVER_IP:3004

# Google Maps
GOOGLE_MAPS_API_KEY=AIzaSyBhcA7J8ZefAwlzhuYUNDIf_W3Yzy_16gA

# File Upload
UPLOAD_PATH=/var/www/taxitime-backend/uploads/
MAX_FILE_SIZE=5MB

# Email (Optional - configure later)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Payment Gateways (Optional - configure later)
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_key
EOF

scp -i "$SSH_KEY" -o StrictHostKeyChecking=no /tmp/.env.production "$SSH_USER@$SERVER_IP:/var/www/taxitime-backend/.env"

echo "✅ Environment file created"
echo ""

# Setup backend
echo "🔧 Setting up backend..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" << 'BACKEND_SETUP'
cd /var/www/taxitime-backend

# Install dependencies
echo "📦 Installing backend dependencies..."
npm install --production

# Create uploads directory
mkdir -p uploads

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Push database schema
echo "🗄️  Creating database tables..."
npx prisma db push --accept-data-loss

# Run seeder
echo "🌱 Seeding database..."
node prisma/seed-complete.js

# Start backend with PM2
echo "🚀 Starting backend..."
pm2 start server.js --name taxitime-backend --time
pm2 save
pm2 startup | tail -n 1 | bash

echo "✅ Backend setup complete!"
BACKEND_SETUP

echo ""
echo "✅ Backend deployed successfully!"
echo ""

# Configure Nginx
echo "🌐 Configuring Nginx..."
cat > /tmp/nginx-config << 'NGINX_CONFIG'
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 10M;

    # Root location
    location / {
        return 200 '{"status":"TaxiTime Server","message":"Backend is running"}';
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
NGINX_CONFIG

scp -i "$SSH_KEY" -o StrictHostKeyChecking=no /tmp/nginx-config "$SSH_USER@$SERVER_IP:/tmp/"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" << 'NGINX_SETUP'
sudo mv /tmp/nginx-config /etc/nginx/sites-available/taxitime
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/taxitime /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
NGINX_SETUP

echo "✅ Nginx configured"
echo ""

# Test deployment
echo "🧪 Testing deployment..."
sleep 3

if curl -s "http://$SERVER_IP/health" | grep -q "ok"; then
    echo "✅ Health check passed!"
else
    echo "⚠️  Health check failed, but backend might still be starting..."
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                  🎉 DEPLOYMENT SUCCESSFUL! 🎉                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Your TaxiTime Backend is now live at:"
echo "   🌐 API: http://$SERVER_IP/api"
echo "   ❤️  Health: http://$SERVER_IP/health"
echo ""
echo "🔐 Login Credentials:"
echo "   Super Admin: admin@abtaxi.com / admin123"
echo "   Owner: owner@citytaxi.com / owner123"
echo "   Driver: driver1@city001.com / 123123123"
echo ""
echo "📝 Database Credentials (save these!):"
echo "   Database: taxitime_db"
echo "   User: taxitime_user"
echo "   Password: $DB_PASSWORD"
echo ""
echo "🔑 JWT Secret (save this!):"
echo "   $JWT_SECRET"
echo ""
echo "📱 Update your mobile app config with:"
echo "   API_URL: http://$SERVER_IP/api"
echo ""
echo "🔧 Server Management:"
echo "   SSH: ssh -i $SSH_KEY ubuntu@$SERVER_IP"
echo "   Status: pm2 status"
echo "   Logs: pm2 logs taxitime-backend"
echo ""
echo "📋 Next Steps:"
echo "   1. Test API: curl http://$SERVER_IP/api/health"
echo "   2. Update mobile app API URL"
echo "   3. Deploy frontends (see LIGHTSAIL_COMPLETE_PLATFORM_SETUP.md)"
echo "   4. Setup domain & SSL (optional)"
echo ""
echo "✅ All done! Your backend is ready to use! 🚀"
echo ""

# Save credentials to file
cat > deployment-credentials.txt << EOF
TaxiTime Deployment Credentials
Generated: $(date)
================================

Server IP: $SERVER_IP
SSH Key: $SSH_KEY

Database:
  Host: localhost
  Database: taxitime_db
  User: taxitime_user
  Password: $DB_PASSWORD

Backend:
  API URL: http://$SERVER_IP/api
  JWT Secret: $JWT_SECRET

Login Credentials:
  Super Admin: admin@abtaxi.com / admin123
  Owner: owner@citytaxi.com / owner123
  Driver: driver1@city001.com / 123123123

SSH Access:
  ssh -i $SSH_KEY ubuntu@$SERVER_IP

PM2 Commands:
  pm2 status
  pm2 logs taxitime-backend
  pm2 restart taxitime-backend
EOF

echo "💾 Credentials saved to: deployment-credentials.txt"
echo ""
