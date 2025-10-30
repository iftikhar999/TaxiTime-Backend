const { PrismaClient } = require('@prisma/client');
const { logDatabaseQuery } = require('../middleware/performanceLogger');

const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'info', emit: 'event' },
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});

// Hook into Prisma query events for performance logging (Prisma 5+/6+ compatible)
prisma.$on('query', (e) => {
  const query = `${e.query}`.substring(0, 200); // Truncate long queries
  const duration = e.duration || 0;
  
  logDatabaseQuery(query, duration, {
    target: e.target,
    params: e.params,
  });
});

console.log('🗄️  Database query logging enabled for performance analysis (Prisma 6 event-based)');

module.exports = prisma;