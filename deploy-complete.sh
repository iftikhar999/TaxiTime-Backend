#!/bin/bash

###############################################################################
# TAXITIME V2 - AUTOMATED LIGHTSAIL DEPLOYMENT SCRIPT
###############################################################################
#
# This script automates the deployment of TaxiTime backend to AWS Lightsail
#
# Usage:
#   ./deploy-complete.sh [SERVER_IP]
#
# Example:
#   ./deploy-complete.sh 13.239.123.45
#
###############################################################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_KEY="$SCRIPT_DIR/LightsailDefaultKey-ap-southeast-2.pem"
SSH_USER="ubuntu"
REMOTE_DIR="/var/www/taxitime-backend"
BRANCH="development"

###############################################################################
# Helper Functions
###############################################################################

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

###############################################################################
# Validation
###############################################################################

validate_environment() {
    print_header "VALIDATING ENVIRONMENT"
    
    # Check if server IP provided
    if [ -z "$1" ]; then
        print_error "Server IP not provided"
        echo "Usage: ./deploy-complete.sh [SERVER_IP]"
        exit 1
    fi
    
    SERVER_IP=$1
    print_success "Server IP: $SERVER_IP"
    
    # Check if SSH key exists
    if [ ! -f "$SSH_KEY" ]; then
        print_error "SSH key not found at: $SSH_KEY"
        exit 1
    fi
    print_success "SSH key found"
    
    # Check SSH key permissions
    PERMS=$(stat -f %A "$SSH_KEY" 2>/dev/null || stat -c %a "$SSH_KEY" 2>/dev/null)
    if [ "$PERMS" != "400" ]; then
        print_warning "SSH key permissions not set correctly. Fixing..."
        chmod 400 "$SSH_KEY"
    fi
    print_success "SSH key permissions: 400"
    
    # Test SSH connection
    print_info "Testing SSH connection..."
    if ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$SSH_USER@$SERVER_IP" "echo 'SSH OK'" > /dev/null 2>&1; then
        print_success "SSH connection successful"
    else
        print_error "Cannot connect to server via SSH"
        exit 1
    fi
}

###############################################################################
# Pre-Deployment Checks
###############################################################################

pre_deployment_checks() {
    print_header "PRE-DEPLOYMENT CHECKS"
    
    print_info "Checking local repository status..."
    
    # Check if we're in the backend directory
    if [ ! -f "package.json" ]; then
        print_error "Not in backend directory. Please run from backend folder."
        exit 1
    fi
    
    # Check current branch
    CURRENT_BRANCH=$(git branch --show-current)
    print_info "Current branch: $CURRENT_BRANCH"
    
    if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
        print_warning "Not on $BRANCH branch. Switch to $BRANCH? (y/n)"
        read -r response
        if [ "$response" = "y" ]; then
            git checkout $BRANCH
            print_success "Switched to $BRANCH"
        else
            print_error "Deployment cancelled"
            exit 1
        fi
    fi
    
    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        print_warning "You have uncommitted changes. Commit them? (y/n)"
        read -r response
        if [ "$response" = "y" ]; then
            git add .
            git commit -m "Pre-deployment commit: $(date)"
            print_success "Changes committed"
        else
            print_error "Please commit changes before deploying"
            exit 1
        fi
    fi
    
    # Push to remote
    print_info "Pushing to remote repository..."
    git push origin $BRANCH
    print_success "Code pushed to remote"
}

###############################################################################
# Database Backup
###############################################################################

backup_database() {
    print_header "DATABASE BACKUP"
    
    BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S).sql"
    
    print_info "Creating database backup: $BACKUP_NAME"
    
    ssh -i "$SSH_KEY" "$SSH_USER@$SERVER_IP" << 'EOF'
        if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw taxitime; then
            sudo -u postgres pg_dump taxitime > ~/backup_$(date +%Y%m%d_%H%M%S).sql
            echo "Database backup created"
        else
            echo "Database 'taxitime' does not exist. Skipping backup."
        fi
EOF
    
    print_success "Database backup completed"
}

###############################################################################
# Deploy Backend
###############################################################################

deploy_backend() {
    print_header "DEPLOYING BACKEND"
    
    print_info "Connecting to server and deploying..."
    
    ssh -i "$SSH_KEY" "$SSH_USER@$SERVER_IP" << EOF
        set -e
        
        echo "📍 Navigating to backend directory..."
        cd $REMOTE_DIR
        
        echo "📍 Stashing local changes..."
        git stash
        
        echo "📍 Pulling latest code..."
        git checkout $BRANCH
        git pull origin $BRANCH
        
        echo "📍 Installing dependencies..."
        npm install --production
        
        echo "📍 Generating Prisma client..."
        npx prisma generate
        
        echo "📍 Running database migrations..."
        npx prisma migrate deploy
        
        echo "📍 Restarting backend service..."
        pm2 restart taxitime-backend || pm2 start server.js --name taxitime-backend --env production
        
        echo "📍 Saving PM2 configuration..."
        pm2 save
        
        echo "✅ Backend deployment completed"
EOF
    
    print_success "Backend deployed successfully"
}

