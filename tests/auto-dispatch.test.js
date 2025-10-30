const AutoDispatchService = require('../services/autoDispatchService');

describe('AutoDispatchService', () => {
  let company;
  let passenger;
  let driver;
  let autoDispatch;
  let ioMock;

  const PICKUP_COORDS = {
    latitude: 25.2854,
    longitude: 51.531,
  };

  const makePolygonAround = (lat, lng, delta = 0.01) => ({
    type: 'Polygon',
    coordinates: [[
      [lng - delta, lat - delta],
      [lng - delta, lat + delta],
      [lng + delta, lat + delta],
      [lng + delta, lat - delta],
      [lng - delta, lat - delta],
    ]],
  });

  beforeEach(async () => {
    ioMock = {
      to: jest.fn(() => ({
        emit: jest.fn(),
      })),
    };
    autoDispatch = new AutoDispatchService(ioMock);

    await global.prisma.rideOffer.deleteMany();
    await global.prisma.locationUpdate.deleteMany();
    await global.prisma.shift.deleteMany();
    await global.prisma.vehicle.deleteMany();
    await global.prisma.zone.deleteMany();
    await global.prisma.ride.deleteMany();
    await global.prisma.user.deleteMany();
    await global.prisma.company.deleteMany();

    company = await global.prisma.company.create({
      data: {
        name: 'Autodispatch Co',
        email: 'auto@dispatch.test',
        phone: '+9740000000',
        ownerId: `owner_${Date.now()}`,
        isActive: true,
        autoDispatchEnabled: true,
        maxDispatchRadiusKm: 5,
      },
    });

    passenger = await global.prisma.user.create({
      data: {
        email: 'passenger@dispatch.test',
        password: 'hashed_password',
        firstName: 'Ride',
        lastName: 'Passenger',
        role: 'PASSENGER',
        isActive: true,
      },
    });

    driver = await global.prisma.user.create({
      data: {
        email: 'driver@dispatch.test',
        password: 'hashed_password',
        firstName: 'Auto',
        lastName: 'Driver',
        role: 'DRIVER',
        companyId: company.id,
        isActive: true,
      },
    });

    await global.prisma.vehicle.create({
      data: {
        make: 'Toyota',
        model: 'Camry',
        year: 2022,
        color: 'White',
        licensePlate: `TEST-${Date.now()}`,
        vehicleType: 'SEDAN',
        companyId: company.id,
        driverId: driver.id,
        isActive: true,
        isAvailable: true,
      },
    });

    await global.prisma.shift.create({
      data: {
        driverId: driver.id,
        companyId: company.id,
        status: 'ONLINE',
        startTime: new Date(),
      },
    });

    await global.prisma.locationUpdate.create({
      data: {
        driverId: driver.id,
        latitude: PICKUP_COORDS.latitude,
        longitude: PICKUP_COORDS.longitude,
        speed: 0,
        heading: 0,
        timestamp: new Date(),
      },
    });
  });

  afterAll(async () => {
    await global.prisma.rideOffer.deleteMany();
    await global.prisma.locationUpdate.deleteMany();
    await global.prisma.shift.deleteMany();
    await global.prisma.vehicle.deleteMany();
    await global.prisma.zone.deleteMany();
    await global.prisma.ride.deleteMany();
    await global.prisma.user.deleteMany();
    await global.prisma.company.deleteMany();
  });

  const createRide = async (overrides = {}) => {
    return global.prisma.ride.create({
      data: {
        rideId: `RID-${Date.now()}`,
        passengerId: passenger.id,
        companyId: company.id,
        status: 'REQUESTED',
        pickup: {
          address: 'Souq Waqif, Doha',
          latitude: PICKUP_COORDS.latitude,
          longitude: PICKUP_COORDS.longitude,
        },
        destination: {
          address: 'Doha Corniche',
          latitude: PICKUP_COORDS.latitude + 0.02,
          longitude: PICKUP_COORDS.longitude + 0.02,
        },
        ...overrides,
      },
    });
  };

  test('dispatchRide assigns driver using zone queue when available', async () => {
    await global.prisma.zone.create({
      data: {
        companyId: company.id,
        name: 'Downtown Doha',
        boundaries: makePolygonAround(PICKUP_COORDS.latitude, PICKUP_COORDS.longitude),
        queue: [driver.id],
        isActive: true,
      },
    });

    const ride = await createRide();

    const result = await autoDispatch.dispatchRide(ride.id);

    expect(result.success).toBe(true);
    expect(result.driverId).toBe(driver.id);

    const updatedRide = await global.prisma.ride.findUnique({
      where: { id: ride.id },
      select: { status: true, driverId: true },
    });

    expect(updatedRide?.status).toBe('DRIVER_ASSIGNED');
    expect(updatedRide?.driverId).toBe(driver.id);
  });

  test('dispatchRide falls back to radius search when zone queue empty', async () => {
    await global.prisma.zone.create({
      data: {
        companyId: company.id,
        name: 'Empty Zone',
        boundaries: makePolygonAround(PICKUP_COORDS.latitude, PICKUP_COORDS.longitude),
        queue: [],
        isActive: true,
      },
    });

    const ride = await createRide();

    const result = await autoDispatch.dispatchRide(ride.id);

    expect(result.success).toBe(true);
    expect(result.driverId).toBe(driver.id);

    const updatedRide = await global.prisma.ride.findUnique({
      where: { id: ride.id },
      select: { status: true, driverId: true },
    });

    expect(updatedRide?.status).toBe('DRIVER_ASSIGNED');
    expect(updatedRide?.driverId).toBe(driver.id);
  });
});
