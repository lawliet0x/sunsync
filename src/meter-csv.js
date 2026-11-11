export const CSV_COLUMNS = ['device_serial','start_at','end_at','kwh','source','external_id'];
export const CSV_HEADER = CSV_COLUMNS.join(',') + '\r\n';
// Bounded RFC 4180-style reader: quoted commas/newlines and escaped quotes.
export function parseMeterCsv(text, now = Date.now()) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > 65536) throw new Error('CSV must be at most 64 KiB.');
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  function endField() { row.push(field); field = ''; closed = false; }
  function endRow() { endField(); if (row.some(x => x.trim())) rows.push(row); row = []; if (rows.length > 21) throw new Error('Import at most 20 readings per file.'); }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\0') throw new Error('CSV contains a null character.');
    if (quoted) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === ',') endField();
    else if (c === '\r' || c === '\n') { if (c === '\r' && text[i+1] === '\n') i++; endRow(); }
    else if (c === '"') { if (field || closed) throw new Error('Invalid CSV quoting.'); quoted = true; }
    else { if (closed) throw new Error('Unexpected text after a quoted CSV field.'); field += c; }
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (field || row.length || closed) endRow();
  const header = rows.shift()?.map(x => x.trim());
  if (!header || header.join(',') !== CSV_COLUMNS.join(',')) throw new Error('Use the exact six-column template header.');
  if (!rows.length) throw new Error('CSV has no readings. Add actual meter export rows.');
  const seen = new Set(), intervals = new Map();
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
  const records = rows.map((cells, i) => {
    const fail = message => { throw new Error('CSV row ' + (i + 1) + ': ' + message); };
    if (cells.length !== 6) fail('expected six fields.');
    const record = Object.fromEntries(CSV_COLUMNS.map((key, j) => [key, cells[j].trim()]));
    const {device_serial, start_at, end_at, kwh, source, external_id} = record;
    if (!device_serial || device_serial.length > 160 || source.length < 10 || source.length > 2000 || !external_id || external_id.length > 200) fail('invalid serial, source (10-2000 characters), or source ID.');
    if (!/^\d{1,7}(\.\d{1,6})?$/.test(kwh) || Number(kwh) > 1000000) fail('kWh must be 0-1000000 with up to six decimals, not a cumulative counter.');
    const start = Date.parse(start_at), end = Date.parse(end_at);
    if (!timestamp.test(start_at) || !timestamp.test(end_at) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > now || end - start > 86400000) fail('use completed ISO intervals, at most one day, with Z or an explicit timezone offset.');
    const identity = JSON.stringify([device_serial,external_id]);
    if (seen.has(identity)) fail('duplicate meter source ID in this file.');
    seen.add(identity);
    const prior = intervals.get(device_serial) || [];
    if (prior.some(([s,e]) => start < e && end > s)) fail('overlapping meter intervals in this file.');
    prior.push([start,end]); intervals.set(device_serial,prior);
    return record;
  });
  if (new TextEncoder().encode(JSON.stringify(records)).length > 12000) throw new Error('Import payload is too large. Shorten source descriptions or split the file.');
  return records;
}
