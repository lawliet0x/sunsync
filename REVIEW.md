# SunSync review and cleanup

11 November 2026

## Which version to use

Use **Updated SunSync source ZIP.zip** as the base. Its 87 files include the integrated public-data workspace, public-data helpers, source CSV and provenance, replacement SQL, two additional migrations and corresponding tests. The archive labelled “Final” is an older 75-file directory-based version with generated build output. The backend/CSV archive is older still (53 files). The two-file private recovery ZIP is a data backup, not an application.

The cleaned package is the most complete supplied source, not a certification that every production workflow is complete.

## Fresh verification

- npm ci --ignore-scripts: passed, 329 packages installed. Project lifecycle scripts were not enabled.
- npm run lint: passed.
- npm test: 35 passed, zero failed. Includes isolated PGlite migration/RLS/workflow tests and public-data checks; no production SQL executed.
- npm run build: passed.
- npm audit --omit=dev: zero reported production dependency vulnerabilities at review time. This is not a full security audit.
- npm run test:browser: attempted; did not pass. The configured Playwright Chromium executable is absent. No browser download was performed. The blocked runner was stopped. Successful login, deployed Edge Function behavior and authenticated/mobile production flows are not verified.
- Limited static credential-pattern scan: no matches for private keys, GitHub token patterns, Supabase secret keys or JWTs in the supplied source. This is not an exhaustive privacy or secrets audit.

## Cleanup performed

Removed 32 superseded status documents, deployment reports and old verification logs from the cleaned copy, not from the original uploads. Exact paths are listed in CLEANUP.json. Replaced the contradictory README with one current entry point. Updated SETUP's production safety warning and CSV guide status reference. Fixed .gitignore: its trailing .env* rule previously overrode the .env.example exception. Added exclusions for nested function environment files, credentials, ZIPs and private backup filenames.

Kept every runtime source file, test, migration, original dataset and provenance file byte-for-byte. Retained package-lock.json, deployment/CI configs and the disabled demo-seeder guard. node_modules and the fresh generated dist are excluded. The private recovery ZIP and its rows are not included. Original uploaded ZIPs are unchanged.

## Remaining issues

1. Migration history is not safe to push blindly. Source CSV migration version is 20261110110000; the supplied deployment record reports remote version 20261110105402 plus regex differences. Remote history and function definitions must be compared before any reconciliation. No live reconciliation was attempted.
2. The newest handover says the database update ran but the matching frontend was not deployed. Those live claims were not independently verified here. Do not assume the current Vercel site matches this source.
3. The supplied handover reports existing SECURITY DEFINER advisor findings and disabled leaked-password protection. These were not changed or independently rechecked. Local authorization tests do not replace hosted security review.
4. tests/authenticated.spec.js still expects “Workspace access not assigned” after switching to another role's default workspace. Workspace.jsx now deliberately provides public-source views on those default pages for unassigned signed-in users. That assertion needs to target an actual operational-only page, and new authenticated public-data browser coverage should be added. No credentials were supplied and this suite was not certified.
5. This review did not validate SMTP/password recovery delivery, real hardware ingestion, production backups, or financial settlement. The app attributes shared energy; it does not physically transfer electricity or implement cash settlement.

## GitHub and deployment

The target repository was verified empty at the start. No GitHub commits, deployments, account/role changes or live database changes were made. This ZIP is a clean source handoff; upload the contents of its SunSync folder at the repository root when approved. Keep recovery data private. Never upload populated environment files.
