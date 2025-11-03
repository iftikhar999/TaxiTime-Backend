#!/bin/bash
# Setup SSL with Let's Encrypt (Free, Auto-Renewing Certificate)
# Usage: ./setup-ssl-letsencrypt.sh yourdomain.com admin@youremail.com

set -e

DOMAIN=$1
EMAIL=$2

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Usage: $0 <domain> <email>"
    echo "Example: $0 abtaxi.com admin@abtaxi.com"
    exit 1
fi

echo "🔐 Setting up SSL for: $DOMAIN"
echo "📧 Email: $EMAIL"
echo ""

# Install Certbot
echo "📦 Installing Certbot..."
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate
echo "🔒 Obtaining SSL certificate..."
sudo certbot --nginx \
    -d $DOMAIN \
    -d www.$DOMAIN \
    --non-interactive \
    --agree-tos \
    --email $EMAIL \
    --redirect

# Test auto-renewal
echo "✅ Testing auto-renewal..."
sudo certbot renew --dry-run

echo ""
echo "✅ SSL SETUP COMPLETE!"
echo ""
echo "Your site is now available at:"
echo "  • https://$DOMAIN"
echo "  • https://www.$DOMAIN"
echo "  • https://$DOMAIN/admin/"
echo "  • https://$DOMAIN/owner/"
echo "  • https://$DOMAIN/dispatch/"
echo ""
echo "Certificate will auto-renew every 90 days."
echo ""
