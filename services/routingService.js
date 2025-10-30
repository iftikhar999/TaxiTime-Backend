/**
 * Routing Service
 * Calculates actual driving distances and routes using Google Maps Directions API
 */

const axios = require('axios');

class RoutingService {
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.useRealRouting = this.googleMapsApiKey && this.googleMapsApiKey.length > 0;
    
    if (!this.useRealRouting) {
      console.warn('⚠️  No Google Maps API key found - Using fallback distance calculation');
      console.warn('⚠️  Set GOOGLE_MAPS_API_KEY environment variable for accurate routing');
    }
  }

  /**
   * Calculate route using Google Maps Directions API
   * Returns actual driving distance and duration
   */
  async calculateRoute(pickupLat, pickupLng, dropoffLat, dropoffLng) {
    if (!this.useRealRouting) {
      console.log('🔄 Using fallback Haversine distance calculation');
      return this.calculateHaversineDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
    }

    try {
      console.log('🗺️  Calculating route using Google Maps Directions API');
      
      const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
        params: {
          origin: `${pickupLat},${pickupLng}`,
          destination: `${dropoffLat},${dropoffLng}`,
          key: this.googleMapsApiKey,
          mode: 'driving',
          departure_time: 'now', // Gets real-time traffic
          traffic_model: 'best_guess',
        },
        timeout: 10000, // 10 second timeout
      });

      if (response.data.status !== 'OK') {
        console.error('❌ Google Maps API error:', response.data.status, response.data.error_message);
        console.log('🔄 Falling back to Haversine calculation');
        return this.calculateHaversineDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
      }

      if (!response.data.routes || response.data.routes.length === 0) {
        console.warn('⚠️  No routes found, using fallback');
        return this.calculateHaversineDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
      }

      const route = response.data.routes[0];
      const leg = route.legs[0];

      // Extract route polyline for display on map
      const polyline = route.overview_polyline.points;

      // Distance in meters, duration in seconds
      const distanceMeters = leg.distance.value;
      const durationSeconds = leg.duration.value;
      
      // Duration in traffic (if available)
      const durationInTrafficSeconds = leg.duration_in_traffic 
        ? leg.duration_in_traffic.value 
        : durationSeconds;

      const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100; // Round to 2 decimal places
      const durationMinutes = Math.ceil(durationInTrafficSeconds / 60); // Round up to nearest minute

      console.log('✅ Route calculated:', {
        distance: `${distanceKm} km`,
        duration: `${durationMinutes} min`,
        hasTraffic: !!leg.duration_in_traffic,
      });

      return {
        distance: distanceKm,
        duration: durationMinutes,
        distanceMeters,
        durationSeconds: durationInTrafficSeconds,
        polyline, // For displaying route on map
        steps: leg.steps.map(step => ({
          instruction: step.html_instructions,
          distance: step.distance.value,
          duration: step.duration.value,
        })),
      };
    } catch (error) {
      console.error('❌ Error calling Google Maps API:', error.message);
      console.log('🔄 Falling back to Haversine calculation');
      return this.calculateHaversineDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
    }
  }

  /**
   * Fallback: Calculate straight-line distance using Haversine formula
   * NOTE: This is NOT accurate for fare calculation as it doesn't follow roads
   */
  calculateHaversineDistance(pickupLat, pickupLng, dropoffLat, dropoffLng) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (dropoffLat - pickupLat) * Math.PI / 180;
    const dLng = (dropoffLng - pickupLng) * Math.PI / 180;
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(pickupLat * Math.PI / 180) * Math.cos(dropoffLat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightLineDistance = R * c;

    // Apply a multiplier to account for roads (typically 1.2-1.4x for urban areas)
    // This is still an ESTIMATE and not as accurate as real routing
    const ROAD_FACTOR = 1.3; // Assume roads add 30% to straight-line distance
    const estimatedDistance = straightLineDistance * ROAD_FACTOR;
    const distance = Math.round(estimatedDistance * 100) / 100;

    // Estimate duration (assuming average speed of 30 km/h in city with traffic)
    const AVERAGE_CITY_SPEED = 30; // km/h
    const duration = Math.max(Math.ceil((distance / AVERAGE_CITY_SPEED) * 60), 5); // minimum 5 minutes

    console.warn(`⚠️  Using ESTIMATED distance: ${distance} km (straight-line: ${Math.round(straightLineDistance * 100) / 100} km × ${ROAD_FACTOR})`);
    console.warn('⚠️  This is NOT accurate - Set GOOGLE_MAPS_API_KEY for real routing');

    return {
      distance,
      duration,
      distanceMeters: distance * 1000,
      durationSeconds: duration * 60,
      isEstimate: true, // Flag to indicate this is not real routing
      polyline: null, // No polyline for straight-line
      steps: [],
    };
  }

  /**
   * Decode Google Maps polyline (for future use)
   */
  decodePolyline(encoded) {
    const poly = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;
      
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }

    return poly;
  }
}

module.exports = new RoutingService();

