# TaxiTime V2 Multi-Service Architecture Master Plan (Deep)

Purpose: exhaustive, implementation-ready blueprint to evolve TaxiTime into a multi-service platform (Taxi, Delivery, Courier) with zero data loss, minimal downtime, and full backward compatibility. If you follow this document in order, you should not need to guess or improvise during implementation.

---

## 0. Objectives and Guardrails
- Preserve existing Taxi flows while adding Delivery and Courier with clear feature flags.
- Normalize service configuration (company-level) and pricing; keep historical data intact.
- Introduce multi-stop, proof-of-delivery, and service-specific dispatch logic.
- Keep authZ by role/company, and propagate `serviceType` through every layer (API, sockets, UI, analytics).
- Ship in phased increments with roll-forward/rollback plans and metrics to prove readiness.

---

## 0.1 Service Decomposition (house-piping model)
Rooms = services, pipes = APIs/events, geyser = event bus/cache, valves = feature flags/retries. Each service owns its data and publishes events; consumers subscribe, not couple to tables.
- **Job Service** — owns `jobs`, `job_stops`, `job_stop_items`, `courier_routes`, `job_events`. APIs: create/update/status, stop transitions, POD attach. Events: `job.created`, `job.updated`, `job.stop.updated`, `job.completed`, `job.cancelled`, `job.pod.captured`.
- **Pricing/Quote Service** — owns `service_pricing_profiles`/rules. APIs: quote, profile CRUD. Events: `quote.calculated` (optional). Pure compute; cached profiles.
- **Dispatch/Assignment Service** — owns `assignments`; orchestrates offers; reads drivers/zones. APIs: assign/cancel/recall. Events: `assignment.sent`, `assignment.accepted`, `assignment.rejected`, `job.auto_assigned`.
- **Driver Service** — owns driver status/availability/capabilities/vehicles. APIs: search by serviceType/zone/capability. Events: `driver.status.updated`, `driver.location.updated`.
- **Zone/Geo Service** — owns zones/geofences; wrappers for reverse geocode/distance matrix/route optimization. APIs: zone lookup, route plan. Events: `zone.updated`.
- **Tracking Service** — owns `location_updates` and live caches; emits `tracking.tick` for sockets; consumes driver locations.
- **POD/Media Service** — owns `job_stop_proofs` + media storage/verification. APIs: upload/list/flag. Events: `pod.captured`, `pod.flagged`, `pod.rejected`.
- **Notification Service** — owns outbound (push/SMS/email/IVR). Consumes job/assignment/pod events; emits `notification.sent` with delivery status.
- **Config/Company Service** — owns `companies`, `company_services`, pricing linkage; emits `company.service.updated`.
- **Reporting/Analytics Service** — consumes all events; maintains aggregates per serviceType/company. APIs: reports/export.

**Inter-service contracts**
- Use REST (or gRPC) for synchronous reads/compute (quote, driver search, zone lookup). Avoid synchronous write fan-out; rely on events.
- Idempotency keys on create/assign/POD endpoints. DTOs live in `shared/contracts`.

**Event bus**
- Kafka/Redis Streams/RabbitMQ topics: `job.*`, `assignment.*`, `driver.*`, `zone.*`, `pod.*`, `tracking.*`, `company.*`.
- Message headers: `serviceType`, `companyId`, `jobId`, `stopId?`, `traceId`.
- DLQ + retries; consumers idempotent (use eventId + source).

**Data ownership rules**
- Only Job Service writes job tables; others call APIs or read replicas.
- Only Pricing writes profiles; Job references by ID.
- Only Driver writes status/location (Tracking can append telemetry).
- Only Zone writes zones; others cache.
- Only POD writes proofs; Job holds FK; Notification references URL only.

**Failure isolation / fallbacks**
- Pricing down → fall back to cached profile; 503 for quote when stale; log metric.  
- Zone/Geo down → straight-line distance; set `optimizationStatus=FAILED`; allow manual route.  
- POD down → if `proofRequired`, allow defer-with-retry queue; block job completion until proof arrives (configurable).  
- Dispatch failures → DLQ + re-offer; accept/decline endpoints idempotent.

**Cache layers**
- Redis/in-memory for profiles, zones, driver availability snapshots, active stops list.  
- Invalidate on `company.service.updated`, `zone.updated`, `driver.status.updated`, `quote.calculated` as needed.

---

## 0.2 Project Structure Alignment (current repo)
- **Backend**: `server.js` bootstraps Express + Socket namespaces; routes under `routes/*` (taxi-focused today); services under `services/*` (autoDispatch, queueManagement, pricing, routing, tracking, earnings).  
  - New work: expand `routes/foodDelivery.js` (or rename to `delivery.js`), `routes/courier.js`, add `/api/v2` routes (dispatch/passenger/driver).  
  - Services to extend: `pricingService.js` (profiles/rules), `jobService.js` (stops/POD/state machine), `autoDispatchService.js`, `queueManagementService.js`, `routingService.js` (routePlan), `notificationService.js` (per service templates), `jobAuditService.js` (job_events).  
  - Sockets: `socket-handlers/enhancedDriverStatusHandlers.js` to emit `serviceType` and stop events; consider dedicated handlers per namespace.  
  - Database: `prisma/schema.prisma` to be updated per Section 1; migrations under `prisma/migrations/*`; add backfill scripts under `scripts/migrations/*`.
- **Frontend Dispatch**: `frontend/dispatch` (minimal now). Plan: add service switcher, boards, stop list, POD viewer, API client to `/api/v2`.  
- **Driver App**: `mobile/driver-app-v1` React Native. Plan: add service-aware queue, delivery/courier flows, POD capture.  
- **Shared**: Add `shared/*` or `src/utils/*` for constants (`serviceTypes`, `socketEvents`, status maps) and DTO validators (Joi/Zod).
- **Docs/Tracking**: This file lives at `Documentation/V2_MULTI_SERVICE_ARCHITECTURE.md`; keep it updated as work completes.

---

## 0.3 Event Contracts (authoritative payloads)
- **job.created**: `{ jobId, companyId, serviceType, channel, customerId?, pricingProfileId?, stops:[{stopId, sequence, type, address, lat, lng, proofRequired, proofType?, pincode?}], tipAmount?, tags? }`
- **job.updated**: `{ jobId, status, serviceType, stopCount, routeId?, priority?, tags?, updatedAt }`
- **job.stop.updated**: `{ jobId, stopId, sequence, status, eta?, arrivedAt?, completedAt?, proofRequired?, proofType? }`
- **job.pod.captured**: `{ jobId, stopId, driverId, type, photoUrls?, signatureUrl?, note?, recipientName?, capturedAt }`
- **assignment.sent**: `{ jobId, driverId, companyId, serviceType, expiresAt, distanceToPickupKm?, offerId }`
- **assignment.accepted/rejected**: `{ jobId, driverId, companyId, serviceType, reason?, respondedAt }`
- **driver.status.updated**: `{ driverId, companyId, status, serviceTypeCapabilities:{taxi,delivery,courier}, location? }`
- **driver.location.updated**: `{ driverId, lat, lng, heading?, speed?, jobId?, stopId?, serviceType? }`
- **quote.calculated**: `{ quoteId, companyId, serviceType, vehicleType?, distanceKm, durationMinutes, breakdown:{base,distance,time,stopFees?,surge?,tax?}, currency }`
- **company.service.updated**: `{ companyId, serviceType, enabled, pricingProfileId?, autoDispatch?, maxParallelOffers?, dispatchRadiusKm?, updatedBy }`
- **pod.flagged/rejected**: `{ jobId, stopId, driverId, reason, verificationResult, flaggedAt }`

