#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// ── Helpers ──────────────────────────────────────────────────────────────────
function cleanRef(val) {
  if (!val) return '';
  return val.replace(/\s*\(https?:\/\/[^)]+\)/g, '').trim();
}

function cleanMarket(val) {
  return cleanRef(val).replace(/^@/, '').trim();
}

function parseNum(val) {
  if (!val) return 0;
  val = String(val).replace(/[€$£\s]/g, '').replace(/,/g, '');
  return parseFloat(val) || 0;
}

// Simple CSV parser that handles quoted fields with commas and newlines
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
          rows.push(row);
        }
        row = [];
      } else if (ch === '\r') {
        // skip
      } else {
        field += ch;
      }
    }
  }
  // last field/row
  row.push(field);
  if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
    rows.push(row);
  }
  return rows;
}

function csvToObjects(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  // Strip BOM from first header
  let headers = rows[0].map(h => h.replace(/^\uFEFF/, ''));
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (rows[i][j] || '').trim();
    }
    result.push(obj);
  }
  return result;
}

// Get column value with fuzzy matching (trailing spaces)
function col(row, name) {
  if (row[name] !== undefined) return row[name];
  // try with trailing space
  if (row[name + ' '] !== undefined) return row[name + ' '];
  // try trimmed version of all keys
  for (const k of Object.keys(row)) {
    if (k.trim() === name) return row[k];
  }
  return '';
}

// ── Constants ────────────────────────────────────────────────────────────────
const MONTHS_2026 = ['01/26','02/26','03/26','04/26','05/26','06/26','07/26','08/26','09/26','10/26','11/26','12/26'];

const BOOK_COL = {
  '01/26':'Bookmaker 01/26','02/26':'Bookmaker 02/26','03/26':'Bookmaker 03/26',
  '04/26':'Bookmakers 04/26','05/26':'Bookmarker 05/26','06/26':'Bookmarker 06/26',
  '07/26':'Bookmarker 07/26','08/26':'Bookmarker 08/26','09/26':'Bookmarker 09/26',
  '10/26':'Bookmarker 10/26','11/26':'Bookmarker 11/26','12/26':'Bookmarker 12/26'
};

// ── Paths ────────────────────────────────────────────────────────────────────
const BASE = path.resolve(__dirname, '..');
const PAGES_CSV   = path.join(BASE, 'BU - Generic pages portfolio 16225822504180ebbeb5c88d43d88b46_all.csv');
const POS_CSV     = path.join(BASE, 'BU - Positions generic pages 16225822504180b599b7efc8dce82d0a_all.csv');
const OPS_CSV     = path.join(BASE, 'BU - Operators 12725822504180ff85b9dcbd76a398cf_all.csv');
const MARKETS_CSV = path.join(BASE, 'BU - Markets 16125822504180e382cac68bd32baacd_all.csv');
const DATA_JSON   = path.join(__dirname, 'data.json');

// ── Read existing data ───────────────────────────────────────────────────────
console.log('Reading existing data.json...');
const existing = JSON.parse(fs.readFileSync(DATA_JSON, 'utf8'));

// Keys to preserve
const PRESERVE_KEYS = [
  'siteConfig', 'operatorConfig', 'operatorVariants', 'proposals',
  'sitesDB', 'scrapeAlerts', 'gscTraffic', 'gscLastSync', 'scanLog'
];
const preserved = {};
for (const k of PRESERVE_KEYS) {
  if (existing[k] !== undefined) preserved[k] = existing[k];
}

// ── Read CSVs ────────────────────────────────────────────────────────────────
console.log('Reading CSV files...');
const rawPagesCSV     = fs.readFileSync(PAGES_CSV, 'utf8');
const rawPositionsCSV = fs.readFileSync(POS_CSV, 'utf8');
const rawOpsCSV       = fs.readFileSync(OPS_CSV, 'utf8');
const rawMarketsCSV   = fs.readFileSync(MARKETS_CSV, 'utf8');

const pages     = csvToObjects(rawPagesCSV);
const positions = csvToObjects(rawPositionsCSV);
const ops       = csvToObjects(rawOpsCSV);
const markets   = csvToObjects(rawMarketsCSV);

console.log(`Parsed: ${pages.length} pages, ${positions.length} positions, ${ops.length} operators, ${markets.length} markets`);

// ── Build operators (per market) ─────────────────────────────────────────────
console.log('Building operators...');
const operatorsMap = {}; // market -> Set of operator names
for (const row of ops) {
  const market = cleanRef(col(row, 'Market'));
  const name = (col(row, 'Bookmaker') || '').trim();
  if (!market || !name) continue;
  if (!operatorsMap[market]) operatorsMap[market] = new Set();
  operatorsMap[market].add(name);
}
// Also add operators found in positions data
for (const row of positions) {
  const market = cleanMarket(col(row, 'Formula Market') || col(row, 'Market'));
  if (!market) continue;
  for (const m of MONTHS_2026) {
    const bookCol = BOOK_COL[m];
    const op = cleanRef(col(row, bookCol));
    if (op) {
      if (!operatorsMap[market]) operatorsMap[market] = new Set();
      operatorsMap[market].add(op);
    }
  }
}
const operatorsResult = {};
for (const [market, set] of Object.entries(operatorsMap)) {
  operatorsResult[market] = [...set].sort();
}

