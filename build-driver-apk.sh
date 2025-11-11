#!/bin/bash

###############################################################################
# TAXITIME V2 - DRIVER APP APK BUILD SCRIPT
###############################################################################
#
# Builds production APK for driver application with Lightsail server URL
#
# Usage:
#   ./build-driver-apk.sh [SERVER_URL]
#
# Example:
#   ./build-driver-apk.sh https://api.taxitime.com
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

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Configuration
APP_DIR="/Applications/A_B_TAXI/mobile/driver-app-v1"
OUTPUT_DIR="$APP_DIR/android/app/build/outputs/apk/release"
FINAL_APK="taxitime-driver-v2.0-$(date +%Y%m%d).apk"

###############################################################################
# Update API Configuration
###############################################################################

update_api_config() {
    SERVER_URL=$1
    
    print_header "UPDATING API CONFIGURATION"
    
    print_info "Server URL: $SERVER_URL"
    
    # Find and update the API config file
    API_CONFIG_FILES=(
        "$APP_DIR/src/config/api.ts"
        "$APP_DIR/src/config/api.js"
        "$APP_DIR/src/services/api.ts"
        "$APP_DIR/src/services/api.js"
    )
    
    FOUND=false
    
    for config_file in "${API_CONFIG_FILES[@]}"; do
        if [ -f "$config_file" ]; then
            print_info "Found config: $config_file"
            
            # Backup original
            cp "$config_file" "$config_file.backup"
            
            # Update API URL
            if [[ "$config_file" == *.ts ]]; then
                # TypeScript file
                sed -i.bak "s|export const API_BASE_URL = .*|export const API_BASE_URL = '$SERVER_URL';|g" "$config_file"
                sed -i.bak "s|export const SOCKET_URL = .*|export const SOCKET_URL = '$SERVER_URL';|g" "$config_file"
            else
                # JavaScript file
                sed -i.bak "s|const API_BASE_URL = .*|const API_BASE_URL = '$SERVER_URL';|g" "$config_file"
                sed -i.bak "s|const SOCKET_URL = .*|const SOCKET_URL = '$SERVER_URL';|g" "$config_file"
            fi
            
            rm "$config_file.bak"
            
            print_success "API configuration updated"
            FOUND=true
            break
        fi
    done
    
    if [ "$FOUND" = false ]; then
        print_warning "API config file not found. You may need to update manually."
        print_info "Looking for these files:"
        for config_file in "${API_CONFIG_FILES[@]}"; do
            echo "  - $config_file"
        done
    fi
}

###############################################################################
# Clean Previous Builds
###############################################################################

clean_build() {
    print_header "CLEANING PREVIOUS BUILDS"
    
    cd "$APP_DIR/android"
    
    print_info "Cleaning Gradle build cache..."
    ./gradlew clean
    
    print_success "Build cache cleaned"
}

###############################################################################
# Install Dependencies
###############################################################################

install_dependencies() {
    print_header "INSTALLING DEPENDENCIES"
    
    cd "$APP_DIR"
    
    print_info "Installing npm packages..."
    npm install
    
    print_success "Dependencies installed"
}

###############################################################################
# Build Release APK
###############################################################################

build_apk() {
    print_header "BUILDING RELEASE APK"
    
    cd "$APP_DIR/android"
    
    print_info "Building release APK..."
    print_warning "This may take several minutes..."
    
    ./gradlew assembleRelease
    
    if [ -f "$OUTPUT_DIR/app-release.apk" ]; then
        print_success "APK build completed"
        
        # Get APK size
        APK_SIZE=$(du -sh "$OUTPUT_DIR/app-release.apk" | cut -f1)
        print_info "APK size: $APK_SIZE"
        
        # Copy to project root with versioned name
        cp "$OUTPUT_DIR/app-release.apk" "$APP_DIR/$FINAL_APK"
        print_success "APK saved as: $FINAL_APK"
    else
        print_error "APK build failed"
        return 1
    fi
}

###############################################################################
# Generate APK Info
###############################################################################

