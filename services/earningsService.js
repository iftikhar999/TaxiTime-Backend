const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Driver Earnings Service
 * Handles recording, aggregating, and querying driver earnings
 */
class EarningsService {
  /**
   * Set socket namespaces for real-time updates
   * @param {Object} dispatchNamespace - Socket.IO dispatch namespace
   * @param {Object} driverNamespace - Socket.IO driver namespace
   */
  setSocketNamespaces(dispatchNamespace, driverNamespace) {
    this.dispatchNamespace = dispatchNamespace;
    this.driverNamespace = driverNamespace;
  }

  /**
   * Emit earnings update to driver and dispatch/owner panels
   * @param {string} driverId 
   * @param {string} companyId 
   * @param {string} jobId 
   */
  async emitEarningsUpdate(driverId, companyId, jobId = null) {
    try {
      // Fetch updated summaries
      const [today, week, month] = await Promise.all([
        this.getSummary(driverId, 'today'),
        this.getSummary(driverId, 'week'),
        this.getSummary(driverId, 'month'),
      ]);

      const payload = {
        driverId,
        companyId,
        jobId,
        summary: {
          today: {
            total: today?.totalEarnings || 0,
            cash: today?.cashAmount || 0,
            card: today?.cardAmount || 0,
            account: today?.accountAmount || 0,
            jobCount: today?.jobCount || 0,
          },
          week: {
            total: week?.totalEarnings || 0,
            cash: week?.cashAmount || 0,
            card: week?.cardAmount || 0,
            account: week?.accountAmount || 0,
            jobCount: week?.jobCount || 0,
          },
          month: {
            total: month?.totalEarnings || 0,
            cash: month?.cashAmount || 0,
            card: month?.cardAmount || 0,
            account: month?.accountAmount || 0,
            jobCount: month?.jobCount || 0,
          },
        },
        timestamp: new Date().toISOString(),
      };

      // Emit to driver's personal room
      if (this.driverNamespace) {
        this.driverNamespace.to(`driver_${driverId}`).emit('earnings:updated', payload);
      }

      // Emit to dispatch/owner panel company room
      if (this.dispatchNamespace && companyId) {
        this.dispatchNamespace.to(`dispatch_${companyId}`).emit('earnings:updated', payload);
        this.dispatchNamespace.to(`company_${companyId}`).emit('earnings:updated', payload);
      }

      console.log('📡 [EarningsService] Emitted earnings update:', {
        driverId,
        companyId,
        jobId,
        todayTotal: payload.summary.today.total,
      });
    } catch (error) {
      console.error('❌ [EarningsService] Failed to emit earnings update:', error);
    }
  }

  /**
   * Record earnings for a completed trip
   * @param {Object} data - Earning data from payment collection
   * @returns {Promise<Object>} Created earning record
   */
  async recordEarning(data) {
    const {
      driverId,
      companyId,
      jobId,
      paymentId,
      shiftId,
      amount,
      currency = 'NZD',
      paymentMethod,
      earnedAt = new Date(),
      baseFare = 0,
      distanceFare = 0,
      timeFare = 0,
      waitingFare = 0,
      extraAmount = 0,
      discountAmount = 0,
      totalAmount,
      companyCommission = 0,
      driverEarnings,
      commissionRate = 0.20,
      totalMobility = false,
      adjustmentReason = null,
      isAdjustment = false,
      tripDistance = null,
      tripDuration = null,
      pickupAddress = null,
      dropoffAddress = null,
      customerName = null,
      metadata = null,
    } = data;

    console.log('💰 [EarningsService] Recording earning:', {
      driverId,
      jobId,
      amount: driverEarnings,
      paymentMethod,
    });

    try {
      // Create earning record
      const earning = await prisma.driverEarning.create({
        data: {
          driverId,
          companyId,
          jobId,
          paymentId,
          shiftId,
          amount: parseFloat(driverEarnings),
          currency,
          paymentMethod: paymentMethod.toUpperCase(),
          earnedAt: new Date(earnedAt),
          baseFare: parseFloat(baseFare) || 0,
          distanceFare: parseFloat(distanceFare) || 0,
          timeFare: parseFloat(timeFare) || 0,
          waitingFare: parseFloat(waitingFare) || 0,
          extraAmount: parseFloat(extraAmount) || 0,
          discountAmount: parseFloat(discountAmount) || 0,
          totalAmount: parseFloat(totalAmount),
          companyCommission: parseFloat(companyCommission),
          driverEarnings: parseFloat(driverEarnings),
          commissionRate: parseFloat(commissionRate),
          totalMobility,
          adjustmentReason,
          isAdjustment,
          tripDistance: tripDistance ? parseFloat(tripDistance) : null,
          tripDuration: tripDuration ? parseInt(tripDuration) : null,
          pickupAddress,
          dropoffAddress,
          customerName,
          metadata,
        },
      });

      console.log('✅ [EarningsService] Earning recorded:', earning.id);

      // Update aggregates in background (don't await to keep response fast)
      this.updateAggregates(driverId, companyId, earnedAt)
        .then(() => {
          // After aggregates update, emit real-time update to driver and dispatch
          return this.emitEarningsUpdate(driverId, companyId, jobId);
        })
        .catch((err) => {
          console.error('❌ [EarningsService] Failed to update aggregates or emit update:', err);
        });

      return earning;
    } catch (error) {
      console.error('❌ [EarningsService] Failed to record earning:', error);
      throw error;
    }
  }

