import React, { useState } from 'react';
import { operation } from './backend.jsx';
import { CSV_COLUMNS, CSV_HEADER, parseMeterCsv } from './meter-csv.js';
export default function MeterCsvImport({ society, onImported }) {
  const [records, setRecords] = useState([]), [error, setError] = useState(''), [result, setResult] = useState(''), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false);
  function template() {
    const url = URL.createObjectURL(new Blob([CSV_HEADER], {type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = 'sunsync-meter-import-template.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function preview(event) {
    setRecords([]); setError(''); setResult(''); setConfirmed(false);
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 65536) throw new Error('CSV must be at most 64 KiB.');
      setRecords(parseMeterCsv(await file.text()));
    } catch(e) { setError(e.message); }
    event.target.value = '';
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setResult('');
    try {
      const data = await operation('import_meter_readings', {society, records});
      setResult(data.accepted + ' readings accepted (including unchanged retries). No allocation was run.');
      setRecords([]); setConfirmed(false);
      await onImported();
    } catch(e) { setError(e.message + ' Import is atomic: a rejected request saves no rows. If the connection failed after submission, retry the same file to reconcile the outcome.'); }
    finally { setBusy(false); }
  }
  return <section className="panel">
    <h3>Import actual meter readings</h3>
    <p>Upload 1-20 readings per file. Use registered active meter serials, completed interval kWh (not cumulative totals), timezone-qualified ISO timestamps, a traceable source and stable source record IDs. All rows save together or none do. No automatic allocation or device-signature verification is performed.</p>
    <button type="button" className="outline" onClick={template}>Download empty CSV template</button>
    <label>Meter export CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={preview}/></label>
    {error && <p role="alert" className="form-error">{error}</p>}
    {result && <p role="status">{result}</p>}
    {records.length > 0 && <form onSubmit={submit}>
      <p>{records.length} readings ready for server validation. Row numbers below exclude the header.</p>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>Row</th>{CSV_COLUMNS.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{records.map((record,i) => <tr key={i}><td>{i+1}</td>{CSV_COLUMNS.map(c => <td key={c}>{record[c]}</td>)}</tr>)}</tbody></table></div>
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required/>I reviewed these readings against the actual source export and selected society.</label>
      <button className="btn" disabled={busy || !confirmed || !society}>{busy ? 'Importing…' : 'Import reviewed readings'}</button>
      <button type="button" className="plain" disabled={busy} onClick={() => setRecords([])}>Cancel preview</button>
    </form>}
  </section>;
}
