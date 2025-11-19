const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const jobService = require('../services/jobService');
const pricingService = require('../services/pricingService');
const trackingService = require('../services/trackingService');
const prisma = require('../lib/prisma');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  getCompanyStripeClient,
} = require('../services/companyStripeService');

const allowedDispatchRoles = ['DISPATCHER', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'SUPER_ADMIN'];

const JOB_STATUS_VALUES = new Set([
  'UNASSIGNED',
  'PENDING',
  'OFFERED',
  'ASSIGNED',
  'ACCEPTED',
  'ON_THE_WAY',
  'ARRIVED',
  'STARTED',
  'ACTIVE',
  'IN_PROGRESS',
  'REACHED',
  'COMPLETED',
  'FINISHED',
  'CANCELLED',
  'REJECTED',
  'NOSHOW',
  'RECALLED',
  'EXPIRED'
]);

const JOB_STATUS_ALIAS = {
  REQUESTED: 'UNASSIGNED',
  PENDING: 'UNASSIGNED',
  REJECTED: 'REJECTED',
  RECALLED: 'RECALLED',
  RECALL: 'RECALLED',
  NO_SHOW: 'NOSHOW',
  NOSHOW: 'NOSHOW',
  SENDING: 'OFFERED',
  DISPLAYED: 'OFFERED',
  ACCEPTED: 'ASSIGNED',
  ON_THE_WAY: 'ON_THE_WAY',
  ONTHEWAY: 'ON_THE_WAY',
  ARRIVED_READY: 'ARRIVED',
  ACTIVE: 'ACTIVE',
  IN_PROGRESS: 'ACTIVE',
  FINISHED: 'COMPLETED',
  CANCELED: 'CANCELLED'
};

const toNumber = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parseJsonField = (value, fallback = null) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Failed to parse JSON field:', error);
    return fallback;
  }
};

const cloneJson = (value) => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('Failed to clone JSON payload:', error);
    return {};
  }
};

const normalizeDriverQueue = (queue) => {
  if (!Array.isArray(queue)) {
    return [];
  }

  const normalized = [];
  for (const entry of queue) {
    const candidate =
      typeof entry === 'string'
        ? entry
        : entry?.driverId || entry?.id || null;
    if (candidate && !normalized.includes(candidate)) {
      normalized.push(candidate);
    }
  }
  return normalized;
};

const normalizeCoordinate = (coord) => {
  const parsed = parseJsonField(coord, coord);
  if (parsed === null || parsed === undefined) return null;

  const arraySource = Array.isArray(parsed) ? parsed : null;

  let lat = toNumber(
    parsed.lat ??
    parsed.latitude ??
    parsed.latitud ??
    parsed.latLng?.lat ??
    (arraySource ? arraySource[1] : undefined),
    null
  );
  let lng = toNumber(
    parsed.lng ??
    parsed.lon ??
    parsed.longitude ??
    parsed.longitud ??
    parsed.latLng?.lng ??
    parsed.latLng?.lon ??
    (arraySource ? arraySource[0] : undefined),
    null
  );

  if ((lat === null || lng === null) && arraySource && arraySource.length >= 2) {
    const altLat = toNumber(arraySource[0], null);
    const altLng = toNumber(arraySource[1], null);
    if (lat === null) lat = altLat;
    if (lng === null) lng = altLng;
  }

  if (lat === null || lng === null) return null;

  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    [lat, lng] = [lng, lat];
  }

  return { lat, lng };
};

const normalizeCoordinates = (rawCoords, rawGeojson) => {
  const coordsParsed = parseJsonField(rawCoords, []);
  let coordinates = Array.isArray(coordsParsed)
    ? coordsParsed.map(normalizeCoordinate).filter(Boolean)
    : [];

  if (coordinates.length === 0 && rawGeojson) {
    const geojson = parseJsonField(rawGeojson, null);
    if (geojson?.type === 'Polygon' && Array.isArray(geojson.coordinates)) {
      const firstRing = geojson.coordinates[0] || [];
      coordinates = firstRing
        .map((point) => normalizeCoordinate(point))
        .filter(Boolean);
    } else if (geojson?.type === 'MultiPolygon' && Array.isArray(geojson.coordinates)) {
      const firstPolygon = geojson.coordinates[0]?.[0] || [];
      coordinates = firstPolygon
        .map((point) => normalizeCoordinate(point))
        .filter(Boolean);
    }
  }

  return coordinates;
};

const decodePolyline = (encoded = '') => {
  if (typeof encoded !== 'string' || !encoded.length) {
    return [];
  }

  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return coordinates;
};

const normalizeRoutePath = (rawRoute) => {
  const route = parseJsonField(rawRoute, rawRoute);
  const points = [];

  const appendPoint = (candidate) => {
    const normalized = normalizeCoordinate(candidate);
    if (normalized) {
      const last = points[points.length - 1];
      if (!last || last.lat !== normalized.lat || last.lng !== normalized.lng) {
        points.push(normalized);
      }
    }
  };

  const visit = (value) => {
    if (!value) return;

    if (typeof value === 'string') {
      decodePolyline(value).forEach(appendPoint);
      return;
    }

    if (Array.isArray(value)) {
      if (!value.length) return;
      if (typeof value[0] === 'number') {
        appendPoint(value);
        return;
      }
      value.forEach(visit);
      return;
    }

    if (typeof value === 'object') {
      if (value.lat !== undefined || value.latitude !== undefined) {
        appendPoint(value);
        return;
      }

      if (Array.isArray(value.coordinates)) {
        visit(value.coordinates);
        return;
      }

      if (value.geometry) {
        visit(value.geometry);
      }

      if (value.path) {
        visit(value.path);
      }

      if (value.points) {
        visit(value.points);
      }

      if (value.polyline) {
        visit(value.polyline.points ?? value.polyline);
      }

      if (value.overview_polyline) {
        visit(value.overview_polyline.points ?? value.overview_polyline);
      }

      if (Array.isArray(value.routes)) {
        value.routes.forEach(visit);
      }

      if (Array.isArray(value.legs)) {
        value.legs.forEach(visit);
      }

      if (Array.isArray(value.steps)) {
        value.steps.forEach(visit);
      }
    }
  };

  visit(route);
  return points;
};

const parseRideLocation = (rawLocation) => {
  const parsed = parseJsonField(rawLocation, rawLocation);
  if (!parsed) return null;

  const coordinate =
    normalizeCoordinate(parsed.coordinates ?? parsed.location ?? parsed) ||
    null;

  const address =
    parsed.address ??
    parsed.formattedAddress ??
    parsed.formatted_address ??
    parsed.name ??
    parsed.description ??
    parsed.label ??
    (typeof parsed === 'string' ? parsed : null);

  return {
    address: address || null,
    latitude: coordinate ? coordinate.lat : null,
    longitude: coordinate ? coordinate.lng : null,
  };
};

const buildDriverTrail = (locationUpdates = []) => {
  if (!Array.isArray(locationUpdates) || !locationUpdates.length) {
    return [];
  }

  return locationUpdates
    .map((update) => {
      const latitude = toNumber(update.latitude, null);
      const longitude = toNumber(update.longitude, null);
      if (latitude === null || longitude === null) {
        return null;
      }
      return {
        latitude,
        longitude,
        heading: toNumber(update.heading, null),
        timestamp: update.timestamp
          ? new Date(update.timestamp).toISOString()
          : update.createdAt
            ? new Date(update.createdAt).toISOString()
            : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeA - timeB;
    });
};

const buildRoutePath = (job, pickupLocation, dropoffLocation, driverTrail) => {
  const tripRoute = normalizeRoutePath(job?.trip?.route);

  if (driverTrail && driverTrail.length >= 2) {
    return driverTrail.map((point) => ({
      lat: point.latitude,
      lng: point.longitude,
    }));
  }

  if (tripRoute.length >= 2) {
    return tripRoute;
  }

  const fallback = [];
  if (
    pickupLocation &&
    pickupLocation.latitude !== null &&
    pickupLocation.longitude !== null
  ) {
    fallback.push({
      lat: pickupLocation.latitude,
      lng: pickupLocation.longitude,
    });
  }

  if (
    dropoffLocation &&
    dropoffLocation.latitude !== null &&
    dropoffLocation.longitude !== null
  ) {
    fallback.push({
      lat: dropoffLocation.latitude,
      lng: dropoffLocation.longitude,
    });
  }

  return fallback;
};

const dispatchJobInclude = {
  users_jobs_customerIdTousers: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
    },
  },
  users_jobs_assignedDriverIdTousers: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      preferences: true,
      location_updates: {
        orderBy: [
          { timestamp: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 1,
        select: {
          latitude: true,
          longitude: true,
          heading: true,
          timestamp: true,
          createdAt: true,
        },
      },
    },
  },
  offers: {
    where: { status: 'SENT' },
    select: {
      id: true,
      driverId: true,
      status: true,
    },
  },
  assignments: {
    select: {
      id: true,
      driverId: true,
      status: true,
      assignedAt: true,
    },
  },
  rides: {
    select: {
      id: true,
      pickup: true,
      destination: true,
      route: true,
    },
  },
  location_updates: {
    orderBy: [
      { timestamp: 'desc' },
      { createdAt: 'desc' },
    ],
    take: 60,
  },
};

