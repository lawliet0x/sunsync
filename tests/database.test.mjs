import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("PostgreSQL migrations, RLS and transactional workflows", async (t) => {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
  );
  const files = (
    await readdir(new URL("../supabase/migrations/", import.meta.url))
  ).sort();
  for (const f of files) {
    let sql = await readFile(
      new URL("../supabase/migrations/" + f, import.meta.url),
      "utf8",
    );
    sql = sql.replace(
      "alter publication supabase_realtime add table public.notifications;",
      "",
    );
    await db.exec(sql);
  }
  const q = async (sql) => (await db.query(sql)).rows;
  const user = async (n) => {
    await db.exec("reset role");
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${id(n)}',false);`,
    );
  };
  const owner = () =>
    db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
  const rejected = async (fn, pattern) => {
    await assert.rejects(fn, pattern);
  };
  await db.exec(
    `insert into auth.users(id) values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}'); insert into public.role_assignments(user_id,role) values('${id(1)}','system'); insert into public.societies(id,name) values('${id(10)}','Society A'),('${id(11)}','Society B'); insert into public.role_assignments(user_id,role,society_id) values('${id(2)}','society','${id(10)}'),('${id(5)}','society','${id(11)}'); insert into public.buildings(id,society_id,name) values('${id(20)}','${id(10)}','Tower A'),('${id(21)}','${id(11)}','Tower B'); insert into public.plans(id,name,max_residents) values('${id(30)}','Test entitlement',2); insert into public.subscriptions(society_id,plan_id,status) values('${id(10)}','${id(30)}','active'); insert into public.allocation_rules(society_id) values('${id(10)}');`,
  );
  await t.test("Every application table has RLS enabled", async () => {
    const tables = await q(
      "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
    );
    assert.ok(tables.length >= 23);
    assert.ok(tables.every((x) => x.relrowsecurity));
  });
  await t.test(
    "Auth trigger creates a profile without role escalation from metadata",
    async () => {
      assert.equal(
        (await q("select count(*)::int as n from public.profiles"))[0].n,
        5,
      );
      await db.exec(
        `insert into auth.users(id,raw_user_meta_data) values('${id(6)}','{"role":"system"}');`,
      );
      assert.equal(
        (
          await q(
            `select count(*)::int as n from public.role_assignments where user_id='${id(6)}'`,
          )
        )[0].n,
        0,
      );
    },
  );
  await t.test(
    "Resident cannot self-assign a role, write readings or read another profile",
    async () => {
      await user(3);
      assert.equal((await q("select * from public.profiles")).length, 1);
      await rejected(
        () =>
          db.exec(
            `insert into public.role_assignments(user_id,role) values('${id(3)}','system')`,
          ),
        /permission denied/,
      );
      await rejected(
        () =>
          db.exec(
            `update public.profiles set id='${id(4)}' where id='${id(3)}'`,
          ),
        /permission denied/,
      );
      await rejected(
        () => db.exec("insert into public.readings default values"),
        /permission denied/,
      );
    },
  );
  let m1, m2;
  await t.test(
    "Admin links residents within scope with cap enforcement",
    async () => {
      await user(2);
      m1 = (
        await q(
          `select public.add_member('${id(10)}','${id(20)}','${id(3)}','101') as id`,
        )
      )[0].id;
      m2 = (
        await q(
          `select public.add_member('${id(10)}','${id(20)}','${id(4)}','102') as id`,
        )
      )[0].id;
      await rejected(
        () =>
          db.exec(
            `select public.add_member('${id(11)}','${id(21)}','${id(3)}','999')`,
          ),
        /Forbidden/,
      );
      await rejected(
        () =>
          db.exec(
            `select public.add_member('${id(10)}','${id(20)}','${id(6)}','103')`,
          ),
        /limit reached/,
      );
    },
  );
  await owner();
  await db.exec(
    `insert into public.installations(id,society_id,name,capacity_kwp,commissioned_on) values('${id(40)}','${id(10)}','Roof',20,'2025-01-01'); insert into public.devices(id,society_id,installation_id,serial,kind) values('${id(50)}','${id(10)}','${id(40)}','gen-1','generation'); insert into public.devices(id,society_id,membership_id,serial,kind) values('${id(51)}','${id(10)}','${m1}','load-1','consumption'),('${id(52)}','${id(10)}','${m2}','load-2','consumption');`,
  );
  const start = new Date(Date.now() - 86400000).toISOString(),
    end = new Date(Date.now() - 82800000).toISOString();
  const ingest = (device, kwh, external, correction = "null") =>
    `select public.ingest_reading('${id(device)}','${start}','${end}',${kwh},'Operator reviewed signed export','${external}',${correction}) as id`;
  await t.test(
    "Ingestion validates energy, rejects overlaps, and retries idempotently",
    async () => {
      await user(2);
      const a = await q(ingest(50, 8, "g1"));
      assert.equal((await q(ingest(50, 8, "g1")))[0].id, a[0].id);
      await rejected(() => db.exec(ingest(50, 9, "g1")), /explicit correction/);
      await rejected(() => db.exec(ingest(51, -1, "bad")), /Invalid energy/);
      await rejected(
        () =>
          db.exec(
            `select public.ingest_reading('${id(50)}','${start}','${new Date(Date.now() - 81000000).toISOString()}',8,'Operator export','overlap')`,
          ),
        /Overlapping/,
      );
      await q(ingest(51, 6, "c1"));
      await q(ingest(52, 4, "c2"));
    },
  );
  await t.test(
    "Corrections retain an immutable prior-value revision",
    async () => {
      await q(
        ingest(50, 10, "g1", "'Corrected according to validated meter export'"),
      );
      assert.equal(
        (await q("select * from public.reading_revisions")).length,
        1,
      );
    },
  );
  await t.test("Server aggregation honors role-scoped rows", async () => {
    await user(3);
    const r = (
      await q(
        `select * from public.energy_report('${id(10)}','${start}','${end}','day')`,
      )
    )[0];
    assert.equal(Number(r.consumption), 6);
    assert.equal(Number(r.generation), 0);
    await rejected(
      () =>
        db.exec(
          `select public.energy_report('${id(10)}','${start}','${end}','invalid')`,
        ),
      /Invalid report/,
    );
  });
  await t.test("Missing meter readings block processing", async () => {
    await user(2);
    await rejected(
      () =>
        db.exec(
          `select public.process_allocation('${id(10)}','${new Date(Date.now() - 172800000).toISOString()}','${new Date(Date.now() - 169200000).toISOString()}')`,
        ),
      /Missing aligned/,
    );
  });
  await t.test(
    "Allocation is retry-safe, demand-capped and estimates require sources",
    async () => {
      await user(2);
      const sql = `select public.process_allocation('${id(10)}','${start}','${end}') as id`;
      const first = (await q(sql))[0].id;
      assert.equal((await q(sql))[0].id, first);
      const a = await q("select * from public.allocations order by energy_kwh");
      assert.deepEqual(
        a.map((x) => Number(x.energy_kwh)),
        [4, 6],
      );
      assert.ok(a.every((x) => x.estimated_savings_inr === null));
      assert.equal(
        (await q("select * from public.credit_transactions")).length,
        2,
      );
      await rejected(
        () =>
          db.exec(ingest(50, 11, "g1", "'Change after processing must fail'")),
        /immutable/,
      );
    },
  );
  await t.test(
    "Cross-account energy, credits and notifications cannot be read or modified",
    async () => {
      await user(3);
      assert.equal((await q("select * from public.memberships")).length, 1);
      assert.equal((await q("select * from public.readings")).length, 1);
      assert.equal(
        (await q("select * from public.credit_transactions")).length,
        1,
      );
      assert.equal((await q("select * from public.notifications")).length, 2);
      assert.ok(
        (await q("select * from public.notifications")).every(
          (r) => r.user_id === id(3),
        ),
      );
      assert.equal(
        (await q(`select * from public.credit_summary('${id(10)}')`))[0]
          .total_kwh,
        "6.000000",
      );
      await rejected(
        () =>
          db.exec(
            `select public.process_allocation('${id(10)}','${start}','${end}')`,
          ),
        /Forbidden/,
      );
      assert.equal(
        (
          await q(
            `update public.notifications set read_at=now() where user_id='${id(4)}' returning id`,
          )
        ).length,
        0,
      );
      await rejected(
        () => db.exec("delete from public.credit_transactions"),
        /permission denied/,
      );
      assert.equal((await q("select * from public.audit_logs")).length, 0);
    },
  );
  await t.test(
    "Society admins cannot access another society or platform settings",
    async () => {
      await user(5);
      assert.equal((await q("select * from public.readings")).length, 0);
      assert.equal((await q("select * from public.memberships")).length, 0);
      await rejected(
        () =>
          db.exec(
            "insert into public.platform_settings values('insecure','true')",
          ),
        /row-level security/,
      );
      await rejected(
        () =>
          db.exec(
            `insert into public.buildings(society_id,name) values('${id(10)}','Unauthorized')`,
          ),
        /row-level security/,
      );
    },
  );
  await t.test(
    "Applicant cannot approve themselves; platform review is atomic and audited",
    async () => {
      await user(6);
      const r = (
        await q(
          `insert into public.registration_requests(applicant_id,society_name,address,evidence) values('${id(6)}','New community','Verified road 123','Ownership document reference 123') returning id`,
        )
      )[0].id;
      await rejected(
        () =>
          db.exec(
            `select public.review_registration('${r}',true,'Verified documents and authority')`,
          ),
        /Forbidden/,
      );
      await user(1);
      const s = (
        await q(
          `select public.review_registration('${r}',true,'Verified documents and authority independently') as id`,
        )
      )[0].id;
      assert.ok(s);
      await rejected(
        () =>
          db.exec(
            `select public.review_registration('${r}',true,'Verified documents and authority independently')`,
          ),
        /not pending/,
      );
      assert.ok((await q("select * from public.audit_logs")).length > 20);
      await rejected(
        () => db.exec("update public.audit_logs set action='erased'"),
        /permission denied/,
      );
    },
  );
  await t.test(
    "Sourced estimates, proportional fractions and concurrent retry requests stay consistent",
    async () => {
      await user(2);
      const s2 = new Date(Date.now() - 72000000).toISOString(),
        e2 = new Date(Date.now() - 68400000).toISOString();
      await db.exec(
        `insert into public.tariffs(society_id,inr_per_kwh,valid_from,valid_until,source,approved_by) values('${id(10)}',7.5,'${start}','${e2}','Approved utility tariff reference 2026','${id(1)}'); insert into public.emission_factors(society_id,kg_co2e_per_kwh,valid_from,valid_until,source,approved_by) values('${id(10)}',0.7,'${start}','${e2}','Published electricity grid factor reference','${id(1)}');`,
      );
      assert.equal(
        (await q("select approved_by from public.tariffs"))[0].approved_by,
        id(2),
      );
      for (const [device, kwh] of [
        [50, 7],
        [51, 6],
        [52, 4],
      ])
        await q(
          `select public.ingest_reading('${id(device)}','${s2}','${e2}',${kwh},'Validated operator export','second-${device}')`,
        );
      const sql = `select public.process_allocation('${id(10)}','${s2}','${e2}') as id`;
      const results = await Promise.all([q(sql), q(sql), q(sql)]);
      assert.ok(results.every((r) => r[0].id === results[0][0].id));
      const a = await q(
        `select * from public.allocations where batch_id='${results[0][0].id}' order by energy_kwh`,
      );
      assert.deepEqual(
        a.map((r) => Number(r.energy_kwh)),
        [2.8, 4.2],
      );
      assert.equal(
        a.reduce((n, r) => n + Number(r.estimated_savings_inr), 0),
        52.5,
      );
      assert.equal(
        Math.round(
          a.reduce((n, r) => n + Number(r.estimated_avoided_kg), 0) * 100,
        ),
        490,
      );
    },
  );
  await t.test(
    "Community rankings require explicit opt-in and return no private identifiers",
    async () => {
      await user(3);
      assert.deepEqual(
        await q(`select * from public.community_leaderboard('${id(10)}')`),
        [],
      );
      await db.exec(
        `update public.profiles set community_alias='Solar neighbour',leaderboard_opt_in=true where id='${id(3)}'`,
      );
      const ranking = await q(
        `select * from public.community_leaderboard('${id(10)}')`,
      );
      assert.equal(ranking.length, 1);
      assert.equal(ranking[0].alias, "Solar neighbour");
      assert.deepEqual(Object.keys(ranking[0]).sort(), [
        "alias",
        "credited_kwh",
      ]);
      await user(5);
      await rejected(
        () => db.exec(`select public.community_leaderboard('${id(10)}')`),
        /Forbidden/,
      );
    },
  );
  await t.test(
    "System-only admin grants, society suspension and resident deactivation enforce access",
    async () => {
      await user(2);
      await rejected(
        () =>
          db.exec(
            `select public.manage_access('${id(10)}','${id(3)}','grant_society_admin')`,
          ),
        /Forbidden/,
      );
      await user(1);
      await db.exec(
        `select public.manage_access('${id(10)}',null,'suspend_society')`,
      );
      await user(3);
      assert.equal(
        (await q("select * from public.credit_transactions")).length,
        0,
      );
      await user(1);
      await db.exec(
        `select public.manage_access('${id(10)}',null,'activate_society')`,
      );
      await user(2);
      await db.exec(
        `select public.manage_access('${id(10)}','${id(3)}','deactivate_resident')`,
      );
      await user(3);
      assert.equal((await q("select * from public.readings")).length, 0);
      await user(2);
      await db.exec(
        `select public.manage_access('${id(10)}','${id(3)}','activate_resident')`,
      );
      await user(3);
      assert.equal((await q("select * from public.readings")).length, 2);
    },
  );
  await t.test(
    "Anonymous clients have no application-table access",
    async () => {
      await owner();
      await db.exec("set role anon");
      await rejected(
        () => db.exec("select * from public.profiles"),
        /permission denied/,
      );
      await rejected(
        () =>
          db.exec(
            `select public.process_allocation('${id(10)}','${start}','${end}')`,
          ),
        /permission denied/,
      );
    },
  );
  await t.test(
    "Revoking an administrator audits the removed assignment and blocks access",
    async () => {
      await user(1);
      await db.exec(
        `select public.manage_access('${id(10)}','${id(6)}','grant_society_admin')`,
      );
      const assignment = (
        await q(
          `select id from public.role_assignments where user_id='${id(6)}' and society_id='${id(10)}' and role='society'`,
        )
      )[0].id;
      await db.exec(
        `select public.manage_access('${id(10)}','${id(6)}','revoke_society_admin')`,
      );
      const audit = (
        await q(
          `select * from public.audit_logs where action='DELETE' and entity_type='role_assignments' and entity_id='${assignment}'`,
        )
      )[0];
      assert.equal(audit.actor_id, id(1));
      assert.equal(audit.society_id, id(10));
      assert.deepEqual(audit.details, {
        user_id: id(6),
        role: "society",
        society_id: id(10),
      });
      await user(6);
      assert.equal(
        (await q(`select public.admin_of('${id(10)}') as allowed`))[0].allowed,
        false,
      );
      await rejected(
        () => db.exec("select public.audit_role_removal()"),
        /permission denied/,
      );
    },
  );
  await t.test('CSV batch import is scoped, atomic, audited and retry-safe', async () => {
    const s = new Date(Date.now()-36000000).toISOString(), e = new Date(Date.now()-32400000).toISOString();
    const row = {device_serial:'gen-1', start_at:s, end_at:e, kwh:'2.5', source:'Actual export reference (synthetic test fixture)', external_id:'csv-generation-1'};
    const call = (records, society = id(10)) => q(      "select public.import_meter_readings('"+society+"','"+JSON.stringify(records).replaceAll("'","''")+"'::jsonb) as result"    );
    await user(3);
    await rejected(() => call([row]), /Forbidden/);
    await user(5);
    await rejected(() => call([row]), /Forbidden/);
    await user(2);
    const before = (await q('select count(*)::int as n from public.readings'))[0].n;
    await rejected(() => call([row, {...row,device_serial:'unknown-meter', external_id:'bad'}]), /CSV row 2 rejected/);
    assert.equal((await q('select count(*)::int as n from public.readings'))[0].n,before);
    const first = (await call([row]))[0].result;
    assert.equal(first.accepted,1);
    assert.deepEqual((await call([row]))[0].result,first);
    assert.equal((await q('select count(*)::int as n from public.readings'))[0].n,before+1);
    await user(1);
    assert.ok((await q("select * from public.audit_logs where entity_id='"+first.reading_ids[0]+"'")).length);
    await user(2);
    await rejected(() => call([{...row,kwh:'9'}]), /explicit correction/);
    await rejected(() => call([{...row,kwh:'NaN'}]), /decimal interval/);
    await rejected(() => call([{...row,extra:'unsafe'}]), /six CSV fields/);
    await rejected(() => call([{...row,kwh:2}]), /must be text/);
    await rejected(() => call([]), /1-20 rows/);
    await rejected(() => call(Array(21).fill(row)), /1-20 rows/);
    await rejected(() => call([{...row,device_serial:'load-1',start_at:start,end_at:end}]), /immutable/);
    await owner(); await db.exec('set role anon');
    await rejected(() => call([row]), /permission denied/);
  });
  await db.close();
});
