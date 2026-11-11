import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_HEADER, parseMeterCsv } from '../src/meter-csv.js';
const now = Date.parse('2026-11-10T12:00:00Z');
const line = 'GEN-1,2026-11-09T10:00:00Z,2026-11-09T11:00:00Z,2.123456,Meter portal export,record-1';
test('CSV supports BOM, CRLF, quoted commas and escaped quotes', () => {
 const a = parseMeterCsv('\uFEFF'+CSV_HEADER+line.replace('Meter portal export','"Meter, portal ""export"""')+'\r\n',now);
 assert.equal(a.length,1); assert.equal(a[0].source,'Meter, portal "export"'); assert.equal(a[0].kwh,'2.123456');
});
test('CSV rejects malformed quotes, columns, blank data and unsafe numeric fields', () => {
 for (const text of [CSV_HEADER, CSV_HEADER+'"unterminated',CSV_HEADER+line+',extra',CSV_HEADER+line.replace('2.123456','-2'),CSV_HEADER+line.replace('2.123456','=1+2'),CSV_HEADER+line.replace('2.123456','NaN'),CSV_HEADER+line.replace('2.123456','1.1234567'),CSV_HEADER+line.replace('Meter portal export','"x"oops')]) assert.throws(() => parseMeterCsv(text,now));
});
test('CSV requires timezone-qualified completed non-overlapping intervals and stable IDs', () => {
 for (const text of [CSV_HEADER+line.replaceAll('00Z','00'),CSV_HEADER+line.replace('2026-11-09T11','2027-11-09T11'),CSV_HEADER+line+'\n'+line,CSV_HEADER+line+'\n'+line.replace('record-1','record-2')]) assert.throws(() => parseMeterCsv(text,now));
});
test('CSV enforces file and row limits', () => {
 assert.throws(() => parseMeterCsv('x'.repeat(65537),now));
 assert.throws(() => parseMeterCsv(CSV_HEADER+Array.from({length:21},(_,i)=>line.replace('GEN-1','GEN-'+i)).join('\n'),now));
});
