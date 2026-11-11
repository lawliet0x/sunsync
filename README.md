# SunSync

React/Vite frontend with Supabase PostgreSQL, Auth, row-level security and an operations Edge Function. This cleaned source is based on **Updated SunSync source ZIP**, the newest and most complete supplied archive, not the older ZIP labelled “Final”.

## Start locally

Use Node 24 (minimum 22.12):

```sh
npm ci
```

Copy `.env.example` to `.env.local`, set the public Supabase URL and anon/publishable key, then run `npm run dev`. Never add a service-role key or database password to a Vite variable.

## Current data and deployment status

Read [the latest handover](PUBLIC-DATA-REPLACEMENT-HANDOVER.md). It records six public-source entities and six historical monthly generation readings from two independent Taiwan sites, not measurements from the four listed Indian housing societies. No resident consumption, savings or credits are invented.

The supplied handover says the database update ran, but this frontend was not deployed. That live status has not been independently rechecked in this review. No live database or deployment was changed during cleanup.

**Do not run `supabase db push` against the existing production project yet.** The source CSV migration has version `20261110110000`, while the handover records remote version `20261110105402` and SQL regex differences. Compare the actual remote migration/function definitions and reconcile deliberately. See [the migration warning](LIVE-PUBLIC-REFERENCE-DEPLOYMENT.md). `data/replace-demo-with-public.sql` contains data deletion/replacement and was already run according to the handover; it is not an automatic startup or production rerun script.

## Checks

```sh
npm run lint
npm test
npm run build
npm audit --omit=dev
npm run test:browser
```

Browser tests require Playwright Chromium. Authenticated tests require a separate private credentials file. See `REVIEW.md` for results actually obtained in this review and remaining gaps.

## Project files

- `src/`: landing page, login, operational workspaces and integrated public-data views.
- `supabase/migrations/`: schema, RLS, reporting, CSV and public-data changes. Retain the complete history.
- `supabase/functions/operations/`: authenticated gateway and bounded request-body parser.
- `tests/`: Node/PGlite checks and desktop/mobile browser specifications.
- `data/`: original source CSV, provenance, normalization and controlled replacement SQL.
- `SETUP.md`: detailed setup, authorization, formulas and deployment checklist; production migration warning above takes precedence.
- `.github/workflows/ci.yml`: lint, tests, build, production dependency audit and browser checks.

Generated `dist`, installed dependencies, old test/deployment reports and the private recovery backup do not belong in the source repository. Original uploaded ZIPs remain unchanged. See `CLEANUP.json` for removed source-package paths. Keep the private backup outside GitHub.
