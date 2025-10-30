/**
 * Performance Analysis Script
 * 
 * Run this after 10 minutes of server operation to analyze logs
 * and generate optimization recommendations.
 * 
 * Usage:
 *   node scripts/analyze-performance.js
 *   node scripts/analyze-performance.js --duration 10  # analyze last 10 minutes
 *   node scripts/analyze-performance.js --export report.json
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '../logs');
const API_LOG = path.join(LOGS_DIR, 'api-frequency.log');
const DB_LOG = path.join(LOGS_DIR, 'db-queries.log');
const PERF_LOG = path.join(LOGS_DIR, 'performance-analysis.log');

// Parse command line arguments
const args = process.argv.slice(2);
const durationMinutes = parseInt(args.find(arg => arg.startsWith('--duration='))?.split('=')[1]) || 10;
const exportFile = args.find(arg => arg.startsWith('--export='))?.split('=')[1];

console.log(`📊 Analyzing performance data from last ${durationMinutes} minutes...\n`);

/**
 * Parse log files
 */
function parseLogs() {
    const cutoffTime = Date.now() - (durationMinutes * 60 * 1000);
    const data = {
        apiCalls: [],
        dbQueries: [],
        socketEvents: [],
    };
    
    // Parse API frequency log
    if (fs.existsSync(API_LOG)) {
        const lines = fs.readFileSync(API_LOG, 'utf8').split('\n').filter(Boolean);
        lines.forEach(line => {
            try {
                const entry = JSON.parse(line);
                if (new Date(entry.timestamp).getTime() > cutoffTime) {
                    data.apiCalls.push(entry);
                }
            } catch (error) {
                // Skip malformed lines
            }
        });
    }
    
    // Parse DB queries log
    if (fs.existsSync(DB_LOG)) {
        const lines = fs.readFileSync(DB_LOG, 'utf8').split('\n').filter(Boolean);
        lines.forEach(line => {
            try {
                const entry = JSON.parse(line);
                if (new Date(entry.timestamp).getTime() > cutoffTime) {
                    data.dbQueries.push(entry);
                }
            } catch (error) {
                // Skip malformed lines
            }
        });
    }
    
    // Parse performance log
    if (fs.existsSync(PERF_LOG)) {
        const lines = fs.readFileSync(PERF_LOG, 'utf8').split('\n').filter(Boolean);
        lines.forEach(line => {
            try {
                const entry = JSON.parse(line);
                if (new Date(entry.timestamp).getTime() > cutoffTime) {
                    data.socketEvents.push(entry);
                }
            } catch (error) {
                // Skip malformed lines
            }
        });
    }
    
    return data;
}

/**
 * Analyze API calls
 */