const normalizeRequirementTimeline = (timeline) => {
  if (!timeline) return [];

  const toArray = (items) =>
    items
      .map((item) => {
        const status = item?.status ?? item?.STATUS ?? item?.Status;
        const timestamp = item?.timestamp ?? item?.at ?? item?.time ?? item?.TIMESTAMP;
        if (!status || !timestamp) {
          return null;
        }
        const parsed = new Date(timestamp);
        if (Number.isNaN(parsed.getTime())) {
          return null;
        }
        return {
          status: String(status).toUpperCase(),
          timestamp: parsed.toISOString(),
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

  if (Array.isArray(timeline)) {
    return toArray(timeline);
  }

  if (typeof timeline === 'object') {
    return toArray(
      Object.entries(timeline).map(([status, timestamp]) => ({
        status,
        timestamp,
      }))
    );
  }

  if (typeof timeline === 'string') {
    try {
      const parsed = JSON.parse(timeline);
      if (Array.isArray(parsed)) {
        return toArray(parsed);
      }
      if (parsed && typeof parsed === 'object') {
        return toArray(
          Object.entries(parsed).map(([status, timestamp]) => ({
            status,
            timestamp,
          }))
        );
      }
    } catch (error) {
      console.warn('Failed to parse requirements.statusTimeline:', error);
    }
  }

  return [];
};

// Helper function to build status timeline with timestamps and durations
const buildStatusTimeline = (job, requirements) => {
  const timeline = [];
  const normalizedTimeline = normalizeRequirementTimeline(
    requirements.statusTimeline
  );

  // If we have statusTimeline in requirements, use it
  if (normalizedTimeline.length > 0) {
    for (let i = 0; i < normalizedTimeline.length; i++) {
      const current = normalizedTimeline[i];
      const next = normalizedTimeline[i + 1];

      const timestamp = new Date(current.timestamp);
      const nextTimestamp = next ? new Date(next.timestamp) : null;

      let duration = null;
      if (nextTimestamp && !Number.isNaN(nextTimestamp.getTime())) {
        const durationMs = nextTimestamp - timestamp;
        const durationSeconds = Math.floor(durationMs / 1000);
        const minutes = Math.floor(durationSeconds / 60);
        const seconds = durationSeconds % 60;
        duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      }

      timeline.push({
        status: current.status,
        timestamp: timestamp.toISOString(),
        duration: duration,
        isLast: i === normalizedTimeline.length - 1,
      });
    }
  } else {
    // Build basic timeline from job timestamps
    const baseTimeline = [
      { status: 'CREATED', timestamp: job.createdAt, field: 'createdAt' },
      { status: 'ASSIGNED', timestamp: job.assignedAt, field: 'assignedAt' },
      { status: 'ACCEPTED', timestamp: job.acceptedAt, field: 'acceptedAt' },
      { status: 'STARTED', timestamp: job.startedAt, field: 'startedAt' },
      { status: 'COMPLETED', timestamp: job.completedAt, field: 'completedAt' },
    ];
    
    const validEntries = baseTimeline.filter(entry => entry.timestamp);
    
    for (let i = 0; i < validEntries.length; i++) {
      const current = validEntries[i];
      const next = validEntries[i + 1];
      
      const timestamp = new Date(current.timestamp);
      const nextTimestamp = next ? new Date(next.timestamp) : null;
      
      let duration = null;
      if (nextTimestamp) {
        const durationMs = nextTimestamp - timestamp;
        const durationSeconds = Math.floor(durationMs / 1000);
        const minutes = Math.floor(durationSeconds / 60);
        const seconds = durationSeconds % 60;
        duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      }
      
      timeline.push({
        status: current.status,
        timestamp: timestamp.toISOString(),
        duration: duration,
        isLast: i === validEntries.length - 1
      });
    }
  }
  
  return timeline;
};

const formatJobForDispatch = (job) => {
  const rawLocationUpdates = job.locationUpdates || job.location_updates || [];
  const rawTrip = job.trip || job.rides || null;
  const rawCustomer = job.customer || job.users_jobs_customerIdTousers || null;
  const rawAssignedDriver =
    job.assignedDriver || job.users_jobs_assignedDriverIdTousers || null;

  const locationUpdates = rawLocationUpdates;
  const trip = rawTrip;

  const customer = rawCustomer
    ? {
        id: rawCustomer.id,
        firstName: rawCustomer.firstName,
        lastName: rawCustomer.lastName,
        phone: rawCustomer.phone,
        email: rawCustomer.email,
      }
    : null;

  const assignedDriver = rawAssignedDriver
    ? {
        id: rawAssignedDriver.id,
        firstName: rawAssignedDriver.firstName,
        lastName: rawAssignedDriver.lastName,
        phone: rawAssignedDriver.phone,
        email: rawAssignedDriver.email,
        preferences: rawAssignedDriver.preferences,
        locationUpdates:
          rawAssignedDriver.locationUpdates ||
          rawAssignedDriver.location_updates ||
          [],
      }
    : null;
  const requirements = parseJsonField(job.requirements, {}) || {};

  // Extract walk-in job metadata
  const isWalkIn = requirements.isWalkIn === true;
  const createdBy = requirements.createdBy || null;

  const tripPickup = parseRideLocation(trip?.pickup);
  const tripDropoff = parseRideLocation(trip?.destination);

  const pickupLatitude = toNumber(job.pickupLatitude, tripPickup?.latitude);
  const pickupLongitude = toNumber(job.pickupLongitude, tripPickup?.longitude);
  const dropoffLatitude = toNumber(
    job.dropoffLatitude,
    tripDropoff?.latitude
  );
  const dropoffLongitude = toNumber(
    job.dropoffLongitude,
    tripDropoff?.longitude
  );

  const pickupAddress = job.pickupAddress ?? tripPickup?.address ?? null;
  const dropoffAddress = job.dropoffAddress ?? tripDropoff?.address ?? null;

  const pickupLocation = {
    address: pickupAddress,
    latitude: pickupLatitude,
    longitude: pickupLongitude,
  };

  const dropoffLocation = {
    address: dropoffAddress,
    latitude: dropoffLatitude,
    longitude: dropoffLongitude,
  };

  const driverTrail = buildDriverTrail(locationUpdates);
  const routePath = buildRoutePath(
    job,
    pickupLocation,
    dropoffLocation,
    driverTrail
  );

  // Build status timeline with durations
  const statusTimeline = buildStatusTimeline(job, requirements);

  // Extract ride metrics from requirements
  const rideMetrics = {
    estimatedDistance: job.estimatedDistance ?? requirements.estimatedDistance ?? null,
    estimatedDuration: job.estimatedDuration ?? requirements.estimatedDuration ?? null,
    actualDistance: job.actualDistanceKm ?? requirements.actualDistance ?? null,
    actualDuration: job.actualDurationSeconds ?? requirements.actualDuration ?? null,
    estimatedPrice: job.estimatedPrice ?? requirements.estimatedPrice ?? null,
    actualFare: job.actualFare ?? requirements.actualFare ?? null,
    finalAmount: job.finalAmount ?? requirements.finalAmount ?? null,
  };

  const formattedJob = {
    ...job,
    pickupAddress,
    dropoffAddress,
    pickupLatitude,
    pickupLongitude,
    dropoffLatitude,
    dropoffLongitude,
    pickupLocation,
    dropoffLocation,
    driverTrail,
    routePath,
    notes: job.notes ?? requirements.notes ?? null,
    tariffId: requirements.tariffId ?? null,
    paymentIntentId: requirements.stripePaymentIntentId ?? null,
    currency: requirements.currency ?? trip?.currency ?? null,
    fareBreakdown: requirements.fareBreakdown ?? null,
    // 🚨 Real-time ride metrics
    rideMetrics: rideMetrics,
    // 🚨 Status timeline with durations
    statusTimeline: statusTimeline,
    // 🚨 CRITICAL FIX: Add requirements fields to top level for edit form
    passengers: requirements.passengers ?? 1,
    bags: requirements.bags ?? 0,
    wheelchairs: requirements.wheelchairs ?? 0,
    vehiclesNeeded: requirements.vehiclesNeeded ?? 1,
    // Add requirement object for comprehensive access
    requirements: requirements,
    // Add passenger contact info from requirements AND customer
    riderName: requirements.passengerName ?? null,
    riderPhone: requirements.passengerPhone ?? null,
    riderEmail: requirements.passengerEmail ?? customer?.email ?? null,
    // Walk-in job metadata
    isWalkIn: isWalkIn,
    createdBy: createdBy,
    createdByDriver: isWalkIn && createdBy && createdBy === job.assignedDriverId ? assignedDriver : null,
  };

  if (customer) {
    formattedJob.customer = {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      email: customer.email, // 🚨 ADD EMAIL TO CUSTOMER OBJECT
    };
  }

  if (assignedDriver) {
    const lastTrailPoint = driverTrail[driverTrail.length - 1];
    const latestDriverLocation =
      assignedDriver.locationUpdates && assignedDriver.locationUpdates.length
        ? assignedDriver.locationUpdates[0]
        : null;
    const driverPrefs = cloneJson(assignedDriver.preferences);
    const fallbackLocation = driverPrefs.lastLocation || {};

    const driverLatitude = toNumber(
      latestDriverLocation?.latitude,
      fallbackLocation.latitude
    );
    const driverLongitude = toNumber(
      latestDriverLocation?.longitude,
      fallbackLocation.longitude
    );
    const driverHeading =
      toNumber(latestDriverLocation?.heading, fallbackLocation.heading) ??
      null;
    const driverUpdatedAt =
      latestDriverLocation?.timestamp ??
      latestDriverLocation?.createdAt ??
      (fallbackLocation.timestamp
        ? new Date(fallbackLocation.timestamp)
        : null);

    formattedJob.assignedDriver = {
      id: assignedDriver.id,
      firstName: assignedDriver.firstName,
      lastName: assignedDriver.lastName,
      phone: assignedDriver.phone,
      email: assignedDriver.email,
      currentLatitude:
        driverLatitude ??
        (lastTrailPoint ? lastTrailPoint.latitude : null),
      currentLongitude:
        driverLongitude ??
        (lastTrailPoint ? lastTrailPoint.longitude : null),
      heading: driverHeading,
      updatedAt: driverUpdatedAt
        ? new Date(driverUpdatedAt).toISOString()
        : null,
    };
  }

  if (trip) {
    formattedJob.trip = {
      id: trip.id,
      pickup: trip.pickup,
      destination: trip.destination,
      route: trip.route,
    };
  }

  delete formattedJob.locationUpdates;
  delete formattedJob.location_updates;

  return formattedJob;
};

const formatZoneForDispatch = (zone) => {
  const boundaries = parseJsonField(zone.boundaries, zone.boundaries) || {};
  const geometryType = (zone.geometryType || boundaries.geometryType || 'POLYGON').toUpperCase();
  const polygonGeojson = zone.polygonGeojson || boundaries.polygonGeojson;

  const coordinates = normalizeCoordinates(zone.coordinates ?? boundaries.coordinates, polygonGeojson);
  const centerPoint = normalizeCoordinate(zone.centerPoint ?? boundaries.centerPoint) ||
    (coordinates.length
      ? {
        lat: coordinates.reduce((sum, point) => sum + point.lat, 0) / coordinates.length,
        lng: coordinates.reduce((sum, point) => sum + point.lng, 0) / coordinates.length,
      }
      : null);

  const boundsRaw = parseJsonField(zone.bounds ?? boundaries.bounds, null);
  const bounds = boundsRaw
    ? {
      north: toNumber(boundsRaw.north, null),
      south: toNumber(boundsRaw.south, null),
      east: toNumber(boundsRaw.east, null),
      west: toNumber(boundsRaw.west, null),
    }
    : null;

  const radius =
    zone.radius !== undefined && zone.radius !== null
      ? toNumber(zone.radius, null)
      : toNumber(boundaries.radius, null);

  const color = boundaries.color || zone.color || '#4F46E5';

  const zoneTariffs = (zone.zone_tariffs || zone.zoneTariffs || []).map((zt) => ({
    id: zt.id,
    tariffId: zt.tariffId,
    zoneId: zt.zoneId,
    priority: zt.priority,
    isDefault: zt.isDefault,
    tariff: zt.tariff || zt.tariffs
      ? {
        id: (zt.tariff || zt.tariffs).id,
        name: (zt.tariff || zt.tariffs).name,
        baseFare: Number((zt.tariff || zt.tariffs).baseFare ?? 0),
        perKmRate: Number((zt.tariff || zt.tariffs).perKmRate ?? 0),
        perMinuteRate: Number((zt.tariff || zt.tariffs).perMinuteRate ?? 0),
        minimumFare: Number((zt.tariff || zt.tariffs).minimumFare ?? 0),
        isActive: (zt.tariff || zt.tariffs).isActive,
      }
      : null,
  }));

  return {
    id: zone.id,
    name: zone.name,
    description: zone.description,
    status: zone.isActive ? 'ACTIVE' : 'INACTIVE',
    geometryType,
    coordinates,
    polygonGeojson,
    centerPoint,
    bounds,
    radius,
    color,
    surgeMultiplier: toNumber(zone.surgeMultiplier, 1),
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
    zoneTariffs,
  };
};

const mapJobStatusToCounter = (normalizedStatus) => {
  switch (normalizedStatus) {
    case 'UNASSIGNED':
    case 'PENDING':
    case 'REQUESTED':
    case 'REJECTED':
    case 'RECALL':
    case 'RECALLED':
      return 'unassigned';
    case 'OFFERED':
    case 'SENDING':
    case 'DISPLAYED':
      return 'offered';
    case 'ASSIGNED':
    case 'ACCEPTED':
    case 'ON_THE_WAY':
    case 'ARRIVED':
    case 'ARRIVED_READY':
      return 'assigned';
    case 'STARTED':
    case 'ACTIVE':
    case 'IN_PROGRESS':
    case 'REACHED':
      return 'active';
    case 'COMPLETED':
    case 'FINISHED':
      return 'finished';
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled';
    default:
      return 'unassigned';
  }
};

const recallJobToQueue = async ({
  jobId,
  actorId,
  reason,
  dispatchNamespace,
  driverNamespace,
}) => {
  const timestamp = new Date();
  const recallReason = reason || 'Job recalled';

  const jobRecord = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      users_jobs_customerIdTousers: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
    },
  });

  if (!jobRecord) {
    throw new Error('Job not found');
  }

  const updatedJob = await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'UNASSIGNED',
      assignedDriverId: null,
      updatedAt: timestamp,
    },
    include: {
      users_jobs_customerIdTousers: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
    },
  });

  await prisma.assignments.updateMany({
    where: {
      jobId,
      ...(jobRecord.assignedDriverId ? { driverId: jobRecord.assignedDriverId } : {}),
    },
    data: {
      status: 'RECALLED',
      rejectionReason: 'RECALLED',
      rejectedAt: timestamp,
      updatedAt: timestamp,
    },
  });

  if (jobRecord.assignedDriverId) {
    await prisma.user.update({
      where: { id: jobRecord.assignedDriverId },
      data: {
        preferences: {
          driverStatus: 'AVAILABLE',
          lastStatusChange: timestamp.toISOString(),
        },
      },
    });
  }

  const dispatchPayload = {
    jobId: jobRecord.jobId || jobRecord.id,
    internalJobId: jobRecord.id,
    driverId: jobRecord.assignedDriverId,
    status: 'UNASSIGNED',
    progressStatus: 'RECALLED',
    reason: recallReason,
    timestamp: timestamp.toISOString(),
    companyId: jobRecord.companyId,
  };

  const jobPlain = JSON.parse(JSON.stringify(updatedJob));
  const jobPayload = {
    job: {
      ...jobPlain,
      progressStatus: 'RECALLED',
      fullRawData: jobPlain,
    },
  };

  const driverStatusPayload = jobRecord.assignedDriverId
    ? {
        driverId: jobRecord.assignedDriverId,
        status: 'AVAILABLE',
        timestamp: timestamp.toISOString(),
      }
    : null;

  const dispatchRooms = [
    `dispatch_${jobRecord.companyId}`,
    `company_${jobRecord.companyId}`,
    'super_admin',
  ];

  dispatchRooms.forEach((room) => {
    dispatchNamespace?.to(room).emit('job:recalled', dispatchPayload);
    dispatchNamespace?.to(room).emit('job:progress:updated', dispatchPayload);
    dispatchNamespace?.to(room).emit('job:updated', jobPayload);
    dispatchNamespace?.to(room).emit('job:data:updated', jobPayload);
    if (driverStatusPayload) {
      dispatchNamespace?.to(room).emit('driver:status:updated', driverStatusPayload);
    }
  });

  if (driverNamespace && jobRecord.assignedDriverId) {
    driverNamespace.to(`driver_${jobRecord.assignedDriverId}`).emit('job:recalled', dispatchPayload);
  }

  const normalizedJob = {
    ...updatedJob,
    customer: updatedJob.users_jobs_customerIdTousers ?? null,
  };
  delete normalizedJob.users_jobs_customerIdTousers;

  console.log(`↩️ Job ${jobId} recalled by ${actorId} - returned to UNASSIGNED`);
  return normalizedJob;
};

