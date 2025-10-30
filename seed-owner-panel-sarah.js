require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedOwnerPanelData() {
    try {
        console.log('🏢 Starting OWNER PANEL specific seeding for Sarah\'s Company (City Cabs)...');

        // First check connection
        await prisma.$connect();
        console.log('✅ Database connected successfully');

        // Get Sarah's company (City Cabs)
        const sarahCompany = await prisma.company.findFirst({
            where: {
                brandName: 'City Cabs'
            },
            include: {
                owner: true,
                subscriptionPlan: true
            }
        });

        if (!sarahCompany) {
            console.log('❌ City Cabs company not found. Please run the base seeder first.');
            return;
        }

        console.log(`✅ Found City Cabs (ID: ${sarahCompany.id})`);

        // Get vehicle types and service cities for reference
        const vehicleTypes = await prisma.vehicleTypeMaster.findMany();
        const serviceCities = await prisma.serviceCity.findMany();

        console.log('🚗 Creating vehicles for City Cabs...');

        // Create vehicles for Sarah's company
        const vehicles = [];
        const vehicleData = [
            {
                make: 'Toyota',
                model: 'Camry',
                year: 2022,
                color: 'Blue',
                licensePlate: 'CC-001',
                vehicleType: 'SEDAN'
            },
            {
                make: 'Honda',
                model: 'Accord',
                year: 2023,
                color: 'Silver',
                licensePlate: 'CC-002',
                vehicleType: 'SEDAN'
            },
            {
                make: 'Toyota',
                model: 'Highlander',
                year: 2022,
                color: 'Black',
                licensePlate: 'CC-003',
                vehicleType: 'SUV'
            },
            {
                make: 'Ford',
                model: 'Transit',
                year: 2023,
                color: 'White',
                licensePlate: 'CC-004',
                vehicleType: 'VAN'
            },
            {
                make: 'Tesla',
                model: 'Model 3',
                year: 2023,
                color: 'Red',
                licensePlate: 'CC-005',
                vehicleType: 'SEDAN'
            }
        ];

        for (const vehicleInfo of vehicleData) {
            // Check if vehicle already exists
            let vehicle = await prisma.vehicle.findUnique({
                where: { licensePlate: vehicleInfo.licensePlate }
            });

            if (!vehicle) {
                vehicle = await prisma.vehicle.create({
                    data: {
                        make: vehicleInfo.make,
                        model: vehicleInfo.model,
                        year: vehicleInfo.year,
                        color: vehicleInfo.color,
                        licensePlate: vehicleInfo.licensePlate,
                        companyId: sarahCompany.id,
                        vehicleType: vehicleInfo.vehicleType,
                        capacity: vehicleInfo.vehicleType === 'VAN' ? 8 : vehicleInfo.vehicleType === 'SUV' ? 6 : 4,
                        isActive: true,
                        isAvailable: true
                    }
                });
                console.log(`✅ Created vehicle: ${vehicleInfo.make} ${vehicleInfo.model} (${vehicleInfo.licensePlate})`);
            } else {
                console.log(`📋 Vehicle already exists: ${vehicleInfo.make} ${vehicleInfo.model} (${vehicleInfo.licensePlate})`);
            }

            vehicles.push(vehicle);
            console.log(`✅ Created vehicle: ${vehicleInfo.make} ${vehicleInfo.model} (${vehicleInfo.licensePlate})`);
        } console.log('👥 Enhancing drivers for City Cabs...');

        // Get existing drivers for City Cabs
        const existingDrivers = await prisma.companyDriver.findMany({
            where: { companyId: sarahCompany.id },
            include: { user: true }
        });

        // Assign vehicles to drivers and create detailed profiles
        for (let i = 0; i < existingDrivers.length && i < vehicles.length; i++) {
            const companyDriver = existingDrivers[i];
            const vehicle = vehicles[i];

            // Update driver with vehicle assignment
            await prisma.companyDriver.update({
                where: { id: companyDriver.id },
                data: {
                    status: 'ACTIVE'
                }
            });

            // Update vehicle with driver assignment
            await prisma.vehicle.update({
                where: { id: vehicle.id },
                data: {
                    driverId: companyDriver.userId
                }
            });

            console.log(`✅ Assigned ${vehicle.make} ${vehicle.model} to ${companyDriver.user.firstName} ${companyDriver.user.lastName}`);
        }

        console.log('🗺️ Creating enhanced zones for City Cabs...');

        // Create detailed zones for Sarah's company
        const zoneData = [
            {
                name: 'Downtown City',
                description: 'Central business district',
                coordinates: [
                    [40.7589, -73.9851],
                    [40.7614, -73.9776],
                    [40.7505, -73.9934],
                    [40.7489, -73.9857]
                ],
                isActive: true,
                priority: 1
            },
            {
                name: 'Airport Zone',
                description: 'Airport pickup and drop area',
                coordinates: [
                    [40.6892, -74.1745],
                    [40.6921, -74.1653],
                    [40.6769, -74.1602],
                    [40.6798, -74.1712]
                ],
                isActive: true,
                priority: 2
            },
            {
                name: 'Residential North',
                description: 'North residential area',
                coordinates: [
                    [40.7831, -73.9712],
                    [40.7856, -73.9587],
                    [40.7789, -73.9534],
                    [40.7765, -73.9671]
                ],
                isActive: true,
                priority: 3
            }
        ];

        const zones = [];
        for (const zoneInfo of zoneData) {
            const zone = await prisma.zone.create({
                data: {
                    name: zoneInfo.name,
                    description: zoneInfo.description,
                    boundaries: zoneInfo.coordinates, // Use coordinates as boundaries
                    isActive: zoneInfo.isActive,
                    companyId: sarahCompany.id,
                    type: 'SERVICE_AREA'
                }
            });

            zones.push(zone);
            console.log(`✅ Created zone: ${zoneInfo.name}`);
        }

        console.log('💰 Creating enhanced tariffs for City Cabs...');

        // Create detailed tariffs
        const tariffData = [
            {
                name: 'Standard City Rate',
                description: 'Regular city rides',
                baseFare: 3.50,
                perKmRate: 2.25,
                perMinuteRate: 0.45,
                minimumFare: 5.00,
                maximumFare: 100.00,
                surgeMultiplier: 1.0,
                isActive: true
            },
            {
                name: 'Airport Premium',
                description: 'Airport pickup/drop rates',
                baseFare: 5.00,
                perKmRate: 2.75,
                perMinuteRate: 0.55,
                minimumFare: 8.00,
                maximumFare: 150.00,
                surgeMultiplier: 1.2,
                isActive: true
            },
            {
                name: 'Night Rate',
                description: 'Night time rates (10PM - 6AM)',
                baseFare: 4.00,
                perKmRate: 2.50,
                perMinuteRate: 0.50,
                minimumFare: 6.00,
                maximumFare: 120.00,
                surgeMultiplier: 1.3,
                isActive: true
            }
        ];

        const tariffs = [];
        for (const tariffInfo of tariffData) {
            const tariff = await prisma.tariff.create({
                data: {
                    name: tariffInfo.name,
                    description: tariffInfo.description,
                    companyId: sarahCompany.id,
                    baseFare: tariffInfo.baseFare,
                    perKmRate: tariffInfo.perKmRate,
                    perMinuteRate: tariffInfo.perMinuteRate,
                    minimumFare: tariffInfo.minimumFare,
                    waitingFee: tariffInfo.waitingFee || 0,
                    airportFee: tariffInfo.airportFee || 0,
                    tollFee: tariffInfo.tollFee || 0,
                    extraStopFee: tariffInfo.extraStopFee || 0
                }
            });

            tariffs.push(tariff);
            console.log(`✅ Created tariff: ${tariffInfo.name}`);
        }

        console.log('🚖 Creating sample rides for City Cabs...');

        // Get passengers for creating rides
        const passengers = await prisma.user.findMany({
            where: { role: 'PASSENGER' },
            take: 3
        });

        // Create sample rides for analytics
        const rideData = [
            {
                status: 'COMPLETED',
                pickupAddress: '123 Main St, Downtown',
                dropoffAddress: '456 Oak Ave, Uptown',
                distance: 8.5,
                duration: 18,
                fare: 24.50,
                tip: 3.00,
                paymentMethod: 'CARD'
            },
            {
                status: 'COMPLETED',
                pickupAddress: 'City Airport Terminal 1',
                dropoffAddress: '789 Pine St, Downtown',
                distance: 12.3,
                duration: 25,
                fare: 35.75,
                tip: 5.00,
                paymentMethod: 'CARD'
            },
            {
                status: 'COMPLETED',
                pickupAddress: '321 Elm St, North Side',
                dropoffAddress: '654 Maple Dr, South Side',
                distance: 6.2,
                duration: 14,
                fare: 18.25,
                tip: 2.50,
                paymentMethod: 'CASH'
            },
            {
                status: 'IN_PROGRESS',
                pickupAddress: '555 Broadway, Theater District',
                dropoffAddress: '888 Park Ave, Upper East',
                distance: 4.1,
                duration: 12,
                fare: 15.00,
                tip: 0.00,
                paymentMethod: 'CARD'
            },
            {
                status: 'REQUESTED',
                pickupAddress: '999 5th Ave, Shopping District',
                dropoffAddress: '111 Central Park West',
                distance: 2.8,
                duration: 8,
                fare: 12.50,
                tip: 0.00,
                paymentMethod: 'CARD'
            }
        ];

        for (let i = 0; i < rideData.length; i++) {
            const rideInfo = rideData[i];
            const driver = existingDrivers[i % existingDrivers.length];
            const passenger = passengers[i % passengers.length];
            const tariff = tariffs[0]; // Use standard tariff

            const ride = await prisma.ride.create({
                data: {
                    rideId: `RIDE-${Date.now()}-${i}`,
                    companyId: sarahCompany.id,
                    driverId: driver.userId,
                    passengerId: passenger.id,
                    tariffId: tariff.id,
                    status: rideInfo.status,
                    pickup: {
                        latitude: 40.7128 + (Math.random() - 0.5) * 0.1,
                        longitude: -74.0060 + (Math.random() - 0.5) * 0.1,
                        address: rideInfo.pickupAddress
                    },
                    destination: {
                        latitude: 40.7128 + (Math.random() - 0.5) * 0.1,
                        longitude: -74.0060 + (Math.random() - 0.5) * 0.1,
                        address: rideInfo.dropoffAddress
                    },
                    estimatedDistance: rideInfo.distance,
                    actualDistance: rideInfo.distance,
                    estimatedDuration: rideInfo.duration,
                    actualDuration: rideInfo.duration,
                    estimatedFare: rideInfo.fare,
                    actualFare: rideInfo.fare,
                    paymentMethod: rideInfo.paymentMethod,
                    paymentStatus: 'COMPLETED',
                    requestedAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
                    acceptedAt: rideInfo.status !== 'REQUESTED' ? new Date(Date.now() - Math.random() * 23 * 60 * 60 * 1000) : null,
                    pickedUpAt: rideInfo.status === 'COMPLETED' || rideInfo.status === 'IN_PROGRESS' ? new Date(Date.now() - Math.random() * 22 * 60 * 60 * 1000) : null,
                    completedAt: rideInfo.status === 'COMPLETED' ? new Date(Date.now() - Math.random() * 21 * 60 * 60 * 1000) : null
                }
            });

            console.log(`✅ Created ride: ${rideInfo.pickupAddress} → ${rideInfo.dropoffAddress} (${rideInfo.status})`);
        }

        console.log('📊 Creating analytics data for City Cabs...');

        // Create company-specific analytics configuration
        await prisma.companyConfiguration.create({
            data: {
                companyId: sarahCompany.id,
                key: 'ANALYTICS_CONFIG',
                category: 'ANALYTICS',
                displayName: 'Analytics Configuration',
                description: 'Analytics dashboard configuration',
                dataType: 'JSON',
                value: {
                    dashboardWidgets: [
                        { id: 'total_rides_today', enabled: true, position: 1 },
                        { id: 'active_drivers', enabled: true, position: 2 },
                        { id: 'revenue_today', enabled: true, position: 3 },
                        { id: 'average_rating', enabled: true, position: 4 },
                        { id: 'ride_completion_rate', enabled: true, position: 5 },
                        { id: 'driver_earnings', enabled: true, position: 6 }
                    ],
                    kpiTargets: {
                        dailyRides: 50,
                        monthlyRevenue: 25000,
                        driverUtilization: 75,
                        customerSatisfaction: 4.5
                    },
                    reportFrequency: {
                        daily: true,
                        weekly: true,
                        monthly: true
                    }
                },
                isActive: true
            }
        });

        // Create operational preferences
        await prisma.companyConfiguration.create({
            data: {
                companyId: sarahCompany.id,
                key: 'OPERATIONAL_SETTINGS',
                category: 'OPERATIONS',
                displayName: 'Operational Settings',
                description: 'Day-to-day operational preferences',
                dataType: 'JSON',
                value: {
                    autoDispatch: {
                        enabled: true,
                        radius: 5.0,
                        timeout: 30
                    },
                    driverManagement: {
                        maxShiftHours: 12,
                        breakRequired: true,
                        breakDuration: 30,
                        locationUpdateInterval: 30
                    },
                    rideManagement: {
                        allowScheduledRides: true,
                        advanceBookingHours: 24,
                        cancellationWindow: 5,
                        waitingTimeLimit: 10
                    },
                    paymentSettings: {
                        acceptCash: true,
                        acceptCard: true,
                        acceptDigitalWallet: true,
                        autoInvoicing: true,
                        commissionRate: 15
                    }
                },
                isActive: true
            }
        });

        // Get final counts for City Cabs
        const finalCounts = {
            vehicles: await prisma.vehicle.count({ where: { companyId: sarahCompany.id } }),
            drivers: await prisma.companyDriver.count({ where: { companyId: sarahCompany.id } }),
            zones: await prisma.companyZone.count({ where: { companyId: sarahCompany.id } }),
            tariffs: await prisma.companyTariff.count({ where: { companyId: sarahCompany.id } }),
            rides: await prisma.ride.count({ where: { companyId: sarahCompany.id } }),
            configurations: await prisma.companyConfiguration.count({ where: { companyId: sarahCompany.id } })
        };

        console.log('\n🎉 OWNER PANEL seeding completed successfully for City Cabs!');
        console.log(`📊 City Cabs Data Summary:`);
        console.log(`   Vehicles: ${finalCounts.vehicles}`);
        console.log(`   Drivers: ${finalCounts.drivers}`);
        console.log(`   Zones: ${finalCounts.zones}`);
        console.log(`   Tariffs: ${finalCounts.tariffs}`);
        console.log(`   Rides: ${finalCounts.rides}`);
        console.log(`   Configurations: ${finalCounts.configurations}`);

        console.log('\n🚖 City Cabs Fleet:');
        console.log('✅ 5 Vehicles (Toyota Camry, Honda Accord, Toyota Highlander, Ford Transit, Tesla Model 3)');
        console.log('✅ 3 Zones (Downtown, Airport, Residential North)');
        console.log('✅ 3 Tariffs (Standard, Airport Premium, Night Rate)');
        console.log('✅ 5 Sample Rides (Various statuses for testing)');
        console.log('✅ Analytics & Operational Configurations');

        console.log('\n🔑 Owner Login Credentials:');
        console.log('Sarah Johnson (City Cabs Owner): sarah@citycabs.com / owner123');
        console.log('Owner Panel URL: http://localhost:3005');

        console.log('\n🚀 City Cabs is ready for comprehensive owner panel testing!');

    } catch (error) {
        console.error('❌ Error seeding owner panel data:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

seedOwnerPanelData();