All events must include headers: `traceId`, `serviceType`, `companyId`, and be idempotent via `eventId`.

---

## 1. Database Schema

### 1.1 New enums (Prisma)
```prisma
enum ServiceType { TAXI DELIVERY COURIER }                  // aligns with existing JobType
enum CourierStopType { PICKUP DROPOFF RETURN }
enum CourierStopStatus { PENDING READY ARRIVED PICKED_UP IN_TRANSIT DELIVERED FAILED CANCELLED }
enum ProofType { PHOTO SIGNATURE PIN CODE NOTE }
enum JobChannel { DISPATCH PASSENGER_APP OWNER_API SCHEDULED WEB_WIDGET }
enum RouteOptimizationStatus { NOT_REQUESTED REQUESTED OPTIMIZED FAILED }
enum PodVerificationResult { PENDING ACCEPTED REJECTED }
```

### 1.2 New tables (core)
- `company_services` — per-company service enablement + config  
  - `id` (cuid, PK), `companyId` (FK companies.id), `serviceType` (ServiceType), `enabled` (bool default false), `pricingProfileId` (FK service_pricing_profiles.id), `autoDispatch` (bool), `maxParallelOffers` (int), `slaSeconds` (int), `dispatchRadiusKm` (float), `operatingHoursJson` (Json), `geoFenceJson` (Json), `metadata` (Json), timestamps.  
  - Indexes: `(companyId, serviceType)` unique.
- `service_pricing_profiles` — reusable pricing bundles per service  
  - `id` (cuid), `companyId` (FK), `serviceType` (ServiceType), `name`, `baseFare` (Decimal), `perKm` (Decimal), `perMinute` (Decimal), `minFare` (Decimal), `pickupFee` (Decimal), `dropoffFee` (Decimal), `stopFee` (Decimal), `waitingPerMin` (Decimal), `surgeJson` (Json), `taxRate` (Decimal), `currency` (string), `active` (bool), timestamps.  
  - Indexes: `(companyId, serviceType, active)`.
- `service_pricing_rules` — optional overrides  
  - `id` (cuid), `pricingProfileId` (FK), `zoneId` (FK zones.id), `vehicleType` (VehicleType?), `timeWindowJson` (Json), `multiplier` (Float), `flatAdjustment` (Decimal), `metadata` (Json).
- `job_stops` — canonical multi-stop storage  
  - `id` (cuid), `jobId` (FK jobs.id), `sequence` (int), `type` (CourierStopType), `status` (CourierStopStatus), `address` (string), `latitude`/`longitude` (float), `contactName` (string), `contactPhone` (string), `notes` (string), `eta` (DateTime), `arrivedAt` (DateTime), `completedAt` (DateTime), `proofRequired` (bool), `proofType` (ProofType?), `pincode` (string?), `instructions` (string?), `metadata` (Json).  
  - Indexes: `(jobId, sequence)`, `(jobId, status)`.
- `job_stop_items` — items per stop (delivery/courier)  
  - `id` (cuid), `stopId` (FK job_stops.id), `name` (string), `qty` (int), `weightGrams` (int?), `volumeCubicCm` (int?), `price` (Decimal?), `metadata` (Json).
- `job_stop_proofs` — proof-of-delivery/collection  
  - `id` (cuid), `jobId` (FK), `stopId` (FK), `driverId` (FK users.id), `type` (ProofType), `photoUrls` (string[]), `signatureUrl` (string?), `note` (string?), `recipientName` (string?), `capturedAt` (DateTime), `verificationResult` (PodVerificationResult?), `metadata` (Json).
- `courier_routes` — route metadata for multi-stop courier  
  - `id` (cuid), `jobId` (FK jobs.id unique), `totalStops` (int), `completedStops` (int), `returnRequired` (bool), `returnStopId` (FK job_stops.id?), `routeOptimized` (bool), `optimizationStatus` (RouteOptimizationStatus default NOT_REQUESTED), `routePlanJson` (Json), `metadata` (Json), timestamps.
- `job_events` — audit trail for jobs and stops  
  - `id` (cuid), `jobId` (FK), `stopId` (nullable FK), `actorId` (FK users.id?), `actorRole` (string), `event` (string), `fromStatus` (string?), `toStatus` (string), `data` (Json), `createdAt` (DateTime).  
  - Indexes: `(jobId, createdAt)`, `(stopId, createdAt)`.

### 1.3 Changes to existing tables (selected)
- `jobs` (`jobs`)  
  - Add: `channel` (JobChannel default DISPATCH), `deliveryType` (DeliveryType?), `serviceType` (ServiceType, mirror of `type`), `pricingProfileId` (FK service_pricing_profiles.id), `pickupContactName`/`pickupContactPhone`, `dropoffContactName`/`dropoffContactPhone`, `pickupWindowStart`/`pickupWindowEnd`, `dropoffWindowStart`/`dropoffWindowEnd`, `tipAmount` (Decimal?), `stopCount` (int default 0), `routeId` (FK courier_routes.id?), `proofRequired` (bool default false), `podType` (ProofType?), `returnToSender` (bool default false), `tags` (string[]), `serviceMetadata` (Json), `channelMetadata` (Json).  
  - Indexes: `(serviceType, status)`, `(channel, createdAt DESC)`, `(routeId)`.
- `delivery_orders`  
  - Add: `pickupWindowStart/End`, `dropoffWindowStart/End`, `failReason` (string?), `attemptCount` (int default 0), `priority` (int), `instructions` (string?), `tipAmount` (Decimal?), `itemsStructured` (Json?) optional mirror of `job_stop_items`.  
  - Link `jobId` if a delivery order always spawns a job (optional).
- `assignments`  
  - Add `serviceType` (ServiceType), index `(driverId, serviceType, status)`.
- `offers`, `rides`, `location_updates`, `alarms`, `messages`, `payments`, `driver_earnings`  
  - Add `serviceType` (ServiceType) column for reporting and filtering; backfill from jobs.type.
- `vehicles` (or vehicle_capabilities)  
  - Add `supportsTaxi`, `supportsDelivery`, `supportsCourier` (bool), `cargoVolumeCubicCm`, `maxLoadKg`, `coldChain` (bool?) if needed for grocery/pharmacy.
- `companies`  
  - Keep `serviceModes` Json; add `defaultServiceType` (ServiceType?), `serviceModeVersion` (int default 1) to signal normalized `company_services`.

### 1.4 State machines (authoritative)
- **Job (Taxi)**: PENDING → ASSIGNED → ACCEPTED → ON_THE_WAY/ARRIVED → STARTED/IN_PROGRESS → FINISHED → (optionally) CANCELLED/REJECTED/NOSHOW.
- **Job (Delivery)**: CREATED → ASSIGNED → ACCEPTED → PICKUP_READY? → PICKED_UP → IN_TRANSIT → DELIVERED → (optionally) RETURNED/CANCELLED/FAILED.
- **Job (Courier)**: CREATED → ASSIGNED → ACCEPTED → IN_PROGRESS (per-stop) → COMPLETED when all stops status = DELIVERED/RETURN (and any return stop done). Cancel paths mirror Delivery.
- **Stop (Delivery/Courier)**: PENDING → READY (optional) → ARRIVED → PICKED_UP (for pickup-type stops) → IN_TRANSIT (optional) → DELIVERED/RETURNED → FAILED/CANCELLED.
- Enforce via `job_events` and validation in services; add DB check constraints where feasible for allowed enums.

