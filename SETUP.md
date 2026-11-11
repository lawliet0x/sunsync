> Current safety note: read README.md and PUBLIC-DATA-REPLACEMENT-HANDOVER.md first. The instructions below describe general setup and operational workflows, not the current production state. The existing project has an unresolved CSV migration version/SQL mismatch. Do not run db push or the public-data replacement transaction against it without reconciliation and review. Fresh local database tests are safe and isolated.

# SunSync setup and operations

This is the supplied frontend incrementally integrated with Supabase. The landing page, original CSS palette, responsive shell and three navigation menus are retained. Placeholder workspace bodies have been replaced with authenticated forms, record tables and real charts. This is an implemented, locally tested application—not a claim of an already deployed or independently production-certified service.

## 1. Prerequisites and install

Use Node 22.12+ (Node 24 LTS recommended), npm, a Supabase account and a Vercel account. Docker Desktop is required only for the full local Supabase stack. A hosted Supabase project can be used instead.

```sh
npm ci
cp .env.example .env.local
npm run lint
npm test
npm run build
npm run dev
```

PowerShell: use `Copy-Item .env.example .env.local` instead of `cp` if desired. Never commit populated environment files. Keep `package-lock.json` in version control. Initialize a Git repository if needed: `git init`, `git add .`, `git commit -m "Implement Supabase backend and workspace integration"`.

Set only these public frontend values in `.env.local` and Vercel:

- `VITE_SUPABASE_URL`: your project HTTPS URL.
- `VITE_SUPABASE_ANON_KEY`: your project's public anon key (a publishable key is also accepted by the client). This is deliberately public; RLS provides authorization.

`.env.example` has blank placeholders only. `ALLOWED_ORIGINS` belongs to the Edge Function environment. `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and `SUPABASE_DB_PASSWORD` are CLI/CI inputs, not Vite variables. Supabase injects `SUPABASE_URL` and `SUPABASE_ANON_KEY` into hosted Edge Functions. This application does not require a service-role key; sensitive functions execute under the user's identity and authorize in PostgreSQL. Do not add service-role credentials to the frontend.

## 2. Fresh-project setup only (not the existing production project)

Create a Supabase project in the dashboard, choosing the appropriate region, organization and paid-plan/backup requirements yourself. No project or billable resource was created during implementation. Set a strong database password using your secret manager.

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase secrets set ALLOWED_ORIGINS=https://YOUR-PRODUCTION-DOMAIN,http://localhost:5173
npx supabase functions deploy operations
```

Alternatively, for the complete local stack:

```sh
npx supabase start
npx supabase db reset
npx supabase functions serve operations --env-file supabase/.env.local
```

For local function CORS, create the ignored `supabase/.env.local` containing `ALLOWED_ORIGINS=http://localhost:5173`. Obtain the local public API URL and anon key from `npx supabase status`; place them in the root `.env.local`. Restart Vite after changes. Do not populate the browser with the local service-role key.

Migrations are ordered under `supabase/migrations/`. They install tables, FKs, constraints, indexes, RLS, Auth profile creation, role helpers, transactional RPCs, audit triggers, reporting and notification realtime. Do not apply to an unrelated existing schema. Test on staging first. If migrating a project with existing Auth users, backfill profiles as database owner before assigning roles:

```sql
insert into public.profiles(id,full_name)
select id,left(coalesce(raw_user_meta_data->>'full_name',''),120) from auth.users
on conflict(id) do nothing;
```

## 3. Auth configuration and first administrator

In Supabase Authentication:

1. Set Site URL to the production Vercel/domain HTTPS origin. Add exact production and local login redirects. Avoid broad wildcard preview-domain allowlists for sensitive production projects.
2. Enable email confirmations, secure email change and secure password change. Set a minimum 12-character password and your desired leaked-password protections (plan dependent).
3. Configure and test production SMTP, sender identity, signup and recovery templates, delivery monitoring and Auth rate limits. Local email delivery does not establish production SMTP reliability.
4. Review session expiry, refresh-token rotation and CAPTCHA/rate-limit settings to match your threat model. Enable and enforce MFA for operators under your organization's policy before launch. The included UI does not implement TOTP enrollment or an MFA step-up flow; adding mandatory MFA requires that follow-up integration and tests.

Create your own account through the UI, verify its email, and obtain the exact user UUID from Authentication → Users. In the Supabase SQL editor, as project owner, bootstrap the first system operator:

```sql
insert into public.role_assignments(user_id,role,society_id)
values ('REPLACE_WITH_VERIFIED_OPERATOR_UUID','system',null);
```

Never execute that SQL for an unverified identity. The browser cannot grant system roles. System recovery or additional system operators require a separately authorized owner-operated SQL change and organizational approval. Auth user metadata never grants privileges.

