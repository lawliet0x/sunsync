import PublicDataWorkspace from "./PublicDataWorkspace.jsx";
import MeterCsvImport from "./MeterCsvImport.jsx";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  supabase,
  useBackend,
  configured,
  friendly,
  operation,
  ApplicationForm,
} from "./backend.jsx";
const labels = {
  profiles: "Profiles",
  memberships: "Residents",
  buildings: "Buildings",
  installations: "Installations",
  devices: "Monitoring devices",
  readings: "Energy readings",
  allocations: "Allocation records",
  credit_transactions: "Solar credit ledger",
  societies: "Societies",
  registration_requests: "Approval requests",
  plans: "Subscription plans",
  subscriptions: "Society subscriptions",
  audit_logs: "Audit events",
  notifications: "Notifications",
  tariffs: "Approved tariffs",
  emission_factors: "Emission factors",
  allocation_rules: "Allocation rules",
  community_challenges: "Community challenges",
  platform_settings: "Platform settings",
  allocation_batches: "Allocation batches",
};
const F = (name, label, type = "text", extra = {}) => ({
  name,
  label,
  type,
  ...extra,
});
const schemas = {
  buildings: [F("name", "Building name"), F("address", "Building address")],
  installations: [
    F("name", "Installation name"),
    F("building_id", "Building", "select", {
      table: "buildings",
      optional: true,
    }),
    F("capacity_kwp", "Capacity (kWp)", "number", { min: 0.001, step: 0.001 }),
    F("commissioned_on", "Commissioning date", "date"),
  ],
  devices: [
    F("serial", "Unique meter serial"),
    F("kind", "Meter type", "select", {
      options: ["generation", "consumption"],
    }),
    F("installation_id", "Generation installation", "select", {
      table: "installations",
      optional: true,
    }),
    F("membership_id", "Consumption membership", "select", {
      table: "memberships",
      optional: true,
    }),
  ],
  tariffs: [
    F("inr_per_kwh", "Approved INR per kWh", "number", {
      min: 0,
      step: 0.000001,
    }),
    F("valid_from", "Effective from", "datetime-local"),
    F("valid_until", "Effective until", "datetime-local"),
    F("source", "Published tariff source / approval reference"),
  ],
  emission_factors: [
    F("kg_co2e_per_kwh", "kg CO₂e per kWh", "number", {
      min: 0,
      step: 0.000001,
    }),
    F("valid_from", "Effective from", "datetime-local"),
    F("valid_until", "Effective until", "datetime-local"),
    F("source", "Published factor source and year"),
  ],
  community_challenges: [
    F("title", "Challenge title"),
    F("description", "Description"),
    F("target_kwh", "Community credit target (kWh)", "number", {
      min: 0.000001,
      step: 0.000001,
    }),
    F("ends_at", "Ends at", "datetime-local"),
  ],
  plans: [
    F("name", "Plan name"),
    F("max_residents", "Resident limit", "number", { min: 1, step: 1 }),
    F("monthly_price_inr", "Monthly listed price (INR)", "number", {
      min: 0,
      step: 0.01,
    }),
  ],
  subscriptions: [
    F("society_id", "Society", "select", { table: "societies" }),
    F("plan_id", "Plan", "select", { table: "plans" }),
    F("status", "Status", "select", {
      options: ["active", "paused", "cancelled"],
    }),
    F("ends_at", "Expiry (optional)", "datetime-local", { optional: true }),
  ],
  platform_settings: [F("key", "Setting key"), F("value", "JSON value")],
  add_member: [
    F("building", "Building", "select", { table: "buildings" }),
    F("resident", "Registered resident user UUID"),
    F("home", "Home / unit"),
  ],
  ingest_reading: [
    F("device", "Monitoring device", "select", { table: "devices" }),
    F("start_at", "Interval start", "datetime-local"),
    F("end_at", "Interval end", "datetime-local"),
    F("kwh", "Interval energy (kWh, not a cumulative counter)", "number", {
      min: 0,
      step: 0.000001,
    }),
    F("provenance", "Data source / validation evidence"),
    F("external_id", "Stable source record ID"),
    F(
      "correction",
      "Correction reason (only for replacing an unallocated reading)",
      "text",
      { optional: true },
    ),
  ],
  process_allocation: [
    F("start_at", "Aligned interval start", "datetime-local"),
    F("end_at", "Aligned interval end", "datetime-local"),
  ],
  profiles: [
    F("full_name", "Your name"),
    F("community_alias", "Public leaderboard alias (optional)", "text", {
      optional: true,
    }),
    F(
      "leaderboard_opt_in",
      "Share alias and credited kWh with this society",
      "select",
      { options: ["false", "true"] },
    ),
  ],
  manage_access: [
    F("society", "Society UUID"),
    F(
      "target_user",
      "Target registered user UUID (blank for society status)",
      "text",
      { optional: true },
    ),
    F("action", "Authorized access change", "select", {
      options: [
        "grant_society_admin",
        "revoke_society_admin",
        "suspend_society",
        "activate_society",
        "deactivate_resident",
        "activate_resident",
      ],
    }),
  ],
  resident_access: [
    F("target_user", "Resident user UUID"),
    F("action", "Resident status", "select", {
      options: ["deactivate_resident", "activate_resident"],
    }),
  ],
  societies: [F("name", "Society name"), F("address", "Address")],
};
const n = (v) => Number(v || 0),
  fmt = (v) =>
    v == null
      ? "Unavailable"
      : Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 });
