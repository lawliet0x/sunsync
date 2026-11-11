# Actual meter data import

Added 10 November 2026. This document describes the new CSV workflow; older deployment reports are historical.

No real readings were supplied or inserted. Existing demo readings remain synthetic. The new feature accepts operator-reviewed exports; it does not connect to a meter automatically or certify a file as genuine.

## Use it

Sign in as a society admin, choose the correct society and open Solar monitoring. Download the empty CSV template, fill it from an actual source export, upload it, review the preview and confirm import. Register each active meter first under Installations. Match its exact serial. Use a separate, properly approved society for real measurements rather than mixing real readings with the synthetic demo society.

Required header, in this order:

`device_serial,start_at,end_at,kwh,source,external_id`

- device_serial: registered active meter serial, 1-160 characters.
- start_at / end_at: ISO timestamps with seconds and Z or an explicit offset such as +05:30. Each completed interval must be greater than zero and at most 24 hours; existing server rules reject data older than two years.
- kwh: interval energy, 0-1000000, at most six decimal places. Do not upload cumulative counters, instantaneous watts, formulas or estimated generation as actual measurement. A cumulative export needs a separately reviewed conversion that handles meter resets and missing intervals.
- source: traceable export/validation reference, 10-2000 characters. Do not include passwords or API tokens.
- external_id: stable ID from the source for this meter reading, 1-200 characters. Retain the same ID on retries.

UTF-8 CSV supports quoted commas, escaped double quotes, CRLF and a BOM. Blank lines are ignored. Limit: 20 data rows, 64 KiB file and 12000 bytes of normalized JSON in the UI. The database independently caps records to 20 and 14000 JSON bytes; the existing Edge gateway caps complete request bodies to 16384 bytes. Split larger exports into reviewed files.

## Guarantees and limits

Each request is one transaction. An invalid or unauthorized row rolls back the whole batch, including audit events and rate counters. The server resolves serials within the selected society, checks admin access and delegates to existing ingest_reading, retaining provenance, actor, audit, interval, overlap, rate-limit and immutable-allocation rules. It does not use a service-role key.

Unchanged retries before allocation return the original reading IDs. The accepted count includes unchanged retries, not just newly created rows. Already allocated intervals remain immutable, even for a retry. CSV cannot make corrections; use the existing explicit correction workflow before allocation. A lost HTTP response can leave commit status unknown; retry the identical file before allocating. No allocation, tariff, credit, payment or emission claim is generated automatically by importing.

The UI preview is a convenience. Server validation is authoritative. A valid file is operator-validated, not cryptographically device-signed. Real meter/API integration remains future work until a brand, documented API and private credentials are supplied.

## Deployment

Apply the new CSV migration after the six original migrations, then deploy the operations function with both index.ts and request-body.js. Keep its existing ALLOWED_ORIGINS and explicit getUser JWT validation. Deploy the Vite frontend after setting the public Supabase URL/key. Keep the demo flag true while the deployment still serves synthetic demo data.

`npm ci`, `npm run lint`, `npm test`, `npm run build`. Read README.md for the actual outcome of this run.
