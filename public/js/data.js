// ==================== CSV PARSER ====================
function parseCSV(text) {
  var lines = text.split(/\r?\n/);
  if (!lines.length) return [];
  // Parse header
  var headers = parseCSVLine(lines[0]);
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var vals = parseCSVLine(lines[i]);
    var row = {};
    headers.forEach(function(h, j) { row[h.trim()] = (vals[j] || '').trim(); });
    rows.push(row);
  }
  return rows;
}
function parseCSVLine(line) {
  var result = []; var current = ''; var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (inQuotes) {
      if (c === '"') { if (line[i+1] === '"') { current += '"'; i++; } else inQuotes = false; }
      else current += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { result.push(current); current = ''; }
      else current += c;
    }
  }
  result.push(current);
  return result;
}

// Helper to find column with fuzzy matching (handles trailing spaces)
function getCol(row, base) {
  if (row[base] !== undefined) return row[base];
  var trimmed = base.trim();
  for (var k of Object.keys(row)) {
    if (k.trim() === trimmed) return row[k];
  }
  return '';
}

// ==================== DATA PROCESSING ====================
function processData() {
  var pageRows = parseCSV(rawPagesCSV);
  var posRows = parseCSV(rawPositionsCSV);

  allMarkets = {};

  // 1. Process pages by market
  pageRows.forEach(function(r) {
    var market = cleanRef(r['Market']);
    if (!market) return;
    if (!allMarkets[market]) allMarkets[market] = { pages: [], sites: new Set() };
    var siteName = cleanRef(r['Site']);
    var url = (r['URL'] || '').trim();
    if (!url) return;

    allMarkets[market].sites.add(siteName);
    allMarkets[market].pages.push({
      article: cleanRef(r['Article']),
      siteName: siteName,
      url: url,
      positions: parsePositionsField(r['BU - Positions']),
      nbPos: parseInt(r['Nb pos.']) || 0,
      topic: cleanRef(r['Topic']),
      tags: cleanRef(r['Tags']),
      area: cleanRef(r['Area']),
      traffic: parseNum(r['Traffic 30 days (19/02)']) || parseNum(r['Traffic 30 days (18/09)']) || parseNum(r['Traffic July']),
      trafficFeb: parseNum(r['Traffic 30 days (19/02)']),
      trafficSep: parseNum(r['Traffic 30 days (18/09)']),
      trafficJuly: parseNum(r['Traffic July']),
      fees: {}
    });
    // Parse monthly fees
    var pg = allMarkets[market].pages[allMarkets[market].pages.length - 1];
    MONTHS_2026.forEach(function(m) {
      var mm = m.split('/')[0], yy = m.split('/')[1];
      pg.fees[m] = parseNum(r['Fees ' + mm + '/' + yy]);
    });
  });

  // Convert site sets to arrays
  Object.values(allMarkets).forEach(function(mk) { mk.sites = [...mk.sites].sort(); });

  // 2. Build position index from positions CSV
  var posIndex = {}; // { market: { url: { posName: { month: { operator, sold, price } } } } }
  posRows.forEach(function(r) {
    var market = cleanRef(getCol(r, 'Formula Market'));
    if (!market) return;
    var url = (r['Url'] || r['URL'] || '').trim();
    if (!url) return;
    var posName = cleanRef(r['Position']);
    if (!posName) return;

    if (!posIndex[market]) posIndex[market] = {};
    if (!posIndex[market][url]) posIndex[market][url] = {};
    if (!posIndex[market][url][posName]) posIndex[market][url][posName] = {};

    MONTHS_2026.forEach(function(m) {
      var mm = m.split('/')[0], yy = m.split('/')[1];
      var bookCol = BOOK_COL[m];
      var op = cleanRef(getCol(r, bookCol));
      var statusRaw = (getCol(r, 'Status ' + mm + '/' + yy) || '').toLowerCase().trim();
      var sold = statusRaw === 'sold' || statusRaw === 'performance' || statusRaw === 'perfomance';
      var price = parseNum(getCol(r, 'Price ' + mm + '/' + yy));
      if (op || sold || price) {
        posIndex[market][url][posName][m] = { operator: op, sold: sold, price: price };
      }
    });
  });

  // 3. Collect operators per market
  Object.keys(allMarkets).forEach(function(market) {
    if (!operators[market]) operators[market] = [];
    var opSet = new Set(operators[market]);
    var pi = posIndex[market] || {};
    Object.values(pi).forEach(function(urlData) {
      Object.values(urlData).forEach(function(posData) {
        Object.values(posData).forEach(function(md) {
          if (md.operator) opSet.add(md.operator);
        });
      });
    });
    operators[market] = [...opSet].sort(function(a, b) { return a.localeCompare(b, 'en'); });
  });

  // 4. Initialize/merge position data per market
  Object.keys(allMarkets).forEach(function(market) {
    if (!positionData[market]) positionData[market] = {};
    var pd = positionData[market];
    var pi = posIndex[market] || {};

    allMarkets[market].pages.forEach(function(pg) {
      if (!pd[pg.url]) {
        pd[pg.url] = { positions: [], conversion: 0 };
        // Build positions from page data
        pg.positions.forEach(function(posName) {
          var pos = { name: posName, months: {} };
          MONTHS_2026.forEach(function(m) {
            var csvData = pi[pg.url]?.[posName]?.[m];
            pos.months[m] = csvData ? Object.assign({}, csvData) : { operator: '', sold: false, price: 0 };
          });
          pd[pg.url].positions.push(pos);
        });
      } else {
        // Merge: add any new positions from CSV not in persisted data
        var existing = new Set(pd[pg.url].positions.map(function(p) { return p.name; }));
        pg.positions.forEach(function(posName) {
          if (!existing.has(posName)) {
            var pos = { name: posName, months: {} };
            MONTHS_2026.forEach(function(m) {
              var csvData = pi[pg.url]?.[posName]?.[m];
              pos.months[m] = csvData ? Object.assign({}, csvData) : { operator: '', sold: false, price: 0 };
            });
            pd[pg.url].positions.push(pos);
          }
        });
      }
    });
  });

  saveOps();
  savePos();
}

// ==================== PERSISTENCE (SERVER API) ====================
async function loadPersisted() {
  try {
    console.log('[LOAD] Fetching data from server...');
    var resp = await fetch('/api/data', { credentials: 'same-origin' });
    console.log('[LOAD] Response:', resp.status, resp.statusText);
    if (resp.ok) {
      var data = await resp.json();
      console.log('[LOAD] Operators:', Object.keys(data.operators || {}).length, '| PositionData:', Object.keys(data.positionData || {}).length);
      if (data.operators && Object.keys(data.operators).length) operators = data.operators;
      if (data.positionData && Object.keys(data.positionData).length) positionData = data.positionData;
      if (data.scrapeAlerts && Object.keys(data.scrapeAlerts).length) scrapeAlerts = data.scrapeAlerts;
      if (data.siteConfig) siteConfig = data.siteConfig;
      if (data.operatorConfig) operatorConfig = data.operatorConfig;
      if (data.operatorDB) operatorDB = data.operatorDB;
      if (data.operatorVariants) operatorVariants = data.operatorVariants;
      if (data.gscTraffic) window.gscTraffic = data.gscTraffic;
      if (data.proposals) { proposals = data.proposals; console.log('[LOAD] Proposals:', Object.keys(proposals).length); }
      if (data.sitesDB) sitesDB = data.sitesDB;
      if (data.marketsDB) window.marketsDB = data.marketsDB;
      // Restore CSV data and rebuild allMarkets
      if (data.rawPagesCSV && data.rawPositionsCSV) {
        rawPagesCSV = data.rawPagesCSV;
        rawPositionsCSV = data.rawPositionsCSV;
        processData();
        console.log('[LOAD] Rebuilt allMarkets from persisted CSV:', Object.keys(allMarkets).length, 'markets');
      }
    }
  } catch(e) { console.error('[LOAD] Failed:', e); }
}

// Apply GSC traffic to pages — supports new format { current, previous, monthly }
function applyGSCTraffic() {
  if (!window.gscTraffic || !currentMarket) return;
  var gscMarket = window.gscTraffic[currentMarket] || {};
  var pages = getMarketPages();
  var updated = 0;
  pages.forEach(function(pg) {
    var gsc = gscMarket[pg.url] || gscMarket[pg.url + '/'] || gscMarket[pg.url.replace(/\/$/, '')];
    if (!gsc) return;
    // New format: { current, previous, monthly }
    if (gsc.current !== undefined) {
      pg.traffic = gsc.current;
      pg.trafficPrevious = gsc.previous || 0;
      pg.trafficMonthly = gsc.monthly || {};
      updated++;
    } else if (gsc.clicks > 0) {
      // Legacy format
      pg.traffic = gsc.clicks;
      updated++;
    }
  });
  if (updated > 0) console.log('[GSC] Applied traffic to', updated, 'pages');
}

// Helper: compute trend % between current and previous
function trafficTrend(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// Helper: render trend badge HTML
function trendBadge(current, previous) {
  if (!previous && !current) return '';
  var pct = trafficTrend(current, previous);
  if (pct === 0) return '<span style="color:#888;font-size:11px;margin-left:4px">→ 0%</span>';
  var color = pct > 0 ? '#00802b' : '#cc0000';
  var arrow = pct > 0 ? '↑' : '↓';
  return '<span style="color:' + color + ';font-size:11px;font-weight:600;margin-left:4px">' + arrow + ' ' + Math.abs(pct) + '%</span>';
}

var _saveTimeout = null;
function saveAll() {
  clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(function() {
    var payload = JSON.stringify({ operators: operators, positionData: positionData, scrapeAlerts: scrapeAlerts, rawPagesCSV: rawPagesCSV, rawPositionsCSV: rawPositionsCSV, siteConfig: siteConfig, operatorConfig: operatorConfig, operatorDB: operatorDB, operatorVariants: operatorVariants, proposals: proposals, sitesDB: sitesDB });
    console.log('[SAVE] Sending', (payload.length / 1024).toFixed(1), 'KB to server...');
    fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: payload
    }).then(function(r) {
      console.log('[SAVE] Response:', r.status, r.statusText);
      if (!r.ok) r.text().then(function(t) { console.error('[SAVE] Error body:', t); });
    }).catch(function(e) { console.error('[SAVE] Network error:', e); });
  }, 500);
}
function saveOps() { saveAll(); }
function savePos() { saveAll(); }
function saveAlerts() { saveAll(); }

// ==================== TRAFFIC SHEET SYNC ====================
function syncTrafficSheet() {
  var btn = document.getElementById('btn-sync-traffic');
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing...'; }
  fetch('/api/sync-traffic-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin'
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (btn) { btn.disabled = false; btn.textContent = 'Sync URLs'; }
    if (d.success) {
      alert('URLs synced to Google Sheet: ' + d.rows + ' rows');
    } else {
      alert('Sync error: ' + (d.error || 'Unknown error'));
    }
  }).catch(function(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Sync URLs'; }
    alert('Sync error: ' + e.message);
  });
}

function importTrafficSheet() {
  var btn = document.getElementById('btn-import-traffic');
  if (btn) { btn.disabled = true; btn.textContent = 'Importing...'; }
  fetch('/api/import-traffic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin'
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (btn) { btn.disabled = false; btn.textContent = 'Import Traffic'; }
    if (d.success) {
      alert('Traffic imported: ' + d.imported + ' pages updated (from ' + d.totalRows + ' rows)');
      // Reload data to reflect traffic changes
      loadData().then(function() { if (typeof renderMarketsView === 'function') renderMarketsView(); });
    } else {
      alert('Import error: ' + (d.error || 'Unknown error'));
    }
  }).catch(function(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Import Traffic'; }
    alert('Import error: ' + e.message);
  });
}

// ==================== AUTO-ADD URL TO TRAFFIC SHEET ====================
function addUrlToTrafficSheet(url, market) {
  fetch('/api/add-traffic-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ url: url, market: market })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.success) {
      console.log('[TRAFFIC] Added URL to sheet:', url, '(' + d.rows + ' rows)');
    } else {
      console.warn('[TRAFFIC] Failed to add URL:', d.error);
    }
  }).catch(function(e) {
    console.warn('[TRAFFIC] Failed to add URL:', e.message);
  });
}

// ==================== SITE CONFIG AUTO-DETECT ====================
function autoDetectSiteConfigs() {
  Object.values(allMarkets).forEach(function(market) {
    (market.pages || []).forEach(function(pg) {
      if (!pg.siteName || siteConfig[pg.siteName]) return;
      var domain = getDomainFromUrl(pg.url);
      if (!domain) return;
      siteConfig[pg.siteName] = { logo: getFaviconUrl(domain), color: '', domain: domain };
      extractColorFromFavicon(domain, pg.siteName);
    });
  });
}

// ==================== MONTH DATA HELPERS ====================
function getMonthData(pos) {
  return pos.months?.[selectedMonth] || { operator: '', sold: false, price: 0 };
}
function getMonthDataForMonth(pos, month) {
  return pos.months?.[month] || { operator: '', sold: false, price: 0 };
}
function setMonthDataAndPropagate(pos, month, data) {
  if (!pos.months) pos.months = {};
  var midx = MONTHS_2026.indexOf(month);
  for (var i = midx; i < MONTHS_2026.length; i++) {
    pos.months[MONTHS_2026[i]] = Object.assign({}, data);
  }
}
function isFullYear() { return selectedMonth === 'full_year'; }
function getActiveMonths() { return isFullYear() ? MONTHS_2026 : [selectedMonth]; }

function getPageRevenue(pageUrl) {
  var pd = positionData[currentMarket]?.[pageUrl];
  if (!pd) return 0;
  var months = getActiveMonths();
  var total = 0;
  pd.positions.forEach(function(pos) {
    months.forEach(function(m) {
      var md = getMonthDataForMonth(pos, m);
      if (md.sold) total += md.price;
    });
  });
  return isFullYear() ? total : total;
}
function getPageSold(pageUrl) {
  var pd = positionData[currentMarket]?.[pageUrl];
  if (!pd) return 0;
  var m = isFullYear() ? '01/26' : selectedMonth;
  return pd.positions.filter(function(pos) { return getMonthDataForMonth(pos, m).sold; }).length;
}
function getPageConversion(pageUrl) {
  return positionData[currentMarket]?.[pageUrl]?.conversion || 0;
}
function getPositionEFTD(traffic, conversion, posName, posIdx, totalPos) {
  var ctr = getPositionCTR(posName, posIdx, totalPos);
  return traffic * (conversion / 100) * ctr;
}
function getPageEFTD(pageUrl) {
  var pd = positionData[currentMarket]?.[pageUrl];
  if (!pd) return 0;
  var pg = getPage(pageUrl);
  if (!pg) return 0;
  var conv = pd.conversion || 0;
  var total = 0;
  pd.positions.forEach(function(pos, i) {
    total += getPositionEFTD(pg.traffic, conv, pos.name, i, pd.positions.length);
  });
  return total;
}
function hasAlerts(pageUrl) {
  return scrapeAlerts[currentMarket]?.[pageUrl] && Object.keys(scrapeAlerts[currentMarket][pageUrl]).length > 0;
}
function siteHasAlerts(siteName) {
  var pages = getMarketPages().filter(function(p) { return p.siteName === siteName; });
  return pages.some(function(p) { return hasAlerts(p.url); });
}

