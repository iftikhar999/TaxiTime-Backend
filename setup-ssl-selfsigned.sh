#!/bin/bash
# Setup Self-Signed SSL Certificate (For Testing Only)
# This will show browser warnings but enables HTTPS

set -e

SERVER_IP="54.252.241.150"

echo "🔐 Setting up self-signed SSL certificate..."
echo "⚠️  This is for TESTING ONLY - browsers will show warnings"
echo ""

# Create SSL directory
sudo mkdir -p /etc/nginx/ssl

# Generate self-signed certificate (valid for 365 days)
echo "📝 Generating certificate..."
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/selfsigned.key \
    -out /etc/nginx/ssl/selfsigned.crt \
    -subj "/C=US/ST=State/L=City/O=AB Taxi/CN=$SERVER_IP"

# Generate Diffie-Hellman parameters
echo "🔑 Generating DH parameters (this may take a minute)..."
sudo openssl dhparam -out /etc/nginx/ssl/dhparam.pem 2048

# Update Nginx configuration
echo "⚙️  Updating Nginx configuration..."
sudo tee /etc/nginx/sites-available/default > /dev/null << 'NGINX_EOF'
server {
    listen 80;
    listen [::]:80;
    server_name _;
    
    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name _;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/selfsigned.key;
    ssl_dhparam /etc/nginx/ssl/dhparam.pem;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_session_timeout 10m;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    # API proxy
    location ^~ /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.io
    location ^~ /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check (no trailing slash redirect)
    location = /health {
        proxy_pass http://localhost:3000/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # Super Admin Panel
    location /admin {
        alias /var/www/super-admin/;
        try_files $uri $uri/ /admin/index.html;
        index index.html;
    }

    # Owner Panel
    location /owner {
        alias /var/www/owner-panel/;
        try_files $uri $uri/ /owner/index.html;
        index index.html;
    }

    # Dispatch System
    location /dispatch {
        alias /var/www/dispatch/;
        try_files $uri $uri/ /dispatch/index.html;
        index index.html;
    }

    # Website (default)
    location / {
        root /var/www/website;
        try_files $uri $uri.html $uri/ /index.html;
        index index.html;
    }
}
NGINX_EOF

# Test and reload Nginx
echo "🧪 Testing Nginx configuration..."
sudo nginx -t

echo "🔄 Reloading Nginx..."
sudo systemctl reload nginx

echo ""
echo "✅ SELF-SIGNED SSL SETUP COMPLETE!"
echo ""
echo "⚠️  BROWSER WARNING:"
echo "   Browsers will show 'Your connection is not private'"
echo "   Click 'Advanced' → 'Proceed to $SERVER_IP (unsafe)'"
echo ""
echo "🌐 Your site is now available at:"
echo "  • https://$SERVER_IP/"
echo "  • https://$SERVER_IP/admin/"
echo "  • https://$SERVER_IP/owner/"
echo "  • https://$SERVER_IP/dispatch/"
echo ""
echo "📝 To get a proper certificate:"
echo "   1. Get a domain name"
echo "   2. Point it to $SERVER_IP"
echo "   3. Run: ./setup-ssl-letsencrypt.sh yourdomain.com email@domain.com"
echo ""