### 1.5 Migration strategy (safe, no data loss)
1. **Preflight**: Add enums first; generate SQL via `prisma migrate dev --create-only`; review.  
2. **Add tables**: Create `company_services`, `service_pricing_profiles`, `service_pricing_rules`, `job_stops`, `job_stop_items`, `job_stop_proofs`, `courier_routes`, `job_events`. No existing rows touched.  
3. **Add nullable columns**: Add new columns to `jobs`, `delivery_orders`, `assignments`, `payments`, `driver_earnings`, `vehicles`, etc. Defaults avoid backfill errors.  
4. **Backfill scripts**:  
   - From `companies.serviceModes` Json → `company_services` (enable flags, set `serviceModeVersion = 2`).  
   - For historical jobs: set `serviceType = type`, `channel = DISPATCH`, `stopCount = 0` if null.  
   - Copy `jobs.type` → `offers.serviceType`, `assignments.serviceType`, `payments.serviceType`, `driver_earnings.serviceType`.  
5. **Dual-write**: Update code to populate both `serviceModes` Json (legacy) and `company_services` rows until cutover.  
6. **Integrity checks**: Row counts per serviceType across `jobs` vs `payments` vs `driver_earnings`; stopCount equals `job_stops` count; orphan detection queries.  
7. **Deploy**: `prisma migrate deploy` in off-peak; wrap behind feature flag `FEATURE_V2_SERVICES`.  
8. **Post-checks**: Monitor errors, compare latency, validate queries using `EXPLAIN` on new indexes.  
9. **Cleanup**: After stabilizing, make `jobs.serviceType` non-null on new writes and pivot read paths to `company_services`.

### 1.6 Data quality, performance, retention
- Add composite indexes on `(serviceType, createdAt)` for reporting tables; `(driverId, serviceType, status)` for assignments/offers.  
- Add partial indexes if high volume (e.g., `job_events` on recent dates).  
- Retention: keep `job_events` 365 days (configurable), `job_stop_proofs` references immutable storage URLs; do not delete without business approval.  
- Add FK on `job_stop_items.stopId` and cascade delete if job is purged in non-prod only.

---

## 2. Backend API and Services

### 2.1 API principles
- **Versioning**: All new endpoints under `/api/v2`. Keep V1 taxi endpoints intact.  
- **Idempotency**: Support `Idempotency-Key` on create/assign/tip/POD endpoints. Store keys per user/company.  
- **Validation**: Joi/Zod schemas; reject unknown fields; enforce `serviceType` present.  
- **Rate limiting**: Passenger endpoints by IP/user; driver endpoints by driverId; admin endpoints by account.  
- **AuthZ**: Include `serviceType` and `companyId` in JWT claims; verify company enabled for requested service.  
- **Error model**: `{ code, message, details }` with stable codes like `SERVICE_DISABLED`, `STOP_SEQUENCE_INVALID`, `POD_REQUIRED`, `ASSIGNMENT_CONFLICT`.

### 2.2 State machines enforced in services
- Taxi job: PENDING → ASSIGNED → ACCEPTED → ON_THE_WAY → ARRIVED → STARTED → IN_PROGRESS → FINISHED.  
- Delivery job: CREATED → ASSIGNED → ACCEPTED → PICKED_UP → IN_TRANSIT → DELIVERED. Cancel anytime before DELIVERED.  
- Courier job: CREATED → ASSIGNED → ACCEPTED → IN_PROGRESS; stops drive completion; job completes when all required stops done.  
- Stop: PENDING/READY → ARRIVED → (PICKED_UP for pickup type) → IN_TRANSIT (optional) → DELIVERED/RETURNED.  
- POD gate: If `proofRequired`, stop cannot transition to DELIVERED without `job_stop_proofs` row.

### 2.3 Endpoints (expanded)
- **Service config**  
  - `GET /api/v2/services` (owner/admin) — list `company_services` + current pricing.  
  - `POST /api/v2/services` — toggle service, set `pricingProfileId`, `autoDispatch`, `maxParallelOffers`, `dispatchRadiusKm`.  
  - `POST /api/v2/services/:serviceType/pricing-profiles` — CRUD pricing profiles and rules.  
  - `GET /api/v2/services/:serviceType/pricing-profiles` — list active profiles.
- **Quoting**  
  - `POST /api/v2/jobs/quote` — unified; returns pricing breakdown, distance/duration, surge info, tax. Supports `routeOptimization: true` for courier.
- **Job creation**  
  - `POST /api/v2/jobs` — unified create with `serviceType`, `deliveryType?`, `stops[]`, `items[]`, `tipAmount`, `channel`, `pricingProfileId`.  
  - `POST /api/v2/delivery/orders` — shortcut for Delivery with items + merchant (if applicable).  
  - `POST /api/v2/courier/jobs` — accepts `stops` (min 2), `returnRequired`, `optimizeRoute`, `priority`, `instructions`.
- **Job lifecycle**  
  - `PATCH /api/v2/jobs/:id/status` — cancel/recall/priority change; validates serviceType.  
  - `PATCH /api/v2/jobs/:id/assign` — manual assign; checks driver capability and service enablement.  
  - `PATCH /api/v2/jobs/:id/stops/:stopId/status` — per-stop transitions; enforces sequence and POD rules.  
  - `POST /api/v2/jobs/:id/stops/:stopId/proof` — upload/attach POD.  
  - `POST /api/v2/jobs/:id/tip` — add/update tip (card vs cash).  
  - `GET /api/v2/jobs/:id/timeline` — `job_events` feed.  
  - `GET /api/v2/jobs/:id/stops` — ordered stops with ETAs and status.
- **Tracking (passenger-facing)**  
  - `GET /api/v2/tracking/:jobId` — sanitized job + stops + driver location; short-lived token optional.  
  - `GET /api/v2/tracking/:jobId/pod` — fetch POD after completion (if allowed).
- **Driver-facing**  
  - `GET /api/v2/driver/jobs/available?serviceType=` — queue filtered by service.  
  - `POST /api/v2/driver/jobs/:id/accept` — accept (idempotent).  
  - `POST /api/v2/driver/jobs/:id/arrive` — mark arrival at current stop.  
  - `POST /api/v2/driver/jobs/:id/start` — start trip (Taxi) or pickup (Delivery/Courier).  
  - `POST /api/v2/driver/jobs/:id/stops/:stopId/complete` — completes stop with optional POD.  
  - `POST /api/v2/driver/jobs/:id/complete` — completes job if all stops done.  
  - `POST /api/v2/driver/jobs/:id/resequence` — courier resequencing when allowed.
- **Reporting/analytics**  
  - `GET /api/v2/reports/service-summary?from=&to=&serviceType=` — trips, earnings, cancellations, on-time %.  
  - `GET /api/v2/reports/driver-performance?serviceType=` — acceptance, SLA breaches, POD issues.  
  - `GET /api/v2/reports/pod-issues` — failed/flagged proofs.
- **Webhooks (optional)**  
  - `/webhooks/jobs/updated`, `/webhooks/jobs/pod`, `/webhooks/jobs/cancelled` — sign with existing secret, include `serviceType`.

### 2.3.1 DTO/Contract mapping (where to put them)
- Add shared schemas in `shared/contracts` (JS) or `src/utils/contracts` if staying JS; if TS layer exists, `src/types/contracts.ts`.  
- Mirror validation in `middleware/validators/*` (Joi/Zod) and reuse in frontends.  
- Idempotency keys stored in Redis or DB table `idempotency_keys` (if new) keyed by `userId/companyId + key + endpoint`.

### 2.4 Example request/response schemas
- Provided in Section 2.3; add error example:  
```json
{ "code": "POD_REQUIRED", "message": "Proof required before completing stop", "details": { "stopId": "..." } }
```

