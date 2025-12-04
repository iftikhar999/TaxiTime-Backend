const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres@localhost:5432/taxitime_local?connection_limit=10&pool_timeout=10',
    },
  },
});

async function main() {
  try {
    console.log('Fetching tariffs from local DB...');
    const tariffs = await prisma.tariffs.findMany();
    console.log(`Found ${tariffs.length} tariffs.`);

    const seedScriptContent = `
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const tariffs = ${JSON.stringify(tariffs, null, 2)};

async function main() {
  console.log('Seeding tariffs to live DB...');
  for (const tariff of tariffs) {
    // Convert string dates back to Date objects if necessary, 
    // but Prisma usually handles ISO strings fine.
    // However, Decimal types might be serialized as strings in JSON.
    // We need to handle that.
    
    const { id, ...data } = tariff;
    
    // Ensure Decimals are properly formatted if needed, 
    // but passing strings to Decimal fields usually works in Prisma.
    
    await prisma.tariffs.upsert({
      where: { id: tariff.id },
      update: {
        ...data,
        updatedAt: new Date(), // Update timestamp
      },
      create: {
        ...tariff,
      },
    });
    console.log(\`Processed tariff: \${tariff.name}\`);
  }
  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
`;

    const outputPath = path.join(__dirname, 'seed-tariffs-live.js');
    fs.writeFileSync(outputPath, seedScriptContent);
    console.log(`Seed script generated at: ${outputPath}`);
    console.log('You can now copy this file to the server and run it.');

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
