// Builds src/data/airports.json from OurAirports (coverage, airport size) and
// mwgg/Airports (IANA time zones). Run with `npm run airports`.
import { writeFileSync } from 'node:fs';

const OURAIRPORTS = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const MWGG = 'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json';

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const [csv, mwgg] = await Promise.all([
  fetch(OURAIRPORTS).then((r) => r.text()),
  fetch(MWGG).then((r) => r.json()),
]);

const tzByIata = {};
for (const a of Object.values(mwgg)) if (a.iata && a.tz) tzByIata[a.iata] = a.tz;

const [header, ...rows] = parseCsv(csv);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const SIZE = { large_airport: 3, medium_airport: 2, small_airport: 1 };

const out = {};
for (const r of rows) {
  const iata = r[col.iata_code];
  const size = SIZE[r[col.type]];
  if (!/^[A-Z]{3}$/.test(iata) || !size) continue;
  if (r[col.scheduled_service] !== 'yes' && size < 2) continue;
  const prev = out[iata];
  if (prev && prev[6] >= size) continue;
  out[iata] = [
    r[col.name],
    r[col.municipality],
    r[col.iso_country],
    Math.round(Number(r[col.latitude_deg]) * 1e4) / 1e4,
    Math.round(Number(r[col.longitude_deg]) * 1e4) / 1e4,
    tzByIata[iata] ?? '',
    size,
  ];
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(new URL('../src/data/airports.json', import.meta.url), JSON.stringify(sorted));
console.log(`Wrote ${Object.keys(sorted).length} airports`);
