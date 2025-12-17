const axios = require('axios');
const { haversineDistance } = require('../../shared/utils');

class RoutingService {
  constructor() {
    this.googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.osrmUrl = process.env.OSRM_SERVER_URL || 'https://router.project-osrm.org';
  }

  async getRoute(points) {
    if (!points || points.length < 2) {
      throw new Error('INVALID_ROUTE_POINTS');
    }
    try {
      if (this.googleApiKey) {
        return await this.getGoogleRoute(points);
      }
      return await this.getOSRMRoute(points);
    } catch (error) {
      console.error('[Routing] primary provider failed:', error.message);
      return this.calculateHaversineRoute(points);
    }
  }

  async getGoogleRoute(points) {
    const origin = `${points[0].lat},${points[0].lng}`;
    const destination = `${points[points.length - 1].lat},${points[points.length - 1].lng}`;
    const waypoints = points
      .slice(1, -1)
      .map((p) => `${p.lat},${p.lng}`)
      .join('|');

    const url = 'https://maps.googleapis.com/maps/api/directions/json';
    const params = {
      origin,
      destination,
      waypoints: waypoints || undefined,
      key: this.googleApiKey,
    };

    const response = await axios.get(url, { params });
    if (response.data.status !== 'OK') {
      throw new Error(`Google API error: ${response.data.status}`);
    }

    const route = response.data.routes[0];
    const leg = route.legs.reduce(
      (acc, l) => ({
        distanceM: acc.distanceM + l.distance.value,
        durationS: acc.durationS + l.duration.value,
      }),
      { distanceM: 0, durationS: 0 }
    );

    return {
      distanceKm: Math.round((leg.distanceM / 1000) * 100) / 100,
      durationMinutes: Math.round(leg.durationS / 60),
      polyline: route.overview_polyline?.points || null,
    };
  }

  async getOSRMRoute(points) {
    const coordinates = points.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `${this.osrmUrl}/route/v1/driving/${coordinates}`;

    const response = await axios.get(url, {
      params: {
        overview: 'full',
        geometries: 'polyline',
      },
    });

    if (response.data.code !== 'Ok') {
      throw new Error(`OSRM error: ${response.data.code}`);
    }

    const route = response.data.routes[0];
    return {
      distanceKm: Math.round((route.distance / 1000) * 100) / 100,
      durationMinutes: Math.round(route.duration / 60),
      polyline: route.geometry || null,
    };
  }

  calculateHaversineRoute(points) {
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      totalDistance += haversineDistance(
        points[i].lat,
        points[i].lng,
        points[i + 1].lat,
        points[i + 1].lng
      );
    }
    const durationMinutes = Math.round((totalDistance / 30) * 60); // assume 30 km/h
    return {
      distanceKm: Math.round(totalDistance * 100) / 100,
      durationMinutes,
      polyline: null,
    };
  }

  haversineDistance(lat1, lng1, lat2, lng2) {
    return haversineDistance(lat1, lng1, lat2, lng2);
  }
}

module.exports = new RoutingService();
