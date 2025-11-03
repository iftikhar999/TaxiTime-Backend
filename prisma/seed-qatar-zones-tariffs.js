const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🇶🇦 Starting QATAR ZONES & TARIFFS seeding...');
  
  // Get existing companies
  const companies = await prisma.company.findMany();
  console.log(`Found ${companies.length} companies`);

  if (companies.length === 0) {
    console.log('❌ No companies found. Please run basic seeder first.');
    return;
  }

  // Qatar-based zones with detailed coverage
  const qatarZones = [
    // DOHA - Capital City (Multiple Districts)
    {
      name: 'Doha Downtown',
      nameAr: 'وسط مدينة الدوحة',
      coordinates: [[25.2854, 51.5310], [25.2900, 51.5350], [25.2850, 51.5400], [25.2800, 51.5360], [25.2854, 51.5310]],
      zoneType: 'CITY_CENTER',
      description: 'Central business district and downtown Doha',
      surgeMultiplier: 1.5,
      priority: 1
    },
    {
      name: 'West Bay',
      nameAr: 'الخليج الغربي',
      coordinates: [[25.3100, 51.5200], [25.3200, 51.5250], [25.3150, 51.5350], [25.3050, 51.5300], [25.3100, 51.5200]],
      zoneType: 'BUSINESS_DISTRICT',
      description: 'Modern business and financial district',
      surgeMultiplier: 1.3,
      priority: 2
    },
    {
      name: 'Aspire Zone',
      nameAr: 'أسباير زون',
      coordinates: [[25.2600, 51.5200], [25.2700, 51.5250], [25.2650, 51.5350], [25.2550, 51.5300], [25.2600, 51.5200]],
      zoneType: 'COMMERCIAL',
      description: 'Sports and entertainment complex',
      surgeMultiplier: 1.4,
      priority: 3
    },
    {
      name: 'The Pearl Qatar',
      nameAr: 'اللؤلؤة قطر',
      coordinates: [[25.3700, 51.5500], [25.3800, 51.5550], [25.3750, 51.5650], [25.3650, 51.5600], [25.3700, 51.5500]],
      zoneType: 'RESIDENTIAL',
      description: 'Luxury artificial island development',
      surgeMultiplier: 1.8,
      priority: 1
    },
    {
      name: 'Katara Cultural Village',
      nameAr: 'كتارا القرية الثقافية',
      coordinates: [[25.3800, 51.5300], [25.3900, 51.5350], [25.3850, 51.5450], [25.3750, 51.5400], [25.3800, 51.5300]],
      zoneType: 'COMMERCIAL',
      description: 'Cultural and arts district',
      surgeMultiplier: 1.2,
      priority: 4
    },
    {
      name: 'Lusail City',
      nameAr: 'مدينة لوسيل',
      coordinates: [[25.4300, 51.5000], [25.4500, 51.5100], [25.4400, 51.5300], [25.4200, 51.5200], [25.4300, 51.5000]],
      zoneType: 'CITY_CENTER',
      description: 'Modern planned city and FIFA World Cup venue',
      surgeMultiplier: 1.6,
      priority: 1
    },

    // AL RAYYAN - Major Municipality
    {
      name: 'Al Rayyan Central',
      nameAr: 'الريان المركز',
      coordinates: [[25.2500, 51.4200], [25.2700, 51.4300], [25.2600, 51.4500], [25.2400, 51.4400], [25.2500, 51.4200]],
      zoneType: 'SERVICE_AREA',
      description: 'Al Rayyan municipal center',
      surgeMultiplier: 1.1,
      priority: 5
    },
    {
      name: 'Education City',
      nameAr: 'المدينة التعليمية',
      coordinates: [[25.3100, 51.4300], [25.3300, 51.4400], [25.3200, 51.4600], [25.3000, 51.4500], [25.3100, 51.4300]],
      zoneType: 'COMMERCIAL',
      description: 'Qatar Foundation Education City campus',
      surgeMultiplier: 1.3,
      priority: 3
    },
    {
      name: 'Al Gharafa',
      nameAr: 'الغرافة',
      coordinates: [[25.2800, 51.4100], [25.3000, 51.4200], [25.2900, 51.4400], [25.2700, 51.4300], [25.2800, 51.4100]],
      zoneType: 'RESIDENTIAL',
      description: 'Residential area in Al Rayyan',
      surgeMultiplier: 1.0,
      priority: 6
    },

    // AL WAKRAH - Coastal Municipality
    {
      name: 'Al Wakrah City',
      nameAr: 'مدينة الوكرة',
      coordinates: [[25.1600, 51.6000], [25.1800, 51.6100], [25.1700, 51.6300], [25.1500, 51.6200], [25.1600, 51.6000]],
      zoneType: 'DOWNTOWN',
      description: 'Historic coastal city and port',
      surgeMultiplier: 1.2,
      priority: 4
    },
    {
      name: 'Al Wukair',
      nameAr: 'الوكير',
      coordinates: [[25.1300, 51.6200], [25.1500, 51.6300], [25.1400, 51.6500], [25.1200, 51.6400], [25.1300, 51.6200]],
      zoneType: 'RESIDENTIAL',
      description: 'Residential area in Al Wakrah',
      surgeMultiplier: 1.0,
      priority: 7
    },

    // UMM SALAL - Northern Municipality
    {
      name: 'Umm Salal Mohammed',
      nameAr: 'أم صلال محمد',
      coordinates: [[25.4100, 51.4000], [25.4300, 51.4100], [25.4200, 51.4300], [25.4000, 51.4200], [25.4100, 51.4000]],
      zoneType: 'SERVICE_AREA',
      description: 'Umm Salal municipal center',
      surgeMultiplier: 1.0,
      priority: 8
    },

    // AL DAAYEN - Eastern Municipality
    {
      name: 'Al Daayen Central',
      nameAr: 'الدعين المركز',
      coordinates: [[25.3500, 51.5800], [25.3700, 51.5900], [25.3600, 51.6100], [25.3400, 51.6000], [25.3500, 51.5800]],
      zoneType: 'SERVICE_AREA',
      description: 'Al Daayen municipal area',
      surgeMultiplier: 1.0,
      priority: 9
    },

    // AL KHOR - Northern Coastal City
    {
      name: 'Al Khor City',
      nameAr: 'مدينة الخور',
      coordinates: [[25.6800, 51.4900], [25.7000, 51.5000], [25.6900, 51.5200], [25.6700, 51.5100], [25.6800, 51.4900]],
      zoneType: 'DOWNTOWN',
      description: 'Northern coastal city and industrial area',
      surgeMultiplier: 1.1,
      priority: 6
    },

    // AL SHAMAL - Northernmost Municipality
    {
      name: 'Al Ruwais',
      nameAr: 'الرويس',
      coordinates: [[26.1000, 51.2000], [26.1200, 51.2100], [26.1100, 51.2300], [26.0900, 51.2200], [26.1000, 51.2000]],
      zoneType: 'SERVICE_AREA',
      description: 'Northern coastal town',
      surgeMultiplier: 1.5,
      priority: 10
    },

    // AL SHAHANIYA - Western Municipality
    {
      name: 'Al Shahaniya',
      nameAr: 'الشحانية',
      coordinates: [[25.3000, 51.2000], [25.3200, 51.2100], [25.3100, 51.2300], [25.2900, 51.2200], [25.3000, 51.2000]],
      zoneType: 'SERVICE_AREA',
      description: 'Western rural and camel racing area',
      surgeMultiplier: 1.3,
      priority: 8
    },

    // AIRPORT ZONES
    {
      name: 'Hamad International Airport',
      nameAr: 'مطار حمد الدولي',
      coordinates: [[25.2730, 51.6080], [25.2780, 51.6120], [25.2750, 51.6150], [25.2700, 51.6110], [25.2730, 51.6080]],
      zoneType: 'AIRPORT',
      description: 'Main international airport',
      surgeMultiplier: 2.0,
      priority: 1
    },

    // INDUSTRIAL ZONES
    {
      name: 'Mesaieed Industrial City',
      nameAr: 'مدينة مسيعيد الصناعية',
      coordinates: [[24.9900, 51.5500], [25.0100, 51.5600], [25.0000, 51.5800], [24.9800, 51.5700], [24.9900, 51.5500]],
      zoneType: 'INDUSTRIAL',
      description: 'Major petrochemical and industrial complex',
      surgeMultiplier: 1.4,
      priority: 5
    },

    // SPECIAL ECONOMIC ZONES
    {
      name: 'Qatar Free Zone',
      nameAr: 'المنطقة الحرة القطرية',
      coordinates: [[25.2200, 51.5700], [25.2400, 51.5800], [25.2300, 51.6000], [25.2100, 51.5900], [25.2200, 51.5700]],
      zoneType: 'COMMERCIAL',
      description: 'Free trade and logistics zone',
      surgeMultiplier: 1.2,
      priority: 6
    }
  ];

  // Qatar-specific tariff plans
  const qatarTariffs = [
    {
      name: 'Qatar Standard',
      nameAr: 'قطر العادية',
      vehicleType: 'SEDAN',
      baseFare: 10.0, // QAR
      perKmRate: 2.0,
      perMinuteRate: 0.5,
      minimumFare: 15.0,
      cancellationFee: 10.0,
      waitingTimeRate: 1.0,
      currency: 'QAR',
      isActive: true,
      timeBasedRates: {
        PEAK_HOURS: { multiplier: 1.5, startTime: '07:00', endTime: '09:00' },
        EVENING_PEAK: { multiplier: 1.3, startTime: '17:00', endTime: '19:00' },
        NIGHT_TIME: { multiplier: 1.2, startTime: '22:00', endTime: '06:00' },
        FRIDAY_PRAYER: { multiplier: 1.4, startTime: '11:30', endTime: '13:30' }
      }
    },
    {
      name: 'Qatar Premium',
      nameAr: 'قطر الممتازة',
      vehicleType: 'SUV',
      baseFare: 15.0,
      perKmRate: 3.0,
      perMinuteRate: 0.8,
      minimumFare: 25.0,
      cancellationFee: 15.0,
      waitingTimeRate: 1.5,
      currency: 'QAR',
      isActive: true,
      timeBasedRates: {
        PEAK_HOURS: { multiplier: 1.6, startTime: '07:00', endTime: '09:00' },
        EVENING_PEAK: { multiplier: 1.4, startTime: '17:00', endTime: '19:00' },
        NIGHT_TIME: { multiplier: 1.3, startTime: '22:00', endTime: '06:00' }
      }
    },
    {
      name: 'Qatar Luxury',
      nameAr: 'قطر الفاخرة',
      vehicleType: 'LUXURY',
      baseFare: 25.0,
      perKmRate: 4.5,
      perMinuteRate: 1.2,
      minimumFare: 40.0,
      cancellationFee: 25.0,
      waitingTimeRate: 2.0,
      currency: 'QAR',
      isActive: true,
      timeBasedRates: {
        PEAK_HOURS: { multiplier: 1.8, startTime: '07:00', endTime: '09:00' },
        EVENING_PEAK: { multiplier: 1.5, startTime: '17:00', endTime: '19:00' },
        NIGHT_TIME: { multiplier: 1.4, startTime: '22:00', endTime: '06:00' }
      }
    },
    {
      name: 'Qatar Airport Express',
      nameAr: 'قطر المطار السريع',
      vehicleType: 'SEDAN',
      baseFare: 20.0,
      perKmRate: 2.5,
      perMinuteRate: 0.6,
      minimumFare: 30.0,
      cancellationFee: 20.0,
      waitingTimeRate: 1.2,
      currency: 'QAR',
      isActive: true,
      specialRates: {
        AIRPORT_PICKUP_FEE: 15.0,
        AIRPORT_DROP_FEE: 10.0,
        LUGGAGE_ASSISTANCE: 5.0
      }
    },
    {
      name: 'Qatar Van/Bus',
      nameAr: 'قطر الحافلة الصغيرة',
      vehicleType: 'VAN',
      baseFare: 20.0,
      perKmRate: 3.5,
      perMinuteRate: 1.0,
      minimumFare: 35.0,
      cancellationFee: 20.0,
      waitingTimeRate: 1.8,
      currency: 'QAR',
      isActive: true,
      capacity: '6-8 passengers'
    },
    {
      name: 'Qatar Economy',
      nameAr: 'قطر الاقتصادية',
      vehicleType: 'COMPACT',
      baseFare: 8.0,
      perKmRate: 1.5,
      perMinuteRate: 0.4,
      minimumFare: 12.0,
      cancellationFee: 8.0,
      waitingTimeRate: 0.8,
      currency: 'QAR',
      isActive: true,
      description: 'Budget-friendly option for Qatar residents'
    }
  ];

  console.log('🗺️ Creating Qatar zones...');
  
  // Create zones for each company
  for (const company of companies) {
    for (const zoneData of qatarZones) {
      // Check if zone already exists
      const existingZone = await prisma.zone.findFirst({
        where: {
          name: zoneData.name,
          companyId: company.id
        }
      });

      let zone;
      if (existingZone) {
        // Update existing zone
        zone = await prisma.zone.update({
          where: { id: existingZone.id },
          data: {
            description: zoneData.description,
            boundaries: zoneData.coordinates,
            type: zoneData.zoneType,
            surgeMultiplier: zoneData.surgeMultiplier || 1.0,
            isActive: true,
            specialRules: {
              nameAr: zoneData.nameAr,
              country: 'Qatar',
              region: 'Gulf',
              timezone: 'Asia/Qatar',
              currency: 'QAR',
              priority: zoneData.priority || 5
            }
          }
        });
      } else {
        // Create new zone
        zone = await prisma.zone.create({
          data: {
            name: zoneData.name,
            companyId: company.id,
            boundaries: zoneData.coordinates,
            type: zoneData.zoneType,
            description: zoneData.description,
            isActive: true,
            surgeMultiplier: zoneData.surgeMultiplier || 1.0,
            specialRules: {
              nameAr: zoneData.nameAr,
              country: 'Qatar',
              region: 'Gulf',
              timezone: 'Asia/Qatar',
              currency: 'QAR',
              priority: zoneData.priority || 5
            }
          }
        });
      }
    }
  }

  console.log(`✅ Created ${qatarZones.length} zones for ${companies.length} companies`);

  console.log('💰 Creating Qatar tariffs...');
  
  // Create tariffs for each company
  for (const company of companies) {
    for (const tariffData of qatarTariffs) {
      // Check if tariff already exists
      const existingTariff = await prisma.tariff.findFirst({
        where: {
          name: tariffData.name,
          companyId: company.id
        }
      });

      let tariff;
      if (existingTariff) {
        // Update existing tariff
        tariff = await prisma.tariff.update({
          where: { id: existingTariff.id },
          data: {
            description: tariffData.description || `${tariffData.name} tariff`,
            baseFare: tariffData.baseFare,
            perKmRate: tariffData.perKmRate,
            perMinuteRate: tariffData.perMinuteRate,
            minimumFare: tariffData.minimumFare,
            waitingFee: tariffData.waitingTimeRate || 1.0,
            airportFee: tariffData.specialRates?.AIRPORT_PICKUP_FEE || 0,
            isActive: tariffData.isActive
          }
        });
      } else {
        // Create new tariff
        tariff = await prisma.tariff.create({
          data: {
            name: tariffData.name,
            companyId: company.id,
            description: tariffData.description || `${tariffData.name} tariff`,
            baseFare: tariffData.baseFare,
            perKmRate: tariffData.perKmRate,
            perMinuteRate: tariffData.perMinuteRate,
            minimumFare: tariffData.minimumFare,
            waitingFee: tariffData.waitingTimeRate || 1.0,
            airportFee: tariffData.specialRates?.AIRPORT_PICKUP_FEE || 0,
            isActive: tariffData.isActive
          }
        });
      }

      // Create zone-tariff associations for relevant zones
      const zones = await prisma.zone.findMany({
        where: { companyId: company.id }
      });

      for (const zone of zones) {
        // Apply different tariffs to different zone types
        const shouldApplyTariff = (
          (tariffData.name.includes('Airport') && zone.type === 'AIRPORT') ||
          (tariffData.name.includes('Luxury') && ['LUXURY_RESIDENTIAL', 'BUSINESS_DISTRICT'].includes(zone.type)) ||
          (tariffData.name.includes('Premium') && ['CITY_CENTER', 'NEW_CITY', 'BUSINESS_DISTRICT'].includes(zone.type)) ||
          (tariffData.name.includes('Standard') && !['AIRPORT', 'LUXURY_RESIDENTIAL'].includes(zone.type)) ||
          (tariffData.name.includes('Economy') && ['RESIDENTIAL', 'RURAL_AREA'].includes(zone.type))
        );

        if (shouldApplyTariff) {
          // Check if zone-tariff association already exists
          const existingZoneTariff = await prisma.zoneTariff.findFirst({
            where: {
              zoneId: zone.id,
              tariffId: tariff.id
            }
          });

          if (!existingZoneTariff) {
            await prisma.zoneTariff.create({
              data: {
                zoneId: zone.id,
                tariffId: tariff.id,
                priority: tariff.priority || 5,
                isDefault: tariff.name === 'Standard Taxi' && zone.priority === 1,
                activeFrom: new Date(),
                daysOfWeek: '0,1,2,3,4,5,6'
              }
            });
          }
        }
      }
    }
  }

  console.log(`✅ Created ${qatarTariffs.length} tariffs for ${companies.length} companies`);

  // Create additional zone-specific configurations
  console.log('⚙️ Creating zone-specific configurations...');
  
  const specialConfigs = [
    { zoneName: 'Hamad International Airport', config: { airportFee: 15.0, luggageAssistance: true, meetAndGreet: true } },
    { zoneName: 'The Pearl Qatar', config: { valetService: true, luxuryVehiclesOnly: true, conciergeService: true } },
    { zoneName: 'Lusail City', config: { sportEventSurge: 2.5, stadiumPickup: true, eventManagement: true } },
    { zoneName: 'Education City', config: { studentDiscount: 0.15, academicHours: true, campusPickup: true } },
    { zoneName: 'West Bay', config: { businessHours: true, corporateRates: true, executiveService: true } }
  ];

  for (const company of companies) {
    for (const specialConfig of specialConfigs) {
      const zone = await prisma.zone.findFirst({
        where: {
          name: specialConfig.zoneName,
          companyId: company.id
        }
      });

      if (zone) {
        await prisma.zone.update({
          where: { id: zone.id },
          data: {
            specialRules: {
              ...zone.specialRules,
              specialConfig: specialConfig.config,
              lastUpdated: new Date().toISOString()
            }
          }
        });
      }
    }
  }

  console.log('✅ Zone configurations updated');

  // Final summary
  const finalZoneCount = await prisma.zone.count();
  const finalTariffCount = await prisma.tariff.count();
  const zoneTariffCount = await prisma.zoneTariff.count();

  console.log('\n🎉 QATAR ZONES & TARIFFS SEEDING COMPLETED!');
  console.log('\n📊 COMPREHENSIVE QATAR DATA SUMMARY:');
  console.log(`   🗺️ ${finalZoneCount} Total Zones Created`);
  console.log(`   💰 ${finalTariffCount} Total Tariffs Created`);
  console.log(`   🔗 ${zoneTariffCount} Zone-Tariff Mappings`);
  console.log('\n🇶🇦 Qatar taxi platform zones and pricing are now fully configured!');
  console.log('\n📍 MAJOR ZONES INCLUDED:');
  console.log('   • Doha (Downtown, West Bay, Aspire, Pearl, Katara)');
  console.log('   • Lusail City (FIFA World Cup venue)');
  console.log('   • Al Rayyan (Education City, Al Gharafa)');
  console.log('   • Al Wakrah (Coastal areas)');
  console.log('   • Al Khor (Northern city)');
  console.log('   • Hamad International Airport');
  console.log('   • Industrial zones (Mesaieed)');
  console.log('   • Special economic zones');
  console.log('\n💎 TARIFF TYPES:');
  console.log('   • Standard (QAR 10 base + QAR 2/km)');
  console.log('   • Premium (QAR 15 base + QAR 3/km)');
  console.log('   • Luxury (QAR 25 base + QAR 4.5/km)');
  console.log('   • Airport Express (QAR 20 base + fees)');
  console.log('   • Van/Bus (QAR 20 base, 6-8 capacity)');
  console.log('   • Economy (QAR 8 base + QAR 1.5/km)');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding Qatar zones & tariffs:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });