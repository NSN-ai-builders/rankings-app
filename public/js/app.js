// ==================== AUTH ====================
async function tryAutoLaunch() {
  try {
    const resp = await fetch('/api/data', { credentials: 'same-origin' });
    if (resp.ok) {
      const data = await resp.json();
      if (data.rawPagesCSV && data.rawPositionsCSV) {
        rawPagesCSV = data.rawPagesCSV;
        rawPositionsCSV = data.rawPositionsCSV;
        if (data.operators && Object.keys(data.operators).length) operators = data.operators;
        if (data.positionData && Object.keys(data.positionData).length) positionData = data.positionData;
        if (data.scrapeAlerts && Object.keys(data.scrapeAlerts).length) scrapeAlerts = data.scrapeAlerts;
        if (data.siteConfig) siteConfig = data.siteConfig;
        if (data.operatorConfig) operatorConfig = data.operatorConfig;
        if (data.operatorDB) operatorDB = data.operatorDB;
        if (data.operatorVariants) operatorVariants = data.operatorVariants;
        if (data.gscTraffic) window.gscTraffic = data.gscTraffic;
        if (data.proposals) { proposals = data.proposals; console.log('[AUTO-LAUNCH] Proposals:', Object.keys(proposals).length); }
        if (data.sitesDB) sitesDB = data.sitesDB;
        processData();
        autoDetectSiteConfigs();
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('upload-screen').style.display = 'none';
        showHomeScreen();
        console.log('[AUTO-LAUNCH] Success - loaded from server');
        return true;
      }
    }
  } catch(e) { console.error('[AUTO-LAUNCH] Failed:', e); }
  return false;
}

async function checkAuth() {
  try {
    const resp = await fetch('/api/check-auth');
    if (resp.ok) {
      document.getElementById('login-screen').style.display = 'none';
      if (await tryAutoLaunch()) return true;
      document.getElementById('upload-screen').style.display = 'flex';
      return true;
    }
  } catch(e) {}
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('upload-screen').style.display = 'none';
  return false;
}

async function doLogin() {
  const pw = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const resp = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    if (resp.ok) {
      document.getElementById('login-screen').style.display = 'none';
      if (await tryAutoLaunch()) return;
      document.getElementById('upload-screen').style.display = 'flex';
    } else {
      errEl.textContent = 'Incorrect password';
    }
  } catch(e) {
    errEl.textContent = 'Server connection error';
  }
}

// Check auth on page load
document.addEventListener('DOMContentLoaded', () => checkAuth());

// ==================== CONSTANTS ====================
const MONTHS_2026 = ['01/26','02/26','03/26','04/26','05/26','06/26','07/26','08/26','09/26','10/26','11/26','12/26'];
const MONTH_LABELS = {};
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
MONTHS_2026.forEach((m,i) => MONTH_LABELS[m] = MONTH_NAMES[i] + ' 2026');
MONTH_LABELS['full_year'] = 'Year 2026';

// Bookmaker column mapping (handle typos)
const BOOK_COL = {};
MONTHS_2026.forEach(m => {
  const mm = m.split('/')[0], yy = m.split('/')[1];
  if (m === '04/26') BOOK_COL[m] = 'Bookmakers 04/26';
  else if (parseInt(mm) >= 5) BOOK_COL[m] = `Bookmarker ${mm}/${yy}`;
  else BOOK_COL[m] = `Bookmaker ${mm}/${yy}`;
});

// Position CTR model (click-through rates)
// Based on typical ranking page behavior
function getPositionCTR(posName, posIndex, totalPositions) {
  const n = Math.max(totalPositions, 1);
  // Named positions
  const nameLower = (posName || '').toLowerCase();
  if (nameLower === 'banner') return 0.05;
  if (nameLower === 'link') return 0.01;
  // Numbered positions: CTR decreases with position, adjusted by total count
  const baseCTRs = [0.30, 0.18, 0.12, 0.08, 0.06, 0.04, 0.03, 0.025, 0.02, 0.015,
                     0.012, 0.010, 0.008, 0.007, 0.006, 0.005, 0.004, 0.004, 0.003, 0.003];
  const idx = Math.min(posIndex, baseCTRs.length - 1);
  let ctr = baseCTRs[idx];
  // Adjust: fewer positions = higher CTR per position
  if (n <= 5) ctr *= 1.3;
  else if (n <= 10) ctr *= 1.0;
  else if (n <= 15) ctr *= 0.85;
  else ctr *= 0.7;
  return ctr;
}

// ==================== STATE ====================
var rawPagesCSV = null, rawPositionsCSV = null;
var allMarkets = {}; // { marketName: { pages:[], ... } }
var currentMarket = null;
// Default to current month
const _now = new Date();
const _mm = String(_now.getMonth() + 1).padStart(2, '0');
var selectedMonth = `${_mm}/26`;
var currentView = 'dashboard';
var currentPageUrl = null;
var currentOperator = null;
var operators = {};  // per market: { marketName: [...] }
var positionData = {}; // per market: { marketName: { url: { positions: [...], conversion: 0 } } }
var scrapeAlerts = {}; // per market: { marketName: { url: { posIdx: { expected, found } } } }
var currentAM = null;
var currentDealOp = null;
var sortState = {};
var chartInstances = [];
var siteConfig = {};   // { siteName: { logo: '', color: '#hex', domain: '' } }
var operatorConfig = {}; // { opName: { logo: '', color: '#hex' } }
var operatorDB = {}; // { market: { operatorName: { baseName, displayName, am, url, status, license, visits } } }
var operatorVariants = {}; // { normalizedName: canonicalName }
var gscTraffic = {}; // { market: { url: { clicks, lastUpdated } } }
var scanLog = []; // scan history
var proposals = {}; // { id: { operator, market, am, type, status, items, ... } }
var sitesDB = {}; // { siteName: { name, domain, color, contact, pages: [...] } }

// ==================== COUNTRY FLAGS ====================
const COUNTRY_FLAGS = {
  'brazil': '\u{1F1E7}\u{1F1F7}', 'brasil': '\u{1F1E7}\u{1F1F7}', 'br': '\u{1F1E7}\u{1F1F7}',
  'mexico': '\u{1F1F2}\u{1F1FD}', 'méxico': '\u{1F1F2}\u{1F1FD}', 'mx': '\u{1F1F2}\u{1F1FD}',
  'chile': '\u{1F1E8}\u{1F1F1}', 'cl': '\u{1F1E8}\u{1F1F1}',
  'colombia': '\u{1F1E8}\u{1F1F4}', 'co': '\u{1F1E8}\u{1F1F4}',
  'peru': '\u{1F1F5}\u{1F1EA}', 'perú': '\u{1F1F5}\u{1F1EA}', 'pe': '\u{1F1F5}\u{1F1EA}',
  'argentina': '\u{1F1E6}\u{1F1F7}', 'ar': '\u{1F1E6}\u{1F1F7}',
  'ecuador': '\u{1F1EA}\u{1F1E8}', 'ec': '\u{1F1EA}\u{1F1E8}',
  'portugal': '\u{1F1F5}\u{1F1F9}', 'pt': '\u{1F1F5}\u{1F1F9}',
  'spain': '\u{1F1EA}\u{1F1F8}', 'españa': '\u{1F1EA}\u{1F1F8}', 'es': '\u{1F1EA}\u{1F1F8}',
  'france': '\u{1F1EB}\u{1F1F7}', 'fr': '\u{1F1EB}\u{1F1F7}',
  'germany': '\u{1F1E9}\u{1F1EA}', 'deutschland': '\u{1F1E9}\u{1F1EA}', 'de': '\u{1F1E9}\u{1F1EA}',
  'italy': '\u{1F1EE}\u{1F1F9}', 'italia': '\u{1F1EE}\u{1F1F9}', 'it': '\u{1F1EE}\u{1F1F9}',
  'uk': '\u{1F1EC}\u{1F1E7}', 'united kingdom': '\u{1F1EC}\u{1F1E7}', 'gb': '\u{1F1EC}\u{1F1E7}',
  'usa': '\u{1F1FA}\u{1F1F8}', 'united states': '\u{1F1FA}\u{1F1F8}', 'us': '\u{1F1FA}\u{1F1F8}',
  'canada': '\u{1F1E8}\u{1F1E6}', 'ca': '\u{1F1E8}\u{1F1E6}',
  'japan': '\u{1F1EF}\u{1F1F5}', 'jp': '\u{1F1EF}\u{1F1F5}',
  'india': '\u{1F1EE}\u{1F1F3}', 'in': '\u{1F1EE}\u{1F1F3}',
  'nigeria': '\u{1F1F3}\u{1F1EC}', 'ng': '\u{1F1F3}\u{1F1EC}',
  'kenya': '\u{1F1F0}\u{1F1EA}', 'ke': '\u{1F1F0}\u{1F1EA}',
  'south africa': '\u{1F1FF}\u{1F1E6}', 'za': '\u{1F1FF}\u{1F1E6}',
  'australia': '\u{1F1E6}\u{1F1FA}', 'au': '\u{1F1E6}\u{1F1FA}',
  'new zealand': '\u{1F1F3}\u{1F1FF}', 'nz': '\u{1F1F3}\u{1F1FF}',
  'uruguay': '\u{1F1FA}\u{1F1FE}', 'uy': '\u{1F1FA}\u{1F1FE}',
  'paraguay': '\u{1F1F5}\u{1F1FE}', 'py': '\u{1F1F5}\u{1F1FE}',
  'bolivia': '\u{1F1E7}\u{1F1F4}', 'bo': '\u{1F1E7}\u{1F1F4}',
  'venezuela': '\u{1F1FB}\u{1F1EA}', 've': '\u{1F1FB}\u{1F1EA}',
  'costa rica': '\u{1F1E8}\u{1F1F7}', 'cr': '\u{1F1E8}\u{1F1F7}',
  'panama': '\u{1F1F5}\u{1F1E6}', 'pa': '\u{1F1F5}\u{1F1E6}',
  'honduras': '\u{1F1ED}\u{1F1F3}', 'hn': '\u{1F1ED}\u{1F1F3}',
  'guatemala': '\u{1F1EC}\u{1F1F9}', 'gt': '\u{1F1EC}\u{1F1F9}',
  'dominican republic': '\u{1F1E9}\u{1F1F4}', 'república dominicana': '\u{1F1E9}\u{1F1F4}', 'do': '\u{1F1E9}\u{1F1F4}',
  'el salvador': '\u{1F1F8}\u{1F1FB}', 'sv': '\u{1F1F8}\u{1F1FB}',
  'nicaragua': '\u{1F1F3}\u{1F1EE}', 'ni': '\u{1F1F3}\u{1F1EE}',
  'cuba': '\u{1F1E8}\u{1F1FA}', 'cu': '\u{1F1E8}\u{1F1FA}',
  'global': '\u{1F30D}', 'world': '\u{1F30D}', 'latam': '\u{1F30E}'
};
function getFlag(market) {
  const key = market.toLowerCase().trim();
  return COUNTRY_FLAGS[key] || '\u{1F30D}';
}

// ==================== HELPERS ====================
// Toast notification system
function showToast(msg, type, duration) {
  type = type || 'info';
  duration = duration || 4000;
  var container = document.querySelector('.toast-container');
  if (!container) { container = document.createElement('div'); container.className = 'toast-container'; document.body.appendChild(container); }
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(function() { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(function() { toast.remove(); }, 300); }, duration);
}

var fmt = function(n) { return n == null ? '0' : Math.round(n).toLocaleString('en-US'); };
var fmtC = function(n) { return fmt(n) + ' \u20AC'; };
var fmtP = function(n) { return (n * 100).toFixed(1) + '%'; };
var esc = function(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

function cleanRef(val) {
  if (!val) return '';
  return val.replace(/\s*\(https?:\/\/[^)]+\)/g, '').replace(/^@/, '').trim();
}
function parseNum(val) {
  if (!val || val === '') return 0;
  return parseFloat(String(val).replace(/[€$£,\s]/g, '').replace(',', '.')) || 0;
}
function parsePositionsField(val) {
  if (!val) return [];
  var parts = val.split(/,(?=\s*[^(]*(?:\(|$))/);
  return parts.map(function(p) { return cleanRef(p.trim()); }).filter(Boolean);
}

// ==================== SITE/OPERATOR CONFIG (LOGO + COLOR) ====================
function getDomainFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch(e) { return ''; }
}

function getFaviconUrl(domain) {
  return 'https://www.google.com/s2/favicons?domain=' + domain + '&sz=64';
}

function extractColorFromFavicon(domain, siteName) {
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      // Find dominant non-white/non-black color
      var colorCounts = {};
      for (var i = 0; i < data.length; i += 4) {
        var r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
        if (a < 128) continue; // skip transparent
        if (r > 230 && g > 230 && b > 230) continue; // skip white-ish
        if (r < 25 && g < 25 && b < 25) continue; // skip black-ish
        if (Math.abs(r-g) < 15 && Math.abs(g-b) < 15 && r > 100) continue; // skip grey
        // Quantize to reduce noise
        var qr = Math.round(r/32)*32, qg = Math.round(g/32)*32, qb = Math.round(b/32)*32;
        var key = qr + ',' + qg + ',' + qb;
        colorCounts[key] = (colorCounts[key] || 0) + 1;
      }
      var sorted = Object.entries(colorCounts).sort(function(a,b) { return b[1] - a[1]; });
      if (sorted.length > 0) {
        var parts = sorted[0][0].split(',').map(Number);
        var hex = '#' + parts.map(function(c) { return c.toString(16).padStart(2,'0'); }).join('');
        if (siteConfig[siteName] && !siteConfig[siteName].color) {
          siteConfig[siteName].color = hex;
          saveAll();
        }
      }
    } catch(e) { /* CORS or other error - color stays empty */ }
  };
  img.src = getFaviconUrl(domain);
}

