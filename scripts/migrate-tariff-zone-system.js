/**
 * Data Migration Script: Tariff-Zone System Redesign
 * 
 * This script migrates existing data from the old structure to the new one:
 * 1. Migrates Zone.tariffId → ZoneTariff junction records
 * 2. Creates default CompanySettings for all companies
 * 3. Validates the migration
 * 
 * Run this AFTER applying the Prisma migration
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateData() {
    console.log('🚀 Starting data migration for Tariff-Zone system redesign...\n');

    try {
        // Step 1: Migrate Zone.tariffId → ZoneTariff
        console.log('📋 Step 1: Migrating Zone → Tariff relationships...');

        const zones = await prisma.zone.findMany({
            where: {
                tariffId: {
                    not: null
                }
            },
            select: {
                id: true,
                tariffId: true,
                name: true
            }
        });

        console.log(`   Found ${zones.length} zones with tariff assignments`);

        let zoneTariffsCreated = 0;
        for (const zone of zones) {
            if (!zone.tariffId) continue;

            try {
                await prisma.zoneTariff.create({
                    data: {
                        zoneId: zone.id,
                        tariffId: zone.tariffId,
                        isDefault: true, // Mark as default since it was the only one
                        priority: 1
                    }
                });
                zoneTariffsCreated++;
                console.log(`   ✅ Migrated zone "${zone.name}" → tariff link`);
            } catch (error) {
                if (error.code === 'P2002') {
                    console.log(`   ⚠️  Zone "${zone.name}" already has this tariff link (skipping)`);
                } else {
                    console.error(`   ❌ Error migrating zone "${zone.name}":`, error.message);
                }
            }
        }

        console.log(`   📊 Created ${zoneTariffsCreated} ZoneTariff records\n`);

        // Step 2: Create default CompanySettings
        console.log('📋 Step 2: Creating default CompanySettings...');

        const companies = await prisma.company.findMany({
            select: {
                id: true,
                brandName: true,
                legalName: true,
                name: true
            }
        });

        console.log(`   Found ${companies.length} companies`);

        let settingsCreated = 0;
        for (const company of companies) {
            const companyName = company.brandName || company.legalName || company.name || company.id;

            try {
                // Check if settings already exist
                const existing = await prisma.companySettings.findUnique({
                    where: { companyId: company.id }
                });

                if (existing) {
                    console.log(`   ⚠️  Settings for "${companyName}" already exist (skipping)`);
                    continue;
                }

                await prisma.companySettings.create({
                    data: {
                        companyId: company.id,
                        mapProvider: 'OPENSTREETMAP',
                        placeApiProvider: 'OPENSTREETMAP',
                        defaultLanguage: 'en',
                        defaultCurrency: 'USD',
                        timezone: 'UTC'
                    }
                });
                settingsCreated++;
                console.log(`   ✅ Created settings for "${companyName}"`);
            } catch (error) {
                if (error.code === 'P2002') {
                    console.log(`   ⚠️  Settings for "${companyName}" already exist (skipping)`);
                } else {
                    console.error(`   ❌ Error creating settings for "${companyName}":`, error.message);
                }
            }
        }

        console.log(`   📊 Created ${settingsCreated} CompanySettings records\n`);

        // Step 3: Validation
        console.log('📋 Step 3: Validating migration...');

        const zoneTariffCount = await prisma.zoneTariff.count();
        const companySettingsCount = await prisma.companySettings.count();
        const companiesCount = await prisma.company.count();

        console.log(`   ✅ ZoneTariff records: ${zoneTariffCount}`);
        console.log(`   ✅ CompanySettings records: ${companySettingsCount}`);
        console.log(`   ✅ Companies: ${companiesCount}`);

        if (companySettingsCount === companiesCount) {
            console.log(`   ✅ All companies have settings!\n`);
        } else {
            console.log(`   ⚠️  ${companiesCount - companySettingsCount} companies missing settings\n`);
        }

        // Summary
        console.log('═══════════════════════════════════════════════════════');
        console.log('✅ MIGRATION COMPLETED SUCCESSFULLY!');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`Zone-Tariff links created: ${zoneTariffsCreated}`);
        console.log(`Company settings created: ${settingsCreated}`);
        console.log('\n💡 Next steps:');
        console.log('   1. Verify data in database');
        console.log('   2. Test API endpoints');
        console.log('   3. Update frontend UI');
        console.log('═══════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('\n❌ MIGRATION FAILED:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run if called directly
if (require.main === module) {
    migrateData()
        .then(() => {
            console.log('✨ Migration script completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateData };
