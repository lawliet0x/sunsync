import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  sourceDate,
  sourceEnergy,
  sourceTimezone,
  sourceUrl,
} from "../src/public-data.js";

test("public energy totals never substitute zero for missing consumption", () => {
  const result = sourceEnergy(
    [
      { device_id: "generation", energy_kwh: "1.125" },
      { device_id: "generation", energy_kwh: "0" },
    ],
    [{ id: "generation", kind: "generation" }],
  );
  assert.equal(result.generated, 1.125);
  assert.equal(result.consumed, null);
  assert.deepEqual(sourceEnergy([], []), {
    generation: [],
    generated: null,
    consumed: null,
  });
});
test("a real zero reading remains distinct from unavailable", () => {
  assert.equal(
    sourceEnergy(
      [{ device_id: "c", energy_kwh: 0 }],
      [{ id: "c", kind: "consumption" }],
    ).consumed,
    0,
  );
});
test("date filters use source timezone including non-UTC day boundaries", () => {
  assert.equal(
    sourceDate("2024-01-01T23:30:00Z", "Asia/Kolkata"),
    "2024-01-02",
  );
  assert.equal(
    sourceDate("2024-01-01T23:30:00Z", "America/Los_Angeles"),
    "2024-01-01",
  );
  assert.equal(sourceDate(null, "UTC"), "");
  assert.equal(sourceDate("2024-01-01", "America/Los_Angeles"), "2024-01-01");
  assert.equal(sourceTimezone({ timezone: "not/a/timezone" }), "UTC");
  assert.equal(sourceTimezone({ timezone: "Asia/Kolkata" }), "Asia/Kolkata");
});
test("provenance links accept only web URLs", () => {
  assert.equal(sourceUrl("javascript:alert(1)"), null);
  assert.equal(sourceUrl(undefined), null);
  assert.equal(
    sourceUrl("https://example.org/source"),
    "https://example.org/source",
  );
});
test("existing primary pages integrate public data, without a directory route", async () => {
  const workspace = await readFile(
    new URL("../src/Workspace.jsx", import.meta.url),
    "utf8",
  );
  const main = await readFile(
    new URL("../src/main.jsx", import.meta.url),
    "utf8",
  );
  const publicWorkspace = await readFile(
    new URL("../src/PublicDataWorkspace.jsx", import.meta.url),
    "utf8",
  );
  assert.match(workspace, /if \(!allowed && publicPage\)/);
  assert.match(workspace, /<PublicDataWorkspace page=\{page\}/);
  assert.doesNotMatch(
    main,
    /PublicSocietyDirectory|Public society directory|VITE_DEMO_MODE/,
  );
  assert.match(publicWorkspace, /\.from\("societies"\)/);
  assert.match(publicWorkspace, /\.eq\("record_origin", "public_source"\)/);
  assert.match(publicWorkspace, /\.eq\("verification", "public_dataset"\)/);
  assert.doesNotMatch(publicWorkspace, /\.insert\(|\.update\(|\.delete\(/);
});

test("monthly public generation is labelled without inventing daily readings or capacity units", async () => {
  const code = await readFile(
    new URL("../src/PublicDataWorkspace.jsx", import.meta.url),
    "utf8",
  );
  assert.match(code, /metadata.granularity === "month"/);
  assert.match(code, /Measured monthly generation \(kWh\)/);
  assert.match(code, /totals are not split or prorated/);
  assert.match(code, /reported_capacity_kw/);
  assert.match(code, /not a kWp rating/);
  assert.match(code, /End — exclusive/);
});
