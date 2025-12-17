# V2 Migration Runbook

## Pre-migration checklist
- [ ] Confirm DATABASE_URL points to staging/clone (not production).
- [ ] Backup staging DB snapshot.
- [ ] Ensure feature flags default OFF (`FEATURE_V2_SERVICES=false`).
- [ ] Ensure Prisma CLI available (`npx prisma --version`).
- [ ] Pull latest code with v2 schema and scripts.

## Steps
1) Generate migration SQL (already generated under `prisma/migrations/20251208142337_v2_multi_service/migration.sql`).  
2) Apply to staging: `npx prisma migrate deploy`.  
3) Run backfills:  
   - `node scripts/migrations/2024xxxx_service_modes.js`  
   - `node scripts/migrations/2024xxxx_backfill_serviceType.js`  
4) Verification queries (psql):  
   - `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('company_services','service_pricing_profiles','job_stops','job_stop_proofs','courier_routes','job_events');`  
   - `SELECT COUNT(*) AS companies_with_services FROM company_services;`  
   - `SELECT COUNT(*) AS jobs_without_serviceType FROM jobs WHERE service_type IS NULL;`  
   - `SELECT COUNT(*) AS mismatched FROM jobs WHERE service_type::text != type::text;`  
   - `SELECT indexname FROM pg_indexes WHERE tablename='jobs' AND indexname LIKE '%service_type%';`  
   - `SELECT COUNT(*) FROM jobs WHERE type='TAXI' AND status IN ('PENDING','ASSIGNED','IN_PROGRESS');`  
5) V1 sanity (flags OFF): hit taxi endpoints/UI flows to confirm no regressions.  
6) Record results and errors.

## Rollback
- Use `scripts/migrations/rollback_v2.sql` on staging if needed. Review before running; it drops new V2 additions only.  
- For production, prefer restore from snapshot instead of running rollback SQL directly.

## Post-migration monitoring
- Check DB error logs and Prisma logs for new errors.  
- Monitor latency on key endpoints (quote, job create, status updates).  
- Confirm sockets still connect for dispatch/driver/customer.  
- Verify feature flags still OFF until rollout.

## Exit criteria (before Phase 1)
- [ ] Migration SQL reviewed and approved.  
- [ ] Staging migration succeeded.  
- [ ] Backfill scripts run cleanly.  
- [ ] V1 endpoints verified working with flags OFF.  
- [ ] Rollback script validated on staging snapshot.  
- [ ] Runbook updated with outcomes.
