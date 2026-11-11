import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("Public municipal reference: migrations, provenance, read-only RLS and operational isolation", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
    );
    for (const f of (
      await readdir(new URL("../supabase/migrations/", import.meta.url))
    ).sort()) {
      const sql = (
        await readFile(
          new URL("../supabase/migrations/" + f, import.meta.url),
          "utf8",
        )
      ).replace(
        "alter publication supabase_realtime add table public.notifications;",
        "",
      );
      await db.exec(sql);
    }

    const directoryFixture = JSON.parse(
      await readFile(
        new URL("../data/public-society-directory.json", import.meta.url),
        "utf8",
      ),
    );
    const directory = (
      await db.query(
        "select * from public.public_society_directory order by slug",
      )
    ).rows;
    assert.equal(directory.length, 4);
    for (const row of directory) {
      const expected = directoryFixture.find((r) => r.slug === row.slug);
      assert.ok(expected);
      for (const k of [
        "name",
        "address",
        "locality",
        "source_url",
        "notes",
        "verification_status",
      ])
        assert.equal(row[k], expected[k]);
      assert.equal(row.verification_status, "public_listing_unverified");
    }
    await db.exec("set role anon");
    await assert.rejects(
      () => db.query("select * from public.public_society_directory"),
      /permission denied/,
    );
    await db.exec("reset role; set role authenticated");
    assert.equal(
      (await db.query("select * from public.public_society_directory")).rows
        .length,
      4,
    );
    await assert.rejects(
      () =>
        db.exec("update public.public_society_directory set name='tampered'"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.exec("delete from public.public_society_directory"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.exec(
          "insert into public.public_society_directory select * from public.public_society_directory",
        ),
      /permission denied/,
    );
    await db.exec("reset role");

    const fixture = JSON.parse(
      await readFile(
        new URL(
          "../data/mira-bhayandar-public-reference.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const rows = (
      await db.query(
        "select * from public.public_reference_records order by key",
      )
    ).rows;
    assert.equal(rows.length, 13);
    assert.equal(
      rows.filter((r) => r.category === "historical_locality").length,
      9,
    );
    for (const r of rows) {
      const expected = fixture.find((f) => f.key === r.key);
      assert.ok(expected);
      for (const k of [
        "label",
        "value_text",
        "source_url",
        "source_title",
        "reference_period",
        "scope_note",
      ])
        assert.equal(r[k], expected[k]);
      assert.ok(r.source_url.startsWith("https://www.mbmc.gov.in/"));
    }
    assert.equal(
      Number(rows.find((r) => r.key === "population_2011").numeric_value),
      809378,
    );
    assert.equal(
      rows.find((r) => r.key === "population_2011").reference_period,
      "2011 Census",
    );
    for (const table of [
      "profiles",
      "societies",
      "memberships",
      "readings",
      "allocations",
      "credit_transactions",
      "tariffs",
      "emission_factors",
    ]) {
      assert.equal(
        (await db.query("select count(*)::int as n from public." + table))
          .rows[0].n,
        0,
      );
    }
    await db.exec("set role anon");
    await assert.rejects(
      () => db.query("select * from public.public_reference_records"),
      /permission denied/,
    );
    await db.exec("reset role; set role authenticated");
    assert.equal(
      (await db.query("select * from public.public_reference_records")).rows
        .length,
      13,
    );
    await assert.rejects(
      () =>
        db.exec(
          "update public.public_reference_records set value_text='tampered'",
        ),
      /permission denied/,
    );
    await assert.rejects(
      () => db.exec("delete from public.public_reference_records"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.exec(
          "insert into public.public_reference_records select * from public.public_reference_records",
        ),
      /permission denied/,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select relrowsecurity from pg_class where oid='public.public_reference_records'::regclass",
        )
      ).rows[0].relrowsecurity,
      true,
    );
  } finally {
    await db.close();
  }
});