Sign in using System Administrator. Create a real subscription plan (there are no invented prices). A society applicant creates and confirms a normal account, then submits the society name, address and ownership/authority evidence from the login/account page. Independently verify both society ownership and requester authority before approving. Approval creates a society and a scoped administrator role atomically. Assign its subscription in Societies / Plans & limits before linking residents.

A resident creates and confirms their own account and shares their displayed UUID with their society admin. In Residents & buildings create a building, then link that registered resident and unit. This is an implemented existing-account linking flow, not an email-invitation service. Automatic invitation email delivery is not implemented.

System admins can grant/revoke society admin access and suspend/activate a society via Societies. Society admins can activate/deactivate their residents; reactivation checks plan capacity. Those actions cannot grant a system role. Administrative access changes must be independently authorized; the UI is not evidence of entitlement.

## 4. Meter setup and energy processing

1. In Installations register actual rooftop capacity and commissioning date. Register one active generation meter per installation and one active consumption meter per participating membership. Meter serials are globally unique.
2. In Society settings enter approved tariffs and published emission factors with their source and validity intervals. No financial/environmental factor is assumed. Historical factors are immutable; create a new effective-dated record. Ambiguous overlapping factors prevent allocation rather than selecting an arbitrary rate.
3. In Solar monitoring submit a validated **interval kWh** reading, not a cumulative meter counter. Include source/evidence and a stable device-source record ID. The server enforces bounded nonnegative energy, completed intervals up to one day, recent history, no overlapping intervals, unique IDs and exact duplicate idempotency.
4. All active meters must have the exact same interval start/end for an allocation. Every eligible active membership requires a consumption meter. Deactivate unused members via the controlled operation. Current device replacement/retirement requires an owner-reviewed database operation; no unmanaged device lifecycle is implied.
5. The implemented method is **proportional demand**. The pool is `min(total generation, total active eligible demand)`. Each home receives `floor(pool × home demand / total demand, 6 decimals)` kWh. This is shared solar attribution, not a metered export settlement or financial trading platform. Residual rounding remains unallocated; credits never exceed generation or household consumption.
6. Processing is one PostgreSQL transaction under a society-scoped advisory lock. Retrying the exact interval returns its original batch; overlapping processing is rejected. Credit rows are unique per allocation and append-only. No spend/debit API exists, so credits are nonnegative lifetime attribution, not a cash wallet.
7. Savings = allocated kWh × applicable approved INR/kWh tariff. Avoided emissions = allocated kWh × sourced kg CO2e/kWh factor. Factors must cover the entire interval. Missing factors produce null/unavailable estimates. Batch records preserve the exact factor IDs; historical data cannot silently reprice them.
8. Correct an unallocated reading by resubmitting the exact interval/source identity with a meaningful reason. Previous and new values, actor and timestamp are retained. Once allocated, reading edits are blocked. Financial reversal/reconciliation is deliberately not implemented; investigate errors with your operator and implement an approved compensating-ledger workflow before enabling retroactive changes.

Device ingestion uses an approved authenticated operator (manual entry or server calling with an authorized user session). Hardware-specific signed payload verification, device credential rotation, cumulative-counter adapters, MQTT/webhook ingestion, automatic allocation schedules, offline buffering and utility settlement integrations are not implemented. `device_signed` is reserved in the schema; the current ingestion API only creates `operator_validated` records and does not claim cryptographic device verification.

Daily/weekly/monthly energy is aggregated on the server with RLS, using Asia/Kolkata and Monday-start weeks. Readings are attributed to their interval-start bucket, never prorated or fabricated. Align intervals to your reporting boundaries for exact bucket reporting. Date filters use inclusive start/exclusive end; credits and estimates use processing timestamps, meter reports use measurement interval starts. The credit page separately queries the all-time ledger total. Frontend tables page through database responses and reject overly broad >10,000-row result sets rather than silently truncating.

Community rankings include only explicitly opted-in aliases and their lifetime credited energy. Residents choose this in Profile & settings; no names/UUIDs or other households' private readings are published. First-credit / 100-kWh milestones derive from saved records. Challenges are informational goals measured against lifetime community credits; deadlines do not implement time-windowed awards.

## 5. Test commands and coverage limits

```sh
npm run lint
npm test
npm run build
npm audit --omit=dev
npx playwright install chromium
npm run test:browser
```

The database suite runs real PostgreSQL using PGlite, applying the migrations with **one explicit platform substitution**: the Supabase realtime publication statement is skipped (it requires the actual Supabase stack). UUID generation uses PostgreSQL built-ins and needs no extension. A minimal `auth.users` table and `auth.uid()` function stand in for Supabase Auth. Tests switch PostgreSQL roles and JWT-subject configuration to exercise actual RLS, constraints and RPC behavior. This is not a mock of SQL logic, but it is not a full hosted Supabase stack. It cannot establish GoTrue email/PKCE/session behavior, Edge runtime behavior, multi-connection lock contention, realtime delivery or infrastructure backups.