function getSiteColor(siteName) {
  return siteConfig[siteName]?.color || '';
}
function getSiteLogo(siteName) {
  return siteConfig[siteName]?.logo || '';
}
function getOperatorColor(opName) {
  return operatorConfig[opName]?.color || '';
}
var _opLogoCache = {};
function getOperatorLogo(opName, market) {
  var cacheKey = (market || currentMarket || '_') + '::' + opName;
  if (_opLogoCache[cacheKey] !== undefined) return _opLogoCache[cacheKey];
  if (operatorConfig[opName]?.logo) { _opLogoCache[cacheKey] = operatorConfig[opName].logo; return _opLogoCache[cacheKey]; }
  // Try to get favicon from operatorDB URL
  var mkList = market ? [market] : (typeof currentMarket !== 'undefined' && currentMarket ? [currentMarket] : Object.keys(operatorDB || {}));
  for (var i = 0; i < mkList.length; i++) {
    var mk = mkList[i];
    if (!operatorDB || !operatorDB[mk]) continue;
    var dbEntry = operatorDB[mk][opName];
    if (!dbEntry) {
      // Try compact match
      var cn = typeof compactNormalize === 'function' ? compactNormalize(opName) : opName.toLowerCase();
      for (var key of Object.keys(operatorDB[mk])) {
        var ck = typeof compactNormalize === 'function' ? compactNormalize(key) : key.toLowerCase();
        if (ck === cn) { dbEntry = operatorDB[mk][key]; break; }
        var bn = operatorDB[mk][key].baseName;
        if (bn && (typeof compactNormalize === 'function' ? compactNormalize(bn) : bn.toLowerCase()) === cn) { dbEntry = operatorDB[mk][key]; break; }
      }
    }
    if (dbEntry && dbEntry.url) {
      var rawUrl = dbEntry.url.trim();
      if (rawUrl && !rawUrl.startsWith('http')) rawUrl = 'https://' + rawUrl;
      try {
        var domain = new URL(rawUrl).hostname;
        _opLogoCache[cacheKey] = 'https://www.google.com/s2/favicons?domain=' + domain + '&sz=32';
        return _opLogoCache[cacheKey];
      } catch(e) {}
    }
  }
  _opLogoCache[cacheKey] = '';
  return '';
}

function getOperatorLogoUrl(opName, market) {
  return getOperatorLogo(opName, market);
}

function getOperatorLogoHtml(opName, market, size) {
  var url = getOperatorLogo(opName, market);
  if (!url) return '';
  var s = size || 16;
  return '<img src="' + url + '" style="width:' + s + 'px;height:' + s + 'px;border-radius:2px;object-fit:contain;vertical-align:middle" onerror="this.style.display=\'none\'">';
}

