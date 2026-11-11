# Live public-reference deployment

Completed 10 November 2026, approximately 16:55 IST.

Website: https://sunsync-gamma.vercel.app
Supabase project: sunsync / olpcjyjdrpnxpybgozof (ap-south-1; observed ACTIVE_HEALTHY).
Vercel project: sunsync / prj_qhUDgnHzg17hZwhhrLhAQ8UAiiq5.
Production deployment: dpl_BHzEurZuxjiWMJmS28oUnfRF5m7F.
Deployment URL: https://sunsync-cvukpk973-vg5807-8709.vercel.app
Previous production rollback target: dpl_266WmVsND453Jmnc7kvp8qYnQ1bG.

## Changes applied

Applied `mira_bhayandar_public_reference` through the Supabase migration tool. The server recorded version `20261110111818`; the source migration has been renamed to match that live version. It creates the public-reference table and inserts 13 MBMC-sourced facts/locality entries. All nine historical localities and every source URL were verified in the live database.

No residents, accounts, societies, readings, tariffs, allocations, credits or bills were inserted or edited by this update. No new paid project was created. Existing production environment settings and the operations Edge Function were left unchanged. The existing demo notice remains visible.

Added an application error boundary so a render failure produces a recoverable screen rather than leaving the app blank.

## Verification

- Live database: 13 records, nine historical localities, all linked to the reviewed MBMC source.
- Live table: RLS enabled; anonymous read denied; authenticated read allowed; authenticated insert/update/delete denied.
- Authenticated society dashboard: loaded on staged build and final production domain.
- Authenticated public-reference page: all 13 cards loaded on staged build and final production domain; 2011 population label confirmed; no load/render error; demo notice visible.
- Existing local tests: 28 Node/database results passed before deployment; lint passed again after the error-boundary addition. See PUBLIC-REFERENCE-TEST-RESULTS.txt for local test scope.
- Authenticated resident/system screens and mobile viewport were not retested end-to-end in this deployment. No meter import, financial mutation or account/access change was used for testing.

The first new production build rendered blank in the verification tab. The previous frontend was restored, an error boundary was added, and the next build was tested at its deployment URL before promotion. The original blank-page cause was not established. The final production page was observed working; this is not a claim that every possible runtime fault has been eliminated.

## Migration history warning

The live CSV migration is `20261110105402_sunsync_csv_import`, while the uploaded source called it `20261110110000_sunsync_csv_import`. It already exists remotely and was NOT replayed. The hosted function also has regex escaping differences from the local file; its behavior was not changed or certified by this public-reference deployment. Do not run an unreviewed `supabase db push` against this project from the original source history: reconcile the existing CSV migration explicitly first. Do not mark different SQL as identical without review. The new public-reference migration is already applied and must not be rerun.

## Existing security-advisor findings

The post-migration advisor reported no finding naming the new reference table. It did report existing application/auth items:
- 11 authenticated-callable SECURITY DEFINER functions: review their internal authorization before changing privileges. Blanket revocation can break existing workflows. https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- RLS enabled without policies on the internal rate_limits table: may be intentional deny-by-default; review function access. https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Leaked-password protection disabled: review availability and enable when appropriate. https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

These findings were reported, not automatically modified.

## Access and rollback

Sign in, then choose “Mira Bhayandar reference” in the left navigation. The same reference data is readable by authenticated accounts; operational data remains governed by existing role/society rules.

If a frontend issue reappears, use Vercel's rollback to the previous target listed above. The additive reference table can remain in place with the old frontend. Do not delete production operational data. Any database removal should use a separate reviewed migration after backing up the reference table.

The package excludes populated environment files, CLI authentication state and private demo passwords. The local `dist` is not a substitute for the Vercel production build with the configured environment variables.