// ═══════════════════════════════════════════════════════════
// Dispatch Support Endpoints
// ═══════════════════════════════════════════════════════════

router.get(
  '/map-settings',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  async (req, res) => {
    try {
      const { companyId } = req.user;

      let settings = await prisma.company_settings.findUnique({
        where: { companyId },
      });

      if (!settings) {
        settings = await prisma.company_settings.create({
          data: {
            companyId,
            mapProvider: 'OPENSTREETMAP',
            placeApiProvider: 'OPENSTREETMAP',
            defaultLanguage: 'en',
            defaultCurrency: 'USD',
            timezone: 'UTC',
          },
        });
      }

      res.json({
        success: true,
        data: {
          mapProvider: settings.mapProvider || 'OPENSTREETMAP',
          placeApiProvider: settings.placeApiProvider || 'OPENSTREETMAP',
          defaultLanguage: settings.defaultLanguage || 'en',
          defaultCurrency: settings.defaultCurrency || 'USD',
          defaultTimezone: settings.timezone || 'UTC',
          updatedAt: settings.updatedAt,
        },
      });
    } catch (error) {
      console.error('Dispatch map settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load map settings',
        error: error.message,
      });
    }
  }
);

const getDispatchDriversHandler = async (req, res) => {
  try {
    const { latitude, longitude, radius = 5, companyId: companyIdQuery } = req.query;
    const companyId = req.user.companyId ?? companyIdQuery;
    console.log('✅ Dispatch get drivers - companyId:', companyId);
    const companyFilter = companyId ? { companyId: String(companyId) } : {};

    const [drivers, zones] = await Promise.all([
      prisma.user.findMany({
        where: {
          role: 'DRIVER',
          ...companyFilter,
          isActive: true,
          OR: [
            {
              // Only include drivers with preferences that have driverStatus not set to OFFLINE
              preferences: {
                path: ['driverStatus'],
                not: 'OFFLINE',
              },
            },
            {
              // Include drivers where preferences don't have driverStatus field at all
              preferences: {
                path: ['driverStatus'],
                equals: null,
              },
            },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          preferences: true,
          rating: true,
          updatedAt: true,
          shifts: {
            where: { endTime: null },
            orderBy: { startTime: 'desc' },
            take: 1,
            select: { status: true },
          },
          assignments: {
            where: {
              status: {
                in: ['ASSIGNED', 'ACCEPTED'],
              },
            },
            orderBy: { assignedAt: 'desc' },
            take: 1,
            select: { jobId: true },
          },
          location_updates: {
            orderBy: [{ timestamp: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: {
              latitude: true,
              longitude: true,
              heading: true,
              speed: true,
              timestamp: true,
              createdAt: true,
            },
          },
        },
        take: 150,
      }),
      prisma.zones.findMany({
        where: {
          isActive: true,
          ...companyFilter,
        },
        select: {
          id: true,
          name: true,
          queue: true,
        },
      }),
    ]);

    const zoneMap = new Map(
      zones.map((zone) => [zone.id, { name: zone.name, queue: normalizeDriverQueue(zone.queue) }])
    );

    const normalizeStatus = (rawStatus) => {
      const status = String(rawStatus || '')
        .toLowerCase()
        .trim();
      switch (status) {
        case 'online':
        case 'available':
          return 'available';
        case 'busy':
          return 'busy';
        case 'break':
        case 'away':
          return 'away';
        default:
          return 'offline';
      }
    };

    const deriveRating = (ratingSource) => {
      if (!ratingSource) {
        return null;
      }
      if (typeof ratingSource === 'object') {
        const candidate =
          ratingSource.average ??
          ratingSource.score ??
          ratingSource.value ??
          ratingSource.total ??
          ratingSource.overall;
        const numeric = Number(candidate);
        return Number.isFinite(numeric) ? numeric : null;
      }
      const numeric = Number(ratingSource);
      return Number.isFinite(numeric) ? numeric : null;
    };

    let responseDrivers = drivers.map((driver) => {
      console.log(`BROTHERRRRR ${JSON.stringify(driver)}`);
      const preferences = cloneJson(driver.preferences);
      const dispatchMeta =
        preferences.dispatch && typeof preferences.dispatch === 'object'
          ? preferences.dispatch
          : {};

      const latestShift = driver.shifts[0] || null;
      const activeAssignment = driver.assignments[0] || null;
      const latestLocation =
        (driver.locationUpdates && driver.locationUpdates[0]) ||
        (driver.location_updates && driver.location_updates[0]) ||
        null;

      // ✅ FIXED: Check preferences.driverStatus first, then dispatch.status, then shift.status

      console.log(`🚗 Driver ${driver.id} preferences driverStatus:`, preferences.driverStatus);
      let statusHint = preferences.driverStatus || dispatchMeta.status || null;
      if (!statusHint && latestShift?.status) {
        statusHint = latestShift?.status;
      } 
      console.log('MALIKKING', activeAssignment);
      if (activeAssignment) {
        statusHint = 'BUSY';
      }
        console.log(`🚗 Driver ${driver.id} status hint:`, statusHint);
      const normalizedStatus = normalizeStatus(statusHint);
       console.log(`🚗 Driver ${driver.id} status hintxxx:`, normalizedStatus);
      const currentZone = dispatchMeta.currentZone || null;
      const zoneInfo = currentZone?.id ? zoneMap.get(currentZone.id) : null;
      const zoneQueue = zoneInfo?.queue || [];
      const queueIndex = currentZone?.id ? zoneQueue.indexOf(driver.id) : -1;
      const queuePosition = queueIndex >= 0 ? queueIndex + 1 : null;

      const latitudeValue =
        latestLocation?.latitude ??
        dispatchMeta.lastLocation?.latitude ??
        null;
      const longitudeValue =
        latestLocation?.longitude ??
        dispatchMeta.lastLocation?.longitude ??
        null;

      const lastUpdated =
        latestLocation?.timestamp ??
        latestLocation?.createdAt ??
        (dispatchMeta.lastLocation?.timestamp
          ? new Date(dispatchMeta.lastLocation.timestamp)
          : null) ??
        driver.updatedAt;

      const ratingValue = deriveRating(driver.rating);

      const driverInfo = {
        id: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        phone: driver.phone,
        email: driver.email,
        driverStatus: normalizedStatus,
        currentLatitude: latitudeValue,
        currentLongitude: longitudeValue,
        heading: latestLocation?.heading ?? dispatchMeta.lastLocation?.heading ?? null,
        speed: latestLocation?.speed ?? dispatchMeta.lastLocation?.speed ?? null,
        updatedAt: lastUpdated?.toISOString?.() || new Date(lastUpdated).toISOString(),
        currentZone: currentZone
          ? {
            id: currentZone.id,
            name: currentZone.name || zoneInfo?.name || null,
            queuePosition,
          }
          : null,
      };

      return {
        id: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        phone: driver.phone,
        email: driver.email,
        status: normalizedStatus.toUpperCase(),
        driverInfo,
        currentLatitude: latitudeValue,
        currentLongitude: longitudeValue,
        heading: driverInfo.heading,
        updatedAt: driverInfo.updatedAt,
        currentZoneId: currentZone?.id || null,
        currentZoneName: currentZone?.name || zoneInfo?.name || null,
        queuePosition,
        rating: ratingValue,
        currentJobId: activeAssignment?.jobId || null,
      };
    });

    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      responseDrivers = responseDrivers
        .map((driver) => {
          if (
            driver.currentLatitude === null ||
            driver.currentLatitude === undefined ||
            driver.currentLongitude === null ||
            driver.currentLongitude === undefined
          ) {
            return { ...driver, distance: null };
          }

          const dLat = ((driver.currentLatitude - lat) * Math.PI) / 180;
          const dLng = ((driver.currentLongitude - lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat * Math.PI) / 180) *
            Math.cos((driver.currentLatitude * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance = 6371 * c;

          return { ...driver, distance };
        })
        .filter(
          (driver) =>
            radius === undefined ||
            radius === null ||
            driver.distance === null ||
            driver.distance <= parseFloat(radius)
        )
        .sort((a, b) => {
          if (a.distance === null && b.distance === null) return 0;
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        });
    }

    res.json({
      success: true,
      data: responseDrivers,
    });
  } catch (error) {
    console.error('Error fetching dispatch drivers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch drivers',
      error: error.message,
    });
  }
};

router.get(
  '/drivers',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  getDispatchDriversHandler
);
router.get(
  '/dispatch/drivers',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  getDispatchDriversHandler
);

const getDispatchJobsHandler = async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const companyId = req.user.companyId;

    let statusFilter;
    if (status) {
      const statuses = String(status)
        .split(',')
        .map((s) => s.replace(/-/g, '_').trim().toUpperCase())
        .filter(Boolean)
        .filter((s) => JOB_STATUS_VALUES.has(s));  // Don't use alias for DB filter

      if (statuses.length) {
        statusFilter = { in: Array.from(new Set(statuses)) };
      }
    }

    if (!statusFilter) {
      statusFilter = {
        in: [
          'UNASSIGNED',
          'PENDING',
          'REJECTED',
          'RECALLED',
          'NOSHOW',
          'OFFERED',
          'ASSIGNED',
          'ACCEPTED',
          'ON_THE_WAY',
          'ARRIVED',
          'STARTED',
          'ACTIVE',
          'IN_PROGRESS',
          'REACHED',
        ],
      };
    }

    // For COMPLETED and CANCELLED jobs, only show today's jobs
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const whereClause = {
      companyId,
      ...(statusFilter ? { status: statusFilter } : {}),
    };

    // If filtering for COMPLETED or CANCELLED, add date filter
    const requestedStatuses = statusFilter?.in || [];
    const hasCompletedOrCancelled = requestedStatuses.some(s => 
      s === 'COMPLETED' || s === 'CANCELLED'
    );

    if (hasCompletedOrCancelled) {
      // Only apply date filter for COMPLETED/CANCELLED
      // Use updatedAt since CANCELLED jobs don't have cancelledAt field
      whereClause.OR = [
        // COMPLETED jobs from today only (based on completedAt timestamp)
        {
          status: 'COMPLETED',
          completedAt: { gte: todayStart }
        },
        // CANCELLED jobs from today only (based on updatedAt since no cancelledAt exists)
        {
          status: 'CANCELLED',
          updatedAt: { gte: todayStart }
        },
        // All other statuses (no date restriction)
        {
          status: { 
            notIn: ['COMPLETED', 'CANCELLED'] 
          }
        }
      ];
      delete whereClause.status; // Remove the status filter since we're using OR
    }

    const jobs = await prisma.job.findMany({
      where: whereClause,
      include: dispatchJobInclude,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
    });

    const formattedJobs = jobs.map(formatJobForDispatch);

    res.json({
      success: true,
      data: formattedJobs,
    });
  } catch (error) {
    console.error('Error getting dispatch jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch jobs',
      error: error.message,
    });
  }
};

