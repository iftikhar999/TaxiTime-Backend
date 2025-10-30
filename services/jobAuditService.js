const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

/**
 * Job Audit Service
 * Tracks every action, status change, and movement for jobs
 */
class JobAuditService {
    /**
     * Log any job-related action
     * @param {Object} params
     * @param {string} params.jobId - Job ID
     * @param {string} params.action - Action type (e.g., 'CREATED', 'ASSIGNED', 'STATUS_CHANGED')
     * @param {string} [params.status] - New status
     * @param {string} [params.previousStatus] - Previous status
     * @param {string} [params.driverId] - Driver ID involved
     * @param {string} [params.assignedBy] - User who performed the action
     * @param {Object} [params.metadata] - Additional data
     * @param {string} [params.userId] - User who triggered the action
     * @param {string} [params.userRole] - Role of user who triggered the action
     */
    async logAction({
        jobId,
        action,
        status = null,
        previousStatus = null,
        driverId = null,
        assignedBy = null,
        metadata = null,
        userId = null,
        userRole = null,
    }) {
        try {
            const logEntry = await prisma.$executeRaw`
        INSERT INTO job_audit_logs (
          id, "jobId", action, status, "previousStatus", 
          "driverId", "assignedBy", metadata, "userId", "userRole"
        ) VALUES (
          ${uuidv4()}, ${jobId}, ${action}, ${status}, ${previousStatus},
          ${driverId}, ${assignedBy}, ${JSON.stringify(metadata)}, ${userId}, ${userRole}
        )
      `;

            console.log(`📝 [JobAudit] ${action} - Job: ${jobId}${status ? ` → ${status}` : ''}${driverId ? ` (Driver: ${driverId})` : ''}`);

            return logEntry;
        } catch (error) {
            console.error('❌ [JobAudit] Failed to log action:', error);
            // Don't throw - audit logging should not break the main flow
        }
    }

    /**
     * Log job creation
     */
    async logCreation(jobId, customerId, metadata = {}) {
        return this.logAction({
            jobId,
            action: 'JOB_CREATED',
            status: 'PENDING',
            userId: customerId,
            userRole: 'CUSTOMER',
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
            },
        });
    }

    /**
     * Log job assignment to driver
     */
    async logAssignment(jobId, driverId, assignedBy, previousStatus, metadata = {}) {
        return this.logAction({
            jobId,
            action: 'JOB_ASSIGNED',
            status: 'OFFERED',
            previousStatus,
            driverId,
            assignedBy,
            userId: assignedBy,
            userRole: 'DISPATCHER',
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
            },
        });
    }

    /**
     * Log job unassignment
     */
    async logUnassignment(jobId, driverId, unassignedBy, reason, previousStatus, metadata = {}) {
        return this.logAction({
            jobId,
            action: 'JOB_UNASSIGNED',
            status: 'UNASSIGNED',
            previousStatus,
            driverId,
            assignedBy: unassignedBy,
            userId: unassignedBy,
            userRole: 'DISPATCHER',
            metadata: {
                reason,
                ...metadata,
                timestamp: new Date().toISOString(),
            },
        });
    }

    /**
     * Log status change
     */
    async logStatusChange(jobId, newStatus, previousStatus, driverId = null, userId = null, userRole = null, metadata = {}) {
        return this.logAction({
            jobId,
            action: 'STATUS_CHANGED',
            status: newStatus,
            previousStatus,
            driverId,
            userId,
            userRole,
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
            },
        });
    }

    /**
     * Log driver acceptance
     */
    async logDriverAcceptance(jobId, driverId, previousStatus, metadata = {}) {
        return this.logAction({
            jobId,
            action: 'DRIVER_ACCEPTED',
            status: 'ACCEPTED',
            previousStatus,
            driverId,
            userId: driverId,
            userRole: 'DRIVER',
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
            },
        });
    }

    /**
     * Log driver rejection
     */
    async logDriverRejection(jobId, driverId, reason, previousStatus, metadata = {}) {
        return this.logAction({
            jobId,
            action: 'DRIVER_REJECTED',
            status: 'REJECTED',
            previousStatus,
            driverId,
            userId: driverId,
            userRole: 'DRIVER',
            metadata: {
                reason,
                ...metadata,
                timestamp: new Date().toISOString(),
            },
        });
    }

    /**
     * Log job cancellation
     */
    async logCancellation(jobId, cancelledBy, reason, previousStatus, userRole, metadata = {}) {
        return this.logAction({
            jobId,
            action: 'JOB_CANCELLED',
            status: 'CANCELLED',
            previousStatus,
            userId: cancelledBy,
            userRole,
            metadata: {
                reason,
                ...metadata,
                timestamp: new Date().toISOString(),
            },
        });
    }

    /**
     * Log job completion
     */
    async logCompletion(jobId, driverId, previousStatus, metadata = {}) {
        return this.logAction({
            jobId,
            action: 'JOB_COMPLETED',
            status: 'COMPLETED',
            previousStatus,
            driverId,
            userId: driverId,
            userRole: 'DRIVER',
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
            },
        });
    }

    /**
     * Get complete audit trail for a job
     */
    async getJobHistory(jobId) {
        try {
            const history = await prisma.$queryRaw`
        SELECT * FROM job_audit_logs 
        WHERE "jobId" = ${jobId} 
        ORDER BY timestamp ASC
      `;

            return history;
        } catch (error) {
            console.error('❌ [JobAudit] Failed to fetch job history:', error);
            return [];
        }
    }

    /**
     * Get recent audit logs for a job
     */
    async getRecentLogs(jobId, limit = 10) {
        try {
            const logs = await prisma.$queryRaw`
        SELECT * FROM job_audit_logs 
        WHERE "jobId" = ${jobId} 
        ORDER BY timestamp DESC 
        LIMIT ${limit}
      `;

            return logs;
        } catch (error) {
            console.error('❌ [JobAudit] Failed to fetch recent logs:', error);
            return [];
        }
    }
}

module.exports = new JobAuditService();
