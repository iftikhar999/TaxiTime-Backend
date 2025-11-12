-- ═══════════════════════════════════════════════════════════════
-- TAXITIME V2 - PERFORMANCE INDEXES
-- ═══════════════════════════════════════════════════════════════
-- This script creates additional indexes to optimize query performance
-- for real-time taxi dispatch operations
-- ═══════════════════════════════════════════════════════════════

-- Start transaction
BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- JOBS TABLE - Critical for dispatch operations
-- ═══════════════════════════════════════════════════════════════

-- Index for finding available jobs by company and status
CREATE INDEX IF NOT EXISTS idx_jobs_company_status_created 
ON jobs(companyId, status, createdAt DESC) 
WHERE status IN ('PENDING', 'OFFERED', 'ASSIGNED');

-- Index for active jobs lookup
CREATE INDEX IF NOT EXISTS idx_jobs_active_status 
ON jobs(status, updatedAt DESC) 
WHERE status IN ('PENDING', 'OFFERED', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'PICKED_UP', 'IN_PROGRESS');

-- Index for driver's active/completed jobs
CREATE INDEX IF NOT EXISTS idx_jobs_driver_status_date 
ON jobs(assignedDriverId, status, createdAt DESC) 
WHERE assignedDriverId IS NOT NULL;

-- Index for scheduled jobs
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled 
ON jobs(scheduledFor, status) 
WHERE scheduledFor IS NOT NULL;

-- Index for job metrics and analytics
CREATE INDEX IF NOT EXISTS idx_jobs_completed_metrics 
ON jobs(companyId, completedAt, status) 
WHERE status = 'COMPLETED';

-- Index for passenger job history
CREATE INDEX IF NOT EXISTS idx_jobs_passenger_history 
ON jobs(passengerId, createdAt DESC);

-- Composite index for zone-based job search
CREATE INDEX IF NOT EXISTS idx_jobs_pickup_zone_status 
ON jobs(pickupZoneId, status, createdAt DESC) 
WHERE pickupZoneId IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- USERS TABLE - Authentication & Authorization
-- ═══════════════════════════════════════════════════════════════

-- Index for active drivers lookup
CREATE INDEX IF NOT EXISTS idx_users_active_drivers 
ON users(companyId, role, isActive, updatedAt) 
WHERE role = 'DRIVER' AND isActive = true;

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role_active 
ON users(role, isActive, createdAt DESC);

-- Index for company admin lookup
CREATE INDEX IF NOT EXISTS idx_users_company_active 
ON users(companyId, isActive) 
WHERE companyId IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- SHIFTS TABLE - Driver availability
-- ═══════════════════════════════════════════════════════════════

-- Index for active shifts lookup
CREATE INDEX IF NOT EXISTS idx_shifts_active 
ON shifts(driverId, status, startTime, endTime) 
WHERE status = 'ACTIVE';

-- Index for company shift management
CREATE INDEX IF NOT EXISTS idx_shifts_company_date 
ON shifts(companyId, startTime DESC, status);

-- Index for shift analytics
CREATE INDEX IF NOT EXISTS idx_shifts_driver_timerange 
ON shifts(driverId, startTime, endTime, status);

-- ═══════════════════════════════════════════════════════════════
-- VEHICLES TABLE - Fleet management
-- ═══════════════════════════════════════════════════════════════

-- Index for available vehicles
CREATE INDEX IF NOT EXISTS idx_vehicles_available 
ON vehicles(companyId, currentStatus, isActive) 
WHERE isActive = true;

-- Index for driver's vehicle lookup
CREATE INDEX IF NOT EXISTS idx_vehicles_driver 
ON vehicles(currentDriverId, isActive) 
WHERE currentDriverId IS NOT NULL;

-- Index for vehicle type filtering
CREATE INDEX IF NOT EXISTS idx_vehicles_type_status 
ON vehicles(vehicleType, currentStatus, companyId);

-- ═══════════════════════════════════════════════════════════════
-- LOCATION_UPDATES TABLE - Real-time tracking
-- ═══════════════════════════════════════════════════════════════

-- Index for latest driver location
CREATE INDEX IF NOT EXISTS idx_location_driver_timestamp 
ON location_updates(driverId, timestamp DESC);

-- Index for zone-based driver search
CREATE INDEX IF NOT EXISTS idx_location_zone_timestamp 
ON location_updates(zoneId, timestamp DESC) 
WHERE zoneId IS NOT NULL;

-- Index for active drivers with recent location
CREATE INDEX IF NOT EXISTS idx_location_recent_active 
ON location_updates(timestamp DESC, driverId) 
WHERE timestamp > NOW() - INTERVAL '5 minutes';

-- ═══════════════════════════════════════════════════════════════
-- ASSIGNMENTS TABLE - Job assignments
-- ═══════════════════════════════════════════════════════════════

-- Index for driver's current assignment
CREATE INDEX IF NOT EXISTS idx_assignments_driver_active 
ON assignments(driverId, status, assignedAt DESC) 
WHERE status IN ('PENDING', 'ACCEPTED', 'IN_PROGRESS');

-- Index for job assignment history
CREATE INDEX IF NOT EXISTS idx_assignments_job_history 
ON assignments(jobId, assignedAt DESC);

-- ═══════════════════════════════════════════════════════════════
-- OFFERS TABLE - Job offers to drivers
-- ═══════════════════════════════════════════════════════════════

-- Index for pending offers
CREATE INDEX IF NOT EXISTS idx_offers_pending 
ON offers(driverId, status, offeredAt DESC) 
WHERE status = 'PENDING';

-- Index for job offers lookup
CREATE INDEX IF NOT EXISTS idx_offers_job_status 
ON offers(jobId, status, offeredAt DESC);

