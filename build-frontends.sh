#!/bin/bash

###############################################################################
# TAXITIME V2 - FRONTEND BUILD SCRIPT
###############################################################################
#
# Builds all frontend applications for production deployment
#
# Usage:
#   ./build-frontends.sh [all|super-admin|owner|dispatch]
#
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Base paths
BASE_DIR="/Applications/A_B_TAXI/frontend"

###############################################################################
# Build Super Admin
###############################################################################

build_super_admin() {
    print_header "BUILDING SUPER ADMIN PANEL"
    
    cd "$BASE_DIR/super-admin"
    
    print_info "Installing dependencies..."
    npm install
    
    print_info "Building production bundle..."
    npm run build
    
    if [ -d "build" ]; then
        print_success "Super Admin build completed"
        print_info "Build size: $(du -sh build | cut -f1)"
    else
        print_error "Build failed - no build directory found"
        return 1
    fi
}

###############################################################################
# Build Owner Panel
###############################################################################

build_owner_panel() {
    print_header "BUILDING OWNER PANEL"
    
    cd "$BASE_DIR/owner-panel"
    
    print_info "Installing dependencies..."
    npm install
    
    print_info "Building production bundle..."
    npm run build
    
    if [ -d "build" ]; then
        print_success "Owner Panel build completed"
        print_info "Build size: $(du -sh build | cut -f1)"
    else
        print_error "Build failed - no build directory found"
        return 1
    fi
}

###############################################################################
# Build Dispatch Portal
###############################################################################

build_dispatch() {
    print_header "BUILDING DISPATCH PORTAL"
    
    cd "$BASE_DIR/dispatch"
    
    print_info "Installing dependencies..."
    npm install
    
    print_info "Building production bundle..."
    npm run build
    
    if [ -d "build" ]; then
        print_success "Dispatch Portal build completed"
        print_info "Build size: $(du -sh build | cut -f1)"
    else
        print_error "Build failed - no build directory found"
        return 1
    fi
}

###############################################################################
# Build Public Website (Next.js)
###############################################################################

build_website() {
    print_header "BUILDING PUBLIC WEBSITE"
    
    cd "$BASE_DIR/website"
    
    print_info "Installing dependencies..."
    npm install
    
    print_info "Building Next.js production bundle..."
    npm run build
    
    if [ -d ".next" ]; then
        print_success "Website build completed"
        print_info "Build size: $(du -sh .next | cut -f1)"
    else
        print_error "Build failed - no .next directory found"
        return 1
    fi
}

###############################################################################
# Main Execution
###############################################################################

main() {
    TARGET=${1:-all}
    
    print_header "🚀 TAXITIME V2 - FRONTEND BUILD SCRIPT"
    
    echo "Building: $TARGET"
    echo ""
    
    case $TARGET in
        all)
            build_super_admin
            build_owner_panel
            build_dispatch
            build_website
            ;;
        super-admin)
            build_super_admin
            ;;
        owner)
            build_owner_panel
            ;;
        dispatch)
            build_dispatch
            ;;
        website)
            build_website
            ;;
        *)
            print_error "Invalid target: $TARGET"
            echo "Usage: ./build-frontends.sh [all|super-admin|owner|dispatch|website]"
            exit 1
            ;;
    esac
    
    print_header "✅ BUILD COMPLETED SUCCESSFULLY"
    
    echo ""
    print_info "Next steps:"
    echo "  1. Test builds locally"
    echo "  2. Deploy to Lightsail server"
    echo "  3. Verify all applications work correctly"
    echo ""
}

main "$@"