router.get(
  '/jobs',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  getDispatchJobsHandler
);
router.get(
  '/dispatch/jobs',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  getDispatchJobsHandler
);

router.get(
  '/jobs/counters',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  async (req, res) => {
    try {
      const companyId = req.user.companyId;

      // Get start of today for filtering completed/cancelled jobs
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Get all jobs grouped by status
      const grouped = await prisma.job.groupBy({
        by: ['status'],
        where: { companyId },
        _count: { status: true },
      });

      // Get today's completed and cancelled jobs count
      // Note: Using updatedAt for cancelled jobs since there's no cancelledAt field in the schema
      const [todayCompleted, todayCancelled] = await Promise.all([
        prisma.job.count({
          where: {
            companyId,
            status: 'COMPLETED',
            completedAt: { gte: todayStart }
          }
        }),
        prisma.job.count({
          where: {
            companyId,
            status: 'CANCELLED',
            updatedAt: { gte: todayStart }
          }
        })
      ]);

      const counters = {
        unassigned: 0,
        offered: 0,
        assigned: 0,
        active: 0,
        finished: 0,
        cancelled: 0,
        noShow: 0,
      };

      // Process all statuses except COMPLETED and CANCELLED
      grouped.forEach(({ status, _count }) => {
        const count = _count?.status || 0;
        if (!count) {
          return;
        }

        const normalized = String(status || '').toUpperCase();

        // Skip COMPLETED and CANCELLED - will use today's count instead
        if (normalized === 'COMPLETED' || normalized === 'CANCELLED') {
          return;
        }

        if (normalized === 'NOSHOW' || normalized === 'NO_SHOW') {
          counters.noShow += count;
          counters.unassigned += count;
          return;
        }

        if (normalized === 'RECALL' || normalized === 'RECALLED') {
          counters.unassigned += count;
          return;
        }

        const key = mapJobStatusToCounter(normalized);
        counters[key] = (counters[key] || 0) + count;
      });

      // Add today's COMPLETED and CANCELLED counts
      counters.finished = todayCompleted;
      counters.cancelled = todayCancelled;

      res.json({
        success: true,
        data: counters,
      });
    } catch (error) {
      console.error('Error getting job counters:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch job counters',
        error: error.message,
      });
    }
  }
);

