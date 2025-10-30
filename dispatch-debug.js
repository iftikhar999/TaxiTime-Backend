// Diagnostic script for dispatch portal driver visibility issues
console.log('🔍 Dispatch Driver Debugging Script');

// Function to check driver data in store
function checkDriverData() {
    console.log('\n📊 Current Driver Data:');

    // Try to access the dispatch store (if available)
    if (typeof window !== 'undefined' && window.__DISPATCH_STORE__) {
        const state = window.__DISPATCH_STORE__.getState();
        console.log('  - Total drivers in store:', state.drivers?.length || 0);
        console.log('  - Drivers with locations:',
            state.drivers?.filter(d => d.position?.latitude && d.position?.longitude)?.length || 0
        );
        console.log('  - Driver statuses:',
            state.drivers?.reduce((acc, d) => {
                acc[d.status] = (acc[d.status] || 0) + 1;
                return acc;
            }, {}) || {}
        );
    } else {
        console.log('  - Store not accessible from console');
    }
}

// Function to check socket connection
function checkSocketConnection() {
    console.log('\n🔌 Socket Connection:');

    // Check if socket events are being received
    if (typeof window !== 'undefined' && window.io) {
        console.log('  - Socket.io available');
        // You can add more socket debugging here
    } else {
        console.log('  - Socket.io not found on window');
    }
}

// Function to check API responses
async function checkDriverAPI() {
    console.log('\n🌐 API Check:');

    try {
        const response = await fetch('/api/dispatch/drivers', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token') || 'NO_TOKEN'}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('  ✅ Driver API successful');
            console.log('  - Response status:', response.status);
            console.log('  - Driver count:', data.data?.length || 0);
            console.log('  - Sample driver:', data.data?.[0] || 'No drivers');
        } else {
            console.log('  ❌ Driver API failed');
            console.log('  - Status:', response.status);
            const errorText = await response.text();
            console.log('  - Error:', errorText);
        }
    } catch (error) {
        console.log('  ❌ Network error:', error.message);
    }
}

// Function to check local storage
function checkLocalStorage() {
    console.log('\n💾 Local Storage:');
    console.log('  - Auth token exists:', !!localStorage.getItem('token'));
    console.log('  - Force refresh mode:', localStorage.getItem('dispatch_force_refresh'));
    console.log('  - Force clear mode:', localStorage.getItem('dispatch_force_clear'));
}

// Run all checks
function runDiagnostics() {
    console.log('🚀 Running Dispatch Portal Diagnostics...');
    checkDriverData();
    checkSocketConnection();
    checkLocalStorage();
    checkDriverAPI();

    console.log('\n💡 Tips:');
    console.log('  - If driver count is 0, check if drivers are online in mobile app');
    console.log('  - If API fails, check server logs and authentication');
    console.log('  - If socket issues, check network tab for websocket connections');
    console.log('  - Try refreshing with Ctrl+F5 to clear cache');
}

// Expose functions to console for manual use
if (typeof window !== 'undefined') {
    window.dispatchDebug = {
        runDiagnostics,
        checkDriverData,
        checkSocketConnection,
        checkDriverAPI,
        checkLocalStorage
    };

    console.log('📖 Usage: window.dispatchDebug.runDiagnostics()');
}

// Auto-run if loaded as a script
if (typeof module === 'undefined') {
    runDiagnostics();
}