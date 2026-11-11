import React, { useEffect, useState } from "react";
import { supabase, useBackend } from "./backend.jsx";

export default function PublicReference() {
  const { session } = useBackend();
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState("Loading public references…");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!session || !supabase) return;
    setStatus("Loading public references…");
    setRecords([]);
    supabase
      .from("public_reference_records")
      .select("*")
      .order("key")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error)
          setStatus(
            "Public references could not be loaded. Check the connection and apply the public-reference migration before deploying this screen.",
          );
        else {
          setRecords(data || []);
          setStatus(
            data?.length ? "" : "No public reference records are available.",
          );
        }
      })
      .catch(() => {
        if (!cancelled)
          setStatus("Public references could not be loaded. Please retry.");
      });
    return () => {
      cancelled = true;
    };
  }, [session, attempt]);
  if (!session)
    return <p role="status">Sign in to view the reference database.</p>;
  return (
    <section className="panel">
      <span className="eyebrow">SOURCED PUBLIC REFERENCE</span>
      <h2>Mira Bhayandar</h2>
      <p>
        Municipal facts and historical locality names, separate from SunSync
        operational records. No personal resident data, meter measurements,
        tariffs or savings are supplied by this directory.
      </p>
      <p>
        The population is from the 2011 Census, not a current estimate.
        Historical locality names are not current ward boundaries or registered
        societies.
      </p>
      {status && <p role="status">{status}</p>}
      <button className="outline" onClick={() => setAttempt((n) => n + 1)}>
        Reload references
      </button>
      {records.length > 0 && (
        <div className="reference-grid">
          {records.map((r) => (
            <article className="reference-card" key={r.key}>
              <h3>{r.label}</h3>
              <p>
                <strong>{r.value_text}</strong>
              </p>
              <p>{r.scope_note}</p>
              <small>
                Reference period: {r.reference_period}
                <br />
                Source accessed: {r.accessed_on}
              </small>
              <p>
                <a
                  href={r.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  MBMC source
                </a>
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