router.get(
  '/zones',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  async (req, res) => {
    try {
      const companyId = req.user.companyId;

      const zones = await prisma.zones.findMany({
        where: { companyId },
        include: {
          zone_tariffs: {
            include: {
              tariffs: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        success: true,
        data: zones.map(formatZoneForDispatch),
      });
    } catch (error) {
      console.error('Error fetching dispatch zones:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch zones',
        error: error.message,
      });
    }
  }
);

router.get(
  '/tariffs',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  async (req, res) => {
    try {
      const companyId = req.user.companyId;

      const tariffs = await prisma.tariffs.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        success: true,
        data: tariffs.map((tariff) => ({
          ...tariff,
          baseFare: Number(tariff.baseFare ?? 0),
          perKmRate: Number(tariff.perKmRate ?? 0),
          perMinuteRate: Number(tariff.perMinuteRate ?? 0),
          minimumFare: Number(tariff.minimumFare ?? 0),
          waitingFee: Number(tariff.waitingFee ?? 0),
          airportFee: Number(tariff.airportFee ?? 0),
          tollFee: Number(tariff.tollFee ?? 0),
        })),
      });
    } catch (error) {
      console.error('Error fetching tariffs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tariffs',
        error: error.message,
      });
    }
  }
);

router.get(
  '/vehicle-types',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  async (req, res) => {
    try {
      const vehicleTypes = await prisma.vehicle_types.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });

      res.json({
        success: true,
        data: vehicleTypes.map((type) => ({
          id: type.id,
          name: type.name,
          code: type.code,
          description: type.description,
          capacity: type.capacity,
          icon: type.icon,
          isActive: type.isActive,
        })),
      });
    } catch (error) {
      console.error('Error fetching vehicle types:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vehicle types',
        error: error.message,
      });
    }
  }
);