  /**
   * Update daily, weekly, and monthly aggregates for a driver
   * @param {string} driverId - Driver ID
   * @param {string} companyId - Company ID
   * @param {Date} date - Date to update aggregates for
   */
  async updateAggregates(driverId, companyId, date = new Date()) {
    console.log('📊 [EarningsService] Updating aggregates for driver:', driverId);

    try {
      await Promise.all([
        this.updateDailySummary(driverId, companyId, date),
        this.updateWeeklySummary(driverId, companyId, date),
        this.updateMonthlySummary(driverId, companyId, date),
      ]);

      console.log('✅ [EarningsService] Aggregates updated');
    } catch (error) {
      console.error('❌ [EarningsService] Failed to update aggregates:', error);
      throw error;
    }
  }

  /**
   * Update daily earnings summary
   */
  async updateDailySummary(driverId, companyId, date) {
    const periodStart = new Date(date);
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(date);
    periodEnd.setHours(23, 59, 59, 999);

    const periodLabel = periodStart.toISOString().split('T')[0]; // YYYY-MM-DD

    return this._updateSummary(
      driverId,
      companyId,
      'DAILY',
      periodStart,
      periodEnd,
      periodLabel
    );
  }

  /**
   * Update weekly earnings summary
   */
  async updateWeeklySummary(driverId, companyId, date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday

    const periodStart = new Date(d.setDate(diff));
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 6);
    periodEnd.setHours(23, 59, 59, 999);

    // ISO week format: YYYY-Www
    const year = periodStart.getFullYear();
    const weekNum = this._getWeekNumber(periodStart);
    const periodLabel = `${year}-W${weekNum.toString().padStart(2, '0')}`;

