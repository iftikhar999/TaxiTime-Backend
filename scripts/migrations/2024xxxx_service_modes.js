/**
 * Backfill company_services from legacy companies.serviceModes JSON.
 * Safe to run multiple times (upsert).
 */
const prisma = require('../../lib/prisma');

async function main() {
  const companies = await prisma.companies.findMany({
    select: { id: true, serviceModes: true },
  });

  console.log(`Found ${companies.length} companies to process`);

  for (const company of companies) {
    const modes = company.serviceModes || {};
    const serviceTypes = [
      { type: 'TAXI', enabled: modes.taxi === true },
      { type: 'DELIVERY', enabled: modes.delivery === true },
      { type: 'COURIER', enabled: modes.courier === true },
    ];

    // If no data present, assume TAXI enabled to match V1 behavior
    if (!modes || Object.keys(modes).length === 0) {
      serviceTypes[0].enabled = true;
    }

    for (const svc of serviceTypes) {
      await prisma.company_services.upsert({
        where: {
          companyId_serviceType: {
            companyId: company.id,
            serviceType: svc.type,
          },
        },
        update: { enabled: svc.enabled },
        create: {
          companyId: company.id,
          serviceType: svc.type,
          enabled: svc.enabled,
        },
      });
    }

    // Mark version
    await prisma.companies.update({
      where: { id: company.id },
      data: {
        serviceModeVersion: 2,
      },
    });
  }

  console.log('company_services backfill complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
