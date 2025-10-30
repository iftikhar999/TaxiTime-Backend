require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedWithMasterData() {
    try {
        console.log('🌱 Starting ENHANCED database seeding with master data...');

        // First check connection
        await prisma.$connect();
        console.log('✅ Database connected successfully');

        // Create super admin if doesn't exist
        console.log('👑 Creating Super Admin...');
        const existingAdmin = await prisma.user.findFirst({
            where: { role: 'SUPER_ADMIN' }
        });

        if (!existingAdmin) {
            const adminPassword = await bcrypt.hash('admin123', 10);
            await prisma.user.create({
                data: {
                    firstName: 'Super',
                    lastName: 'Admin',
                    email: 'admin@abtaxi.com',
                    phone: '+1234567890',
                    password: adminPassword,
                    role: 'SUPER_ADMIN',
                    isActive: true,
                    isVerified: true
                }
            });
            console.log('✅ Super Admin created');
        } else {
            console.log('✅ Super Admin already exists');
        }

        // Enhanced billing data for existing companies
        console.log('💰 Creating billing records...');
        const companies = await prisma.company.findMany({
            include: { subscriptionPlan: true }
        });

        for (const company of companies) {
            // Check if billing record exists
            const existingBilling = await prisma.billingRecord.findFirst({
                where: { companyId: company.id }
            });

            if (!existingBilling && company.subscriptionPlan) {
                const billingRecord = await prisma.billingRecord.create({
                    data: {
                        companyId: company.id,
                        subscriptionPlanId: company.subscriptionPlanId,
                        billingPeriodStart: new Date(),
                        billingPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        basePlanCost: company.subscriptionPlan.price,
                        vehicleCost: 0.0,
                        commissionAmount: 0.0,
                        setupFee: company.subscriptionPlan.setupFee || 0.0,
                        totalAmount: company.subscriptionPlan.price + (company.subscriptionPlan.setupFee || 0.0),
                        status: 'PAID',
                        paidAt: new Date()
                    }
                });

                // Create invoice linked to billing record
                await prisma.invoice.create({
                    data: {
                        companyId: company.id,
                        billingRecordId: billingRecord.id,
                        invoiceNumber: `INV-${company.companyCode}-${Date.now()}`,
                        issueDate: new Date(),
                        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        subtotal: company.subscriptionPlan.price,
                        taxAmount: company.subscriptionPlan.price * 0.08, // 8% tax
                        totalAmount: company.subscriptionPlan.price * 1.08,
                        status: 'PAID',
                        paidAt: new Date(),
                        lineItems: [
                            {
                                description: `${company.subscriptionPlan.name} Plan`,
                                quantity: 1,
                                unitPrice: company.subscriptionPlan.price,
                                totalPrice: company.subscriptionPlan.price
                            }
                        ]
                    }
                });

                console.log(`✅ Created billing records for ${company.brandName}`);
            }
        }

        // Enhanced company settings
        console.log('⚙️ Creating company settings...');
        for (const company of companies) {
            const existingSettings = await prisma.companySettings.findFirst({
                where: { companyId: company.id }
            });

            if (!existingSettings) {
                await prisma.companySettings.create({
                    data: {
                        companyId: company.id,
                        timezone: 'UTC',
                        defaultCurrency: 'USD',
                        defaultLanguage: 'en',
                        mapProvider: 'OPENSTREETMAP',
                        placeApiProvider: 'OPENSTREETMAP'
                    }
                });

                console.log(`✅ Created settings for ${company.brandName}`);
            }
        }

        // Enhanced company configurations
        console.log('🔧 Creating company configurations...');
        for (const company of companies) {
            const existingConfig = await prisma.companyConfiguration.findFirst({
                where: { companyId: company.id }
            });

            if (!existingConfig) {
                await prisma.companyConfiguration.create({
                    data: {
                        companyId: company.id,
                        key: 'BUSINESS_SETTINGS',
                        category: 'BUSINESS',
                        displayName: 'Business Configuration',
                        description: 'Company business hours and operational settings',
                        dataType: 'JSON',
                        value: {
                            businessHours: {
                                monday: { open: '06:00', close: '23:00', isActive: true },
                                tuesday: { open: '06:00', close: '23:00', isActive: true },
                                wednesday: { open: '06:00', close: '23:00', isActive: true },
                                thursday: { open: '06:00', close: '23:00', isActive: true },
                                friday: { open: '06:00', close: '23:00', isActive: true },
                                saturday: { open: '07:00', close: '22:00', isActive: true },
                                sunday: { open: '08:00', close: '20:00', isActive: true }
                            },
                            dispatchSettings: {
                                autoAssignEnabled: true,
                                maxAssignDistance: 5,
                                assignmentTimeout: 30,
                                maxParallelOffers: 3,
                                priorityMode: 'NEAREST_DRIVER'
                            },
                            paymentSettings: {
                                acceptCash: true,
                                acceptCard: true,
                                acceptWallet: true,
                                tipEnabled: true,
                                defaultTipPercentage: 15,
                                allowNegativeBalance: false,
                                autoRecharge: true
                            },
                            notifications: {
                                emailEnabled: true,
                                smsEnabled: true,
                                pushEnabled: true,
                                emailTemplates: {
                                    welcome: 'standard',
                                    booking: 'detailed',
                                    completion: 'receipt'
                                }
                            },
                            features: {
                                enableScheduledRides: true,
                                enableRideSharing: false,
                                enableDelivery: false,
                                enableCorporateAccounts: true,
                                enableLoyaltyProgram: true
                            }
                        },
                        isActive: true
                    }
                });

                console.log(`✅ Created configuration for ${company.brandName}`);
            }
        }

        // Sample payment data
        console.log('💳 Creating sample payment data...');
        const passengers = await prisma.user.findMany({
            where: { role: 'PASSENGER' },
            take: 3
        });

        for (const passenger of passengers) {
            // Create wallet transactions
            await prisma.walletTransaction.create({
                data: {
                    userId: passenger.id,
                    type: 'CREDIT',
                    amount: 50.00,
                    description: 'Welcome bonus',
                    currency: 'USD',
                    balanceBefore: 0.00,
                    balanceAfter: 50.00
                }
            });

            await prisma.walletTransaction.create({
                data: {
                    userId: passenger.id,
                    type: 'DEBIT',
                    amount: 12.50,
                    description: 'Ride payment',
                    currency: 'USD',
                    balanceBefore: 50.00,
                    balanceAfter: 37.50
                }
            });

            console.log(`✅ Created wallet transactions for ${passenger.firstName}`);
        }

        // Global configuration for system settings
        console.log('🌐 Creating global configuration...');
        const existingGlobalConfig = await prisma.globalConfiguration.findFirst({
            where: { key: 'SYSTEM_SETTINGS' }
        });

        if (!existingGlobalConfig) {
            await prisma.globalConfiguration.create({
                data: {
                    key: 'SYSTEM_SETTINGS',
                    category: 'SYSTEM',
                    displayName: 'System Configuration',
                    description: 'Global system configuration and feature flags',
                    dataType: 'JSON',
                    value: {
                        systemName: 'A&B Taxi Management System',
                        version: '1.0.0',
                        defaultCurrency: 'USD',
                        defaultTimezone: 'UTC',
                        maintenanceMode: false,
                        allowNewRegistrations: true,
                        maxCompaniesPerPlan: {
                            basic: 1,
                            professional: 5,
                            enterprise: -1
                        },
                        systemLimits: {
                            maxDriversPerCompany: 1000,
                            maxVehiclesPerCompany: 500,
                            maxZonesPerCompany: 50,
                            maxTariffsPerCompany: 20
                        },
                        featureFlags: {
                            enableRealtimeTracking: true,
                            enableAdvancedReports: true,
                            enableWalletSystem: true,
                            enableMultiLanguage: false,
                            enableApiAccess: true,
                            enableWebhooks: true
                        },
                        emailSettings: {
                            provider: 'sendgrid',
                            fromEmail: 'noreply@abtaxi.com',
                            fromName: 'A&B Taxi',
                            templatesEnabled: true
                        },
                        smsSettings: {
                            provider: 'twilio',
                            enabled: true,
                            internationalEnabled: false
                        },
                        backupSettings: {
                            enabled: true,
                            frequency: 'daily',
                            retention: 30,
                            cloudProvider: 'aws'
                        }
                    },
                    isActive: true
                }
            }); console.log('✅ Created global configuration');
        }        // Sample reports data structure
        console.log('📊 Creating sample reports metadata...');
        for (const company of companies) {
            // Create a sample report configuration
            await prisma.companyConfiguration.create({
                data: {
                    companyId: company.id,
                    key: 'REPORTS_CONFIG',
                    category: 'REPORTS',
                    displayName: 'Reports Configuration',
                    description: 'Available reports and dashboard widgets',
                    dataType: 'JSON',
                    value: {
                        availableReports: [
                            {
                                id: 'daily_summary',
                                name: 'Daily Summary',
                                description: 'Daily operations summary',
                                frequency: 'daily',
                                enabled: true,
                                recipients: [company.primaryContactEmail]
                            },
                            {
                                id: 'weekly_performance',
                                name: 'Weekly Performance',
                                description: 'Weekly performance metrics',
                                frequency: 'weekly',
                                enabled: true,
                                recipients: [company.primaryContactEmail]
                            },
                            {
                                id: 'monthly_financial',
                                name: 'Monthly Financial',
                                description: 'Monthly financial summary',
                                frequency: 'monthly',
                                enabled: true,
                                recipients: [company.primaryContactEmail]
                            }
                        ],
                        customReports: [
                            {
                                id: 'driver_performance',
                                name: 'Driver Performance Analysis',
                                query: 'SELECT * FROM rides WHERE company_id = ?',
                                enabled: true,
                                accessLevel: 'MANAGER'
                            }
                        ],
                        dashboardWidgets: [
                            { id: 'active_rides', enabled: true, position: 1 },
                            { id: 'revenue_today', enabled: true, position: 2 },
                            { id: 'driver_count', enabled: true, position: 3 },
                            { id: 'customer_count', enabled: true, position: 4 }
                        ]
                    },
                    isActive: true
                }
            });

            console.log(`✅ Created reports configuration for ${company.brandName}`);
        }

        // Get final enhanced counts
        const finalCounts = {
            users: await prisma.user.count(),
            companies: await prisma.company.count(),
            drivers: await prisma.companyDriver.count(),
            passengers: await prisma.user.count({ where: { role: 'PASSENGER' } }),
            vehicles: await prisma.vehicle.count(),
            zones: await prisma.zone.count(),
            tariffs: await prisma.tariff.count(),
            subscriptionPlans: await prisma.subscriptionPlan.count(),
            billingRecords: await prisma.billingRecord.count(),
            invoices: await prisma.invoice.count(),
            walletTransactions: await prisma.walletTransaction.count(),
            companySettings: await prisma.companySettings.count(),
            companyConfigurations: await prisma.companyConfiguration.count(),
            globalConfigurations: await prisma.globalConfiguration.count()
        };

        console.log('\n🎉 ENHANCED Database seeding completed successfully!');
        console.log(`📊 Final counts:`);
        console.log(`   Users: ${finalCounts.users}`);
        console.log(`   Companies: ${finalCounts.companies}`);
        console.log(`   Drivers: ${finalCounts.drivers}`);
        console.log(`   Passengers: ${finalCounts.passengers}`);
        console.log(`   Vehicles: ${finalCounts.vehicles}`);
        console.log(`   Zones: ${finalCounts.zones}`);
        console.log(`   Tariffs: ${finalCounts.tariffs}`);
        console.log(`   Subscription Plans: ${finalCounts.subscriptionPlans}`);
        console.log(`\n💼 Business Data:`);
        console.log(`   Billing Records: ${finalCounts.billingRecords}`);
        console.log(`   Invoices: ${finalCounts.invoices}`);
        console.log(`   Wallet Transactions: ${finalCounts.walletTransactions}`);
        console.log(`\n⚙️ Configuration Data:`);
        console.log(`   Company Settings: ${finalCounts.companySettings}`);
        console.log(`   Company Configurations: ${finalCounts.companyConfigurations}`);
        console.log(`   Global Configurations: ${finalCounts.globalConfigurations}`);

        console.log('\n💡 Enhanced features added:');
        console.log('✅ Super Admin user with full access');
        console.log('✅ Comprehensive billing records and invoices');
        console.log('✅ Company-specific settings and configurations');
        console.log('✅ Wallet system with sample transactions');
        console.log('✅ Global system configuration');
        console.log('✅ Reports configuration and metadata');
        console.log('✅ Business hours and operational settings');
        console.log('✅ Payment and notification preferences');
        console.log('✅ Feature flags and system limits');
        console.log('✅ Ready for full production deployment');

        console.log('\n🔑 Updated login credentials:');
        console.log('Super Admin: admin@abtaxi.com / admin123');
        console.log('Company Owners: [owner-email] / owner123');
        console.log('Drivers: [driver-email] / driver123');
        console.log('Dispatchers: [dispatcher-email] / dispatch123');
        console.log('Passengers: [passenger-email] / passenger123');

    } catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

seedWithMasterData();