// ── Build operatorDB ─────────────────────────────────────────────────────────
console.log('Building operatorDB...');
const operatorDB = {};
for (const row of ops) {
  const market = cleanRef(col(row, 'Market'));
  const name = (col(row, 'Bookmaker') || '').trim();
  if (!market || !name) continue;
  if (!operatorDB[market]) operatorDB[market] = {};
  operatorDB[market][name] = {
    am: cleanRef(col(row, 'Account Manager')),
    status: col(row, 'Status') || col(row, 'Account status') || '',
    license: col(row, 'License') || '',
    company: col(row, 'Company') || '',
    url: col(row, 'URL') || '',
    baseName: name,
    vertical: col(row, 'Main Vertical') || '',
    keyword: col(row, 'Main Brand Keyword') || ''
  };
}

// ── Build positionData ───────────────────────────────────────────────────────
console.log('Building positionData...');
const positionData = {};
for (const row of positions) {
  const market = cleanMarket(col(row, 'Formula Market') || col(row, 'Market'));
  const url = (col(row, 'Url') || col(row, 'URL') || '').trim();
  const posName = (col(row, 'Position') || '').trim();
  if (!market || !url || !posName) continue;

  if (!positionData[market]) positionData[market] = {};
  if (!positionData[market][url]) positionData[market][url] = { positions: [], conversion: 0 };

  const months = {};
  for (const m of MONTHS_2026) {
    const bookCol = BOOK_COL[m];
    const operator = cleanRef(col(row, bookCol));
    const statusVal = col(row, 'Status ' + m);
    const sold = statusVal.toLowerCase().includes('sold');
    const price = parseNum(col(row, 'Price ' + m));
    months[m] = { operator: operator, sold: sold, price: price };
  }

  positionData[market][url].positions.push({
    name: posName,
    months: months
  });
}

// Sort positions within each URL: numeric first (sorted), then named
for (const market of Object.keys(positionData)) {
  for (const url of Object.keys(positionData[market])) {
    positionData[market][url].positions.sort((a, b) => {
      const aNum = parseInt(a.name);
      const bNum = parseInt(b.name);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      if (!isNaN(aNum)) return -1;
      if (!isNaN(bNum)) return 1;
      return a.name.localeCompare(b.name);
    });
  }
}

// ── Build allMarkets (pages grouped by market) ───────────────────────────────
console.log('Building allMarkets...');
const allMarkets = {};
for (const row of pages) {
  const market = cleanRef(col(row, 'Market'));
  const site = cleanRef(col(row, 'Site'));
  const url = (col(row, 'URL') || '').trim();
  const article = (col(row, 'Article') || '').trim();
  if (!market) continue;

  if (!allMarkets[market]) allMarkets[market] = [];

  const fees = {};
  for (const m of MONTHS_2026) {
    fees[m] = parseNum(col(row, 'Fees ' + m));
  }
  fees['12/25'] = parseNum(col(row, 'Fees 12/25'));

  const posRefs = (col(row, 'BU - Positions') || '').split(',').map(s => cleanRef(s.trim())).filter(Boolean);

  allMarkets[market].push({
    article: article,
    site: site,
    url: url,
    nbPos: parseNum(col(row, 'Nb pos.')),
    topic: col(row, 'Topic') || '',
    tags: col(row, 'Tags') || '',
    area: cleanRef(col(row, 'Area')),
    traffic: parseNum(col(row, 'Traffic 30 days (19/02)')),
    trafficSep: parseNum(col(row, 'Traffic 30 days (18/09)')),
    trafficJuly: parseNum(col(row, 'Traffic July')),
    fees: fees,
    positions: posRefs,
    soldPos: col(row, 'Sold pos. 03/26') || ''
  });
}

// ── Build marketsDB ──────────────────────────────────────────────────────────
console.log('Building marketsDB...');

// ISO 2 corrections (CSV has non-standard codes)
// Note: CR is valid for Costa Rica, only fix it for Czech Republic
const ISO_FIXES_BY_MARKET = {
  'Czech Republic': { from: 'CR', to: 'CZ' },
  'Bulgaria':       { from: 'BU', to: 'BG' },
  'Japan':          { from: 'JA', to: 'JP' },
  'Ireland':        { from: 'IR', to: 'IE' },
  'United Kingdom': { from: 'UK', to: 'GB' },
};

// Multi-country / aggregate markets → "all" (no country filter for traffic)
const MULTI_COUNTRY_MARKETS = new Set([
  'Africa FR', 'Africa EN', 'Rest of LATAM', 'Other', 'Global'
]);

const marketsDB = {};
const seenMarkets = {};