function analyzeAPIs(apiCalls) {
    const stats = new Map();
    
    apiCalls.forEach(call => {
        const key = call.endpoint;
        if (!stats.has(key)) {
            stats.set(key, {
                endpoint: key,
                count: 0,
                totalDuration: 0,
                callers: new Set(),
            });
        }
        const stat = stats.get(key);
        stat.count++;
        stat.totalDuration += call.duration;
        stat.callers.add(call.caller);
    });
    
    return Array.from(stats.values())
        .map(stat => ({
            ...stat,
            avgDuration: Math.round(stat.totalDuration / stat.count),
            callsPerMinute: (stat.count / durationMinutes).toFixed(2),
            uniqueCallers: stat.callers.size,
            callers: undefined,
        }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Analyze database queries
 */
function analyzeQueries(dbQueries) {
    const stats = new Map();
    
    dbQueries.forEach(query => {
        const key = `${query.queryType} ${query.table}`;
        if (!stats.has(key)) {
            stats.set(key, {
                query: key,
                count: 0,
                totalDuration: 0,
            });
        }
        const stat = stats.get(key);
        stat.count++;
        stat.totalDuration += query.duration;
    });
    
    return Array.from(stats.values())
        .map(stat => ({
            ...stat,
            avgDuration: Math.round(stat.totalDuration / stat.count),
            queriesPerMinute: (stat.count / durationMinutes).toFixed(2),
        }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Generate recommendations
 */
function generateRecommendations(apiStats, queryStats) {
    const recommendations = [];
    
    // Check APIs
    apiStats.forEach(api => {
        const cpm = parseFloat(api.callsPerMinute);
        
        if (cpm > 30 && api.endpoint.startsWith('GET')) {
            recommendations.push({
                type: '🔴 HIGH PRIORITY - CACHING',
                target: api.endpoint,
                issue: `Called ${cpm} times/minute`,
                action: 'Add request caching with 10-30s TTL',
                impact: 'Reduce calls by 80-95%',
            });
        }
        
        if (cpm > 60) {
            recommendations.push({
                type: '🟡 MEDIUM - SLOW DOWN',
                target: api.endpoint,
                issue: `Very high frequency: ${cpm} calls/minute`,
                action: 'Increase client polling interval (e.g., 10s → 30s)',
                impact: 'Reduce server load by 60%',
            });
        }
        
        if (api.avgDuration > 500) {
            recommendations.push({
                type: '🔴 HIGH PRIORITY - SLOW API',
                target: api.endpoint,
                issue: `Slow response: ${api.avgDuration}ms average`,
                action: 'Optimize queries, add indexes, or cache',
                impact: 'Improve user experience',
            });
        }
        
        if (cpm < 0.5 && cpm > 0) {
            recommendations.push({
                type: '🟢 LOW PRIORITY - INFREQUENT',
                target: api.endpoint,
                issue: `Rarely called: ${cpm} times/minute`,
                action: 'This endpoint is fine - no action needed',
                impact: 'None',
            });
        }
    });
    
    // Check queries
    queryStats.forEach(query => {
        const qpm = parseFloat(query.queriesPerMinute);
        
        if (qpm > 100 && query.query.startsWith('SELECT')) {
            recommendations.push({
                type: '🔴 HIGH PRIORITY - DB CACHING',
                target: query.query,
                issue: `Query executed ${qpm} times/minute`,
                action: 'Cache query results or use in-memory store',
                impact: 'Reduce DB load by 90%',
            });
        }
        
        if (query.avgDuration > 100 && query.count > 50) {
            recommendations.push({
                type: '🔴 HIGH PRIORITY - SLOW QUERY',
                target: query.query,
                issue: `Slow query: ${query.avgDuration}ms (${query.count} times)`,
                action: 'Add database index or optimize query',
                impact: 'Improve response times',
            });
        }
    });
    
    return recommendations;
}

/**
 * Print report
 */
function printReport(data, apiStats, queryStats, recommendations) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 PERFORMANCE ANALYSIS REPORT');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log(`⏱️  Analysis Period: ${durationMinutes} minutes`);
    console.log(`📡 Total API Calls: ${data.apiCalls.length}`);
    console.log(`🗄️  Total DB Queries: ${data.dbQueries.length}`);
    console.log(`⚡ Total Socket Events: ${data.socketEvents.length}\n`);
    
    console.log('─────────────────────────────────────────────────────────────');
    console.log('🔝 TOP 10 APIs BY FREQUENCY');
    console.log('─────────────────────────────────────────────────────────────\n');
    apiStats.slice(0, 10).forEach((api, i) => {
        console.log(`${i + 1}. ${api.endpoint}`);
        console.log(`   📊 ${api.count} calls (${api.callsPerMinute}/min)`);
        console.log(`   ⏱️  ${api.avgDuration}ms avg`);
        console.log(`   👥 ${api.uniqueCallers} unique callers\n`);
    });
    
    console.log('─────────────────────────────────────────────────────────────');
    console.log('🗄️  TOP 10 DATABASE QUERIES');
    console.log('─────────────────────────────────────────────────────────────\n');
    queryStats.slice(0, 10).forEach((query, i) => {
        console.log(`${i + 1}. ${query.query}`);
        console.log(`   📊 ${query.count} queries (${query.queriesPerMinute}/min)`);
        console.log(`   ⏱️  ${query.avgDuration}ms avg\n`);
    });
    
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`💡 OPTIMIZATION RECOMMENDATIONS (${recommendations.length})`);
    console.log('─────────────────────────────────────────────────────────────\n');
    recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec.type}`);
        console.log(`   Target: ${rec.target}`);
        console.log(`   Issue: ${rec.issue}`);
        console.log(`   Action: ${rec.action}`);
        console.log(`   Impact: ${rec.impact}\n`);
    });
    
    console.log('═══════════════════════════════════════════════════════════\n');
}

/**
 * Main execution
 */
function main() {
    try {
        const data = parseLogs();
        
        if (data.apiCalls.length === 0 && data.dbQueries.length === 0) {
            console.log('⚠️  No performance data found for the specified period.');
            console.log('💡 Make sure the server is running with performance logging enabled.\n');
            return;
        }
        
        const apiStats = analyzeAPIs(data.apiCalls);
        const queryStats = analyzeQueries(data.dbQueries);
        const recommendations = generateRecommendations(apiStats, queryStats);
        
        printReport(data, apiStats, queryStats, recommendations);
        
        // Export if requested
        if (exportFile) {
            const report = {
                generatedAt: new Date().toISOString(),
                durationMinutes,
                summary: {
                    totalApiCalls: data.apiCalls.length,
                    totalDbQueries: data.dbQueries.length,
                    totalSocketEvents: data.socketEvents.length,
                },
                apiStats,
                queryStats,
                recommendations,
            };
            
            fs.writeFileSync(exportFile, JSON.stringify(report, null, 2));
            console.log(`📄 Report exported to: ${exportFile}\n`);
        }
        
        console.log('✅ Analysis complete!\n');
        console.log('Next steps:');
        console.log('1. Review high-priority recommendations');
        console.log('2. Apply optimizations in Super Admin panel');
        console.log('3. Re-analyze after 10 minutes to verify improvements\n');
        
    } catch (error) {
        console.error('❌ Error during analysis:', error);
        process.exit(1);
    }
}

main();