###############################################################################
# Deploy Frontends
###############################################################################

deploy_super_admin() {
    print_header "DEPLOYING SUPER ADMIN PANEL"
    
    ssh -i "$SSH_KEY" "$SSH_USER@$SERVER_IP" << 'EOF'
        set -e
        
        cd /var/www/taxitime-super-admin
        
        git stash
        git checkout development
        git pull origin development
        
        npm install
        npm run build
        
        pm2 restart taxitime-super-admin || pm2 start "npx serve -s build -l 3002" --name taxitime-super-admin
        pm2 save
        
        echo "✅ Super Admin deployed"
EOF
    
    print_success "Super Admin Panel deployed"
}

deploy_owner_panel() {
    print_header "DEPLOYING OWNER PANEL"
    
    ssh -i "$SSH_KEY" "$SSH_USER@$SERVER_IP" << 'EOF'
        set -e
        
        cd /var/www/taxitime-owner-panel
        
        git stash
        git checkout development
        git pull origin development
        
        npm install
        npm run build
        
        pm2 restart taxitime-owner-panel || pm2 start "npx serve -s build -l 3003" --name taxitime-owner-panel
        pm2 save
        
        echo "✅ Owner Panel deployed"
EOF
    
    print_success "Owner Panel deployed"
}

deploy_dispatch() {
    print_header "DEPLOYING DISPATCH PORTAL"
    
    ssh -i "$SSH_KEY" "$SSH_USER@$SERVER_IP" << 'EOF'
        set -e
        
        cd /var/www/taxitime-dispatch
        
        git stash
        git checkout development
        git pull origin development
        
        npm install
        npm run build
        
        pm2 restart taxitime-dispatch || pm2 start "npx serve -s build -l 3004" --name taxitime-dispatch
        pm2 save
        
        echo "✅ Dispatch Portal deployed"
EOF
    
    print_success "Dispatch Portal deployed"
}

###############################################################################
# Run Production Seeder (Optional)
###############################################################################

run_seeder() {
    print_header "DATABASE SEEDING"
    
    print_warning "Do you want to run the production seeder?"
    print_warning "⚠️  Only run this on a fresh database!"
    print_info "Run seeder? (y/n)"
    read -r response
    
    if [ "$response" = "y" ]; then
        ssh -i "$SSH_KEY" "$SSH_USER@$SERVER_IP" << EOF
            cd $REMOTE_DIR
            node seed-final-production.js
EOF
        print_success "Seeder executed"
    else
        print_info "Skipping seeder"
    fi
}

###############################################################################
# Post-Deployment Verification
###############################################################################

verify_deployment() {
    print_header "POST-DEPLOYMENT VERIFICATION"
    
    print_info "Checking PM2 status..."
    ssh -i "$SSH_KEY" "$SSH_USER@$SERVER_IP" "pm2 status"
    
    print_info "Checking backend logs..."
    ssh -i "$SSH_KEY" "$SSH_USER@$SERVER_IP" "pm2 logs taxitime-backend --lines 20 --nostream"
    
    print_info "Testing API health endpoint..."
    HEALTH_CHECK=$(ssh -i "$SSH_KEY" "$SSH_USER@$SERVER_IP" "curl -s http://localhost:3000/api/health")
    
    if [ -n "$HEALTH_CHECK" ]; then
        print_success "Backend API is responding"
    else
        print_error "Backend API is not responding"
    fi
}

###############################################################################
# Main Execution
###############################################################################

main() {
    clear
    
    print_header "🚀 TAXITIME V2 - AUTOMATED DEPLOYMENT"
    
    echo "This script will deploy TaxiTime to AWS Lightsail"
    echo ""
    echo "Steps:"
    echo "  1. Validate environment"
    echo "  2. Pre-deployment checks"
    echo "  3. Backup database"
    echo "  4. Deploy backend"
    echo "  5. Deploy frontends"
    echo "  6. Run seeder (optional)"
    echo "  7. Verify deployment"
    echo ""
    print_warning "Continue? (y/n)"
    read -r response
    
    if [ "$response" != "y" ]; then
        print_error "Deployment cancelled"
        exit 0
    fi
    
    # Execute deployment steps
    validate_environment "$1"
    pre_deployment_checks
    backup_database
    deploy_backend
    deploy_super_admin
    deploy_owner_panel
    deploy_dispatch
    run_seeder
    verify_deployment
    
    print_header "✅ DEPLOYMENT COMPLETED SUCCESSFULLY"
    
    echo ""
    print_success "Backend API: http://$SERVER_IP:3000"
    print_success "Super Admin: http://$SERVER_IP:3002"
    print_success "Owner Panel: http://$SERVER_IP:3003"
    print_success "Dispatch: http://$SERVER_IP:3004"
    echo ""
    print_info "Next steps:"
    echo "  1. Test all applications"
    echo "  2. Update mobile app with server URL"
    echo "  3. Build and test mobile APK"
    echo "  4. Monitor logs: ssh -i $SSH_KEY $SSH_USER@$SERVER_IP 'pm2 logs'"
    echo ""
    print_header "🎉 ALL DONE!"
}

# Run main function with command line arguments
main "$@"
