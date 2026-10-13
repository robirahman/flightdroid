/** IATA airline codes for carriers common enough to show up in confirmation emails. */
export const AIRLINES: Record<string, string> = {
  '2D': 'Dynamic Airways', '3K': 'Jetstar Asia', '3U': 'Sichuan Airlines', '4U': 'Germanwings', '5J': 'Cebu Pacific',
  '6E': 'IndiGo', '7C': 'Jeju Air', '8M': 'Myanmar Airways', '9W': 'Jet Airways', A3: 'Aegean Airlines',
  AA: 'American Airlines', AC: 'Air Canada', AD: 'Azul', AF: 'Air France', AI: 'Air India', AK: 'AirAsia',
  AM: 'Aeroméxico', AR: 'Aerolíneas Argentinas', AS: 'Alaska Airlines', AT: 'Royal Air Maroc', AV: 'Avianca',
  AY: 'Finnair', AZ: 'ITA Airways', B6: 'JetBlue', BA: 'British Airways', BR: 'EVA Air', BT: 'airBaltic',
  BW: 'Caribbean Airlines', CA: 'Air China', CI: 'China Airlines', CM: 'Copa Airlines', CX: 'Cathay Pacific',
  CZ: 'China Southern', DE: 'Condor', DL: 'Delta Air Lines', DY: 'Norwegian', EI: 'Aer Lingus', EK: 'Emirates',
  ET: 'Ethiopian Airlines', EW: 'Eurowings', EY: 'Etihad Airways', F9: 'Frontier Airlines', FI: 'Icelandair',
  FJ: 'Fiji Airways', FR: 'Ryanair', FZ: 'flydubai', G3: 'GOL', G4: 'Allegiant Air', GA: 'Garuda Indonesia',
  GF: 'Gulf Air', HA: 'Hawaiian Airlines', HU: 'Hainan Airlines', HX: 'Hong Kong Airlines', IB: 'Iberia',
  JL: 'Japan Airlines', JQ: 'Jetstar', JU: 'Air Serbia', KE: 'Korean Air', KL: 'KLM', KQ: 'Kenya Airways',
  KU: 'Kuwait Airways', LA: 'LATAM', LH: 'Lufthansa', LO: 'LOT Polish Airlines', LX: 'SWISS', LY: 'El Al',
  MH: 'Malaysia Airlines', MS: 'EgyptAir', MU: 'China Eastern', MX: 'Breeze Airways', NH: 'ANA',
  NK: 'Spirit Airlines', NZ: 'Air New Zealand', OS: 'Austrian Airlines', OU: 'Croatia Airlines',
  OZ: 'Asiana Airlines', PC: 'Pegasus', PD: 'Porter Airlines', PR: 'Philippine Airlines', QF: 'Qantas',
  QR: 'Qatar Airways', RJ: 'Royal Jordanian', SA: 'South African Airways', SK: 'SAS', SN: 'Brussels Airlines',
  SQ: 'Singapore Airlines', SV: 'Saudia', SY: 'Sun Country', TG: 'Thai Airways', TK: 'Turkish Airlines',
  TP: 'TAP Air Portugal', TR: 'Scoot', U2: 'easyJet', UA: 'United Airlines', UL: 'SriLankan Airlines',
  UX: 'Air Europa', VA: 'Virgin Australia', VN: 'Vietnam Airlines', VS: 'Virgin Atlantic', VY: 'Vueling',
  W6: 'Wizz Air', WN: 'Southwest Airlines', WS: 'WestJet', XQ: 'SunExpress', Y4: 'Volaris', ZH: 'Shenzhen Airlines',
  '9K': 'Cape Air', OO: 'SkyWest', YX: 'Republic Airways', MQ: 'Envoy Air', '9E': 'Endeavor Air', QX: 'Horizon Air',
  ZW: 'Air Wisconsin', OH: 'PSA Airlines', G7: 'GoJet', C5: 'CommutAir', YV: 'Mesa Airlines', PT: 'Piedmont Airlines',
  WY: 'Oman Air', PK: 'Pakistan International', BG: 'Biman Bangladesh', UK: 'Vistara', SG: 'SpiceJet',
  VJ: 'VietJet Air', FD: 'Thai AirAsia', D7: 'AirAsia X', MM: 'Peach', BX: 'Air Busan', LJ: 'Jin Air',
  HO: 'Juneyao Air', FM: 'Shanghai Airlines', '3F': 'Fly One', H2: 'Sky Airline', JA: 'JetSMART', '4O': 'Interjet',
  VB: 'Viva Aerobus', P5: 'Wingo', '2K': 'Avianca Ecuador', XL: 'LATAM Ecuador', TS: 'Air Transat', F8: 'Flair Airlines',
  WG: 'Sunwing', LS: 'Jet2', BY: 'TUI Airways', HV: 'Transavia', TO: 'Transavia France', V7: 'Volotea', EN: 'Air Dolomiti',
  WF: 'Widerøe', RO: 'TAROM', FB: 'Bulgaria Air', OK: 'Czech Airlines', PS: 'Ukraine International', A9: 'Georgian Airways',
  J2: 'Azerbaijan Airlines', KC: 'Air Astana', HY: 'Uzbekistan Airways', SU: 'Aeroflot', S7: 'S7 Airlines',
  ME: 'Middle East Airlines', J9: 'Jazeera Airways', G9: 'Air Arabia', XY: 'flynas', WB: 'RwandAir', TC: 'Air Tanzania',
  KP: 'ASKY Airlines', W3: 'Arik Air', HM: 'Air Seychelles', MK: 'Air Mauritius', UU: 'Air Austral', TN: 'Air Tahiti Nui',
  NF: 'Air Vanuatu', PX: 'Air Niugini', NX: 'Air Macau', KA: 'Cathay Dragon', UO: 'HK Express', GK: 'Jetstar Japan',
  BC: 'Skymark', NU: 'Japan Transocean Air', '7G': 'StarFlyer', IT: 'Tigerair Taiwan', JX: 'STARLUX', BI: 'Royal Brunei',
  QZ: 'Indonesia AirAsia', JT: 'Lion Air', ID: 'Batik Air', OD: 'Batik Air Malaysia', '5W': 'Wizz Air Abu Dhabi',
  WK: 'Edelweiss', '4Y': 'Discover Airlines', EJ: 'New England Airlines', KS: 'PenAir', '3M': 'Silver Airways',
  XP: 'Avelo Airlines', '8D': 'FitsAir', VX: 'Virgin America',
};