### 2.5 Background jobs / cron
- Auto-cancel overdue offers per service rules.  
- SLA breach watcher: re-offer or escalate after `slaSeconds`.  
- Route optimizer (courier): compute routePlanJson if `optimizeRoute = true`.  
- Restaurant/merchant readiness poller (Delivery).  
- Tracking token expiry cleanup; POD verification audit queue.  
- Daily reporting aggregation per `serviceType`.

### 2.6 Pricing and dispatch updates
- `pricingService`: load `service_pricing_profiles` + rules; compute per-stop fees; support surge and tax.  
- `autoDispatchService` / `queueManagementService`: filter drivers by capabilities and service; limit offers by `maxParallelOffers`; prioritize by proximity to first stop for courier.  
- `routingService`: distance matrix for ordered stops; optional resequence for courier; fallback if optimizer fails.

### 2.7 Security and compliance
- Ensure PII (names, phones, signatures) kept in encrypted storage; limit POD URL exposure with signed URLs if S3.  
- Ensure tracking tokens are short-lived and scoped to job only.  
- Role checks in every handler; forbid cross-company access.

### 2.8 Cross-service/API dependency map
- Job Service requires: Pricing (quote), Zone/Geo (distance/route), Driver (capability check), Dispatch (assignment orchestration).  
- Dispatch requires: Job (create/update), Driver (availability), Zone (proximity lookup), Notification (offer push), Tracking (driver location).  
- Driver App/API requires: Job (tasks), Tracking (location post), POD (upload), Notification (push receipts).  
- Passenger requires: Job (create/track), Pricing (quote), Notification (receipts/updates).

---

## 3. Realtime (Sockets)
- Namespaces: `/dispatch`, `/driver`, `/customer`; include `serviceType` in all payloads.
- **Dispatch events**  
  - `job:new` — `{ job, stops, pricing }`  
  - `job:updated` — status/pricing changes  
  - `job:stop:updated` — `{ jobId, stopId, status, sequence }`  
  - `job:pod:capture` — `{ jobId, stopId, proof }`  
  - `service:config:update` — company service toggles/pricing profile changes  
  - Rooms: `dispatch_${companyId}`, optionally `dispatch_${companyId}_${serviceType}`.
- **Driver events**  
  - `driver:job:offer`, `driver:job:cancel`, `driver:job:update`, `driver:job:stop` (next stop info), `driver:pod:required`, `driver:route:optimize`.  
  - Rooms: `driver_${driverId}`.
- **Customer events**  
  - `customer:tracking:update` — driver location + current stop  
  - `customer:job:status` — job status changes  
  - `customer:pod:available` — proof ready after completion
- Add ack/retry semantics for critical events (offer, cancel, pod:required).

---

## 4. Dispatch Panel (React)
- **Global UX**: Top-level Service Switcher (Taxi/Delivery/Courier); persists per user; filters API calls and socket rooms.  
- **Boards**: Separate boards per service with columns (Pending, Assigned, In Progress, Completed, Issues). Courier rows show stop chips with counts and completion progress.  
- **Forms**:  
  - Taxi: unchanged.  
  - Delivery: pickup/dropoff, items, tip, proof requirement, pickup/delivery windows, merchant readiness status.  
  - Courier: multi-stop builder (add/reorder), return-to-sender toggle, route optimization toggle, time windows per stop.  
- **Map**:  
  - Taxi: heatmap + driver proximity to pickup.  
  - Delivery: pickup/dropoff markers, readiness badge.  
  - Courier: numbered stop markers + polyline; color by status.  
- **Components to build**: ServiceSwitcher, StopList (drag/drop), ItemList, PODViewer, PricingBreakdown, TimeWindowPicker, RouteSummaryCard, DriverCapabilityBadge, StopSequenceValidator.  
- **State management**: Extend store with `serviceType`, `stops`, `items`, `pricingProfileId`, `activeJob`, `routePlan`. Normalize entities by jobId/stopId.  
- **Permissions**: Role gate for cancel/recall, resequence, free-tip edits.  
- **Edge cases**: prevent completing courier job if open stops; warn on resequence when driver is en route; show SLA timers per service.

---

## 5. Driver App (React Native)
- **Queues**: Tab or filter by serviceType; badge color per service.  
- **Taxi flow**: existing; ensure service badge and correct sockets.  
- **Delivery flow**: pickup → dropoff; show merchant readiness; allow call/chat; POD capture (photo/signature/pin).  
- **Courier flow**: multi-stop list with sequence numbers; next-stop card; allow dispatcher-driven resequence; per-stop start/arrive/complete; return-to-sender handling.  
- **POD screen**: camera, signature pad, PIN entry; offline cache + retry; upload to `/job_stop_proofs`.  
- **Navigation**: deep link to maps per stop; aggregated route for courier; offline fallback shows cached coordinates.  
- **Location**: maintain existing intervals; ensure stop-level updates include `stopId`.  
- **Sync**: on reconnect, refetch active job + stops; block job completion until all required stops are done.  
- **Error handling**: handle POD-required errors, stop-order errors, idempotent accept.

---

## 6. Owner Panel
- **Service configuration**: Toggle services, assign pricing profiles, set SLA, dispatch radius, max offers per service.  
- **Driver capabilities**: Manage per-driver eligibility (Taxi/Delivery/Courier), vehicle capacity/cargo, training flag.  
- **Reporting**: Filters by serviceType; revenue, cancellations, on-time %, POD issues, acceptance. CSV export.  
- **Billing**: Show commissions/fees per service; tie into existing billing_records with serviceType.  
- **Branding**: Service-specific assets (e.g., delivery icon) if exposed to passenger UI.

---

## 7. Passenger App / Website
- **Service selection**: Landing selector; remember last choice; allow deep link (e.g., `?serviceType=COURIER`).  
- **Flows**:  
  - Taxi: unchanged.  
  - Delivery: choose store or pickup location; add items; tip; proof preference; schedule windows.  
  - Courier: multi-stop form (min 2), return-to-sender toggle, optional route optimization preview.  
- **Tracking**: Live driver location; stop-by-stop status for courier; POD preview after completion.  
- **Payments**: Tip pre/post ride; taxes/fees per serviceType; idempotent checkout.  
- **Guest vs logged-in**: allow guest checkout with phone verification if required.

---

## 8. Shared Types & Utilities (TypeScript)
- **Types/interfaces** (e.g., `shared/types.ts`)  
```ts
export type ServiceType = 'TAXI' | 'DELIVERY' | 'COURIER';
export type CourierStopType = 'PICKUP' | 'DROPOFF' | 'RETURN';
export type CourierStopStatus = 'PENDING' | 'READY' | 'ARRIVED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
export type ProofType = 'PHOTO' | 'SIGNATURE' | 'PIN' | 'CODE' | 'NOTE';

export interface JobStop {
  id: string;
  jobId: string;
  sequence: number;
  type: CourierStopType;
  status: CourierStopStatus;
  address: string;
  latitude: number;
  longitude: number;
  contactName?: string;
  contactPhone?: string;
  proofRequired: boolean;
  proofType?: ProofType;
  pincode?: string;
  eta?: string;
  arrivedAt?: string;
  completedAt?: string;
}

export interface DeliveryItem { name: string; qty: number; weightGrams?: number; price?: number; }
export interface PricingBreakdown { base: number; distance: number; time: number; stopFees?: number; surge?: number; tax?: number; }
```
- **Constants**: `shared/socketEvents.js`, `shared/serviceTypes.js`, `shared/jobStatus.ts`, `shared/stopStatus.ts`.  
- **Validators**: Zod/Joi schemas shared between backend and frontends for request DTOs.  
- **Helpers**: `calculatePricing`, `buildRoute`, `podRequired`, `canResequence`, `sanitizeJobForCustomer`.