async function rows(table, society, range) {
  let out = [],
    offset = 0;
  while (true) {
    let q = supabase
      .from(table)
      .select("*")
      .order(
        table === "platform_settings"
          ? "key"
          : table === "readings"
            ? "interval_start"
            : "created_at",
        { ascending: false },
      )
      .range(offset, offset + 499);
    if (
      society &&
      ![
        "profiles",
        "role_assignments",
        "plans",
        "platform_settings",
        "societies",
        "registration_requests",
        "audit_logs",
      ].includes(table)
    )
      q = q.eq("society_id", society);
    if (table === "societies" && society) q = q.eq("id", society);
    if (
      range &&
      [
        "readings",
        "allocations",
        "credit_transactions",
        "allocation_batches",
      ].includes(table)
    )
      q = q
        .gte(
          table === "readings" ? "interval_start" : "created_at",
          new Date(range.from).toISOString(),
        )
        .lt(
          table === "readings" ? "interval_start" : "created_at",
          new Date(range.to).toISOString(),
        );
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 500) break;
    offset += 500;
    if (offset >= 10000)
      throw new Error("Too many records. Narrow the date range.");
  }
  return out;
}
export default function Workspace({ role, page }) {
  const {
    session,
    roles,
    loading: authLoading,
    error: authError,
    refreshRoles,
  } = useBackend();
  const [society, setSociety] = useState(""),
    [data, setData] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [form, setForm] = useState(null),
    [editing, setEditing] = useState(null),
    [search, setSearch] = useState(""),
    [period, setPeriod] = useState("Day"),
    [health, setHealth] = useState(null),
    [report, setReport] = useState([]),
    [benefits, setBenefits] = useState([]),
    [balance, setBalance] = useState(null),
    [leaderboard, setLeaderboard] = useState([]),
    [communityTotal, setCommunityTotal] = useState(null);
  const [range, setRange] = useState(() => {
    const end = new Date();
    end.setDate(end.getDate() + 1);
    return {
      from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  });
  const requestVersion = useRef(0);
  const allowed = roles.some((r) => r.role === role);
  const scopes = [
    ...new Set(
      roles
        .filter((r) => r.society_id && (r.role === role || r.role === "system"))
        .map((r) => r.society_id),
    ),
  ];
  useEffect(() => {
    if (!society && scopes.length) setSociety(scopes[0]);
  }, [scopes.join(","), society]);
  const load = useCallback(async () => {
    if (!configured || !session || !allowed) return;
    if (role !== "system" && !society) return;
    const version = ++requestVersion.current;
    setBusy(true);
    setError("");
    try {
      let tables;
      if (role === "system")
        tables =
          page === "Platform overview"
            ? ["societies", "registration_requests", "subscriptions", "plans"]
            : page === "Societies"
              ? ["societies", "plans", "subscriptions"]
              : page === "Approvals"
                ? ["registration_requests"]
                : page === "Plans & limits"
                  ? ["plans", "societies", "subscriptions"]
                  : page === "Audit & security"
                    ? ["audit_logs"]
                    : page === "Platform settings"
                      ? ["platform_settings", "profiles"]
                      : [];
      else if (page === "Notifications") tables = ["notifications"];
      else if (page === "Profile & settings") tables = ["profiles"];
      else if (page === "Society settings")
        tables = [
          "societies",
          "tariffs",
          "emission_factors",
          "allocation_rules",
          "community_challenges",
        ];
      else if (page === "Residents & buildings")
        tables = ["memberships", "buildings", "profiles"];
      else if (page === "Installations")
        tables = ["installations", "devices", "buildings", "memberships"];
      else if (page === "Community")
        tables = ["community_challenges", "credit_transactions"];
      else
        tables = [
          "readings",
          "devices",
          "allocations",
          "credit_transactions",
          ...(role === "society"
            ? [
                "memberships",
                "allocation_batches",
                "installations",
                "allocation_rules",
              ]
            : []),
        ];
      const result = Object.fromEntries(
        await Promise.all(
          tables.map(async (t) => [
            t,
            await rows(t, role === "system" ? null : society, range),
          ]),
        ),
      );
      if (version !== requestVersion.current) return;
      setData(result);
      if (page === "Community") {
        const responses = await Promise.all([
          supabase.rpc("community_leaderboard", { society }),
          supabase.rpc("community_progress", { society }),
          supabase.rpc("credit_summary", { society }),
        ]);
        if (responses.some((r) => r.error))
          throw new Error("Community report unavailable");
        if (version !== requestVersion.current) return;
        setLeaderboard(responses[0].data);
        setCommunityTotal(responses[1].data);
        setBalance(responses[2].data[0]);
      }

      if (tables.includes("readings")) {
        const { data: reportRows, error: reportError } = await supabase.rpc(
          "energy_report",
          {
            society,
            start_at: new Date(range.from).toISOString(),
            end_at: new Date(range.to).toISOString(),
            grain: period.toLowerCase(),
          },
        );
        if (reportError) throw reportError;
        if (version !== requestVersion.current) return;
        setReport(
          reportRows.map((r) => ({
            date: new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Kolkata",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(r.bucket)),
            generation: Number(r.generation),
            consumption: Number(r.consumption),
          })),
        );
        const { data: summary, error: summaryError } = await supabase.rpc(
          "credit_summary",
          { society },
        );
        if (summaryError) throw summaryError;
        if (version !== requestVersion.current) return;
        setBalance(summary[0]);
        const { data: benefitRows, error: benefitError } = await supabase.rpc(
          "benefit_report",
          {
            society,
            start_at: new Date(range.from).toISOString(),
            end_at: new Date(range.to).toISOString(),
            grain: period.toLowerCase(),
          },
        );
        if (benefitError) throw benefitError;
        if (version !== requestVersion.current) return;
        setBenefits(
          benefitRows.map((r) => ({
            date: new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Kolkata",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(r.bucket)),
            estimated_savings_inr:
              r.estimated_savings_inr === null
                ? null
                : Number(r.estimated_savings_inr),
          })),
        );
      }
    } catch (e) {
      if (version !== requestVersion.current) return;
      setError(
        e.message === "Too many records. Narrow the date range."
          ? e.message
          : friendly(e),
      );
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }, [
    role,
    page,
    society,
    session?.user.id,
    allowed,
    range.from,
    range.to,
    period,
  ]);
  useEffect(() => {
    setData({});
    setBalance(null);
    setLeaderboard([]);
    setReport([]);
    setBenefits([]);
    setCommunityTotal(null);
    setForm(null);
    setEditing(null);
    setSearch("");
    load();
    return () => {
      requestVersion.current += 1;
    };
  }, [load]);
  useEffect(() => {
    if (!session || !supabase) return;
    const channel = supabase
      .channel("personal-notifications-" + session.user.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: "user_id=eq." + session.user.id,
        },
        () => {
          if (page === "Notifications") load();
          else setNotice("A new notification is available.");
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user.id, page, load]);
  if (authLoading)
    return (
      <section className="panel" role="status">
        Restoring secure session…
      </section>
    );
  if (!configured || !session)
    return (
      <section className="panel">
        <h1>Sign-in required</h1>
        <p>
          {configured
            ? "Sign in to load your authorized records."
            : "Configure Supabase using SETUP.md. No sample records are displayed."}
        </p>
        <a className="btn" href={"#/login/" + role}>
          Go to login
        </a>
      </section>
    );
  const publicPage = [
    "Overview",
    "Platform overview",
    "Societies",
    "Solar monitoring",
    "Society analytics",
    "Installations",
    "My consumption",
  ].includes(page);
  if (!allowed && publicPage) return <PublicDataWorkspace page={page} />;
  if (!allowed)
    return (
      <section className="panel">
        <h1>Workspace access not assigned</h1>
        <p>
          {authError ||
            "This account has no approved role for this workspace. New residents must be linked by their society administrator. Applications do not grant administrative privileges."}
        </p>
        <p>
          Your user ID: <code>{session.user.id}</code>
        </p>
        <button className="outline" onClick={refreshRoles}>
          Refresh permissions
        </button>
        <ApplicationForm />
      </section>
    );
  const list = (t) =>
    (data[t] || []).filter(
      (r) => t !== "societies" || r.record_origin !== "public_source",
    );
  const open = (t, row = null) => {
    setForm(t);
    setEditing(row);
    setError("");
    setNotice("");
  };
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      for (const field of schemas[form]) {
        if (!values[field.name] && field.optional) {
          values[field.name] = null;
          continue;
        }
        if (field.type === "number")
          values[field.name] = Number(values[field.name]);
        if (field.type === "datetime-local")
          values[field.name] = new Date(values[field.name]).toISOString();
      }
      if (
        [
          "add_member",
          "process_allocation",
          "ingest_reading",
          "manage_access",
          "resident_access",
        ].includes(form)
      ) {
        await operation(form === "resident_access" ? "manage_access" : form, {
          ...values,
          ...(form === "ingest_reading" || form === "manage_access"
            ? {}
            : { society }),
        });
      } else {
        let payload = { ...values };
        if (form === "profiles") {
          payload.community_alias ||= "";
          payload.leaderboard_opt_in = values.leaderboard_opt_in === "true";
        }
        if (form === "platform_settings")
          payload.value = JSON.parse(values.value);
        if (
          ![
            "profiles",
            "societies",
            "plans",
            "platform_settings",
            "subscriptions",
          ].includes(form)
        )
          payload.society_id = society;
        if (["tariffs", "emission_factors"].includes(form))
          payload.approved_by = session.user.id;
        let q;
        if (form === "profiles")
          q = supabase.from(form).update(payload).eq("id", session.user.id);
        else if (form === "societies")
          q = supabase.from(form).update(payload).eq("id", society);
        else if (editing)
          q = supabase
            .from(form)
            .update(payload)
            .eq(
              form === "platform_settings" ? "key" : "id",
              editing.key || editing.id,
            );
        else q = supabase.from(form).insert(payload);
        const { data: result, error } = await q.select();
        if (error) throw error;
        if (!result?.length) throw Error("No rows changed");
      }
      setNotice("Saved successfully.");
      setForm(null);
      setEditing(null);
      await load();
    } catch (e) {
      setError(
        [
          "add_member",
          "process_allocation",
          "ingest_reading",
          "manage_access",
          "resident_access",
        ].includes(form)
          ? e.message
          : friendly(e),
      );
    } finally {
      setBusy(false);
    }
  }
  const button = (table, label) => (
    <button className="btn" disabled={busy} onClick={() => open(table)}>
      {label || "Add " + (labels[table] || table)}
    </button>
  );
  function table(t, { edit = false } = {}) {
    const records = list(t).filter((r) =>
      JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
    );
    const excluded = ["updated_at", "received_by"];
    const cols = [...new Set(records.flatMap(Object.keys))].filter(
      (k) => !excluded.includes(k),
    );
    return (
      <section className="panel" key={t}>
        <div className="panel-heading">
          <h3>{labels[t] || t}</h3>
          {edit && button(t)}
        </div>
        {!records.length ? (
          <p>No matching records available.</p>
        ) : (
          <div className="data-scroll">
            <table>
              <thead>
                <tr>
                  {cols.map((k) => (
                    <th key={k}>{k.replaceAll("_", " ")}</th>
                  ))}
                  {((edit &&
                    ["plans", "subscriptions", "platform_settings"].includes(
                      t,
                    )) ||
                    t === "registration_requests" ||
                    t === "notifications") && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id || r.key}>
                    {cols.map((k) => (
                      <td key={k}>
                        {r[k] === null
                          ? "Unavailable"
                          : typeof r[k] === "object"
                            ? JSON.stringify(r[k])
                            : String(r[k])}
                      </td>
                    ))}
                    {edit &&
                      ["plans", "subscriptions", "platform_settings"].includes(
                        t,
                      ) && (
                        <td>
                          <button
                            className="outline"
                            onClick={() => open(t, r)}
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    {t === "notifications" && (
                      <td>
                        {!r.read_at && (
                          <button
                            className="outline"
                            onClick={async () => {
                              const { error } = await supabase
                                .from(t)
                                .update({ read_at: new Date().toISOString() })
                                .eq("id", r.id);
                              if (error) setError(friendly(error));
                              else load();
                            }}
                          >
                            Mark read
                          </button>
                        )}
                      </td>
                    )}
                    {t === "registration_requests" && (
                      <td>
                        {r.status === "pending" && (
                          <>
                            <button
                              className="outline"
                              onClick={() => {
                                setEditing(r);
                                setForm("review");
                              }}
                            >
                              Review evidence
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }
  const measured = list("readings"),
    deviceMap = new Map(list("devices").map((d) => [d.id, d]));
  const consumptionRows = measured.filter(
    (r) => deviceMap.get(r.device_id)?.kind === "consumption",
  );
  const consumption = consumptionRows.length
      ? consumptionRows.reduce((a, r) => a + n(r.energy_kwh), 0)
      : null,
    generation = measured
      .filter((r) => deviceMap.get(r.device_id)?.kind === "generation")
      .reduce((a, r) => a + n(r.energy_kwh), 0);
  const credits = list("credit_transactions").reduce(
    (a, r) => a + n(r.amount_kwh),
    0,
  );
  const allocations = list("allocations");
  const savings =
    allocations.length &&
    allocations.every((a) => a.estimated_savings_inr !== null)
      ? allocations.reduce((a, r) => a + n(r.estimated_savings_inr), 0)
      : null;
  const emissions =
    allocations.length &&
    allocations.every((a) => a.estimated_avoided_kg !== null)
      ? allocations.reduce((a, r) => a + n(r.estimated_avoided_kg), 0)
      : null;
  const metric = (title, value, unit) => (
    <section className="metric">
      <div className="metric-top">{title}</div>
      <h2>
        {fmt(value)} <small>{unit}</small>
      </h2>
    </section>
  );
  const chart = () => (
    <section className="panel">
      <div className="panel-heading">
        <h3>
          {page === "My savings"
            ? "Estimated savings history (INR)"
            : "Recorded interval energy (kWh)"}
        </h3>
        <div className="segmented">
          {["Day", "Week", "Month"].map((p) => (
            <button
              key={p}
              className={period === p ? "selected" : ""}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      {!(page === "My savings" ? benefits.length : measured.length) ? (
        <p>No eligible records in this range.</p>
      ) : (
        <div style={{ height: 300, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={page === "My savings" ? benefits : report}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar
                dataKey={
                  page === "My savings"
                    ? "estimated_savings_inr"
                    : "consumption"
                }
                fill="#38754d"
              />
              {role !== "resident" && page !== "My savings" && (
                <Bar dataKey="generation" fill="#edc44f" />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p>
        Operator-validated interval measurements, grouped by interval start in
        Asia/Kolkata; weeks start Monday. Intervals crossing a bucket boundary
        are attributed to the start bucket, not prorated. For exact reporting,
        ingest aligned intervals.
      </p>
    </section>
  );
  const overview = [
    "Overview",
    "My consumption",
    "Solar monitoring",
    "Society analytics",
    "My savings",
    "My solar credits",
    "Energy allocation",
  ].includes(page);
  async function checkHealth() {
    setBusy(true);
    const began = performance.now();
    const checks = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("societies").select("id", { count: "exact", head: true }),
    ]);
    setHealth({
      checked_at: new Date().toISOString(),
      authentication: checks[0].error ? "failed" : "reachable",
      database: checks[1].error ? "failed" : "reachable",
      round_trip_ms: Math.round(performance.now() - began),
      meter_ingestion: "Requires a test reading",
      allocation_processor: "Requires a complete test interval",
      realtime: "Validate notification delivery after deployment",
      backups: "Verify in Supabase dashboard; not observable by this app",
    });
    setBusy(false);
  }
  return (
    <>
      {publicPage && <PublicDataWorkspace page={page} embedded />}
      <div className="page-heading">
        <div>
          <div className="eyebrow">{role.toUpperCase()} / SUNSYNC</div>
          <h1>{page}</h1>
          <p>
            Authenticated, permission-scoped records. Calculated savings and
            emissions are estimates.
          </p>
        </div>
        <button className="outline" onClick={load} disabled={busy}>
          Refresh records
        </button>
      </div>
      {role !== "system" && (
        <label>
          Society
          <select value={society} onChange={(e) => setSociety(e.target.value)}>
            <option value="">Choose a society</option>
            {scopes.map((id) => (
              <option key={id} value={id}>
                {list("societies").find((s) => s.id === id)?.name || id}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="data-filters">
        <label>
          Search displayed records
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {overview && (
          <>
            <label>
              From (inclusive)
              <input
                type="date"
                value={range.from}
                onChange={(e) => setRange({ ...range, from: e.target.value })}
              />
            </label>
            <label>
              Until (exclusive)
              <input
                type="date"
                value={range.to}
                onChange={(e) => setRange({ ...range, to: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
      {busy && <p role="status">Loading / processing…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!busy && !error && (
        <>
          {overview && (
            <>
              <div className="metrics">
                {metric(
                  role === "resident" ? "My consumption" : "Consumption",
                  measured.length ? consumption : null,
                  "kWh",
                )}
                {metric(
                  role === "resident"
                    ? "Credits received in range"
                    : "Solar generated",
                  role === "resident"
                    ? list("credit_transactions").length
                      ? credits
                      : null
                    : measured.length
                      ? generation
                      : null,
                  "kWh",
                )}
                {metric("Estimated savings", savings, "INR")}
                {metric("Estimated avoided emissions", emissions, "kg CO₂e")}
              </div>
              {role === "society" &&
                ["Overview", "Solar monitoring"].includes(page) &&
                button("ingest_reading", "Submit / correct validated reading")}
              {page === "My solar credits" && balance && (
                <section className="panel">
                  <h3>All-time credited energy</h3>
                  <p>
                    {fmt(balance.total_kwh)} kWh. This is an attribution total,
                    not a redeemable cash balance.
                  </p>
                </section>
              )}
              {page === "Energy allocation" && role === "society" && (
                <section className="panel">
                  <h3>Proportional demand allocation</h3>
                  <p>
                    Allocate the lesser of generation and active resident
                    demand. Every active meter must have a validated reading for
                    the exact same completed interval. Credits are
                    non-redeemable energy attribution, not a cash wallet.
                    Fractions round down to six decimal places. Allocations are
                    immutable and retry-safe.
                  </p>
                  {button("process_allocation", "Allocate aligned interval")}
                  {table("allocation_rules")}
                </section>
              )}
              {!["My solar credits", "Energy allocation"].includes(page) &&
                chart()}
              {["My solar credits", "My savings", "Energy allocation"].includes(
                page,
              ) && (
                <>
                  {table("allocations")}
                  {table("credit_transactions")}
                  {role === "society" && table("allocation_batches")}
                </>
              )}
              <section className="panel">
                <h3>Calculation provenance</h3>
                <p>
                  Estimated savings = allocated kWh × approved INR/kWh tariff.
                  Estimated avoided emissions = allocated kWh × sourced kg
                  CO₂e/kWh factor. Missing factors produce unavailable
                  estimates, never invented defaults. Each allocation batch
                  retains the immutable factor and tariff IDs used. Credits and
                  estimates are filtered by processing time; meter energy is
                  filtered by measurement interval start. Displayed credits are
                  period receipts, not an all-time or spendable balance.
                </p>
              </section>
              {page === "Solar monitoring" && role === "society" && (
                <MeterCsvImport
                  key={society}
                  society={society}
                  onImported={load}
                />
              )}
              {page === "Solar monitoring" && table("readings")}
            </>
          )}
          {page === "Residents & buildings" && (
            <>
              {button("add_member", "Link registered resident")}
              <p>
                Ask the resident to create and verify their account first and
                share their user ID. Linking grants resident access only; it
                never grants administrator authority.
              </p>
              {button("resident_access", "Activate / deactivate resident")}
              {table("memberships")}
              {table("buildings", { edit: true })}
            </>
          )}
          {page === "Installations" && (
            <>
              {table("installations", { edit: true })}
              {table("devices", { edit: true })}
            </>
          )}
          {page === "Community" && (
            <>
              {table("community_challenges")}
              <section className="panel">
                <h3>Opt-in community leaderboard</h3>
                <p>
                  Only residents who explicitly enabled sharing in Profile &
                  settings appear. Credited kWh is a lifetime attribution total,
                  not a measurement of personal environmental performance.
                </p>
                {leaderboard.length ? (
                  <ol>
                    {leaderboard.map((r, i) => (
                      <li key={i}>
                        {r.alias}: {fmt(r.credited_kwh)} kWh
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No opted-in participants yet.</p>
                )}
                <p>
                  Community lifetime allocated energy: {fmt(communityTotal)}{" "}
                  kWh. Published challenge targets use this lifetime total; the
                  deadline is informational.
                </p>
              </section>
              <section className="panel">
                <h3>My achievements</h3>
                <p>
                  {n(balance?.total_kwh) > 0
                    ? "First verified solar credit received."
                    : "No verified credit achievement yet."}{" "}
                  {n(balance?.total_kwh) >= 100
                    ? "100 kWh credited milestone reached."
                    : ""}
                </p>
                <p>
                  Milestones are derived from saved allocation records, not
                  clicks.
                </p>
              </section>
              <section className="panel">
                <h3>My participation</h3>
                <p>
                  {list("credit_transactions").length
                    ? `${fmt(credits)} kWh in your available credit history.`
                    : "No verified participation records yet."}{" "}
                  No public rankings expose household energy. Challenges are
                  informational goals; no unimplemented badge claims are
                  displayed.
                </p>
              </section>
            </>
          )}
          {page === "Notifications" && table("notifications")}
          {page === "Profile & settings" && (
            <section className="panel">
              <h3>Your profile</h3>
              <p>
                {list("profiles").find((p) => p.id === session.user.id)
                  ?.full_name || "Name not set"}
              </p>
              <p>{session.user.email}</p>
              {button("profiles", "Edit your name")}
              <a className="outline" href={"#/login/" + role}>
                Password recovery / account
              </a>
            </section>
          )}
          {page === "Society settings" && (
            <>
              {button("societies", "Edit society identity")}
              {table("tariffs", { edit: true })}
              {table("emission_factors", { edit: true })}
              {table("allocation_rules")}
              {table("community_challenges", { edit: true })}
            </>
          )}
          {page === "Platform overview" && (
            <>
              <div className="metrics">
                {metric(
                  "Operational societies (not public listings)",
                  list("societies").filter(
                    (s) => s.record_origin !== "public_source",
                  ).length,
                  "",
                )}
                {metric(
                  "Pending approvals",
                  list("registration_requests").filter(
                    (x) => x.status === "pending",
                  ).length,
                  "",
                )}
                {metric(
                  "Active subscriptions",
                  list("subscriptions").filter((x) => x.status === "active")
                    .length,
                  "",
                )}
              </div>
              {table("registration_requests")}
              {table("societies")}
            </>
          )}
          {page === "Societies" && (
            <>
              {button(
                "manage_access",
                "Manage society status / administrator access",
              )}
              {table("societies")}
              {table("subscriptions", { edit: true })}
              <p>
                New societies are created through reviewed approval requests.
                Subscription records are manual entitlements, not a payment
                processor.
              </p>
            </>
          )}
          {page === "Approvals" && table("registration_requests")}
          {page === "Plans & limits" && (
            <>
              {table("plans", { edit: true })}
              {table("subscriptions", { edit: true })}
              <p>
                Resident caps are enforced transactionally when linking a
                resident. No billing or payment capture is claimed.
              </p>
            </>
          )}
          {page === "Audit & security" && (
            <>
              {table("audit_logs")}
              <p>
                Audit rows are append-only to application users. Database owners
                can administer them; export to separate immutable storage for
                regulatory retention.
              </p>
            </>
          )}
          {page === "Platform settings" &&
            table("platform_settings", { edit: true })}
          {page === "Platform health" && (
            <section className="panel">
              <h3>On-demand service checks</h3>
              <button className="btn" onClick={checkHealth}>
                Run reachability checks
              </button>
              {health && (
                <dl>
                  {Object.entries(health).map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt>{k.replaceAll("_", " ")}</dt>
                      <dd>{v}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              )}
              <p>
                No claimed uptime. Configure infrastructure alerts and scheduled
                ingestion checks separately.
              </p>
            </section>
          )}
        </>
      )}
      {form && (
        <div className="modal-backdrop">
          <section
            className="panel modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-title"
          >
            <button
              className="modal-close outline"
              onClick={() => {
                setForm(null);
                setEditing(null);
              }}
            >
              Close
            </button>
            <h2 id="edit-title">
              {form === "review"
                ? "Review society evidence"
                : labels[form] || form.replaceAll("_", " ")}
            </h2>
            {form === "review" ? (
              <>
                <p>Application: {editing.society_name}</p>
                <p>Address: {editing.address}</p>
                <p>Evidence: {editing.evidence}</p>
                <p>
                  Independently verify society ownership and requester authority
                  before approval. An application alone proves neither.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      const f = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      await operation("review_registration", {
                        request_id: editing.id,
                        approve: f.decision === "approve",
                        note: f.note,
                      });
                      setForm(null);
                      setNotice("Review saved.");
                      await load();
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Decision
                    <select name="decision">
                      <option value="reject">Reject</option>
                      <option value="approve">
                        Approve after independent verification
                      </option>
                    </select>
                  </label>
                  <label>
                    Verification references and review reason
                    <textarea name="note" required minLength={10} />
                  </label>
                  <button className="btn" disabled={busy}>
                    Record decision
                  </button>
                </form>
              </>
            ) : (
              <form onSubmit={save}>
                {(schemas[form] || []).map((field) => (
                  <label key={field.name}>
                    {field.label}
                    {field.type === "select" ? (
                      <select
                        name={field.name}
                        required={!field.optional}
                        defaultValue={String(
                          editing?.[field.name] ??
                            (form === "profiles"
                              ? (list("profiles").find(
                                  (p) => p.id === session.user.id,
                                )?.[field.name] ?? "")
                              : ""),
                        )}
                      >
                        <option value="">Choose…</option>
                        {field.options?.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                        {field.table &&
                          list(field.table).map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name || r.serial || r.unit || r.id}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <input
                        name={field.name}
                        type={field.type}
                        required={!field.optional}
                        min={field.min}
                        step={field.step}
                        maxLength={field.type === "text" ? 2000 : undefined}
                        defaultValue={
                          editing
                            ? field.name === "value"
                              ? JSON.stringify(editing.value)
                              : field.type === "datetime-local" &&
                                  editing[field.name]
                                ? new Date(
                                    new Date(editing[field.name]).getTime() -
                                      new Date().getTimezoneOffset() * 60000,
                                  )
                                    .toISOString()
                                    .slice(0, 16)
                                : editing[field.name] || ""
                            : form === "profiles"
                              ? list("profiles").find(
                                  (p) => p.id === session.user.id,
                                )?.[field.name] || ""
                              : form === "societies"
                                ? list("societies")[0]?.[field.name] || ""
                                : ""
                        }
                      />
                    )}
                  </label>
                ))}
                <button className="btn" disabled={busy}>
                  {busy ? "Processing…" : "Save securely"}
                </button>
              </form>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
