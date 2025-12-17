class EventBus {
  constructor() {
    this.io = null;
  }

  setSocketIO(io) {
    this.io = io;
  }

  async publish(eventType, payload) {
    if (!this.io) {
      console.warn('[EventBus] Socket.IO not initialized');
      return;
    }

    const { companyId, serviceType } = payload;
    if (companyId) {
      this.io.to(`dispatch_${companyId}`).emit(eventType, payload);
      if (serviceType) {
        this.io.to(`dispatch_${companyId}_${serviceType}`).emit(eventType, payload);
      }
    }

    switch (eventType) {
      case 'job.created':
        if (companyId) this.io.to(`drivers_${companyId}`).emit('job:new', payload);
        break;
      case 'job.status.updated':
        if (payload.customerId) {
          this.io.to(`customer_${payload.customerId}`).emit('job:status', payload);
        }
        if (payload.driverId) {
          this.io.to(`driver_${payload.driverId}`).emit('job:status', payload);
        }
        break;
      case 'job.assigned':
        if (payload.driverId) {
          this.io.to(`driver_${payload.driverId}`).emit('job:assigned', payload);
        }
        break;
      case 'driver.location.updated':
        if (payload.jobId) {
          this.io.to(`tracking_${payload.jobId}`).emit('driver:location', payload);
        }
        break;
      case 'stop.status.updated':
        if (companyId) {
          this.io.to(`dispatch_${companyId}`).emit('stop:status', payload);
          if (serviceType) {
            this.io.to(`dispatch_${companyId}_${serviceType}`).emit('stop:status', payload);
          }
        }
        if (payload.driverId) {
          this.io.to(`driver_${payload.driverId}`).emit('stop:status', payload);
        }
        if (payload.jobId) {
          this.io.to(`tracking_${payload.jobId}`).emit('stop:status', payload);
        }
        break;
      case 'pod.captured':
        if (companyId) {
          this.io.to(`dispatch_${companyId}`).emit('pod:captured', payload);
        }
        if (payload.jobId) {
          this.io.to(`tracking_${payload.jobId}`).emit('pod:captured', payload);
        }
        break;
      case 'job.completed':
        if (companyId) {
          this.io.to(`dispatch_${companyId}`).emit('job:completed', payload);
        }
        break;
      default:
        break;
    }
  }
}

module.exports = new EventBus();