---

## 9. Testing and Quality Strategy
- **Unit tests**: pricing per service, stop state machine, POD validation, capability checks.  
- **Integration**: `/api/v2/jobs/quote`, `/api/v2/jobs` (Taxi/Delivery/Courier variants), stop status updates, POD uploads, driver accept/complete.  
- **E2E**:  
  - Taxi: create → assign → accept → complete.  
  - Delivery: create with POD → driver flow → customer tracking.  
  - Courier: multi-stop create with optimization → driver completes all stops → return-to-sender path.  
- **Load tests**: quote endpoints and socket fan-out with mixed services.  
- **Contract tests**: socket events payload shape (dispatch/driver/customer).  
- **Regression**: ensure V1 Taxi endpoints unchanged under feature flag off.

### 9.1 Test ownership and placement
- **Unit**: `tests/unit/services.pricing.test.js`, `services.job.test.js` (state machine), `services.routing.test.js`, `services.notification.test.js`.  
- **Integration**: `tests/integration/api.v2.jobs.test.js`, `tests/integration/api.v2.driver.test.js`, `tests/integration/api.v2.dispatch.test.js`, `tests/integration/api.v2.pod.test.js`.  
- **E2E**: reuse `e2e-tests/*` harness; add scenarios per serviceType.  
- **Socket contracts**: `tests/contracts/socket.dispatch.test.js`, `socket.driver.test.js`, `socket.customer.test.js` validating event schemas in Section 0.3.  
- **Backfill validation**: `tests/integration/migrations.backfill_serviceType.test.js` ensuring counts match and no nulls.  
- **Performance**: simple k6/Artillery scripts under `tests/load/quote.yml`, `tests/load/dispatch.yml`.

---

## 10. Implementation Phases (with exit criteria)
- **Phase 0: Readiness**  
  - Land enums/tables/columns migrations.  
  - Backfill scripts prepared and dry-run.  
  - Feature flags in place (`FEATURE_V2_SERVICES`, `FEATURE_POD`, `FEATURE_COURIER_OPTIMIZE`).  
  - Exit: migrations apply cleanly in staging; V1 unaffected.
- **Phase 1: Backend foundations**  
  - Unified quote/create endpoints; `serviceType` propagation; dual-write company_services.  
  - Socket payloads include `serviceType`.  
  - Exit: integration tests for quote/create (all services) pass; dispatch still functional for Taxi.
- **Phase 2: Delivery + Courier flows**  
  - Implement job_stops, POD endpoints, stop status machine, routing/optimization.  
  - Dispatch panel Delivery/Courier UI; driver app POD & multi-stop screens.  
  - Exit: E2E for delivery and courier green; POD stored and retrievable; customer tracking works.
- **Phase 3: Reporting + owner + hardening**  
  - Owner service config UI, reporting per service, billing updates.  
  - Performance tuning (indexes), alerting, dashboards.  
  - Exit: reporting matches DB aggregates; error rate steady; latency within SLO.
- **Phase 4: Rollout**  
  - Gradual enable per company via `company_services`; monitor metrics; canary release.  
  - Exit: all targeted companies on V2; feature flags can be left on permanently or removed after stability window.

---

## 11. File-by-File Implementation Guide (ordered)
1. **Database**  
   - `prisma/schema.prisma`: add enums/tables/columns.  
   - `prisma/migrations/*`: generated SQL.  
   - `scripts/migrations/2024xxxx_service_modes.js`: backfill company_services + serviceType.  
   - `scripts/migrations/2024xxxx_backfill_serviceType.js`: copy type → serviceType in related tables.
2. **Backend core services**  
   - `services/pricingService.js`: serviceType-aware pricing, profiles/rules.  
   - `services/jobService.js`: create/update jobs with stops/items/routes; emit job_events; enforce state machine.  
   - `services/autoDispatchService.js` and `services/queueManagementService.js`: filter drivers by capability; per-service offer logic.  
   - `services/routingService.js`: stop ordering, routePlanJson.  
   - `services/notificationService.js`: templates per service; POD notifications.  
   - `services/jobAuditService.js`: write job_events.
3. **API routes/controllers**  
   - `routes/dispatch.js`: add `/api/v2/jobs`, `/api/v2/jobs/quote`, `/api/v2/jobs/:id/status`, `/api/v2/jobs/:id/assign`.  
   - `routes/foodDelivery.js` → expand to delivery endpoints (or rename `delivery.js`, update `server.js`).  
   - `routes/courier.js`: courier create, stop updates, resequence.  
   - `routes/drivers.js`: add available jobs filter, arrive/start/complete per service, POD upload.  
   - `routes/public.js` or new `routes/passenger.js`: passenger quote/create/track.  
   - `routes/reports.js`: add serviceType filters, new report endpoints.  
   - `middleware/validators/*`: schemas for new DTOs.
4. **Sockets**  
   - `socket-handlers/enhancedDriverStatusHandlers.js`: include serviceType, stop events.  
   - `socket-handlers/dispatch.js` (if present): new events job:stop:updated, job:pod:capture.  
   - Update namespace room naming to optionally include serviceType.
5. **Shared definitions**  
   - `shared/socketEvents.js`, `shared/serviceTypes.js`, `shared/statusMaps.js`.  
   - `src/utils` or `shared`: helpers `podRequired`, `sanitizeJobForCustomer`, `ensureStopOrder`.
6. **Dispatch panel (React)**  
   - `frontend/dispatch/src/state/*`: add serviceType, stops, items, routePlan.  
   - `frontend/dispatch/src/services/*`: point to `/api/v2` endpoints.  
   - Components: `ServiceSwitcher.tsx`, `StopList.tsx`, `ItemList.tsx`, `PODViewer.tsx`, `PricingBreakdown.tsx`, `TimeWindowPicker.tsx`, `RouteSummaryCard.tsx`.  
   - Views: Delivery board, Courier board, job detail modal with stops and POD.
7. **Driver app (React Native)**  
   - `mobile/driver-app-v1/src/types/service.ts`: add types.  
   - Screens: `ServiceQueueScreen`, `DeliveryJobScreen`, `CourierRouteScreen`, `PODCaptureScreen`.  
   - API client: call new endpoints, handle socket events.  
   - Store: add serviceType and stop state, route plan.  
   - Navigation helpers: deep link per stop.
8. **Passenger app/website**  
   - Service selector component, delivery form, courier multi-stop form, tracking page.  
   - API client to `/api/v2/jobs/quote` and `/api/v2/jobs`.  
   - Add POD view after completion.
9. **Owner panel**  
   - Update `routes/owner-*.js` for service filters; UI for service toggles and pricing profile binding.  
   - Reporting pages per serviceType; CSV export.
10. **Tests**  
    - `tests` or `e2e-tests`: add scenarios for Taxi/Delivery/Courier flows, POD, resequence.  
    - Socket contract tests; pricing calculations snapshot tests.

---

## 12. Observability, Performance, Security
- **Metrics**: per serviceType — job creation/accept/complete rates, cancellation reasons, SLA breaches, POD failures, quote latency, dispatch latency, socket delivery failures.  
- **Logs**: include `serviceType`, `jobId`, `stopId`, `companyId`, `driverId` in structured logs.  
- **Tracing**: wrap quote → dispatch → driver accept → POD → payment in a trace; tag serviceType.  
- **SLOs**: quote p95 < 400ms; job create p95 < 500ms; dispatch fan-out < 2s; socket delivery success > 99.5%.  
- **Security**: signed URLs for POD photos; limit tracking token TTL; mask phone numbers via existing VOIP masking where available; enforce company scoping everywhere.  
- **Performance**: add suggested indexes (Section 1.6); batch stop inserts; cache pricing profiles; throttle socket broadcasts if necessary.

