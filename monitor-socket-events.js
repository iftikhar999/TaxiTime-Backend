#!/usr/bin/env node

/**
 * Socket Event Monitoring Script
 * Run this to see what socket events are being emitted by the backend
 */

const io = require('socket.io-client');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

console.log('🔌 Connecting to backend socket:', BACKEND_URL);
console.log('📡 Monitoring dispatch namespace events...\n');

// Connect to dispatch namespace
const dispatchSocket = io(`${BACKEND_URL}/dispatch`, {
    transports: ['websocket'],
    reconnection: true
});

dispatchSocket.on('connect', () => {
    console.log('✅ Connected to dispatch namespace');
    console.log('Socket ID:', dispatchSocket.id);

    // Authenticate (you'll need a real userId and companyId)
    dispatchSocket.emit('authenticate', {
        userId: 'test-user',
        companyId: 'test-company'
    });

    // Join company room
    dispatchSocket.emit('joinCompany', 'test-company');

    console.log('\n📊 Listening for events...\n');
});

dispatchSocket.on('disconnect', () => {
    console.log('❌ Disconnected from dispatch namespace');
});

dispatchSocket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error.message);
});

// Listen for ALL possible events
const events = [
    'driverOnline',
    'driverOffline',
    'driverLocationUpdate',
    'driver:status:update',
    'driver:status:updated',
    'driver:zone:changed',
    'zone_queue_updated',
    'meter:started',
    'meter:update',
    'meter:stopped',
    'meter:telemetry',
    'job_completed',
    'job:completed',
    'ride_created',
    'ride_updated',
    'payment:collected',
    'all:online:drivers',
    'online:drivers:list'
];

events.forEach(eventName => {
    dispatchSocket.on(eventName, (data) => {
        console.log(`\n🔔 Event: ${eventName}`);
        console.log('   Time:', new Date().toISOString());
        console.log('   Data:', JSON.stringify(data, null, 2));
        console.log('---');
    });
});

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('\n\n👋 Closing connection...');
    dispatchSocket.close();
    process.exit(0);
});

console.log('💡 Press Ctrl+C to stop monitoring\n');
console.log('🧪 Test by:');
console.log('   1. Starting a driver shift from mobile app');
console.log('   2. Changing driver status');
console.log('   3. Moving driver location');
console.log('   4. Completing a ride\n');
