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

// Temporary aliases so legacy camelCase model names continue to work
const aliasModel = (alias, target) => {
  if (!prisma[alias] && prisma[target]) {
    prisma[alias] = prisma[target];
  }
};

aliasModel('companyTariff', 'company_tariffs');
aliasModel('companyTariffs', 'company_tariffs');
aliasModel('companyZone', 'company_zones');
aliasModel('companyZones', 'company_zones');
aliasModel('zone', 'zones');
aliasModel('zoneTariff', 'zone_tariffs');
aliasModel('zoneTariffs', 'zone_tariffs');
aliasModel('tariff', 'tariffs');
aliasModel('tariffsLegacy', 'tariffs');

console.log('🗄️  Database query logging enabled for performance analysis (Prisma 6 event-based)');

module.exports = prisma;