---

## 13. Rollback and Safety
- **DB rollback**: keep down scripts; for prod, export `job_stops`, `job_stop_proofs`, `company_services` before dropping.  
- **Feature flags**: `FEATURE_V2_SERVICES`, `FEATURE_POD`, `FEATURE_COURIER_OPTIMIZE` to disable new flows quickly.  
- **API kill switch**: conditionally unregister `/api/v2` routers in `server.js` if flag off.  
- **Socket kill switch**: stop emitting new event names if instability detected.  
- **Data preservation**: if rolling back code only, leave schema intact; if schema rollback needed, archive tables to CSV and store S3 path in runbook.  
- **Deployment strategy**: blue/green or canary; monitor metrics before full cutover.

---

## 14. Execution Tracker (update as you build)
- [ ] Migrations added (`prisma/schema.prisma`, `prisma/migrations/*`) with new enums/tables/columns.  
- [ ] Backfill scripts (`scripts/migrations/2024xxxx_service_modes.js`, `..._backfill_serviceType.js`) dry-run complete.  
- [ ] Feature flags wired (`FEATURE_V2_SERVICES`, `FEATURE_POD`, `FEATURE_COURIER_OPTIMIZE`) in `server.js` route registration and sockets.  
- [ ] Services updated: pricing, job (stops/POD/state), autoDispatch, queueManagement, routing (optimization), notification, jobAudit.  
- [ ] APIs `/api/v2`: dispatch/passenger/driver endpoints live with validation and idempotency.  
- [ ] Sockets emit `serviceType` + stop/POD events; rooms adjusted (`dispatch_${companyId}_${serviceType}` optional).  
- [ ] Dispatch UI: service switcher, delivery/courier boards, stop list, POD viewer wired to `/api/v2`.  
- [ ] Driver app: service-aware queue, delivery flow, courier multi-stop, POD capture and retry.  
- [ ] Owner panel updates: service toggles, pricing profile binding, reporting filters.  
- [ ] Tests: unit (pricing/state/POD), integration (quote/create/assign/stop), E2E (taxi/delivery/courier), socket contract.  
- [ ] Observability: metrics/logs/traces tagged with `serviceType`; alerts on SLA breach, POD errors, dispatch failures.  
- [ ] Rollout: staged enable per company via `company_services`; rollback runbook validated.
- [ ] Event contracts implemented in code (`shared/contracts` + validators) and emitted with headers (`traceId`, `serviceType`, `companyId`).  
- [ ] Idempotency storage in place for create/assign/POD/tip.  
- [ ] Backward compatibility confirmed: V1 taxi endpoints operate with flags OFF.

---

## 15. Merchant Module (Food Delivery)
**Why**: Food/grocery/pharmacy delivery needs merchant onboarding, menus, prep, and order lifecycle.

### 15.1 Tables
- `merchants` (exists; extend if needed): `id (cuid)`, `companyId`, `name`, `type` (MerchantType), `description`, `address`, `latitude`, `longitude`, `logo`, `coverImage`, `rating` (Decimal), `totalRatings` (Int), `avgPrepTimeMinutes` (Int default 15), `minOrderAmount` (Decimal), `isOpen` (Bool), `isActive` (Bool), `operatingHoursJson`, `autoAcceptOrders` (Bool default false), `commissionPercent` (Decimal), `bankDetailsEncrypted`, `contactName/Phone/Email`, `tags (String[])`, `metadata`, timestamps. Indexes: `(companyId)`, `(companyId, isActive)`, `(latitude, longitude)`.
- `merchant_users`: `id`, `merchantId`, `userId`, `role` (MerchantUserRole), `permissions Json`, `isActive`, timestamps. Indexes: `(merchantId)`, `(userId)`, unique `(merchantId, userId)`.
- `menu_categories`: `id`, `merchantId`, `name`, `description`, `imageUrl`, `sequence (Int)`, `isActive`, `availableFrom/To (Time)`, timestamps. Indexes: `(merchantId)`, `(merchantId, sequence)`.
- `menu_items`: `id`, `categoryId`, `merchantId` (denorm), `name`, `description`, `price`, `discountPrice`, `discountValidUntil`, `imageUrl`, `prepTimeMinutes`, `isAvailable`, `isPopular`, `isFeatured`, `modifiersJson`, `tags (String[])`, `allergens (String[])`, `calories (Int?)`, `nutritionJson?`, `maxQuantity (Int default 99)`, `minQuantity (Int default 1)`, `metadata`, timestamps. Indexes: `(categoryId)`, `(merchantId)`, `(merchantId, isAvailable)`.
- `merchant_zones`: `id`, `merchantId`, `zoneId`, `deliveryFee`, `minOrderAmount`, `maxDeliveryRadiusKm`, `estimatedDeliveryMinutes`, `isActive`, `priorityOrder (Int)`, `metadata`, timestamps. Indexes: `(merchantId)`, `(zoneId)`, unique `(merchantId, zoneId)`.
- `merchant_operating_exceptions`: `id`, `merchantId`, `date`, `isClosed`, `openTime?`, `closeTime?`, `reason`, `createdAt`. Index: `(merchantId, date)`.

### 15.2 Enums
```prisma
enum MerchantType { RESTAURANT GROCERY PHARMACY STORE OTHER }
enum MerchantUserRole { MERCHANT_OWNER MERCHANT_MANAGER MERCHANT_STAFF }
enum MerchantOrderStatus { PENDING_MERCHANT ACCEPTED PREPARING READY_FOR_PICKUP PICKED_UP CANCELLED_BY_MERCHANT CANCELLED_BY_CUSTOMER }
```

### 15.3 APIs
- Merchant management (owner/admin): CRUD merchants, users, operating hours/exceptions.
- Menu management (merchant portal): CRUD categories/items, bulk availability, reorder.
- Order management (merchant portal): list/detail orders, accept/reject with prep time, mark ready, update prep time.
- Merchant analytics: summary, item performance, ratings.
- Public: merchant search and public profile/menu.

### 15.4 Socket (/merchant)
- To merchant: `merchant:order:new`, `merchant:order:cancelled`, `merchant:driver:assigned`, `merchant:driver:arriving`, `merchant:driver:arrived`.
- From merchant: `order:accepted`, `order:rejected`, `order:preparing`, `order:ready`, `order:prep_time_updated`, `merchant:status:toggle`.
- Rooms: `merchant_{merchantId}`, `merchant_{companyId}_all`.

### 15.5 Order Flow (delivery_orders ↔ merchants ↔ jobs)
1) Customer places order → `delivery_orders` `PENDING_MERCHANT` → socket `merchant:order:new`.  
2) Merchant accepts → status `ACCEPTED`, set `prepTimeMinutes`.  
3) Merchant optionally sets `PREPARING`.  
4) Merchant marks `READY_FOR_PICKUP` → create `jobs` (DELIVERY) + triggers dispatch.  
5) Driver assigned/accepts → sockets to merchant/dispatch.  
6) Driver arrives → merchant notified; driver picks up.  
7) Standard delivery flow to `DELIVERED`.

### 15.6 Merchant Portal UI (summary)
- Dashboard: counts by status, revenue, avg prep, open/close toggle.  
- Orders: tabs (New/Preparing/Ready/History), accept/reject with prep time, mark ready.  
- Menu: categories reorder, items edit/toggle, modifiers/allergens.  
- Settings: hours, zones map, auto-accept, prep defaults, notifications.

---

