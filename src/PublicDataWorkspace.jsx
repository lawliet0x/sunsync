import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { supabase, useBackend, configured } from "./backend.jsx";
import {
  sourceDate,
  sourceEnergy,
  sourceTimezone,
  sourceUrl,
} from "./public-data.js";

const fmt = (value) =>
  value == null
    ? "Unavailable"
    : Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
const kind = (row) =>
  (row.entity_kind || row.source_metadata?.entity_kind) === "energy_site"
    ? "Energy site"
    : "Housing society";
function Provenance({ metadata = {} }) {
  const url = sourceUrl(metadata.source_url);
  return (
    <div className="source-provenance">
      <p>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {metadata.source_name || "Original public source"}
          </a>
        ) : (
          "Source link unavailable"
        )}
        {metadata.accessed_on && ` · Accessed ${metadata.accessed_on}`}
      </p>
      {metadata.notes && <p>{metadata.notes}</p>}
    </div>
  );
}
async function readIntervals(societyId) {
  const records = [];
  for (let offset = 0; offset <= 1000; offset += 500) {
    const { data, error } = await supabase
      .from("readings")
      .select("*")
      .eq("society_id", societyId)
      .eq("verification", "public_dataset")
      .order("interval_start", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + 499);
    if (error) throw error;
    records.push(...(data || []));
    if (records.length > 1000)
      throw new Error(
        "This source exceeds the 1,000-interval display limit. A narrower import is required; no partial total is displayed.",
      );
    if (data.length < 500) return records;
  }
  return records;
}
export default function PublicDataWorkspace({
  page = "Overview",
  embedded = false,
}) {
  const { session, loading: authLoading } = useBackend();
  const [societies, setSocieties] = useState([]);
  const [selected, setSelected] = useState("");
  const [details, setDetails] = useState({
    readings: [],
    devices: [],
    installations: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [range, setRange] = useState({ from: "", to: "" });
  useEffect(() => {
    let current = true;
    if (!session || !supabase) return;
    setLoading(true);
    setError("");
    setSocieties([]);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("societies")
          .select("*")
          .eq("record_origin", "public_source")
          .order("name");
        if (error) throw error;
        if (!current) return;
        setSocieties(data || []);
        setSelected((old) =>
          data?.some((s) => s.id === old)
            ? old
            : data?.find((s) => kind(s) === "Energy site")?.id ||
              data?.[0]?.id ||
              "",
        );
      } catch {
        if (current)
          setError(
            "Public-source records could not be loaded. Check your connection and try again.",
          );
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [session?.user.id, attempt]);
  const source = societies.find((s) => s.id === selected);
  const metadata = source?.source_metadata || {};
  const timezone = sourceTimezone({
    timezone: metadata.timezone || source?.timezone,
  });
  useEffect(() => {
    let current = true;
    setDetails({ readings: [], devices: [], installations: [] });
    setDetailError("");
    if (!source || !session || !supabase) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    setRange({
      from: sourceDate(source.source_metadata?.period_start, timezone),
      to: sourceDate(source.source_metadata?.period_end, timezone),
    });
    (async () => {
      try {
        const [readings, devices, installations] = await Promise.all([
          readIntervals(source.id),
          supabase.from("devices").select("*").eq("society_id", source.id),
          supabase
            .from("installations")
            .select("*")
            .eq("society_id", source.id),
        ]);
        if (devices.error || installations.error)
          throw devices.error || installations.error;
        if (current)
          setDetails({
            readings,
            devices: devices.data || [],
            installations: installations.data || [],
          });
      } catch (e) {
        if (current)
          setDetailError(
            e.message?.includes("1,000-interval")
              ? e.message
              : "Energy records could not be loaded. Retry to refresh the source.",
          );
      } finally {
        if (current) setDetailLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [source, timezone, session?.user.id, attempt]);
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
            ? "Sign in to read sourced society and energy records."
            : "Supabase is not configured. No example records are substituted."}
        </p>
        <a href="#/login" className="btn">
          Go to login
        </a>
      </section>
    );
  const invalidRange = range.from && range.to && range.from > range.to;
  const filtered = details.readings.filter((r) => {
    const day = sourceDate(r.interval_start, timezone);
    return (!range.from || day >= range.from) && (!range.to || day <= range.to);
  });
  const energy = sourceEnergy(filtered, details.devices);
  const monthly = metadata.granularity === "month";
  const monthLabel = (value) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      month: "long",
      year: "numeric",
    }).format(new Date(value));
  const intervalLabel = (value) =>
    monthly ? sourceDate(value, timezone) : stamp(value);
  const stamp = (value) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(value));
  const chart = energy.generation.map((r) => ({
    interval: r.interval_start,
    generation: Number(r.energy_kwh),
  }));
  const showRecords = ["Societies", "Platform overview", "Overview"].includes(
    page,
  );
  return (
    <section
      className="public-data-workspace"
      aria-label="Public-source workspace"
    >
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            REAL PUBLIC-SOURCE RECORDS · READ ONLY
          </span>
          {embedded ? (
            <h2>Public-source society & energy records</h2>
          ) : (
            <h1>{page}</h1>
          )}
          <p>
            Published housing society listings and an independent energy
            dataset, not onboarded SunSync customers. No resident accounts or
            financial results are inferred.
          </p>
        </div>
        <button
          className="outline"
          onClick={() => setAttempt((n) => n + 1)}
          disabled={loading || detailLoading}
        >
          Refresh public data
        </button>
      </div>
      {loading && <p role="status">Loading sourced records…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && !societies.length && (
        <section className="panel">
          <p>
            No public-source records are available. No sample data is displayed.
          </p>
        </section>
      )}
      {!loading && !error && societies.length > 0 && (
        <>
          {showRecords && (
            <section className="panel">
              <h2>Societies &amp; energy sites</h2>
              <p>
                {societies.filter((s) => kind(s) === "Housing society").length}{" "}
                publicly listed housing societies;{" "}
                {societies.filter((s) => kind(s) === "Energy site").length}{" "}
                independent energy sites. These are source records, not a
                registered-customer count.
              </p>
              <div className="data-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Name / location</th>
                      <th>Record type</th>
                      <th>Status &amp; source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {societies.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <button
                            className="plain"
                            onClick={() => setSelected(s.id)}
                          >
                            {s.name}
                          </button>
                          <p>{s.address || "Address unavailable"}</p>
                          {s.source_metadata?.locality}
                        </td>
                        <td>{kind(s)}</td>
                        <td>
                          Public source · Unverified / not onboarded
                          <Provenance metadata={s.source_metadata} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <section className="panel">
            <label>
              Source society / energy site
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {societies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {kind(s)}
                  </option>
                ))}
              </select>
            </label>
            {source && (
              <>
                <h2>{source.name}</h2>
                <p>
                  {kind(source)} · Public source · Unverified / not onboarded
                </p>
                <Provenance metadata={metadata} />
                <p>
                  <strong>
                    Historical public data, not a live meter feed.
                  </strong>{" "}
                  {metadata.period_start
                    ? `Published coverage: ${metadata.period_start} to ${metadata.period_end || "unknown end"}.`
                    : "No energy coverage is declared for this listing."}{" "}
                  {metadata.granularity === "month" &&
                    "Measured monthly generation totals (kWh), preserved as published; no daily or hourly estimates. "}
                  Source timezone: {timezone}
                  {!metadata.timezone &&
                    !source?.timezone &&
                    " (not supplied; UTC used)"}
                  .
                </p>
                {kind(source) === "Housing society" && (
                  <p>
                    This society listing does not establish a solar installation
                    or energy usage. The independent energy-site dataset is not
                    this society’s data.
                  </p>
                )}
              </>
            )}
          </section>
          {detailLoading && <p role="status">Loading source intervals…</p>}
          {detailError && (
            <p className="form-error" role="alert">
              {detailError}
            </p>
          )}
          {!detailLoading && !detailError && source && (
            <>
              <div className="data-filters">
                <label>
                  From (source-local date)
                  <input
                    type="date"
                    value={range.from}
                    onChange={(e) =>
                      setRange({ ...range, from: e.target.value })
                    }
                  />
                </label>
                <label>
                  Through (inclusive source-local date)
                  <input
                    type="date"
                    value={range.to}
                    onChange={(e) => setRange({ ...range, to: e.target.value })}
                  />
                </label>
                <button
                  className="outline"
                  onClick={() =>
                    setRange({
                      from: sourceDate(metadata.period_start, timezone),
                      to: sourceDate(metadata.period_end, timezone),
                    })
                  }
                >
                  Source coverage
                </button>
              </div>
              {invalidRange ? (
                <p role="alert">
                  Choose an end date on or after the start date.
                </p>
              ) : (
                <>
                  <div className="metrics">
                    <section className="metric">
                      <div className="metric-top">
                        {monthly
                          ? "Measured generation — selected monthly intervals"
                          : "Published generation in range"}
                      </div>
                      <h2>
                        {fmt(energy.generated)} <small>kWh</small>
                      </h2>
                    </section>
                    <section className="metric">
                      <div className="metric-top">Consumption</div>
                      <h2>
                        {fmt(energy.consumed)}{" "}
                        <small>
                          {energy.consumed == null ? "Not supplied" : "kWh"}
                        </small>
                      </h2>
                    </section>
                  </div>
                  <section className="panel">
                    <h3>
                      {monthly
                        ? "Measured monthly generation (kWh)"
                        : "Published generation intervals (kWh)"}
                    </h3>
                    {chart.length ? (
                      <div style={{ height: 320, minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chart}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="interval"
                              tickFormatter={monthly ? monthLabel : stamp}
                              minTickGap={60}
                            />
                            <YAxis />
                            <Tooltip
                              labelFormatter={monthly ? monthLabel : stamp}
                            />
                            <Bar
                              dataKey="generation"
                              name="Generation (kWh)"
                              fill="#38754d"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p>
                        No published generation intervals are available in this
                        range. Missing data is not zero generation.
                      </p>
                    )}
                    <p>
                      {monthly &&
                        "Each bar is one original monthly total, not a daily curve or instantaneous power reading. Date filters select whole months by interval start; totals are not split or prorated. "}
                      Intervals use {timezone}. Public dataset provenance is not
                      SunSync meter verification. No consumption curve is
                      fabricated. Credits, savings, tariffs and emissions are
                      unavailable for these source records.
                    </p>
                  </section>
                  <section className="panel">
                    <h3>Source installations &amp; dataset identifiers</h3>
                    {details.installations.length ? (
                      details.installations.map((i) => (
                        <article key={i.id}>
                          <h4>{i.name}</h4>
                          <p>
                            Capacity: {fmt(i.capacity_kwp)}{" "}
                            {i.capacity_kwp == null ? "" : "kWp"} ·
                            Commissioned: {i.commissioned_on || "Unavailable"}
                          </p>
                          {i.source_metadata?.reported_capacity_kw != null && (
                            <p>
                              Source-reported capacity:{" "}
                              {fmt(i.source_metadata.reported_capacity_kw)} kW
                              (not a kWp rating).
                            </p>
                          )}
                          <Provenance metadata={i.source_metadata} />
                        </article>
                      ))
                    ) : (
                      <p>No installation is established by this source.</p>
                    )}
                    {details.devices.map((d) => (
                      <p key={d.id}>
                        Dataset identifier: <code>{d.serial}</code> · {d.kind} ·
                        Not a physical meter serial; not an active SunSync
                        device.
                      </p>
                    ))}
                  </section>
                  {filtered.length > 0 && (
                    <section className="panel">
                      <h3>Published interval records ({filtered.length})</h3>
                      <div className="data-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Start ({timezone})</th>
                              <th>End — exclusive ({timezone})</th>
                              <th>Energy (kWh)</th>
                              <th>Source</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((r) => (
                              <tr key={r.id}>
                                <td>{intervalLabel(r.interval_start)}</td>
                                <td>{intervalLabel(r.interval_end)}</td>
                                <td>{fmt(r.energy_kwh)}</td>
                                <td>
                                  Public dataset
                                  <Provenance metadata={r.source_metadata} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