function colorToLightBg(hex) {
  if (!hex) return '';
  var r = parseInt(hex.slice(1,3), 16);
  var g = parseInt(hex.slice(3,5), 16);
  var b = parseInt(hex.slice(5,7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',0.04)';
}

function applyBackgroundTint(color) {
  var content = document.getElementById('main-content');
  if (!content) return;
  if (color) {
    document.body.style.backgroundColor = colorToLightBg(color);
    content.style.backgroundColor = 'transparent';
  } else {
    document.body.style.backgroundColor = '';
  }
}

// ==================== MARKET HELPERS ====================
function getMarketPages() { return allMarkets[currentMarket]?.pages || []; }
function getMarketSites() { return allMarkets[currentMarket]?.sites || []; }
function getMarketOperators() { return operators[currentMarket] || []; }
function getMarketPosData() { return positionData[currentMarket] || {}; }
function getPage(url) { return getMarketPages().find(function(p) { return p.url === url; }); }

// ==================== FILE UPLOAD ====================
['pages', 'positions'].forEach(function(type) {
  var zone = document.getElementById('zone-' + type);
  var input = document.getElementById('file-' + type);
  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', function() { zone.classList.remove('dragover'); });
  zone.addEventListener('drop', function(e) {
    e.preventDefault(); zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(type, e.dataTransfer.files[0]);
  });
  input.addEventListener('change', function() { if (input.files[0]) handleFile(type, input.files[0]); });
});

function handleFile(type, file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    if (type === 'pages') rawPagesCSV = e.target.result;
    else rawPositionsCSV = e.target.result;
    document.getElementById('zone-' + type).classList.add('loaded');
    document.getElementById('fn-' + type).textContent = file.name;
    checkReady();
  };
  reader.readAsText(file);
}
function checkReady() {
  document.getElementById('btn-launch').style.display = (rawPagesCSV && rawPositionsCSV) ? 'block' : 'none';
}

// ==================== LAUNCH ====================
async function launch() {
  await loadPersisted();
  processData();
  autoDetectSiteConfigs();
  document.getElementById('upload-screen').style.display = 'none';
  showHomeScreen();
}

// ==================== EXPORT / IMPORT ====================
function exportData() {
  var blob = new Blob([JSON.stringify({ operators: operators, positionData: positionData, scrapeAlerts: scrapeAlerts, operatorDB: operatorDB, operatorVariants: operatorVariants, gscTraffic: gscTraffic, scanLog: scanLog, proposals: proposals, sitesDB: sitesDB, exportDate: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rankings-data-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}

function importData(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var data = JSON.parse(ev.target.result);
      if (data.operators) operators = Object.assign({}, operators, data.operators);
      if (data.positionData) positionData = Object.assign({}, positionData, data.positionData);
      if (data.scrapeAlerts) scrapeAlerts = Object.assign({}, scrapeAlerts, data.scrapeAlerts);
      if (data.operatorDB) operatorDB = Object.assign({}, operatorDB, data.operatorDB);
      if (data.operatorVariants) operatorVariants = Object.assign({}, operatorVariants, data.operatorVariants);
      if (data.gscTraffic) gscTraffic = Object.assign({}, gscTraffic, data.gscTraffic);
      if (data.scanLog) scanLog = data.scanLog;
      if (data.proposals) proposals = Object.assign({}, proposals, data.proposals);
      if (data.sitesDB) sitesDB = Object.assign({}, sitesDB, data.sitesDB);
      saveAll();
      renderCurrentView();
      showToast('Import successful!', 'success');
    } catch (err) { showToast('Import error: ' + err.message, 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ==================== SORT ====================
function setupSort(tableId, renderFn) {
  var table = document.getElementById(tableId);
  if (!table) return;
  if (!sortState[tableId]) sortState[tableId] = { col: null, asc: true };

  table.querySelectorAll('th[data-sort]').forEach(function(th) {
    th.style.cursor = 'pointer';
    th.onclick = function() {
      var col = th.dataset.sort;
      var st = sortState[tableId];
      if (st.col === col) st.asc = !st.asc;
      else { st.col = col; st.asc = true; }
      // Sort data arrays if available
      sortTableRows(tableId, col, st.asc);
    };
  });
}

function sortTableRows(tableId, col, asc) {
  var table = document.getElementById(tableId);
  if (!table) return;
  var tbody = table.querySelector('tbody');
  var rows = Array.from(tbody.querySelectorAll('tr'));
  var thIdx = Array.from(table.querySelectorAll('th')).findIndex(function(th) { return th.dataset.sort === col; });
  if (thIdx < 0) return;

  rows.sort(function(a, b) {
    var va = a.cells[thIdx]?.textContent.trim() || '';
    var vb = b.cells[thIdx]?.textContent.trim() || '';
    var na = parseFloat(va.replace(/[^\d.-]/g, ''));
    var nb = parseFloat(vb.replace(/[^\d.-]/g, ''));
    if (!isNaN(na) && !isNaN(nb)) return asc ? na - nb : nb - na;
    return asc ? va.localeCompare(vb, 'en') : vb.localeCompare(va, 'en');
  });

  rows.forEach(function(r) { tbody.appendChild(r); });
}
