const { PrismaClient } = require('@prisma/client');

const remoteDbUrl = 'postgresql://postgres:taxitime_database@54.252.241.150:5432/taxitime';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: remoteDbUrl,
    },
  },
});

async function main() {
  try {
    console.log('Connecting to remote DB...');
    await prisma.$connect();
    console.log('Connected successfully!');
    const count = await prisma.tariffs.count();
    console.log(`Found ${count} tariffs in remote DB.`);
  } catch (e) {
    console.error('Connection failed:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