const normalize = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const BY_NAME = new Map<string, string>();
for (const [code, name] of Object.entries(AIRLINES)) {
  const n = normalize(name);
  BY_NAME.set(n, code);
  // "United Airlines" → also "united"; "Delta Air Lines" → "delta".
  const short = n.replace(/\b(air ?lines|airways|airline|air)\b/g, '').trim();
  if (short && !BY_NAME.has(short)) BY_NAME.set(short, code);
}

export function airlineCodeFromName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const n = normalize(name);
  if (BY_NAME.has(n)) return BY_NAME.get(n);
  const short = n.replace(/\b(air ?lines|airways|airline|air|inc|ltd|sa|ag)\b/g, '').trim();
  return BY_NAME.get(short);
}

export function airlineName(code: string): string | undefined {
  return AIRLINES[code.toUpperCase()];
}

/** Full airline names, longest first, for scanning free text (short forms like "united" are too ambiguous). */
export const AIRLINE_NAME_PATTERNS: [RegExp, string][] = Object.entries(AIRLINES)
  .map(([code, name]) => [normalize(name), code] as const)
  .filter(([name]) => name.length >= 4)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([name, code]) => [new RegExp(`\\b${name.replace(/ /g, '\\s+')}\\b`, 'i'), code]);

/** Every known name and short name ("united", "delta"), for "<airline> 1234" style mentions. */
export const AIRLINE_NAME_ALTERNATION = [...BY_NAME.keys()]
  .filter((name) => name.length >= 4)
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/ /g, '\\s+'))
  .join('|');

export const airlineCodeFromAnyName = (name: string) => BY_NAME.get(normalize(name));