// ==================== OPERATOR DATABASE (CSV IMPORT) ====================

var MARKET_SUFFIXES = [' BR',' MX',' CL',' CO',' PE',' AR',' EC',' PT',' ES',' FR',' IT',' UK',' US',' CA',' AU',' IN',' NG',' ZA',' JP',' RU',' PL',' BE',' NL',' HU',' BG',' CZ',' RS',' SE',' CH',' UA',' VE',' KZ',' BD',' PA',' SV',' CR',' UZ',' AFR',' LATAM'];

function normalizeOperatorName(name) {
  if (!name) return '';
  // Strip Notion URLs
  var n = name.replace(/\s*\(https?:\/\/[^)]+\)/g, '').trim();
  // Remove accents
  n = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Lowercase
  n = n.toLowerCase();
  // Remove extra spaces
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

// Compact normalization: remove ALL spaces, accents, special chars → "Bet do Milhão" = "BetdoMilhao" = "betdomilhao"
function compactNormalize(name) {
  if (!name) return '';
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

// Resolve a scraped name to a known canonical operator name
function resolveOperatorName(scrapedName, market) {
  if (!scrapedName) return scrapedName;
  var marketOps = operators[market] || [];

  // 1. Exact match in operator list
  if (marketOps.includes(scrapedName)) return scrapedName;

  // 2. Case-insensitive match
  var scrapedLower = scrapedName.toLowerCase();
  for (var i = 0; i < marketOps.length; i++) {
    if (marketOps[i].toLowerCase() === scrapedLower) return marketOps[i];
  }

  // 3. Compact match (strips spaces, accents, special chars)
  var scrapedCompact = compactNormalize(scrapedName);
  for (var j = 0; j < marketOps.length; j++) {
    if (compactNormalize(marketOps[j]) === scrapedCompact) return marketOps[j];
  }

  // 4. Market suffix stripping
  var scrapedBase = scrapedName;
  for (var k = 0; k < MARKET_SUFFIXES.length; k++) {
    if (scrapedName.toUpperCase().endsWith(MARKET_SUFFIXES[k])) {
      scrapedBase = scrapedName.substring(0, scrapedName.length - MARKET_SUFFIXES[k].length).trim();
      break;
    }
  }
  if (scrapedBase !== scrapedName) {
    var baseCompact = compactNormalize(scrapedBase);
    for (var l = 0; l < marketOps.length; l++) {
      if (compactNormalize(marketOps[l]) === baseCompact) return marketOps[l];
    }
  }

  // 5. Custom variant lookup
  var customVariants = operatorVariants._custom || {};
  for (var canonical in customVariants) {
    var variants = customVariants[canonical] || [];
    for (var v = 0; v < variants.length; v++) {
      if (compactNormalize(variants[v]) === scrapedCompact) return canonical;
    }
  }

  // 6. Operator DB variant lookup
  if (operatorVariants[normalizeOperatorName(scrapedName)]) {
    var dbCanonical = operatorVariants[normalizeOperatorName(scrapedName)];
    // Find the matching name in market operators
    for (var m = 0; m < marketOps.length; m++) {
      if (compactNormalize(marketOps[m]) === compactNormalize(dbCanonical)) return marketOps[m];
    }
  }

  return scrapedName; // No match found, return as-is
}

// Check if two operator names match (variant-aware)
function operatorsMatch(name1, name2) {
  if (!name1 || !name2) return false;
  // Exact
  if (name1 === name2) return true;
  // Case-insensitive
  if (name1.toLowerCase() === name2.toLowerCase()) return true;
  // Compact match
  if (compactNormalize(name1) === compactNormalize(name2)) return true;
  // Market suffix strip
  var strip = function(n) { return n.replace(/\s*(br|brasil|brazil|mx|co|cl|pe|ar|pt)\s*$/i, '').trim(); };
  if (compactNormalize(strip(name1)) === compactNormalize(strip(name2))) return true;
  // Custom variants: check if both resolve to the same canonical name
  var customVariants = operatorVariants._custom || {};
  var resolve = function(name) {
    var nc = compactNormalize(name);
    for (var canonical in customVariants) {
      if (compactNormalize(canonical) === nc) return canonical;
      var variants = customVariants[canonical] || [];
      for (var i = 0; i < variants.length; i++) {
        if (compactNormalize(variants[i]) === nc) return canonical;
      }
    }
    return name;
  };
  if (resolve(name1) === resolve(name2)) return true;
  // Contains match (short name inside long)
  var l1 = name1.toLowerCase(), l2 = name2.toLowerCase();
  if (l1.includes(l2) || l2.includes(l1)) return true;
  return false;
}

// Get custom variants for an operator
function getCustomVariants(opName) {
  var custom = operatorVariants._custom || {};
  return custom[opName] || [];
}

// Add a custom variant for an operator + merge existing data
function addCustomVariant(opName, variant) {
  if (!variant || !variant.trim()) return;
  if (!operatorVariants._custom) operatorVariants._custom = {};
  if (!operatorVariants._custom[opName]) operatorVariants._custom[opName] = [];
  var trimmed = variant.trim();
  if (!operatorVariants._custom[opName].includes(trimmed)) {
    operatorVariants._custom[opName].push(trimmed);
  }
  // Merge: replace all occurrences of variant in positionData with canonical name
  mergeOperatorVariant(opName, trimmed);
  saveAll();
}

// Merge variant into canonical: replace in all position data + remove from operators list
function mergeOperatorVariant(canonical, variant) {
  var merged = 0;
  var variantCompact = compactNormalize(variant);

  // Go through all markets
  Object.keys(positionData).forEach(function(market) {
    var pd = positionData[market];
    Object.keys(pd).forEach(function(pageUrl) {
      var page = pd[pageUrl];
      if (!page.positions) return;
      page.positions.forEach(function(pos) {
        if (!pos.months) return;
        Object.keys(pos.months).forEach(function(m) {
          var md = pos.months[m];
          if (md.operator && md.operator !== canonical && compactNormalize(md.operator) === variantCompact) {
            md.operator = canonical;
            merged++;
          }
        });
      });
    });

    // Remove variant from operators list for this market
    if (operators[market]) {
      operators[market] = operators[market].filter(function(o) {
        if (o === canonical) return true;
        return compactNormalize(o) !== variantCompact;
      });
    }
  });

  // Also merge scrapeAlerts
  Object.keys(scrapeAlerts).forEach(function(market) {
    Object.keys(scrapeAlerts[market] || {}).forEach(function(pageUrl) {
      Object.keys(scrapeAlerts[market][pageUrl] || {}).forEach(function(posIdx) {
        var alert = scrapeAlerts[market][pageUrl][posIdx];
        if (alert.expected && compactNormalize(alert.expected) === variantCompact) alert.expected = canonical;
        if (alert.found && compactNormalize(alert.found) === variantCompact) alert.found = canonical;
      });
    });
  });

  return merged;
}

// Rename an operator everywhere (change canonical name)
function renameOperator(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return;
  var oldCompact = compactNormalize(oldName);

  Object.keys(positionData).forEach(function(market) {
    var pd = positionData[market];
    Object.keys(pd).forEach(function(pageUrl) {
      var page = pd[pageUrl];
      if (!page.positions) return;
      page.positions.forEach(function(pos) {
        if (!pos.months) return;
        Object.keys(pos.months).forEach(function(m) {
          if (pos.months[m].operator === oldName) pos.months[m].operator = newName;
        });
      });
    });

    // Update operators list
    if (operators[market]) {
      var idx = operators[market].indexOf(oldName);
      if (idx !== -1) {
        operators[market][idx] = newName;
        operators[market].sort(function(a, b) { return a.localeCompare(b, 'en'); });
      }
    }
  });

  // Transfer config
  if (operatorConfig[oldName]) {
    operatorConfig[newName] = Object.assign({}, operatorConfig[oldName], operatorConfig[newName] || {});
    delete operatorConfig[oldName];
  }

  // Transfer custom variants
  if (operatorVariants._custom && operatorVariants._custom[oldName]) {
    if (!operatorVariants._custom[newName]) operatorVariants._custom[newName] = [];
    operatorVariants._custom[newName] = operatorVariants._custom[newName].concat(operatorVariants._custom[oldName]);
    // Add old name as a variant of new name
    if (!operatorVariants._custom[newName].includes(oldName)) {
      operatorVariants._custom[newName].push(oldName);
    }
    delete operatorVariants._custom[oldName];
  }

  saveAll();
}

// Merge two operators: absorb source into target
function mergeOperators(targetName, sourceName) {
  if (!targetName || !sourceName || targetName === sourceName) return 0;
  var merged = 0;

  Object.keys(positionData).forEach(function(market) {
    var pd = positionData[market];
    Object.keys(pd).forEach(function(pageUrl) {
      var page = pd[pageUrl];
      if (!page.positions) return;
      page.positions.forEach(function(pos) {
        if (!pos.months) return;
        Object.keys(pos.months).forEach(function(m) {
          if (pos.months[m].operator === sourceName) {
            pos.months[m].operator = targetName;
            merged++;
          }
        });
      });
    });

    // Remove source from operators list
    if (operators[market]) {
      operators[market] = operators[market].filter(function(o) { return o !== sourceName; });
      // Ensure target exists
      if (!operators[market].includes(targetName)) {
        operators[market].push(targetName);
        operators[market].sort(function(a, b) { return a.localeCompare(b, 'en'); });
      }
    }
  });

  // Add source as variant of target
  addCustomVariant(targetName, sourceName);

  // Transfer config if source has some
  if (operatorConfig[sourceName]) {
    if (!operatorConfig[targetName]) operatorConfig[targetName] = {};
    Object.keys(operatorConfig[sourceName]).forEach(function(k) {
      if (!operatorConfig[targetName][k]) operatorConfig[targetName][k] = operatorConfig[sourceName][k];
    });
    delete operatorConfig[sourceName];
  }

  saveAll();
  return merged;
}

// Remove a custom variant for an operator
function removeCustomVariant(opName, variant) {
  if (!operatorVariants._custom || !operatorVariants._custom[opName]) return;
  operatorVariants._custom[opName] = operatorVariants._custom[opName].filter(function(v) { return v !== variant; });
  if (operatorVariants._custom[opName].length === 0) delete operatorVariants._custom[opName];
  saveAll();
}

function parseOperatorCSV(csvText) {
  var rows = parseCSV(csvText);
  operatorDB = {};
  operatorVariants = {};

  var totalOps = 0;
  var marketSet = {};

  rows.forEach(function(r) {
    var bookmaker = (r['Bookmaker'] || '').trim();
    if (!bookmaker) return;

    var marketRaw = r['Market'] || '';
    var market = cleanRef(marketRaw);
    if (!market) return;

    var am = cleanRef(r['Account Manager'] || '');
    var url = (r['URL'] || '').trim();
    var status = (r['Account status'] || '').trim();
    var license = (r['License'] || '').trim();
    var visitsRaw = (r['Monthly visits (Similarweb)'] || '').trim();
    var visits = parseNum(visitsRaw);
    var keyAccount = (r['Key account'] || '').trim().toLowerCase();

    // Detect base name by stripping market suffix
    var baseName = bookmaker;
    for (var i = 0; i < MARKET_SUFFIXES.length; i++) {
      if (bookmaker.toUpperCase().endsWith(MARKET_SUFFIXES[i])) {
        baseName = bookmaker.substring(0, bookmaker.length - MARKET_SUFFIXES[i].length).trim();
        break;
      }
    }

    // Parse fix fees and nb positions per month
    var fixFees = {};
    var nbPositions = {};
    MONTHS_2026.forEach(function(m) {
      var mm = m.split('/')[0], yy = m.split('/')[1];
      fixFees[m] = parseNum(getCol(r, 'Fix fees ' + mm + '/' + yy));
      nbPositions[m] = parseNum(getCol(r, 'Nb positions ' + mm + '/' + yy));
    });
    // Also parse 2025 months if available
    ['07/25','08/25','09/25','10/25','11/25','12/25'].forEach(function(m) {
      var mm = m.split('/')[0], yy = m.split('/')[1];
      fixFees[m] = parseNum(getCol(r, 'Fix fees ' + mm + '/' + yy));
    });

    var company = cleanRef(r['Company'] || '');
    var accountStatusDetail = (r['Status'] || '').trim();

    if (!operatorDB[market]) operatorDB[market] = {};
    operatorDB[market][bookmaker] = {
      baseName: baseName,
      displayName: bookmaker,
      am: am,
      url: url,
      status: status,
      license: license,
      visits: visits,
      keyAccount: keyAccount === 'yes',
      company: company,
      fixFees: fixFees,
      nbPositions: nbPositions
    };

    totalOps++;
    marketSet[market] = true;

    // Build variants for matching
    var normalized = normalizeOperatorName(bookmaker);
    operatorVariants[normalized] = bookmaker;
    // Also add baseName variant
    var normalizedBase = normalizeOperatorName(baseName);
    if (normalizedBase !== normalized) {
      operatorVariants[normalizedBase] = bookmaker;
    }
  });

  saveAll();
  return { totalOps: totalOps, marketCount: Object.keys(marketSet).length, markets: marketSet };
}

function matchOperator(scrapedName, market) {
  if (!scrapedName || !market) return null;

  var db = operatorDB[market];
  if (!db) return null;

  // 1. Exact match
  if (db[scrapedName]) return db[scrapedName];

  // 2. Case-insensitive exact match
  var scrapedLower = scrapedName.toLowerCase();
  for (var opName in db) {
    if (opName.toLowerCase() === scrapedLower) return db[opName];
  }

  // 3. BaseName match (strip market suffix from scrapedName)
  var scrapedBase = scrapedName;
  for (var i = 0; i < MARKET_SUFFIXES.length; i++) {
    if (scrapedName.toUpperCase().endsWith(MARKET_SUFFIXES[i])) {
      scrapedBase = scrapedName.substring(0, scrapedName.length - MARKET_SUFFIXES[i].length).trim();
      break;
    }
  }
  for (var opName2 in db) {
    if (db[opName2].baseName.toLowerCase() === scrapedBase.toLowerCase()) return db[opName2];
  }

  // 4. Normalized match via operatorVariants
  var normalizedScraped = normalizeOperatorName(scrapedName);
  var canonicalName = operatorVariants[normalizedScraped];
  if (canonicalName && db[canonicalName]) return db[canonicalName];

  // 5. Try normalized base
  var normalizedBase = normalizeOperatorName(scrapedBase);
  var canonicalBase = operatorVariants[normalizedBase];
  if (canonicalBase && db[canonicalBase]) return db[canonicalBase];

  // 6. Partial contains match (last resort)
  for (var opName3 in db) {
    var opLower = opName3.toLowerCase();
    if (opLower.includes(scrapedLower) || scrapedLower.includes(opLower)) {
      return db[opName3];
    }
  }

  return null;
}

function getOperatorDBInfo(opName, market) {
  if (!market) market = currentMarket;
  return matchOperator(opName, market);
}