Browser tests cover public/unsigned routes on desktop/mobile and account/recovery form navigation. They do not simulate successful hosted Auth or make up successful ingestion/deployment. Review REVIEW.md for commands actually run in this delivery. If Chromium is absent, the install command downloads a browser; it was not automatically downloaded solely to consume your credits or bandwidth.

## 6. Deploy Vercel

The root folder is the directory containing package.json (not its outer archive folder). Commit this directory and import it into Vercel, or use:

```sh
npm ci
npm run build
npx vercel login
npx vercel
npx vercel --prod
```

Use framework Vite, build command `npm run build`, output `dist`, Node 24. Add the two public Vite environment variables to the intended environments **before building**. Do not place Supabase CLI tokens or database passwords in Vite. Update Supabase Auth URL allowlists and `ALLOWED_ORIGINS` to the final domain, and redeploy the function if secrets changed. `vercel.json` supplies SPA fallback routing and security headers/CSP. Custom Supabase API domains require updating CSP connect-src. Google font origins are allowed because the original stylesheet uses them.

Historical setup assumptions are not current hosting status. See PUBLIC-DATA-REPLACEMENT-HANDOVER.md for supplied deployment history; this cleanup did not change hosting or the live database.

## 7. Backups, recovery, monitoring and retention

These are external operational requirements, not settings silently configured by this source archive:

- Choose a Supabase plan with appropriate automated database backups; enable PITR if your recovery objectives need it. Verify actual backup retention and coverage in the project dashboard. Define owner-approved RPO/RTO, retention and data residency.
- Schedule encrypted off-platform dumps using a trusted runner and a secret-managed connection. Example: `pg_dump "$DATABASE_URL" --format=custom --file=sunsync.dump`. Never put this URL in frontend config or logs. Store outside the web project. Back up any Auth/storage assets separately as required by Supabase's current backup scope.
- Restore to an isolated staging project using `pg_restore --no-owner --no-privileges --dbname="$RESTORE_DATABASE_URL" sunsync.dump`; coordinate Supabase-owned auth/extensions/roles with its restore guidance. Verify account login, row counts, RLS, ledger totals and application integrity before an owner-approved cutover. Rehearse and record restore duration; a configured backup alone is not proof of recoverability.
- Alert on Auth failures, function errors/latency, Postgres CPU/storage/connections and rejected ingestion; build an external stale-meter alert based on each device's expected cadence. Platform health intentionally reports only actual reachability checks and unverified services as needing verification, not invented uptime.
- Edge failures are logged without request bodies or raw SQL errors. Successful sensitive mutations are audited in DB. Supabase platform logs retain unsuccessful requests; add durable security-event export if required. SQL audit rows are immutable to application roles, not to project owners; export to separate write-once storage if required.
- RPC limits are per authenticated actor/minute; Auth has its own provider throttles. They are not a complete distributed WAF or per-IP abuse solution. Configure an API gateway/WAF and SMTP controls for production exposure. Database functions authorize independently even when called directly outside the Edge gateway.
- Rate-limit buckets are opportunistically cleaned after 24 hours during successful processing. Agree on audit/energy/PII retention and a reviewed off-platform archival/deletion policy; don't cascade-delete credit history casually.

## 8. Post-deployment acceptance checklist

Use two societies, two admins and two residents, with separate browser sessions:

- Confirm signup email, login/logout, page refresh, expiry/refresh, recovery email, reset and secure email/password change behavior. Test malformed/expired/reused recovery links.
- Confirm direct REST/RPC calls cannot escalate roles or access another household/society. Test suspended societies, removed admins and deactivated memberships. Test anonymous requests and altered IDs.
- Run `npx supabase db lint --linked` and review advisor findings, indexes and database permissions on the actual hosted version.
- Verify operator-only ingest and error redaction via deployed Edge endpoint; wrong origin, absent JWT, expired JWT, oversized body and malformed payload must fail.
- Load one completed interval for every meter. Retry ingestion, submit overlap, correct before processing, and test invalid/future/negative data.
- Run simultaneous allocations from separate connections; ensure one batch and one credit per home. Verify proportional rounding, demand caps, duplicate rejection, sourced savings and null factors.
- Verify late reading corrections are blocked after processing and financial adjustments remain disabled.
- Confirm per-user realtime notifications and mark-read isolation. Verify opted-in leaderboard aliases do not disclose nonparticipants.
- Check responsive views, keyboard navigation, charts, production CSP, browser console, domain routing and source map/secret exposure.
- Validate actual backup restore, alert delivery, SMTP delivery and admin recovery. Record signed acceptance. Do not treat a successful frontend build as evidence that these external workflows passed.