/** Sender domains of airlines whose emails rarely state the carrier code next to each flight number. */
export const AIRLINE_DOMAINS: Record<string, string> = {
  'united.com': 'UA', 'delta.com': 'DL', 'aa.com': 'AA', 'americanairlines.com': 'AA', 'alaskaair.com': 'AS',
  'southwest.com': 'WN', 'luv.southwest.com': 'WN', 'jetblue.com': 'B6', 'spirit.com': 'NK', 'flyfrontier.com': 'F9',
  'hawaiianairlines.com': 'HA', 'aircanada.com': 'AC', 'aircanada.ca': 'AC', 'westjet.com': 'WS', 'britishairways.com': 'BA',
  'ba.com': 'BA', 'lufthansa.com': 'LH', 'airfrance.fr': 'AF', 'airfrance.com': 'AF', 'klm.com': 'KL', 'emirates.com': 'EK',
  'qatarairways.com': 'QR', 'etihad.com': 'EY', 'singaporeair.com': 'SQ', 'cathaypacific.com': 'CX', 'qantas.com': 'QF',
  'qantas.com.au': 'QF', 'ana.co.jp': 'NH', 'jal.com': 'JL', 'jal.co.jp': 'JL', 'ryanair.com': 'FR', 'easyjet.com': 'U2',
  'virginatlantic.com': 'VS', 'aerlingus.com': 'EI', 'iberia.com': 'IB', 'turkishairlines.com': 'TK', 'thy.com': 'TK',
  'swiss.com': 'LX', 'austrian.com': 'OS', 'flysas.com': 'SK', 'finnair.com': 'AY', 'icelandair.com': 'FI', 'icelandair.is': 'FI',
  'aeromexico.com': 'AM', 'copaair.com': 'CM', 'avianca.com': 'AV', 'latam.com': 'LA', 'koreanair.com': 'KE',
  'flyasiana.com': 'OZ', 'evaair.com': 'BR', 'china-airlines.com': 'CI', 'airnewzealand.com': 'NZ', 'airnewzealand.co.nz': 'NZ',
  'virginaustralia.com': 'VA', 'flysuncountry.com': 'SY', 'suncountry.com': 'SY', 'allegiantair.com': 'G4', 'flybreeze.com': 'MX',
  'aveloair.com': 'XP', 'porterairlines.com': 'PD', 'vueling.com': 'VY', 'wizzair.com': 'W6', 'norwegian.com': 'DY',
  'tap.pt': 'TP', 'flytap.com': 'TP', 'elal.com': 'LY', 'airindia.com': 'AI', 'goindigo.in': '6E', 'airasia.com': 'AK',
  'aerolineas.com.ar': 'AR', 'latamairlines.com': 'LA', 'ita-airways.com': 'AZ', 'alitalia.com': 'AZ',
  'aireuropa.com': 'UX', 'volaris.com': 'Y4', 'vivaaerobus.com': 'VB', 'jetsmart.com': 'JA', 'skyairline.com': 'H2',
  'voegol.com.br': 'G3', 'voeazul.com.br': 'AD', 'royalairmaroc.com': 'AT', 'egyptair.com': 'MS', 'ethiopianairlines.com': 'ET',
  'kenya-airways.com': 'KQ', 'saudia.com': 'SV', 'flydubai.com': 'FZ', 'airarabia.com': 'G9', 'transavia.com': 'HV',
  'eurowings.com': 'EW', 'brusselsairlines.com': 'SN', 'aegeanair.com': 'A3', 'lot.com': 'LO', 'airbaltic.com': 'BT',
  'flypgs.com': 'PC', 'condor.com': 'DE', 'edelweissair.ch': 'WK', 'airtransat.com': 'TS', 'flair.com': 'F8',
  'thaiairways.com': 'TG', 'vietnamairlines.com': 'VN', 'malaysiaairlines.com': 'MH',
  'philippineairlines.com': 'PR', 'garuda-indonesia.com': 'GA', 'airchina.com': 'CA', 'csair.com': 'CZ', 'ceair.com': 'MU',
  'hawaiianair.com': 'HA', 'jetstar.com': 'JQ', 'flyscoot.com': 'TR', 'cebupacificair.com': '5J',
};

/** Online travel agencies and corporate booking tools whose emails carry other airlines' flights. */
export const TRAVEL_AGENCY_DOMAINS = [
  'cheapoair.com', 'onetravel.com', 'expedia.com', 'priceline.com', 'orbitz.com', 'travelocity.com', 'kayak.com',
  'hopper.com', 'trip.com', 'kiwi.com', 'edreams.com', 'opodo.com', 'despegar.com', 'booking.com', 'navan.com',
  'tripactions.com', 'egencia.com', 'justfly.com', 'flighthub.com', 'mytrip.com', 'gotogate.com', 'budgetair.com',
  'amextravel.com', 'studentuniverse.com', 'lastminute.com', 'travelgenio.com', 'almundo.com', 'tripit.com',
];

/** Senders that write numeric dates month-first (03/04 = March 4). Everyone else is read day-first. */
const US_AIRLINES = new Set(['AA', 'DL', 'UA', 'WN', 'B6', 'AS', 'NK', 'F9', 'HA', 'G4', 'SY', 'MX', 'XP', 'VX']);
const US_AGENCIES = ['cheapoair.com', 'onetravel.com', 'expedia.com', 'priceline.com', 'orbitz.com', 'travelocity.com', 'kayak.com', 'hopper.com', 'navan.com', 'tripactions.com', 'egencia.com', 'amextravel.com', 'studentuniverse.com', 'tripit.com'];

export function usesMonthFirstDates(from: string, carrier: string | undefined): boolean {
  const domain = from.match(/@([\w.-]+)/)?.[1]?.toLowerCase() ?? '';
  return (carrier !== undefined && US_AIRLINES.has(carrier)) || US_AGENCIES.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function airlineFromSender(from: string): string | undefined {
  const domain = from.match(/@([\w.-]+)/)?.[1]?.toLowerCase();
  if (!domain) return undefined;
  for (const [d, code] of Object.entries(AIRLINE_DOMAINS)) if (domain === d || domain.endsWith(`.${d}`)) return code;
  return undefined;
}
