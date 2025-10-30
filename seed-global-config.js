const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const globalConfigurations = [
    // Vehicle Types Configuration
    {
        key: 'vehicleTypes',
        category: 'business',
        displayName: 'Vehicle Types',
        description: 'Available vehicle types for ride booking',
        dataType: 'json',
        value: [
            {
                id: 'economy',
                name: 'Economy',
                description: 'Budget-friendly rides',
                capacity: 4,
                baseMultiplier: 1.0,
                icon: 'car',
                features: ['Standard seating', 'Basic amenities']
            },
            {
                id: 'standard',
                name: 'Standard',
                description: 'Comfortable rides for everyday travel',
                capacity: 4,
                baseMultiplier: 1.2,
                icon: 'car-sedan',
                features: ['Comfortable seating', 'Air conditioning', 'Phone charger']
            },
            {
                id: 'premium',
                name: 'Premium',
                description: 'Higher-end vehicles with extra comfort',
                capacity: 4,
                baseMultiplier: 1.5,
                icon: 'car-luxury',
                features: ['Leather seats', 'Premium sound system', 'Bottled water']
            },
            {
                id: 'suv',
                name: 'SUV',
                description: 'Spacious vehicles for groups',
                capacity: 6,
                baseMultiplier: 1.8,
                icon: 'car-suv',
                features: ['Extra space', 'Higher seating', 'Luggage capacity']
            },
            {
                id: 'luxury',
                name: 'Luxury',
                description: 'Premium experience with high-end vehicles',
                capacity: 4,
                baseMultiplier: 2.5,
                icon: 'car-luxury',
                features: ['Luxury vehicle', 'Professional driver', 'Concierge service']
            }
        ]
    },

    // Payment Methods Configuration
    {
        key: 'paymentMethods',
        category: 'business',
        displayName: 'Payment Methods',
        description: 'Available payment options for customers',
        dataType: 'json',
        value: [
            {
                id: 'cash',
                name: 'Cash',
                description: 'Pay with cash to the driver',
                icon: 'cash',
                isEnabled: true,
                processingFee: 0,
                acceptedCurrencies: ['USD', 'EUR', 'GBP']
            },
            {
                id: 'credit_card',
                name: 'Credit Card',
                description: 'Pay with credit/debit card',
                icon: 'credit-card',
                isEnabled: true,
                processingFee: 2.9,
                supportedCards: ['visa', 'mastercard', 'amex']
            },
            {
                id: 'digital_wallet',
                name: 'Digital Wallet',
                description: 'Pay with app wallet balance',
                icon: 'wallet',
                isEnabled: true,
                processingFee: 0,
                minBalance: 5.00
            },
            {
                id: 'paypal',
                name: 'PayPal',
                description: 'Pay with your PayPal account',
                icon: 'paypal',
                isEnabled: false,
                processingFee: 3.4
            },
            {
                id: 'apple_pay',
                name: 'Apple Pay',
                description: 'Pay with Apple Pay',
                icon: 'apple-pay',
                isEnabled: true,
                processingFee: 2.9,
                platforms: ['ios']
            },
            {
                id: 'google_pay',
                name: 'Google Pay',
                description: 'Pay with Google Pay',
                icon: 'google-pay',
                isEnabled: true,
                processingFee: 2.9,
                platforms: ['android']
            }
        ]
    },

    // Ride Status Configuration
    {
        key: 'rideStatuses',
        category: 'system',
        displayName: 'Ride Status Options',
        description: 'Available ride status values and their properties',
        dataType: 'json',
        value: [
            {
                id: 'requested',
                name: 'Ride Requested',
                description: 'Customer has requested a ride',
                color: '#FFA500',
                canCancel: true,
                nextStatuses: ['assigned', 'cancelled']
            },
            {
                id: 'assigned',
                name: 'Driver Assigned',
                description: 'A driver has been assigned to the ride',
                color: '#1E90FF',
                canCancel: true,
                nextStatuses: ['accepted', 'cancelled']
            },
            {
                id: 'accepted',
                name: 'Driver Accepted',
                description: 'Driver has accepted the ride',
                color: '#32CD32',
                canCancel: true,
                nextStatuses: ['arrived', 'cancelled']
            },
            {
                id: 'arrived',
                name: 'Driver Arrived',
                description: 'Driver has arrived at pickup location',
                color: '#FF6347',
                canCancel: true,
                nextStatuses: ['picked_up', 'cancelled']
            },
            {
                id: 'picked_up',
                name: 'Passenger Picked Up',
                description: 'Passenger is in the vehicle',
                color: '#9370DB',
                canCancel: false,
                nextStatuses: ['in_progress']
            },
            {
                id: 'in_progress',
                name: 'Ride In Progress',
                description: 'Ride is currently active',
                color: '#FF1493',
                canCancel: false,
                nextStatuses: ['completed']
            },
            {
                id: 'completed',
                name: 'Ride Completed',
                description: 'Ride has been completed successfully',
                color: '#008000',
                canCancel: false,
                nextStatuses: []
            },
            {
                id: 'cancelled',
                name: 'Ride Cancelled',
                description: 'Ride was cancelled',
                color: '#DC143C',
                canCancel: false,
                nextStatuses: []
            }
        ]
    },

    // Operational Settings
    {
        key: 'operationalSettings',
        category: 'business',
        displayName: 'Operational Settings',
        description: 'General operational parameters',
        dataType: 'json',
        value: {
            maxWaitTime: 300, // 5 minutes in seconds
            driverSearchRadius: 10, // kilometers
            maxOfferAttempts: 3,
            offerTimeoutSeconds: 30,
            cancellationGracePeriod: 120, // 2 minutes
            ratingScale: {
                min: 1,
                max: 5,
                step: 1
            },
            supportedLanguages: ['en', 'es', 'fr', 'de'],
            defaultCurrency: 'USD',
            distanceUnit: 'km', // or 'miles'
            timeFormat: '24h' // or '12h'
        }
    },

    // Pricing Configuration
    {
        key: 'pricingConfig',
        category: 'business',
        displayName: 'Pricing Configuration',
        description: 'Default pricing parameters and rules',
        dataType: 'json',
        value: {
            surgePricing: {
                enabled: true,
                maxMultiplier: 3.0,
                minMultiplier: 1.0,
                triggerThreshold: 0.8 // 80% of drivers busy
            },
            dynamicPricing: {
                enabled: false,
                factorsConsidered: ['demand', 'weather', 'time', 'events']
            },
            discounts: {
                firstRideDiscount: 0.2, // 20%
                loyaltyDiscounts: [
                    { ridesRequired: 10, discount: 0.05 },
                    { ridesRequired: 50, discount: 0.1 },
                    { ridesRequired: 100, discount: 0.15 }
                ]
            },
            fees: {
                bookingFee: 1.50,
                cancellationFee: 3.00,
                airportFee: 5.00,
                tollPassthrough: true
            }
        }
    },

    // Driver App Settings
    {
        key: 'driverAppSettings',
        category: 'ui',
        displayName: 'Driver App Configuration',
        description: 'Driver mobile app behavior settings',
        dataType: 'json',
        value: {
            locationUpdateInterval: 10, // seconds
            backgroundLocationEnabled: true,
            offerSoundEnabled: true,
            autoAcceptEnabled: false,
            shiftReminderEnabled: true,
            navigationProvider: 'google', // google, apple, waze
            mapTheme: 'standard',
            batteryOptimization: true,
            offlineMode: {
                enabled: true,
                syncInterval: 60 // seconds
            }
        }
    },

    // Passenger App Settings
    {
        key: 'passengerAppSettings',
        category: 'ui',
        displayName: 'Passenger App Configuration',
        description: 'Passenger mobile app behavior settings',
        dataType: 'json',
        value: {
            saveLocationsEnabled: true,
            pushNotificationsEnabled: true,
            locationSharingEnabled: true,
            fareEstimateEnabled: true,
            tipSuggestions: [0.15, 0.18, 0.20, 0.25],
            mapProvider: 'google',
            defaultMapZoom: 15,
            showDriverPhoto: true,
            showVehicleDetails: true,
            emergencyFeatures: {
                panicButton: true,
                shareRideEnabled: true,
                emergencyContacts: true
            }
        }
    },

    // Admin Dashboard Settings
    {
        key: 'adminDashboardSettings',
        category: 'ui',
        displayName: 'Admin Dashboard Configuration',
        description: 'Admin dashboard display and behavior settings',
        dataType: 'json',
        value: {
            defaultDashboardView: 'overview',
            refreshInterval: 30, // seconds
            realtimeUpdatesEnabled: true,
            exportFormats: ['csv', 'xlsx', 'pdf'],
            mapSettings: {
                defaultZoom: 12,
                clusterMarkers: true,
                showHeatmap: false
            },
            notifications: {
                newRideAlerts: true,
                driverOfflineAlerts: true,
                emergencyAlerts: true,
                systemAlerts: true
            },
            reports: {
                autoGenerate: false,
                emailDelivery: true,
                retentionDays: 90
            }
        }
    },

    // Integration Settings
    {
        key: 'integrationSettings',
        category: 'integration',
        displayName: 'Third-party Integration Settings',
        description: 'Configuration for external service integrations',
        dataType: 'json',
        value: {
            maps: {
                primary: 'google',
                apiKeys: {
                    google: '', // To be set by company
                    mapbox: '',
                    apple: ''
                }
            },
            payment: {
                providers: ['stripe', 'paypal', 'square'],
                webhookRetries: 3,
                timeoutSeconds: 30
            },
            sms: {
                provider: 'twilio',
                senderIds: [],
                templates: {
                    rideConfirmation: 'Your ride is confirmed. Driver: {driverName}, ETA: {eta}',
                    driverArrived: 'Your driver has arrived at the pickup location.',
                    rideCompleted: 'Thank you for riding with us! Rate your experience.'
                }
            },
            email: {
                provider: 'sendgrid',
                templates: {
                    welcome: 'welcome-template',
                    receipt: 'receipt-template',
                    support: 'support-template'
                }
            }
        }
    },

    // Safety & Security Settings
    {
        key: 'safetySettings',
        category: 'system',
        displayName: 'Safety & Security Configuration',
        description: 'Safety features and security settings',
        dataType: 'json',
        value: {
            driverBackground: {
                required: true,
                recheckInterval: 365, // days
                acceptedSources: ['local_police', 'national_database']
            },
            vehicleInspection: {
                required: true,
                intervalMonths: 6,
                requiredDocuments: ['registration', 'insurance', 'inspection']
            },
            rideMonitoring: {
                enabled: true,
                panicButtonEnabled: true,
                automaticDetection: true,
                responseTeam247: false
            },
            dataProtection: {
                dataRetentionDays: 2555, // 7 years
                anonymizeAfterDays: 90,
                encryptSensitiveData: true
            }
        }
    }
];

async function seedGlobalConfigurations() {
    console.log('🌱 Seeding global configurations...');

    try {
        for (const config of globalConfigurations) {
            const existing = await prisma.globalConfiguration.findUnique({
                where: { key: config.key }
            });

            if (existing) {
                console.log(`⏭️ Global config '${config.key}' already exists, skipping...`);
                continue;
            }

            await prisma.globalConfiguration.create({
                data: config
            });

            console.log(`✅ Created global config: ${config.displayName}`);
        }

        console.log('🎉 Global configurations seeded successfully!');
    } catch (error) {
        console.error('❌ Error seeding global configurations:', error);
    }
}

async function main() {
    await seedGlobalConfigurations();
}

if (require.main === module) {
    main()
        .catch(console.error)
        .finally(() => prisma.$disconnect());
}

module.exports = { seedGlobalConfigurations };