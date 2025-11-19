#!/usr/bin/env node

/**
 * Database Connection Health Check
 * 
 * This script checks for orphaned database connections and provides
 * recommendations for fixing connection pool issues.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkConnections() {
  try {
    console.log('🔍 Checking PostgreSQL connection status...\n');

    // Get current connections
    const connections = await prisma.$queryRaw`
      SELECT 
        count(*)::int as total_connections,
        count(*) FILTER (WHERE state = 'active')::int as active_connections,
        count(*) FILTER (WHERE state = 'idle')::int as idle_connections
      FROM 
        pg_stat_activity
      WHERE 
        datname = current_database()
    `;

    const maxConnResult = await prisma.$queryRaw`
      SELECT setting::int as max_connections 
      FROM pg_settings 
      WHERE name = 'max_connections'
    `;

    const stats = {
      ...connections[0],
      max_connections: maxConnResult[0].max_connections,
      available_connections: maxConnResult[0].max_connections - connections[0].total_connections
    };
    
    console.log('📊 Connection Statistics:');
    console.log(`   Total Connections: ${stats.total_connections}`);
    console.log(`   Active: ${stats.active_connections}`);
    console.log(`   Idle: ${stats.idle_connections}`);
    console.log(`   Available: ${stats.available_connections}`);
    console.log(`   Max Allowed: ${stats.max_connections}`);
    console.log();

    // Check connection details
    const details = await prisma.$queryRaw`
      SELECT 
        pid,
        usename,
        application_name,
        client_addr,
        state,
        query_start,
        state_change,
        wait_event_type,
        wait_event
      FROM 
        pg_stat_activity
      WHERE 
        datname = current_database()
        AND pid <> pg_backend_pid()
      ORDER BY 
        state_change DESC
      LIMIT 10
    `;

    console.log('🔌 Recent Connections:');
    details.forEach((conn, idx) => {
      console.log(`   ${idx + 1}. PID: ${conn.pid}`);
      console.log(`      App: ${conn.application_name || 'Unknown'}`);
      console.log(`      State: ${conn.state}`);
      console.log(`      User: ${conn.usename}`);
      console.log(`      Client: ${conn.client_addr || 'local'}`);
      console.log();
    });

    // Provide recommendations
    const utilizationPercent = (Number(stats.total_connections) / Number(stats.max_connections)) * 100;
    
    console.log('💡 Recommendations:');
    if (utilizationPercent > 80) {
      console.log('   ⚠️  WARNING: Connection pool is over 80% utilized!');
      console.log('   • Consider reducing connection_limit in DATABASE_URL');
      console.log('   • Check for connection leaks (unclosed Prisma clients)');
      console.log('   • Ensure graceful shutdown handlers are working');
      console.log('   • Consider increasing PostgreSQL max_connections');
    } else if (utilizationPercent > 60) {
      console.log('   ⚠️  Connection pool is over 60% utilized');
      console.log('   • Monitor for potential connection leaks');
      console.log('   • Ensure all Prisma queries properly close');
    } else {
      console.log('   ✅ Connection pool utilization is healthy');
    }

  } catch (error) {
    console.error('❌ Error checking connections:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Kill idle connections (use with caution!)
async function killIdleConnections() {
  try {
    console.log('⚠️  Killing idle connections...\n');
    
    const result = await prisma.$queryRaw`
      SELECT 
        pg_terminate_backend(pid) as terminated,
        pid,
        usename,
        application_name,
        state
      FROM 
        pg_stat_activity
      WHERE 
        datname = current_database()
        AND pid <> pg_backend_pid()
        AND state = 'idle'
        AND state_change < NOW() - INTERVAL '5 minutes'
    `;

    console.log(`✅ Terminated ${result.length} idle connections`);
    result.forEach(conn => {
      console.log(`   - PID ${conn.pid} (${conn.application_name || 'Unknown'})`);
    });

  } catch (error) {
    console.error('❌ Error killing connections:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
const command = process.argv[2];

if (command === 'kill-idle') {
  killIdleConnections();
} else {
  checkConnections();
}
