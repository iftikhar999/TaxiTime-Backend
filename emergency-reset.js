#!/usr/bin/env node
/**
 * Force Clear All Driver Data - Emergency Reset
 * 
 * This script forcefully clears ALL driver-related data without connecting to database.
 * Use this when you have database connection issues.
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function emergencyReset() {
    try {
        console.log('\n🚨 EMERGENCY RESET - Clearing ALL driver app data...\n');

        // Get database URL from .env
        const fs = require('fs');
        const envContent = fs.readFileSync('.env', 'utf8');
        const dbUrlMatch = envContent.match(/DATABASE_URL="([^"]+)"/);

        if (!dbUrlMatch) {
            console.error('❌ Could not find DATABASE_URL in .env');
            process.exit(1);
        }

        const dbUrl = dbUrlMatch[1];

        // Parse PostgreSQL connection string
        const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
        if (!urlMatch) {
            console.error('❌ Invalid DATABASE_URL format');
            process.exit(1);
        }

        const [, user, password, host, port, database] = urlMatch;

        console.log('📋 Database connection:');
        console.log(`   Host: ${host}:${port}`);
        console.log(`   Database: ${database}`);
        console.log(`   User: ${user}\n`);

        // SQL commands to clear data
        const sqlCommands = `
      -- End all active shifts
      UPDATE shifts SET status = 'OFFLINE', "endTime" = NOW() 
      WHERE status IN ('ONLINE', 'BUSY', 'BREAK');

      -- Delete all vehicle assignments
      DELETE FROM assignments;

      -- Clear vehicle selections (if there's a column for it)
      -- UPDATE users SET "currentVehicleId" = NULL WHERE role = 'DRIVER';
    `;

        console.log('⚡ Executing SQL commands...\n');

        // Execute via psql
        const command = `PGPASSWORD="${password}" psql -h ${host} -p ${port} -U ${user} -d ${database} -c "${sqlCommands.replace(/\n/g, ' ')}"`;

        const { stdout, stderr } = await execPromise(command);

        if (stderr && !stderr.includes('NOTICE')) {
            console.error('❌ Error:', stderr);
        } else {
            console.log('✅ SUCCESS! All driver data cleared.\n');
            console.log('📱 Now you can:');
            console.log('   1. Uninstall the app: adb uninstall com.driverapptemp');
            console.log('   2. Rebuild the app: npx react-native run-android');
            console.log('   3. Login and you will see Vehicle Selection Screen\n');
        }

    } catch (error) {
        console.error('\n❌ Emergency reset failed:', error.message);
        console.log('\n💡 Alternative: Use pgAdmin or psql directly to run:');
        console.log('   UPDATE shifts SET status = \'OFFLINE\', "endTime" = NOW() WHERE status IN (\'ONLINE\', \'BUSY\', \'BREAK\');');
        console.log('   DELETE FROM assignments;\n');
    }
}

emergencyReset();