    return this._updateSummary(
      driverId,
      companyId,
      'WEEKLY',
      periodStart,
      periodEnd,
      periodLabel
    );
  }

  /**
   * Update monthly earnings summary
   */
  async updateMonthlySummary(driverId, companyId, date) {
    const d = new Date(date);
    const periodStart = new Date(d.getFullYear(), d.getMonth(), 1);
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    periodEnd.setHours(23, 59, 59, 999);

    const periodLabel = `${d.getFullYear()}-${(d.getMonth() + 1)
      .toString()
      .padStart(2, '0')}`; // YYYY-MM

    return this._updateSummary(
      driverId,
      companyId,
      'MONTHLY',
      periodStart,
      periodEnd,
      periodLabel
    );
  }

  /**
   * Core aggregate calculation logic
   */
  async _updateSummary(driverId, companyId, periodType, periodStart, periodEnd, periodLabel) {
    // Get all earnings for the period
    const earnings = await prisma.driverEarning.findMany({
      where: {
        driverId,
        earnedAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
    });

    if (earnings.length === 0) {
      console.log(`📊 No earnings for ${periodType} ${periodLabel}`);
      return null;
    }

    // Calculate aggregates
    const summary = earnings.reduce(
      (acc, earning) => {
        acc.totalEarnings += parseFloat(earning.driverEarnings) || 0;
        acc.totalTrips += 1;
        acc.totalDistance += parseFloat(earning.tripDistance) || 0;
        acc.totalDuration += parseInt(earning.tripDuration) || 0;

        // Payment method breakdown
        const method = earning.paymentMethod.toUpperCase();
        switch (method) {
          case 'CASH':
            acc.cashEarnings += parseFloat(earning.driverEarnings) || 0;
            acc.cashTrips += 1;
            break;
          case 'CARD':
            acc.cardEarnings += parseFloat(earning.driverEarnings) || 0;
            acc.cardTrips += 1;
            break;
          case 'EFTPOS':
            acc.eftposEarnings += parseFloat(earning.driverEarnings) || 0;
            acc.eftposTrips += 1;
            break;
          case 'ACCOUNT':
            acc.accountEarnings += parseFloat(earning.driverEarnings) || 0;
            acc.accountTrips += 1;
            break;
          case 'GIFTCARD':
            acc.giftCardEarnings += parseFloat(earning.driverEarnings) || 0;
            acc.giftCardTrips += 1;
            break;
        }

        // Special categories
        if (earning.totalMobility) {
          acc.totalMobilityEarnings += parseFloat(earning.driverEarnings) || 0;
          acc.totalMobilityTrips += 1;
        }

        if (earning.isAdjustment) {
          acc.adjustmentEarnings += parseFloat(earning.driverEarnings) || 0;
          acc.adjustmentTrips += 1;
        }

        // Commission
        acc.totalCompanyCommission += parseFloat(earning.companyCommission) || 0;

        // Fare breakdown
        acc.totalBaseFare += parseFloat(earning.baseFare) || 0;
        acc.totalDistanceFare += parseFloat(earning.distanceFare) || 0;
        acc.totalTimeFare += parseFloat(earning.timeFare) || 0;
        acc.totalWaitingFare += parseFloat(earning.waitingFare) || 0;
        acc.totalExtraAmount += parseFloat(earning.extraAmount) || 0;
        acc.totalDiscountAmount += parseFloat(earning.discountAmount) || 0;

        return acc;
      },
      {
        totalEarnings: 0,
        totalTrips: 0,
        totalDistance: 0,
        totalDuration: 0,
        cashEarnings: 0,
        cashTrips: 0,
        cardEarnings: 0,
        cardTrips: 0,
        eftposEarnings: 0,
        eftposTrips: 0,
        accountEarnings: 0,
        accountTrips: 0,
        giftCardEarnings: 0,
        giftCardTrips: 0,
        totalMobilityEarnings: 0,
        totalMobilityTrips: 0,
        adjustmentEarnings: 0,
        adjustmentTrips: 0,
        totalCompanyCommission: 0,
        totalBaseFare: 0,
        totalDistanceFare: 0,
        totalTimeFare: 0,
        totalWaitingFare: 0,
        totalExtraAmount: 0,
        totalDiscountAmount: 0,
      }
    );

    // Calculate average commission rate
    const averageCommissionRate =
      summary.totalTrips > 0
        ? summary.totalCompanyCommission /
          (summary.totalEarnings + summary.totalCompanyCommission)
        : 0.2;

    // Upsert summary record
    const summaryRecord = await prisma.driverEarningsSummary.upsert({
      where: {
        driverId_periodType_periodLabel: {
          driverId,
          periodType,
          periodLabel,
        },
      },
      update: {
        ...summary,
        averageCommissionRate,
        periodStart,
        periodEnd,
        updatedAt: new Date(),
      },
      create: {
        driverId,
        companyId,
        periodType,
        periodStart,
        periodEnd,
        periodLabel,
        ...summary,
        averageCommissionRate,
      },
    });

    console.log(
      `✅ ${periodType} summary updated: ${periodLabel} - $${summary.totalEarnings.toFixed(
        2
      )} (${summary.totalTrips} trips)`
    );

    return summaryRecord;
  }

  /**
   * Get earnings summary for a driver
   * @param {string} driverId - Driver ID
   * @param {string} period - 'today', 'week', 'month'
   * @returns {Promise<Object>} Earnings summary
   */
  async getSummary(driverId, period = 'today') {
    const now = new Date();
    let periodType, periodLabel;

    switch (period.toLowerCase()) {
      case 'today':
      case 'daily':
        periodType = 'DAILY';
        periodLabel = now.toISOString().split('T')[0];
        break;
      case 'week':
      case 'weekly':
        periodType = 'WEEKLY';
        const weekNum = this._getWeekNumber(now);
        periodLabel = `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
        break;
      case 'month':
      case 'monthly':
        periodType = 'MONTHLY';
        periodLabel = `${now.getFullYear()}-${(now.getMonth() + 1)
          .toString()
          .padStart(2, '0')}`;
        break;
      default:
        throw new Error(`Invalid period: ${period}`);
    }

    const summary = await prisma.driverEarningsSummary.findUnique({
      where: {
        driverId_periodType_periodLabel: {
          driverId,
          periodType,
          periodLabel,
        },
      },
    });

    if (!summary) {
      // Return empty summary if none exists
      return {
        periodType,
        periodLabel,
        totalEarnings: 0,
        totalTrips: 0,
        totalDistance: 0,
        cashEarnings: 0,
        cardEarnings: 0,
        eftposEarnings: 0,
        accountEarnings: 0,
        giftCardEarnings: 0,
      };
    }

    return summary;
  }

  /**
   * Get earnings history with pagination and filters
   */
  async getHistory(driverId, options = {}) {
    const {
      page = 1,
      limit = 20,
      startDate = null,
      endDate = null,
      paymentMethod = null,
      includeAdjustments = true,
    } = options;

    const where = {
      driverId,
      ...(startDate && endDate
        ? {
            earnedAt: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }
        : {}),
      ...(paymentMethod ? { paymentMethod: paymentMethod.toUpperCase() } : {}),
      ...(includeAdjustments === false ? { isAdjustment: false } : {}),
    };

    const [earnings, total] = await Promise.all([
      prisma.driverEarning.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              jobId: true,
              pickupAddress: true,
              dropoffAddress: true,
            },
          },
          payment: {
            select: {
              id: true,
              paymentMethod: true,
              status: true,
            },
          },
        },
        orderBy: { earnedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.driverEarning.count({ where }),
    ]);

    return {
      earnings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get adjustment history
   */
  async getAdjustments(driverId, options = {}) {
    const { page = 1, limit = 20 } = options;

    return this.getHistory(driverId, {
      ...options,
      page,
      limit,
      includeAdjustments: true,
    });
  }

  /**
   * Get ISO week number
   */
  _getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  /**
   * Get fleet earnings for owner (aggregated by driver)
   */
  async getFleetEarnings(companyId, period = 'today') {
    const now = new Date();
    let periodType, periodLabel;

    switch (period.toLowerCase()) {
      case 'today':
      case 'daily':
        periodType = 'DAILY';
        periodLabel = now.toISOString().split('T')[0];
        break;
      case 'week':
      case 'weekly':
        periodType = 'WEEKLY';
        const weekNum = this._getWeekNumber(now);
        periodLabel = `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
        break;
      case 'month':
      case 'monthly':
        periodType = 'MONTHLY';
        periodLabel = `${now.getFullYear()}-${(now.getMonth() + 1)
          .toString()
          .padStart(2, '0')}`;
        break;
      default:
        throw new Error(`Invalid period: ${period}`);
    }

    const summaries = await prisma.driverEarningsSummary.findMany({
      where: {
        companyId,
        periodType,
        periodLabel,
      },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: {
        totalEarnings: 'desc',
      },
    });

    // Calculate fleet totals
    const fleetTotals = summaries.reduce(
      (acc, summary) => {
        acc.totalEarnings += parseFloat(summary.totalEarnings) || 0;
        acc.totalTrips += summary.totalTrips || 0;
        acc.totalCommission += parseFloat(summary.totalCompanyCommission) || 0;
        return acc;
      },
      { totalEarnings: 0, totalTrips: 0, totalCommission: 0 }
    );

    return {
      period: periodLabel,
      periodType,
      drivers: summaries,
      fleetTotals,
    };
  }
}

// Export the class (not a singleton instance)
module.exports = EarningsService;