for (const row of markets) {
  const name = (col(row, 'Market') || '').trim();
  if (!name) continue;

  const area = cleanRef(col(row, 'Area'));
  const bu = cleanRef(col(row, 'Business Unit'));
  let code = (col(row, 'MKT') || '').trim();

  // Fix non-standard ISO codes (per market to avoid Costa Rica CR → CZ)
  const fix = ISO_FIXES_BY_MARKET[name];
  if (fix && code === fix.from) code = fix.to;

  // Determine countryCodes for traffic filtering
  let countryCodes;
  if (MULTI_COUNTRY_MARKETS.has(name) || code === '-' || !code) {
    countryCodes = ['all'];
  } else {
    countryCodes = [code];
  }

  // Handle Bojoko duplicates — flag on primary entry, skip duplicate
  if (area === 'Bojoko') {
    if (seenMarkets[name]) {
      marketsDB[seenMarkets[name]].bojoko = true;
      continue;
    }
  }

  const sitesStr = col(row, 'Sites') || '';
  const sitesList = sitesStr.split(',').map(s => cleanRef(s.trim())).filter(Boolean);

  seenMarkets[name] = name;

  marketsDB[name] = {
    code: code,
    countryCodes: countryCodes,
    area: area,
    bu: bu,
    bojoko: area === 'Bojoko',
    activePlayers: parseNum(col(row, 'Active players')),
    marketSize: parseNum(col(row, 'Market size')),
    regulationStatus: col(row, 'Regulation status') || '',
    regulatorUrl: col(row, 'Regulator URL') || '',
    growthYoY: col(row, 'Growth (YoY)') || '',
    playerValue: parseNum(col(row, 'NSN Player Value')),
    prio: parseNum(col(row, 'Prio')),
    sites: sitesList,
    legal: col(row, 'Legal') || '',
    illegal: col(row, 'Illegal') || '',
    restricted: col(row, 'Restricted') || '',
    maturityScore: parseNum(col(row, 'Maturity score')),
    priorityScore: parseNum(col(row, 'Priority score')),
    riskScore: parseNum(col(row, 'Risk score')),
    seoDifficulty: parseNum(col(row, 'SEO Difficulty')),
    taxBurden: col(row, 'Tax Burden (operators)') || '',
    keywordVolumeBetting: parseNum(col(row, 'Keyword volume - Betting')),
    keywordVolumeCasino: parseNum(col(row, 'Keyword volume - Casino')),
    affiliatePresenceBetting: parseNum(col(row, 'Affiliate presence - betting')),
    affiliatePresenceCasino: parseNum(col(row, 'Affiliate presence - casino'))
  };
}

// ── Assemble final data ──────────────────────────────────────────────────────
const data = {
  operators: operatorsResult,
  positionData: positionData,
  scrapeAlerts: preserved.scrapeAlerts || {},
  lastModified: new Date().toISOString(),
  rawPagesCSV: rawPagesCSV,
  rawPositionsCSV: rawPositionsCSV,
  siteConfig: preserved.siteConfig || {},
  operatorConfig: preserved.operatorConfig || {},
  operatorDB: operatorDB,
  operatorVariants: preserved.operatorVariants || {},
  sitesDB: preserved.sitesDB || {},
  proposals: preserved.proposals || {},
  gscTraffic: preserved.gscTraffic || {},
  gscLastSync: preserved.gscLastSync || null,
  scanLog: preserved.scanLog || {},
  allMarkets: allMarkets,
  marketsDB: marketsDB
};

// ── Write ────────────────────────────────────────────────────────────────────
console.log('Writing data.json...');
fs.writeFileSync(DATA_JSON, JSON.stringify(data, null, 2), 'utf8');

// ── Stats ────────────────────────────────────────────────────────────────────
const marketCount = Object.keys(allMarkets).length;
const pageCount = Object.values(allMarkets).reduce((s, arr) => s + arr.length, 0);
const posCount = Object.values(positionData).reduce((s, urls) =>
  s + Object.values(urls).reduce((s2, u) => s2 + u.positions.length, 0), 0);
const opMarkets = Object.keys(operatorsResult).length;
const opCount = Object.values(operatorsResult).reduce((s, arr) => s + arr.length, 0);
const dbMarkets = Object.keys(operatorDB).length;
const dbOps = Object.values(operatorDB).reduce((s, m) => s + Object.keys(m).length, 0);
const mktCount = Object.keys(marketsDB).length;

console.log('\n=== Import Stats ===');
console.log(`Markets (allMarkets):    ${marketCount} markets, ${pageCount} pages`);
console.log(`Positions (positionData): ${Object.keys(positionData).length} markets, ${posCount} position rows`);
console.log(`Operators:               ${opMarkets} markets, ${opCount} unique operators`);
console.log(`OperatorDB:              ${dbMarkets} markets, ${dbOps} operator records`);
console.log(`MarketsDB:               ${mktCount} markets`);
console.log(`Preserved keys:          ${PRESERVE_KEYS.filter(k => preserved[k] !== undefined).join(', ')}`);
console.log('\nDone!');