// Create a new job (taxi/delivery/courier)
router.post('/jobs', authenticateToken, authorizeRoles(...allowedDispatchRoles), async (req, res) => {
  try {
    const {
      type, // TAXI, DELIVERY, COURIER
      customerId,
      passengerName,
      passengerPhone,
      phone,
      passengerEmail,
      email,
      pickupAddress,
      pickupLatitude,
      pickupLongitude,
      dropoffAddress,
      dropoffLatitude,
      dropoffLongitude,
      vehicleType,
      scheduledTime,
      specialRequests,
      paymentMethod,
      // Delivery specific fields
      recipientName,
      recipientPhone,
      packageDescription,
      merchantId,
      pickup,
      destination,
      tariffId,
      fareBreakdown,
      estimatedDistance,
      estimatedDuration,
      estimatedFare,
      driverAssignment,
      driverId,
      instructions,
      notes,
      validationCode,
      requirements,
      paymentIntentId,
    } = req.body;

    const resolvedCompanyIdRaw =
      req.user.companyId ??
      req.body.companyId ??
      req.query.companyId ??
      req.params.companyId;
    const resolvedCompanyId = resolvedCompanyIdRaw
      ? String(resolvedCompanyIdRaw)
      : null;

    if (!resolvedCompanyId) {
      return res.status(400).json({
        success: false,
        error: 'Company context is required to create a dispatch job',
      });
    }

    const jobType =
      typeof type === 'string' && type.length
        ? String(type).toUpperCase()
        : 'TAXI';

    const resolvedPickup = {
      address: pickupAddress || pickup?.address || pickup?.name,
      lat: toNumber(pickupLatitude, pickup?.lat ?? pickup?.latitude),
      lng: toNumber(pickupLongitude, pickup?.lng ?? pickup?.longitude),
    };

    const resolvedDropoff = {
      address: dropoffAddress || destination?.address || destination?.name,
      lat: toNumber(dropoffLatitude, destination?.lat ?? destination?.latitude),
      lng: toNumber(dropoffLongitude, destination?.lng ?? destination?.longitude),
    };

    if ([resolvedPickup.lat, resolvedPickup.lng, resolvedDropoff.lat, resolvedDropoff.lng].some(value => value === null || Number.isNaN(value))) {
      throw new Error('Invalid pickup or dropoff coordinates');
    }

    const normalizedPaymentMethod = (paymentMethod || 'CARD')
      .toString()
      .toUpperCase();

    console.log('🕐 [CREATE JOB] Scheduling parameters:', {
      scheduledTime,
      scheduledTimeType: typeof scheduledTime,
      scheduledFor: req.body.scheduledFor,
      scheduledForType: typeof req.body.scheduledFor,
      willSetScheduledAt: !!scheduledTime
    });

    let verifiedPaymentIntentId = null;
    if (normalizedPaymentMethod === 'CARD') {
      if (!paymentIntentId) {
        throw new Error('Payment intent is required for card payments');
      }
      const { stripe } = await getCompanyStripeClient(req.user.companyId);
      if (!stripe) {
        throw new Error('Stripe is not configured for this company');
      }
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );
      if (
        !['succeeded', 'requires_capture'].includes(paymentIntent.status)
      ) {
        throw new Error(
          `Payment intent not ready for job creation (status: ${paymentIntent.status})`
        );
      }
      verifiedPaymentIntentId = paymentIntent.id;
    }

    // Get price estimate
    const priceEstimate = await pricingService.calculatePrice({
      companyId: resolvedCompanyId,
      vehicleType: vehicleType || 'SEDAN',
      pickupLatitude: resolvedPickup.lat,
      pickupLongitude: resolvedPickup.lng,
      dropoffLatitude: resolvedDropoff.lat,
      dropoffLongitude: resolvedDropoff.lng,
      scheduledTime,
      jobType: jobType,
    });

    const normalizedPhone = (passengerPhone || phone || '').toString().trim() || null;
    const normalizedEmail = (passengerEmail || email || '').toString().trim() || null;
    let resolvedCustomerId = customerId || null;

    if (!resolvedCustomerId && normalizedPhone) {
      const existingCustomer = await prisma.user.findFirst({
        where: { phone: normalizedPhone },
        select: { id: true },
      });
      if (existingCustomer) {
        resolvedCustomerId = existingCustomer.id;
      }
    }

    if (!resolvedCustomerId) {
      const nameSource = (passengerName || '').trim();
      const nameParts = nameSource.split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] || 'Guest';
      const lastName = nameParts.slice(1).join(' ') || 'Passenger';
      const password = bcrypt.hashSync(
        `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        10
      );

      const fallbackEmail =
        normalizedEmail ||
        `guest-${Date.now()}-${Math.random().toString(36).slice(2)}@dispatch.local`;

      const createdPassenger = await prisma.user.create({
        data: {
          id: randomUUID(),
          firstName,
          lastName,
          email: fallbackEmail,
          phone: normalizedPhone || undefined,
          password,
          role: 'PASSENGER',
          isActive: true,
          isVerified: false,
          companyId: resolvedCompanyId,
          updatedAt: new Date(),
        },
        select: { id: true },
      });

      resolvedCustomerId = createdPassenger.id;
    }

    if (!resolvedCustomerId) {
      resolvedCustomerId = req.user.id;
    }

    // Create job
    const jobData = {
      type: jobType,
      customerId: resolvedCustomerId,
      companyId: resolvedCompanyId,
      pickupAddress: resolvedPickup.address,
      pickupLatitude: resolvedPickup.lat,
      pickupLongitude: resolvedPickup.lng,
      dropoffAddress: resolvedDropoff.address,
      dropoffLatitude: resolvedDropoff.lat,
      dropoffLongitude: resolvedDropoff.lng,
      vehicleType: vehicleType || 'SEDAN',
      estimatedPrice: estimatedFare ?? priceEstimate.finalPrice,
      estimatedDistance: estimatedDistance ?? priceEstimate.distance,
      estimatedDuration: estimatedDuration ?? priceEstimate.estimatedTime,
      scheduledAt: scheduledTime ? new Date(scheduledTime) : null,
      estimatedArrival: priceEstimate.estimatedTime
        ? new Date(Date.now() + priceEstimate.estimatedTime * 60 * 1000)
        : null,
      instructions: instructions || specialRequests,
      paymentMethod: normalizedPaymentMethod,
      status: 'PENDING',
    };

    let combinedRequirements = requirements || {};

    if (type === 'DELIVERY') {
      combinedRequirements = {
        recipientName,
        recipientPhone,
        packageDescription,
        merchantId,
        ...(requirements || {}),
      };
    }

    if (notes) {
      combinedRequirements = { ...combinedRequirements, notes };
    }

    if (validationCode) {
      combinedRequirements = {
        ...combinedRequirements,
        validationCode,
      };
    }

    if (passengerName) {
      combinedRequirements = {
        ...combinedRequirements,
        passengerName: passengerName.trim(),
      };
    }

    if (normalizedPhone) {
      combinedRequirements = {
        ...combinedRequirements,
        passengerPhone: normalizedPhone,
      };
    }

    if (tariffId) {
      combinedRequirements = { ...combinedRequirements, tariffId };
    }

    combinedRequirements = {
      ...combinedRequirements,
      currency: priceEstimate.currency || 'USD',
    };

    if (fareBreakdown) {
      combinedRequirements = { ...combinedRequirements, fareBreakdown };
    }

    if (verifiedPaymentIntentId) {
      combinedRequirements = {
        ...combinedRequirements,
        stripePaymentIntentId: verifiedPaymentIntentId,
      };
    }

    if (Object.keys(combinedRequirements).length > 0) {
      jobData.requirements = combinedRequirements;
    }

    if ((driverAssignment === 'manual' || driverAssignment === 'auto') && driverId) {
      jobData.assignedDriverId = driverId;
      jobData.status = driverAssignment === 'manual' ? 'ASSIGNED' : jobData.status;
    }

    let job = await jobService.createJob(jobData);

    if (driverId && driverAssignment && driverAssignment.toLowerCase() === 'manual') {
      const io = req.io;
      await jobService.assignDriver(job.id, driverId, req.user.id, io);
    }

    if (verifiedPaymentIntentId && job.tripId) {
      await prisma.rides.update({
        where: { id: job.tripId },
        data: {
          paymentStatus: 'PAID',
          paymentMethod: 'CARD',
          paymentId: verifiedPaymentIntentId,
        },
      });
    }

    const hydratedJob = await prisma.job.findUnique({
      where: { id: job.id },
      include: dispatchJobInclude,
    });
    const formattedJob = hydratedJob ? formatJobForDispatch(hydratedJob) : formatJobForDispatch(job);

    res.status(201).json({
      success: true,
      data: {
        job: formattedJob,
        priceBreakdown: priceEstimate,
      }
    });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Get price estimate
router.post('/estimate', authenticateToken, authorizeRoles(...allowedDispatchRoles), async (req, res) => {
  try {
    const {
      pickupLatitude,
      pickupLongitude,
      dropoffLatitude,
      dropoffLongitude,
      vehicleType,
      scheduledTime,
      jobType
    } = req.body;

    const estimate = await pricingService.calculatePrice({
      companyId: req.user.companyId,
      vehicleType: vehicleType || 'SEDAN',
      pickupLatitude: parseFloat(pickupLatitude),
      pickupLongitude: parseFloat(pickupLongitude),
      dropoffLatitude: parseFloat(dropoffLatitude),
      dropoffLongitude: parseFloat(dropoffLongitude),
      scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
      jobType: jobType || 'TAXI',
    });

    res.json({
      success: true,
      data: estimate
    });
  } catch (error) {
    console.error('Error calculating estimate:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Get driver's active jobs
router.get('/driver/jobs',
  authenticateToken,
  authorizeRoles(['DRIVER']),
  async (req, res) => {
    try {
      const jobs = await jobService.getDriverActiveJobs(req.user.id);

      res.json({
        success: true,
        data: jobs
      });
    } catch (error) {
      console.error('Error getting driver jobs:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Accept job offer
router.post('/offers/:offerId/accept',
  authenticateToken,
  authorizeRoles(['DRIVER']),
  async (req, res) => {
    try {
      const { offerId } = req.params;

      const assignment = await jobService.acceptOffer(offerId, req.user.id);

      // Start job tracking
      await req.trackingService.startJobTracking(assignment.jobId);

      res.json({
        success: true,
        data: assignment
      });
    } catch (error) {
      console.error('Error accepting offer:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update job status
router.patch('/jobs/:jobId/status',
  authenticateToken,
  authorizeRoles(['DRIVER', 'DISPATCHER']),
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const { status, location, reason } = req.body;
      const normalizedStatus =
        typeof status === 'string' ? status.replace(/-/g, '_').trim().toUpperCase() : null;

      if (normalizedStatus === 'RECALL' || normalizedStatus === 'RECALLED') {
        const dispatchNamespace =
          req.dispatchNamespace || global.dispatchNamespace || null;
        const driverNamespace = req.driverNamespace || global.driverNamespace || null;

        const job = await recallJobToQueue({
          jobId,
          actorId: req.user.id,
          reason,
          dispatchNamespace,
          driverNamespace,
        });

        return res.json({
          success: true,
          data: job,
          message: 'Job recalled and returned to queue',
        });
      }

      const job = await jobService.updateJobStatus(
        jobId,
        status,
        req.user.id,
        location
      );

      // Handle tracking based on status
      if (status === 'COMPLETED' || status === 'CANCELLED') {
        await req.trackingService.stopJobTracking(jobId);
      }

      res.json({
        success: true,
        data: job
      });
    } catch (error) {
      console.error('Error updating job status:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update driver location
router.post('/driver/location',
  authenticateToken,
  authorizeRoles(['DRIVER']),
  async (req, res) => {
    try {
      const locationData = req.body;

      const locationUpdate = await req.trackingService.updateDriverLocation(
        req.user.id,
        locationData
      );

      res.json({
        success: true,
        data: locationUpdate
      });
    } catch (error) {
      console.error('Error updating driver location:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get customer job history
router.get('/customer/jobs',
  authenticateToken,
  authorizeRoles(['CUSTOMER']),
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;

      const jobs = await jobService.getCustomerJobHistory(
        req.user.id,
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: jobs
      });
    } catch (error) {
      console.error('Error getting customer job history:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Manual job assignment endpoint
router.post('/dispatch/assign',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  async (req, res) => {
    try {
      const { jobId, driverId } = req.body;

      if (!jobId || !driverId) {
        return res.status(400).json({
          success: false,
          error: 'jobId and driverId are required'
        });
      }

      // Use the jobService to assign the driver
      const io = req.io;
      const assignment = await jobService.assignDriver(jobId, driverId, req.user.id, io);

      // Start job tracking
      if (req.trackingService) {
        await req.trackingService.startJobTracking(jobId);
      }

      res.json({
        success: true,
        data: assignment,
        message: 'Job successfully assigned to driver'
      });

    } catch (error) {
      console.error('Error assigning job:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

router.post('/jobs/:jobId/assign',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const { driverId, status = 'OFFERED' } = req.body;
      const normalizedStatus = String(status).toUpperCase();

      if (!driverId) {
        return res.status(400).json({
          success: false,
          error: 'driverId is required'
        });
      }

      const io = req.io;
      const assignment = await jobService.assignDriver(jobId, driverId, req.user.id, io);

      if (req.trackingService) {
        await req.trackingService.startJobTracking(jobId);
      }

      if (normalizedStatus && normalizedStatus !== 'OFFERED') {
        await jobService.updateJobStatus(jobId, normalizedStatus, driverId);
      }

      res.json({
        success: true,
        data: assignment,
        message: 'Job successfully offered to driver'
      });
    } catch (error) {
      console.error('Error assigning job (REST):', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

router.post(
  '/jobs/:jobId/unassign',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const { reason } = req.body || {};

      const io = req.io;
      const job = await jobService.unassignDriver(
        jobId,
        req.user.id,
        reason || 'Dispatcher unassigned job',
        io
      );

      res.json({
        success: true,
        data: job,
        message: 'Job returned to unassigned queue',
      });
    } catch (error) {
      console.error('Error unassigning job:', error);
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
);

router.post('/jobs/:jobId/cancel',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const { reason } = req.body;

      // Get job details before cancellation to know which driver to notify
      const jobBeforeCancel = await prisma.job.findUnique({
        where: { id: jobId },
      });

      // Update job status to CANCELLED
      // The reason can be stored in instructions field if needed
      let job = await jobService.updateJobStatus(jobId, 'CANCELLED', req.user.id, null);

      // Optionally append cancellation reason to instructions
      if (reason && job) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            instructions: job.instructions 
              ? `${job.instructions}\n\n[Cancelled: ${reason}]`
              : `[Cancelled: ${reason}]`
          }
        });
        job = await prisma.job.findUnique({
          where: { id: jobId },
        });
      }

      // Emit socket event to notify driver if job was assigned
      const io = req.io;
      if (io && jobBeforeCancel?.assignedDriverId) {
        const driverRoom = `driver:${jobBeforeCancel.assignedDriverId}`;
        io.to(driverRoom).emit('job:cancelled', {
          jobId: jobId,
          reason: reason || 'Job cancelled by dispatcher',
          timestamp: new Date().toISOString()
        });
        console.log(`Emitted job:cancelled event to driver ${jobBeforeCancel.assignedDriverId}`);
      }

      // Also emit to dispatch room for real-time updates
      if (io) {
        io.to('dispatch').emit('job:data:updated', {
          jobId: jobId,
          status: 'CANCELLED',
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: job,
        message: 'Job cancelled successfully'
      });
    } catch (error) {
      console.error('Error cancelling job:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

router.patch(
  '/jobs/:jobId',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const {
        pickup,
        dropoff,
        vehicleType,
        notes,
        instructions,
        tariffId,
        recalculateFare = true,
        // Additional fields for comprehensive job editing
        passengerName,
        phone,
        email,
        passengers,
        bags,
        wheelchairs,
        vehiclesNeeded,
        paymentMethod,
        scheduledFor,
        validationCode,
        currency,
        // Driver assignment
      driverAssignment,
      driverId,
    } = req.body || {};

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return res.status(404).json({
        success: false,
          error: 'Job not found',
        });
      }

      if (
        ['STARTED', 'IN_PROGRESS', 'ACCEPTED', 'COMPLETED', 'CANCELLED'].includes(
          job.status
        )
      ) {
        return res.status(400).json({
          success: false,
          error: 'Active or completed jobs cannot be edited',
        });
      }

      const existingRequirements = parseJsonField(job.requirements, {});
      const updates = {};

      // Handle driver assignment changes
      if (driverAssignment !== undefined) {
        if (driverAssignment === 'manual' && driverId) {
          // Assign to specific driver
          const driver = await prisma.user.findFirst({
            where: {
              id: driverId,
              role: 'DRIVER',
              companyId: job.companyId,
            },
            select: { id: true },
          });
          
          if (!driver) {
            return res.status(400).json({
              success: false,
              error: 'Selected driver not found',
            });
          }
          
          // If job was assigned to different driver, unassign first
          if (job.assignedDriverId && job.assignedDriverId !== driverId) {
            console.log(`[Job Edit] Reassigning job from ${job.assignedDriverId} to ${driverId}`);
            // Emit socket event to old driver
            if (req.io) {
              req.io.to(`driver:${job.assignedDriverId}`).emit('job:unassigned', {
                jobId: jobId,
                message: 'Job has been reassigned to another driver',
                timestamp: new Date().toISOString()
              });
            }
          }
          
          updates.assignedDriverId = driverId;
          updates.status = 'ASSIGNED';
          
          // Emit to new driver
          if (req.io) {
            req.io.to(`driver:${driverId}`).emit('job:assigned', {
              jobId: jobId,
              message: 'New job has been assigned to you',
              timestamp: new Date().toISOString()
            });
          }
        } else if (driverAssignment === 'unassigned') {
          // Unassign driver if there was one
          if (job.assignedDriverId) {
            console.log(`[Job Edit] Unassigning driver ${job.assignedDriverId} from job`);
            if (req.io) {
              req.io.to(`driver:${job.assignedDriverId}`).emit('job:unassigned', {
                jobId: jobId,
                message: 'Job has been unassigned',
                timestamp: new Date().toISOString()
              });
            }
          }
          updates.assignedDriverId = null;
          updates.status = 'UNASSIGNED';
        } else if (driverAssignment === 'auto') {
          // Keep existing assignment or set to UNASSIGNED
          if (!job.assignedDriverId) {
            updates.status = 'UNASSIGNED';
          }
        }
      }

      let pricingPayload = null;
      
      console.log('🕐 [UPDATE JOB] Scheduling parameters:', {
        scheduledFor,
        scheduledForType: typeof scheduledFor,
        scheduledTime: req.body.scheduledTime,
        scheduledTimeType: typeof req.body.scheduledTime,
        willSetScheduledAt: scheduledFor !== undefined,
        scheduledForValue: scheduledFor
      });
      
      const nextPickup = pickup
        ? {
          address: pickup.address,
          latitude: toNumber(pickup.latitude, null),
          longitude: toNumber(pickup.longitude, null),
        }
        : null;
      const nextDropoff = dropoff
        ? {
          address: dropoff.address,
          latitude: toNumber(dropoff.latitude, null),
          longitude: toNumber(dropoff.longitude, null),
        }
        : null;

      if (nextPickup && (!nextPickup.latitude || !nextPickup.longitude)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid pickup coordinates',
        });
      }

      if (nextDropoff && (!nextDropoff.latitude || !nextDropoff.longitude)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid dropoff coordinates',
        });
      }

      if (nextPickup || nextDropoff || vehicleType) {
        if (recalculateFare) {
          pricingPayload = await pricingService.calculatePrice({
            companyId: job.companyId,
            vehicleType: vehicleType || job.vehicleType || 'SEDAN',
            pickupLatitude: nextPickup?.latitude ?? job.pickupLatitude,
            pickupLongitude: nextPickup?.longitude ?? job.pickupLongitude,
            dropoffLatitude: nextDropoff?.latitude ?? job.dropoffLatitude,
            dropoffLongitude: nextDropoff?.longitude ?? job.dropoffLongitude,
            jobType: job.type,
          });

          updates.estimatedPrice = pricingPayload.finalPrice;
          updates.estimatedDistance = pricingPayload.distance;
          updates.estimatedDuration = pricingPayload.estimatedTime;
        }
      }

      if (nextPickup) {
        updates.pickup = {
          address: nextPickup.address,
          latitude: nextPickup.latitude,
          longitude: nextPickup.longitude,
        };
      }

      if (nextDropoff) {
        updates.dropoff = {
          address: nextDropoff.address,
          latitude: nextDropoff.latitude,
          longitude: nextDropoff.longitude,
        };
      }

      if (vehicleType) {
        updates.vehicleType = vehicleType;
      }

      if (notes !== undefined) {
        existingRequirements.notes = notes;
      }

      if (instructions !== undefined) {
        updates.instructions = instructions;
      }

      if (tariffId) {
        existingRequirements.tariffId = tariffId;
      }
      
      // Update passenger information in requirements
      if (passengerName !== undefined) {
        existingRequirements.passengerName = passengerName.trim();
      }
      
      if (phone !== undefined) {
        existingRequirements.passengerPhone = phone;
      }
      
      if (email !== undefined) {
        existingRequirements.passengerEmail = email;
      }
      
      // Update job requirements
      if (passengers !== undefined) {
        existingRequirements.passengers = passengers;
      }
      
      if (bags !== undefined) {
        existingRequirements.bags = bags;
      }
      
      if (wheelchairs !== undefined) {
        existingRequirements.wheelchairs = wheelchairs;
      }
      
      if (vehiclesNeeded !== undefined) {
        existingRequirements.vehiclesNeeded = vehiclesNeeded;
      }
      
      if (validationCode !== undefined) {
        existingRequirements.validationCode = validationCode;
      }
      
      if (currency !== undefined) {
        existingRequirements.currency = currency;
      }
      
      // Update payment method (direct field)
      if (paymentMethod !== undefined) {
        updates.paymentMethod = paymentMethod;
      }
      
      // ✅ FIX: Update scheduled time - handle both null and undefined
      // When switching from "later" to "now", frontend sends null to clear
      if (scheduledFor !== undefined) {
        if (scheduledFor === null || scheduledFor === "") {
          updates.scheduledAt = null;
          console.log('🕐 [UPDATE JOB] Cleared scheduled time (now job)');
        } else {
          updates.scheduledAt = new Date(scheduledFor);
          console.log('🕐 [UPDATE JOB] Set scheduled time:', updates.scheduledAt);
        }
      }

      if (pricingPayload?.fareBreakdown) {
        existingRequirements.fareBreakdown = pricingPayload.fareBreakdown;
      }

      if (pricingPayload?.currency) {
        existingRequirements.currency = pricingPayload.currency;
      }

      updates.requirements = existingRequirements;

      const updatedJob = await jobService.updateJobDetails(jobId, updates);

      const refreshedJob = await prisma.job.findUnique({
        where: { id: jobId },
        include: dispatchJobInclude,
      });
      const normalizedJob = refreshedJob
        ? formatJobForDispatch(refreshedJob)
        : updatedJob
          ? formatJobForDispatch(updatedJob)
          : null;

      if (!normalizedJob) {
        throw new Error('Job updated but formatted data could not be generated');
      }
      
      // Emit update to dispatch room
      if (req.io) {
        req.io.to('dispatch').emit('job:data:updated', {
          jobId: jobId,
          updates: normalizedJob,
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: normalizedJob,
        message: 'Job updated successfully',
      });
    } catch (error) {
      console.error('Error updating job:', error);
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Get job tracking information
router.get('/tracking/:jobId',
  authenticateToken,
  authorizeRoles(['DISPATCHER', 'OWNER', 'SUPER_ADMIN', 'DRIVER', 'PASSENGER']),
  async (req, res) => {
    try {
      const { jobId } = req.params;

      // Get job with tracking information
      const jobRecord = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          ...dispatchJobInclude,
          companies: {
            select: {
              id: true,
              brandName: true,
              legalName: true,
            },
          },
          location_updates: {
            orderBy: { timestamp: 'desc' },
            take: 20,
          },
        }
      });

      if (!jobRecord) {
        return res.status(404).json({
          success: false,
          error: 'Job not found'
        });
      }

      const company = jobRecord.companies
        ? {
          id: jobRecord.companies.id,
          brandName: jobRecord.companies.brandName,
          legalName: jobRecord.companies.legalName,
        }
        : null;
      const formattedJob = formatJobForDispatch(jobRecord);
      if (company) {
        formattedJob.company = company;
      }

      const assignedDriverRecord = jobRecord.users_jobs_assignedDriverIdTousers || null;
      const latestDriverLocation =
        assignedDriverRecord?.location_updates &&
        assignedDriverRecord.location_updates.length
          ? assignedDriverRecord.location_updates[0]
          : null;
      const driverPrefs = cloneJson(assignedDriverRecord?.preferences);
      const fallbackLocation = driverPrefs.lastLocation || {};

      const locationHistory = jobRecord.location_updates || [];

      res.json({
        success: true,
        data: {
          job: formattedJob,
          currentLocation: assignedDriverRecord ? {
            latitude: toNumber(
              latestDriverLocation?.latitude,
              fallbackLocation.latitude
            ),
            longitude: toNumber(
              latestDriverLocation?.longitude,
              fallbackLocation.longitude
            ),
            heading: toNumber(
              latestDriverLocation?.heading,
              fallbackLocation.heading
            ),
            timestamp: new Date(
              latestDriverLocation?.timestamp ??
              latestDriverLocation?.createdAt ??
              fallbackLocation.timestamp ??
              Date.now()
            )
          } : null,
          locationHistory,
        }
      });

    } catch (error) {
      console.error('Error fetching job tracking:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// GET /api/dispatch/drivers - Get list of online drivers for dispatch portal
router.get('/drivers',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  async (req, res) => {
    try {
      console.log('[Dispatch] Fetching online drivers list');

      const includeOffline = req.query.include_offline === 'true';

      const whereCondition = {
        endTime: null,
        ...(includeOffline
          ? { status: { in: ['ONLINE', 'BUSY', 'AWAY', 'OFFLINE'] } }
          : { status: { in: ['ONLINE', 'BUSY', 'AWAY'] } }
        )
      };

      // Filter by company if user is not super admin
      if (req.user.role !== 'SUPER_ADMIN' && req.user.companyId) {
        whereCondition.driver = { companyId: req.user.companyId };
      }

      const onlineDrivers = await prisma.shift.findMany({
        where: whereCondition,
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              companyId: true,
              preferences: true,
              locationUpdates: {
                orderBy: [
                  { timestamp: 'desc' },
                  { createdAt: 'desc' }
                ],
                take: 1,
                select: {
                  latitude: true,
                  longitude: true,
                  heading: true,
                  timestamp: true
                }
              },
              company: {
                select: {
                  id: true,
                  name: true,
                  legalName: true
                }
              },
              assignedVehicles: {
                include: {
                  vehicle: {
                    select: {
                      id: true,
                      plateNumber: true,
                      make: true,
                      model: true,
                      vehicleType: true
                    }
                  }
                },
                take: 1
              }
            }
          }
        },
        orderBy: {
          startTime: 'desc'
        }
      });

      // Fetch all unique vehicle types to get their icons
      const vehicleTypes = onlineDrivers
        .map(shift => shift.driver.assignedVehicles?.[0]?.vehicle?.vehicleType)
        .filter(Boolean);
      
      const uniqueVehicleTypes = [...new Set(vehicleTypes)];
      
      const vehicleTypeIcons = {};
      if (uniqueVehicleTypes.length > 0) {
        const vehicleTypeMasters = await prisma.vehicle_types.findMany({
          where: {
            code: { in: uniqueVehicleTypes }
          },
          select: {
            code: true,
            icon: true,
            name: true
          }
        });
        
        vehicleTypeMasters.forEach(vt => {
          vehicleTypeIcons[vt.code] = {
            icon: vt.icon,
            name: vt.name
          };
        });
      }

      const transformedDrivers = onlineDrivers.map(shift => {
        const lastLocation = shift.driver.locationUpdates?.[0] || null;
        const assignedVehicle = shift.driver.assignedVehicles?.[0]?.vehicle || null;
        const vehicleTypeInfo = assignedVehicle?.vehicleType ? vehicleTypeIcons[assignedVehicle.vehicleType] : null;

        // ✅ FIXED: Get status from driver preferences, not shift
        // Priority: preferences.driverStatus > preferences.dispatch.status > shift.status
        const driverStatus = 
          shift.driver.preferences?.driverStatus || 
          shift.driver.preferences?.dispatch?.status || 
          shift.status;

        return {
          id: shift.driver.id,
          firstName: shift.driver.firstName,
          lastName: shift.driver.lastName,
          fullName: `${shift.driver.firstName} ${shift.driver.lastName}`.trim(),
          phone: shift.driver.phone,
          status: driverStatus, // ✅ FIXED: Use driver status from preferences
          companyId: shift.driver.companyId,
          companyName: shift.driver.company?.legalName || shift.driver.company?.name || 'Unknown',
          shiftStartTime: shift.startTime?.toISOString(),
          location: lastLocation ? {
            latitude: parseFloat(lastLocation.latitude),
            longitude: parseFloat(lastLocation.longitude),
            heading: lastLocation.heading ? parseFloat(lastLocation.heading) : null,
            timestamp: lastLocation.timestamp?.toISOString() || new Date().toISOString()
          } : null,
          vehicle: assignedVehicle ? {
            id: assignedVehicle.id,
            plateNumber: assignedVehicle.plateNumber,
            make: assignedVehicle.make,
            model: assignedVehicle.model,
            type: assignedVehicle.vehicleType,
            typeName: vehicleTypeInfo?.name || assignedVehicle.vehicleType,
            icon: vehicleTypeInfo?.icon || null,
            displayName: `${assignedVehicle.make} ${assignedVehicle.model} (${assignedVehicle.plateNumber})`.trim()
          } : null,
          currentZone: shift.driver.preferences?.dispatch?.currentZone || null,
          lastStatusUpdate: shift.driver.preferences?.dispatch?.lastStatusUpdate || shift.startTime?.toISOString()
        };
      });

      console.log(`[Dispatch] Found ${transformedDrivers.length} online drivers`);

      res.json({
        success: true,
        data: transformedDrivers,
        meta: {
          total: transformedDrivers.length,
          includeOffline,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('[Dispatch] Error fetching online drivers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch drivers',
        message: 'Unable to load driver list',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Get job audit history/logs
router.get(
  '/jobs/:jobId/audit-logs',
  authenticateToken,
  authorizeRoles(...allowedDispatchRoles),
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const { limit = 50 } = req.query;
      const jobAuditService = require('../services/jobAuditService');

      const logs = await jobAuditService.getJobHistory(jobId);

      res.json({
        success: true,
        logs: logs.slice(0, parseInt(limit)),
        total: logs.length,
      });
    } catch (error) {
      console.error('[Dispatch] Error fetching job audit logs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch job audit logs',
      });
    }
  }
);

module.exports = router;