## 16. Pricing Engine Specification
### 16.1 Formulas
- **Taxi**: `fare = base + distanceKm*perKm + durationMin*perMin + waitingFee + surge + bookingFee + tolls + airportFee - discounts + tax`. Example provided in doc.  
- **Delivery**: `fare = base + deliveryFee(zone or distance) + stopFee*(additionalStops) + handling + peakMultiplier + smallOrderFee - merchantDiscount + serviceFee% + tax`. Zone fee from `merchant_zones` priority; fallback distance-based.  
- **Courier**: `fare = base + distance*perKm + stopFee*(stops-1) + weight/volume surcharges + priority surcharge + insurance + returnFee (if required) + tax`. Distance from ordered or optimized route.

### 16.2 Surge Algorithm
- Demand/supply ratio per zone+service; tiers (1.0–3.0) with Redis cache TTL 60s. Key `surge:{companyId}:{zoneId}:{serviceType}`.

### 16.3 Time-Window Rules
- Stored in `service_pricing_rules.timeWindowJson`; evaluate holidays first, then peaks/quiet; apply highest multiplier.

### 16.4 Pricing Service Implementation (services/pricingService.js)
- Steps: load profile → route distance/duration → service-specific breakdown → time multiplier → surge multiplier (if not scheduled) → subtotal/tax/total → return quote with validity and routePlan. Includes taxi/delivery/courier helpers and insurance/priority logic (see detailed example above).

---

## 17. Notification Templates
### 17.1 Push (FCM/APNs)
- Templates for Taxi, Delivery, Courier events (job assigned/accepted/arrived/completed, order placed/accepted/ready, POD captured, stop completed) with data payload including `serviceType`, `jobId`, `orderId`, actions (`VIEW_JOB`, `TRACK`, `NAVIGATE`, `VIEW_POD`).

### 17.2 SMS (stored in `notification_templates`)
- Predefined codes: `TAXI_BOOKING_CONFIRMED`, `TAXI_DRIVER_ARRIVING/ARRIVED`, `DELIVERY_ORDER_CONFIRMED/OUT_FOR_DELIVERY/COMPLETED`, `COURIER_*`, `OTP_VERIFICATION`, `DRIVER_PAYMENT_RECEIVED`.

### 17.3 Email (templates/email/*.html)
- `receipt_taxi.html`, `receipt_delivery.html`, `receipt_courier.html`, `driver_weekly_summary.html` with placeholders for company, route/stops, driver, fare breakdown, POD thumbnails, support contact.

---

## 18. Third-Party Integrations
- **Maps/Routing**: Primary Google (Distance Matrix, Directions, Geocoding, Places, Static Maps); fallback OSM/OSRM. Config: `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_SIGNING_SECRET`, `OSRM_SERVER_URL`, `GEOCODING_PROVIDER`, `ROUTING_PROVIDER`. Cache/batch to control cost.  
- **Payments**: Primary Stripe (PaymentIntents, SetupIntents, webhooks, optional Connect). Alt PayPal. Store `payment_intent_id`, verify webhooks, idempotency. Config keys listed.  
- **Comms**: Push (FCM), SMS (Twilio primary, MessageBird alt), Email (SendGrid primary, SES alt), VOIP masking (Twilio Proxy/Plivo). Config keys listed.  
- **Storage**: S3/R2/GCS for POD, documents, logos, menu images. Config: `STORAGE_PROVIDER`, bucket/region/keys, `CDN_BASE_URL`, signed URL expiries, retention.  
- **Route Optimization**: Providers Google Routes/HERE/ORS/simple; config `ROUTE_OPTIMIZER_PROVIDER`, `ROUTE_OPTIMIZATION_ENABLED`, `MAX_STOPS_FOR_OPTIMIZATION`.

---

## 19. Mobile App Technical Specifications (Driver)
- **Offline strategy**: cache active job/stops/PODs/location buffer, queues with retries/fail buckets; SQLite/AsyncStorage tables + TTLs defined.  
- **Background location**: react-native-background-geolocation settings (accuracy, filters, heartbeat, foreground service, geofence radius). Batch send via socket; buffer locally.  
- **Push setup**: FCM token registration, refresh handling, foreground/background handlers, deep linking for tap actions (`VIEW_JOB`, `VIEW_STOP`, `NAVIGATE`).  
- **Deep links**: `taxitime://job/{jobId}`, `/stop/{stopId}`, `/pod`, `/navigate`, `/earnings`, etc., plus universal links.

---

## 20. Performance Targets and Limits
- **API p95 targets**: quotes <400ms, job create <500ms, status <300ms, etc.  
- **Capacity**: websockets target 50k per instance, API 2k rps, location 5k/sec.  
- **Rate limits**: per role (passenger/driver/dispatch/webhook) using Redis sliding window.  
- **DB targets**: key queries under 20ms with indexes; GIST for geo.  
- **Retention**: jobs 3y archive, events 1y, location 90d, POD photos 2y with lifecycle to cold storage.

---

## 21. UI/UX Screen Specifications (Highlights)
- **Dispatch**: service switcher header, stats bar.  
- **Courier composer**: detailed multi-stop form with map/route/price preview.  
- **Driver app**: courier multi-stop view with progress, NAV, POD requirements.  
- **POD capture**: gated complete button until proof captured.  
- **Passenger service selection**: clear cards for Taxi/Delivery/Courier with recents.

---

## 22. Glossary
- **POD**: Proof of Delivery (photo/signature/pin).  
- **SLA**: Service Level Agreement (time to accept/arrive/complete).  
- **Surge**: Dynamic multiplier based on demand/supply per zone/service.  
- **ServiceType**: TAXI | DELIVERY | COURIER.  
- **Stop**: A pickup/dropoff/return point in courier/delivery.  
- **RoutePlan**: Ordered list of stops with optimized sequence and polyline.  
- **Feature Flag**: Runtime toggle controlling V2 features.

---

## 23. Error Code Catalog (API)
- `SERVICE_DISABLED`, `INVALID_SERVICE_TYPE`, `STOP_SEQUENCE_INVALID`, `POD_REQUIRED`, `ASSIGNMENT_CONFLICT`, `ZONE_NOT_FOUND`, `MERCHANT_CLOSED`, `MENU_ITEM_UNAVAILABLE`, `PAYMENT_REQUIRED`, `IDEMPOTENCY_REPLAY`, `RATE_LIMITED`, `SURGE_UNAVAILABLE`, `OPTIMIZER_FAILED`, `FEATURE_FLAG_OFF`.  
- Format: `{ code, message, details }`; document in `shared/contracts/errors.json` and reuse in validators.

---

## 24. Feature Flag Reference
- `FEATURE_V2_SERVICES` (enable /api/v2 + sockets)  
- `FEATURE_POD` (enforce POD gates)  
- `FEATURE_COURIER_OPTIMIZE` (route optimization)  
- `FEATURE_MERCHANT_PORTAL` (merchant/menu/order flows)  
- `FEATURE_SURGE_PRICING` (enable surge calc/emission)  
- `FEATURE_RATE_LIMITS_V2` (new rate limit profiles)  
- `FEATURE_BACKGROUND_LOCATION_ENFORCE` (driver app policies)

---