generate_apk_info() {
    print_header "GENERATING APK INFORMATION"
    
    INFO_FILE="$APP_DIR/apk-info-$(date +%Y%m%d).txt"
    
    cat > "$INFO_FILE" << EOF
═══════════════════════════════════════════════════════════════
TAXITIME DRIVER APP - APK BUILD INFORMATION
═══════════════════════════════════════════════════════════════

Build Date: $(date)
APK File: $FINAL_APK
Server URL: $SERVER_URL
APK Size: $(du -sh "$APP_DIR/$FINAL_APK" | cut -f1)

═══════════════════════════════════════════════════════════════
INSTALLATION INSTRUCTIONS
═══════════════════════════════════════════════════════════════

1. Transfer APK to Android device:
   - Via USB: Copy $FINAL_APK to device
   - Via cloud: Upload to Drive/Dropbox and download on device
   
2. On Android device:
   - Enable "Install from Unknown Sources" in Settings
   - Tap the APK file
   - Follow installation prompts
   
3. First launch:
   - Grant location permissions (required)
   - Grant notification permissions (required)
   - Log in with driver credentials
   
═══════════════════════════════════════════════════════════════
TESTING CHECKLIST
═══════════════════════════════════════════════════════════════

Backend Connection:
  [ ] App connects to server
  [ ] Login successful
  [ ] Profile data loads

Location Services:
  [ ] GPS location updates working
  [ ] Location updates sent to server
  [ ] Update interval respects company settings

Shift Management:
  [ ] Can start shift
  [ ] Appears online in dispatch
  [ ] Can end shift

Job Management:
  [ ] Receives job notifications
  [ ] Can accept/reject jobs
  [ ] Job details display correctly
  [ ] Can start trip
  [ ] Can complete trip
  
Earnings:
  [ ] Earnings calculated correctly
  [ ] Payment methods work
  [ ] Earnings display in app

Real-time Updates:
  [ ] Job status updates immediately
  [ ] Dispatch can see driver location
  [ ] Chat/messages work (if applicable)

═══════════════════════════════════════════════════════════════
TROUBLESHOOTING
═══════════════════════════════════════════════════════════════

If app doesn't connect:
1. Check device has internet connection
2. Verify server URL: $SERVER_URL
3. Check backend server is running
4. View logs: adb logcat | grep TaxiTime

If location doesn't update:
1. Grant location permissions
2. Check GPS is enabled
3. View logs: adb logcat | grep LocationTracking

If crashes on startup:
1. Clear app data in Settings
2. Reinstall APK
3. Check logcat for errors

═══════════════════════════════════════════════════════════════
SUPPORT
═══════════════════════════════════════════════════════════════

For issues, contact: dev@taxitime.com

═══════════════════════════════════════════════════════════════
EOF

    print_success "APK info saved to: $INFO_FILE"
    
    # Display summary
    cat "$INFO_FILE"
}

###############################################################################
# Restore API Config
###############################################################################

restore_api_config() {
    print_header "RESTORING API CONFIGURATION"
    
    for config_file in "${API_CONFIG_FILES[@]}"; do
        if [ -f "$config_file.backup" ]; then
            mv "$config_file.backup" "$config_file"
            print_success "Restored: $config_file"
        fi
    done
}

###############################################################################
# Main Execution
###############################################################################

main() {
    if [ -z "$1" ]; then
        print_error "Server URL not provided"
        echo "Usage: ./build-driver-apk.sh [SERVER_URL]"
        echo "Example: ./build-driver-apk.sh https://api.taxitime.com"
        exit 1
    fi
    
    SERVER_URL=$1
    
    print_header "🚀 TAXITIME DRIVER APP - APK BUILD"
    
    echo "Server URL: $SERVER_URL"
    echo "App Directory: $APP_DIR"
    echo "Output APK: $FINAL_APK"
    echo ""
    print_warning "Continue? (y/n)"
    read -r response
    
    if [ "$response" != "y" ]; then
        print_error "Build cancelled"
        exit 0
    fi
    
    # Execute build steps
    update_api_config "$SERVER_URL"
    install_dependencies
    clean_build
    build_apk
    generate_apk_info
    restore_api_config
    
    print_header "✅ APK BUILD COMPLETED"
    
    echo ""
    print_success "APK Location: $APP_DIR/$FINAL_APK"
    print_info "APK Info: $APP_DIR/apk-info-$(date +%Y%m%d).txt"
    echo ""
    print_info "Next steps:"
    echo "  1. Test APK on Android device"
    echo "  2. Verify connection to: $SERVER_URL"
    echo "  3. Complete testing checklist"
    echo "  4. Distribute to drivers"
    echo ""
    print_header "🎉 ALL DONE!"
}

# Run main
main "$@"