-- Index for offer expiry check
CREATE INDEX IF NOT EXISTS idx_offers_expiry 
ON offers(expiresAt, status) 
WHERE status = 'PENDING';

-- ═══════════════════════════════════════════════════════════════
-- NOTIFICATIONS TABLE - User notifications
-- ═══════════════════════════════════════════════════════════════

-- Index for unread notifications
CREATE INDEX IF NOT EXISTS idx_notifications_unread 
ON notifications(userId, isRead, createdAt DESC) 
WHERE isRead = false;

-- Index for notification type filtering
CREATE INDEX IF NOT EXISTS idx_notifications_type_user 
ON notifications(userId, type, createdAt DESC);

-- ═══════════════════════════════════════════════════════════════
-- PAYMENTS TABLE - Financial transactions
-- ═══════════════════════════════════════════════════════════════

-- Index for pending payments
CREATE INDEX IF NOT EXISTS idx_payments_pending 
ON payments(status, createdAt DESC) 
WHERE status = 'PENDING';

-- Index for company payment analytics
CREATE INDEX IF NOT EXISTS idx_payments_company_date 
ON payments(companyId, paidAt DESC, status) 
WHERE companyId IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- DRIVER_EARNINGS TABLE - Earnings tracking
-- ═══════════════════════════════════════════════════════════════

-- Already has good indexes, adding settlement tracking
CREATE INDEX IF NOT EXISTS idx_earnings_unsettled 
ON driver_earnings(driverId, isSettled, earnedAt DESC) 
WHERE isSettled = false;

-- ═══════════════════════════════════════════════════════════════
-- COMPANIES TABLE - Company management
-- ═══════════════════════════════════════════════════════════════

-- Index for active companies
CREATE INDEX IF NOT EXISTS idx_companies_active 
ON companies(isActive, subscriptionStatus) 
WHERE isActive = true;

-- ═══════════════════════════════════════════════════════════════
-- ZONES TABLE - Geographic zones
-- ═══════════════════════════════════════════════════════════════

-- Index for active zones by company
CREATE INDEX IF NOT EXISTS idx_zones_company_active 
ON zones(companyId, isActive) 
WHERE isActive = true;

-- Index for zone type filtering
CREATE INDEX IF NOT EXISTS idx_zones_type_company 
ON zones(zoneType, companyId, isActive);

-- ═══════════════════════════════════════════════════════════════
-- RIDE_OFFERS TABLE - Ride sharing offers
-- ═══════════════════════════════════════════════════════════════

-- Index for active ride offers
CREATE INDEX IF NOT EXISTS idx_ride_offers_active 
ON ride_offers(rideId, status, createdAt DESC) 
WHERE status IN ('PENDING', 'ACCEPTED');

-- ═══════════════════════════════════════════════════════════════
-- MESSAGES TABLE - Chat/messaging
-- ═══════════════════════════════════════════════════════════════

-- Index for conversation lookup
CREATE INDEX IF NOT EXISTS idx_messages_conversation 
ON messages(senderId, recipientId, createdAt DESC);

-- Index for unread messages
CREATE INDEX IF NOT EXISTS idx_messages_unread 
ON messages(recipientId, isRead, createdAt DESC) 
WHERE isRead = false;

-- ═══════════════════════════════════════════════════════════════
-- RATINGS TABLE - Driver/passenger ratings
-- ═══════════════════════════════════════════════════════════════

-- Index for driver ratings lookup
CREATE INDEX IF NOT EXISTS idx_ratings_driver_date 
ON ratings(driverId, createdAt DESC) 
WHERE driverId IS NOT NULL;

-- Index for passenger ratings
CREATE INDEX IF NOT EXISTS idx_ratings_passenger_date 
ON ratings(passengerId, createdAt DESC) 
WHERE passengerId IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- SUPPORT_TICKETS TABLE - Customer support
-- ═══════════════════════════════════════════════════════════════

-- Index for open tickets
CREATE INDEX IF NOT EXISTS idx_tickets_open 
ON support_tickets(status, priority, createdAt DESC) 
WHERE status IN ('OPEN', 'IN_PROGRESS');

-- Index for user tickets
CREATE INDEX IF NOT EXISTS idx_tickets_user_status 
ON support_tickets(userId, status, createdAt DESC);

-- ═══════════════════════════════════════════════════════════════
-- Additional Performance Optimizations
-- ═══════════════════════════════════════════════════════════════

-- Create composite indexes for common JOIN operations
CREATE INDEX IF NOT EXISTS idx_company_drivers_lookup 
ON company_drivers(companyId, userId, status);

CREATE INDEX IF NOT EXISTS idx_company_vehicles_active 
ON company_vehicles(companyId, vehicleId, isActive);

CREATE INDEX IF NOT EXISTS idx_vehicle_zones_lookup 
ON vehicle_zones(vehicleId, zoneId, canOperate);

-- Commit transaction
COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- ANALYZE TABLES - Update statistics for query planner
-- ═══════════════════════════════════════════════════════════════

ANALYZE jobs;
ANALYZE users;
ANALYZE shifts;
ANALYZE vehicles;
ANALYZE location_updates;
ANALYZE assignments;
ANALYZE offers;
ANALYZE notifications;
ANALYZE payments;
ANALYZE driver_earnings;
ANALYZE companies;
ANALYZE zones;
ANALYZE ride_offers;
ANALYZE messages;
ANALYZE ratings;
ANALYZE support_tickets;

-- ═══════════════════════════════════════════════════════════════
-- Summary
-- ═══════════════════════════════════════════════════════════════

SELECT 
    'Performance indexes created successfully!' as status,
    COUNT(*) as total_indexes,
    COUNT(DISTINCT tablename) as tables_indexed
FROM pg_indexes 
WHERE schemaname = 'public';