## 25. Environment Variables Reference (consolidated)
- **Core**: `DATABASE_URL`, `PORT`, `NODE_ENV`, `ALLOWED_ORIGINS`, `FRONTEND_URLS`.  
- **Feature flags**: see Section 24 (boolean envs).  
- **Auth/Security**: `JWT_SECRET`, `SESSION_SECRET`, `WEBHOOK_SECRET`.  
- **Maps/Routing**: `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_SIGNING_SECRET`, `OSRM_SERVER_URL`, `GEOCODING_PROVIDER`, `ROUTING_PROVIDER`.  
- **Payments**: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`, `PAYPAL_CLIENT_ID/SECRET/WEBHOOK_ID`.  
- **Comms**: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_MESSAGING_SERVICE_SID`, `MESSAGEBIRD_API_KEY`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `AWS_SES_REGION`, `AWS_SES_FROM_EMAIL`.  
- **Storage**: `STORAGE_PROVIDER`, `AWS_S3_BUCKET`, `AWS_S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `CDN_BASE_URL`, `POD_SIGNED_URL_EXPIRY_SECONDS`, `UPLOAD_SIGNED_URL_EXPIRY_SECONDS`.  
- **Optimization**: `ROUTE_OPTIMIZER_PROVIDER`, `ROUTE_OPTIMIZATION_ENABLED`, `MAX_STOPS_FOR_OPTIMIZATION`.  
- **Surge/Cache**: `REDIS_URL` (for surge/rate limiting/idempotency).  
- **Logs/Tracing**: `LOG_LEVEL`, `OTEL_EXPORTER_OTLP_ENDPOINT` (if using OTEL).

---

Use this document as the master plan; execute sections in order, honor exit criteria, and keep feature flags ready to ensure a safe multi-service rollout.
PHASE 6: END-TO-END INTEGRATION & PRODUCTION READINESS

Phase 1 ✅ Backend foundations (48 tests)
Phase 2 ✅ Delivery + Courier flows (24 tests)
Phase 3 ✅ Frontend V2 services (TypeScript)
Phase 4 ✅ Dispatch UI components (9 tests)
Phase 5 ✅ Feature flags (11 tests)

Now implementing Phase 6: Wire V2 into main app + production readiness.

================================================================================
DELIVERABLES
================================================================================

1. src/components/settings/SettingsPanel.tsx
   - Settings modal with tabs: General, V2 Features, About
   - V2 Features tab embeds V2FeatureToggle component
   - Dark mode support using existing theme context

2. src/components/admin/MigrationStatusWidget.tsx
   - Dashboard widget showing V2 migration progress
   - V2 API health check (online/offline/checking)
   - Progress bar (X/Y features enabled)
   - List each flag with enabled/disabled indicator

3. UPDATE src/components/jobs/JobComposerComplete.tsx (or equivalent job component)
   - Import useFeatureFlags hook
   - Conditionally render StopManagementPanel when v2Stops enabled
   - Conditionally render PODViewer when v2POD enabled
   - Graceful fallback if V2 unavailable

4. src/__tests__/phase6.test.tsx
   - Test conditional rendering based on flags
   - Test graceful degradation
   - Test migration progress calculation
   - Minimum 6 tests

5. scripts/verify_phase6.sh
   - Check all files exist
   - Run phase6 tests
   - Verify feature flag integration in job components
   - Report pass/fail

================================================================================
FILE STRUCTURE
================================================================================

frontend/dispatch/src/
├── components/
│   ├── settings/
│   │   └── SettingsPanel.tsx       (NEW)
│   ├── admin/
│   │   └── MigrationStatusWidget.tsx (NEW)
│   └── jobs/
│       └── JobComposerComplete.tsx  (UPDATE - add V2 conditionals)
├── __tests__/
│   └── phase6.test.tsx             (NEW)
└── scripts/
    └── verify_phase6.sh            (NEW)

================================================================================
VERIFICATION
================================================================================

cd /Applications/A_B_TAXI/frontend/dispatch
chmod +x scripts/verify_phase6.sh
./scripts/verify_phase6.sh
npx vitest run src/__tests__/phase6.test.tsx

================================================================================
REPORT FORMAT
================================================================================

When complete, report:

1. Files created (list paths)
2. Files modified (list paths + changes)
3. Test results (X/Y passing)
4. Verification script output
5. Any issues or notes

Phase 6 complete → V2 Migration ready for production rollout.PHASE 7: DRIVER APP V2 INTEGRATION

Phase 1-6 ✅ Complete (98+ tests passing)

Now implementing Phase 7: Driver mobile app V2 integration for multi-stop jobs and POD capture.

================================================================================
OBJECTIVES
================================================================================

1. Update driver app to consume V2 job endpoints
2. Implement multi-stop navigation UI
3. Add POD capture (signature, photo, PIN)
4. Real-time stop status updates via socket
5. Route optimization display
6. Graceful V1 fallback

================================================================================
DELIVERABLES
================================================================================

Directory: mobile/driver-app/src/

1. services/v2/apiClient.ts
   - V2 axios client with auth
   - V1 fallback mechanism
   - Offline queue support

2. services/v2/jobService.ts
   - getActiveJob()
   - getJobStops(jobId)
   - updateStopStatus(stopId, status)
   - V1 fallback for non-V2 jobs

3. services/v2/podService.ts
   - captureSignature(stopId, signatureData)
   - capturePhoto(stopId, photoUri)
   - verifyPIN(stopId, pin)
   - getPodRequirements(stopId)

4. screens/ActiveJob/StopListScreen.tsx
   - List all stops with sequence numbers
   - Current stop highlighted
   - Stop status indicators (pending/en_route/arrived/completed/failed)
   - Swipe actions for status updates

5. screens/ActiveJob/StopDetailScreen.tsx
   - Stop address + contact info
   - Navigation button (open maps)
   - Status action buttons
   - POD capture trigger
   - Notes input

6. screens/ActiveJob/PODCaptureScreen.tsx
   - Signature pad component
   - Camera capture for photo
   - PIN input field
   - Submit POD button
   - Offline queue indicator

7. components/StopProgressBar.tsx
   - Visual progress indicator
   - X/Y stops completed
   - ETA display

8. hooks/useActiveJob.ts
   - Fetch active job with stops
   - Real-time socket updates
   - Optimistic UI updates

9. hooks/useStopActions.ts
   - arrive(), complete(), fail(), skip()
   - Loading/error states
   - Offline queue fallback

10. hooks/usePODCapture.ts
    - Signature capture state
    - Photo capture state
    - PIN verification
    - Submit handler

11. __tests__/v2DriverApp.test.ts
    - Service tests
    - Hook tests
    - Minimum 12 tests

12. scripts/verify_phase7.sh
    - Check all files exist
    - Run tests
    - Report pass/fail

================================================================================
FILE STRUCTURE
================================================================================

mobile/driver-app/src/
├── services/
│   └── v2/
│       ├── apiClient.ts
│       ├── jobService.ts
│       ├── podService.ts
│       └── index.ts
├── screens/
│   └── ActiveJob/
│       ├── StopListScreen.tsx
│       ├── StopDetailScreen.tsx
│       └── PODCaptureScreen.tsx
├── components/
│   └── StopProgressBar.tsx
├── hooks/
│   ├── useActiveJob.ts
│   ├── useStopActions.ts
│   ├── usePODCapture.ts
│   └── index.ts
├── __tests__/
│   └── v2DriverApp.test.ts
└── scripts/
    └── verify_phase7.sh

================================================================================
TECHNICAL NOTES
================================================================================

- Driver app uses React Native
- Existing auth context available
- Socket.io client already configured
- Use existing theme/styling patterns
- Support offline mode with queue

================================================================================
VERIFICATION
================================================================================

cd /Applications/A_B_TAXI/mobile/driver-app
chmod +x scripts/verify_phase7.sh
./scripts/verify_phase7.sh
npm test -- --testPathPattern=v2DriverApp

================================================================================
REPORT FORMAT
================================================================================

When complete, report:

1. Files created (list paths)
2. Test results (X/Y passing)
3. Verification script output
4. Any issues or notes

Phase 7 complete → Driver app ready for V2 multi-stop + POD.