# SunSync: demo replaced with public-source data

10 November 2026. This file supersedes older demo, directory and deployment status documents in this archive.

## What is live

The existing Supabase project `olpcjyjdrpnxpybgozof` was updated. No new project or directory table was created.

- `societies`: four publicly listed Mira Bhayandar housing societies plus two independently identified Taiwan solar energy sites.
- `installations`: two source installations. Unavailable commissioning dates and kWp ratings remain null. Source-reported kW capacity is in `source_metadata.reported_capacity_kw`, not mislabelled kWp.
- `devices`: two inactive dataset-series identifiers, explicitly not physical meter serial numbers.
- `readings`: six actual published monthly generation records, July–September 2026, with `verification = public_dataset`, row provenance and original periods.
- No resident consumption, memberships, credits, tariffs, emissions factors or savings were invented.

The synthetic demo society and its linked operational history were removed after a backup: 14 readings, seven allocations and credits, its membership, building, rooftop, meters, subscription, tariff/emissions assumptions, challenge, demo approval request and society-scoped role assignments. User accounts and the system role were preserved. Audit rows remain; when a removed society was referenced by a foreign key, its original ID and name were preserved in audit `details` and the FK was cleared.

Public entities are internally suspended and labelled not onboarded in the new UI. They have no society/resident role assignments. Public rows are readable by authenticated users, not anonymous users, and protected from app writes even by a system administrator. Public-source records do not establish society authorization or registration.

The old `public_society_directory` and municipal-reference tables were retained for backward compatibility with the undeployed old frontend. The new source does not use a separate society-directory screen: primary dashboards read the existing operational tables directly. Existing test fixtures remain synthetic by design; the demo seeder is disabled.

## Energy sources and exact values

Taiwan Power Company official dataset: https://data.gov.tw/en/datasets/29938

Original CSV: https://service.taipower.com.tw/data/opendata/apply/file/d693003/001.csv

| Solar site | July 2026 kWh | August 2026 kWh | September 2026 kWh |
|---|---:|---:|---:|
| Kaohsiung Training Institute Solar Power Station | 47,253 | 26,115 | 40,251 |
| Lanyu Power Plant Solar Power Station | 3,678 | 2,808 | 3,407 |

These are external-site measured monthly totals, not Mira Road society measurements or a live feed. The six records total 123,512 kWh across the two sites and three months; that combined total is not one site's monthly generation. Capacity is reported as 370.74 kW and 28.8 kW respectively.

The source supplies calendar year/month rather than timestamped meter boundaries. Asia/Taipei month boundaries are an explicit normalization convention. Monthly values were copied directly, not integrated from power, split into days, scaled or date-shifted. Gross/net accounting was not specified by the reviewed documentation. September 2026 was the latest period in the downloaded file. The portal's older metadata date is not used as a measurement date.

Attribution: Taiwan Power Company, 2026, dataset 29938 (source version not stated). Released under the Open Government Data License, version 1.0: https://data.gov.tw/license . Original data, normalized JSON, extraction script, license attribution, record ordinals and SHA-256 are in `data/taipower-*` and `data/normalize_taipower.py`.

Housing society source names, exact addresses, access dates and unverified-registration caveats are retained in each society's `source_metadata` and `data/public-society-directory.json`. The four source pages were reread; no solar measurements were established by those listings.

## Delivery status: frontend NOT deployed

The user explicitly chose database update and source ZIP only after Vercel required email verification for a new deployment. No new frontend deployment was accepted. The existing https://sunsync-gamma.vercel.app frontend therefore remains the older build and may show outdated notices, its old directory menu or missing-role screens. It does not yet show the new integrated dashboard. Deploy this source when hosting access is available.

The source integrates public data into existing Overview, Platform overview, Societies, Solar monitoring, Installations and analytics pages. It preserves unavailable values as unavailable, uses source coverage by default, and labels monthly/historical data. Unassigned signed-in users get read-only primary data views; operational actions still require separate authorization.

Do not replay all migrations against the live project. These additions are already applied:

- `20261110115335_integrated_public_data`
- `20261110120242_public_monthly_energy`

The explicit data transaction is `data/replace-demo-with-public.sql`; it has already run live. It is provided for review and controlled fresh setups, not blind production reruns. The previous CSV migration history/regex discrepancy described in `LIVE-PUBLIC-REFERENCE-DEPLOYMENT.md` remains unresolved and must be reconciled separately before any `supabase db push`.

## Verification and remaining limitations

- 35 Node/database/frontend-unit test results passed; lint and production build passed. Logs are in `verification/final-*`.
- All six imported energy values, capacities and source names were independently checked against the original CSV rows.
- Live SQL confirmed six entities, two installations, six readings, 123,512 kWh, zero synthetic readings and no demo membership/credits/tariffs/emissions factors.
- Live transactional access test confirmed that a signed-in unassigned reader sees the public records and public writes fail even for the system administrator. The test transaction was rolled back.
- Full authenticated/mobile browser end-to-end tests did not run: Playwright's Chromium executable was absent. The updated frontend was not browser-tested against production and is not claimed deployed.
- Existing security-advisor findings remain: eleven authenticated-callable SECURITY DEFINER functions, intentional deny-by-default `rate_limits` RLS, and leaked-password protection disabled. No blanket privilege changes were made. See `verification/public-data-security-advisors.json` and the prior deployment report.
  - https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
  - https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
  - https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

A separate private backup archive contains pre-replacement application and audit rows, not Auth passwords or tokens. Keep it private. Restoring demo rows would need a reviewed, FK-ordered transaction; it is not an automatic rollback command. Environment values, passwords, authentication state and node_modules are excluded from the source ZIP.
