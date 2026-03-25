// ==================== SCRAPING ====================

// Check if auto-scan is enabled for a page
function isAutoScanEnabled(pageUrl) {
  var pd = getMarketPosData()[pageUrl];
  if (!pd) return true; // default enabled
  return pd.autoScan !== false; // default true unless explicitly set to false
}

// Toggle auto-scan for a page
function toggleAutoScan(pageUrl, enabled) {
  var pd = getMarketPosData()[pageUrl];
  if (!pd) return;
  pd.autoScan = enabled;
  savePos();
}

// Get scan status icon for a page
function getScanIcon(pageUrl) {
  if (isAutoScanEnabled(pageUrl)) {
    return '<span title="Auto-scan enabled" style="cursor:help;font-size:13px;color:var(--green)">\u25CF</span>';
  } else {
    return '<span title="Auto-scan disabled" style="cursor:help;font-size:13px;color:var(--red)">\u25CF</span>';
  }
}

// Manual scan (button click)
async function scrapePositions(pageUrl) {
  var btn = document.getElementById('scrape-btn');
  if (btn) { btn.disabled = true; btn.textContent = '\u23F3 Scanning...'; }

  try {
    var resp = await fetch('/api/scrape?url=' + encodeURIComponent(pageUrl));
    var data = await resp.json();

    if (!data.success || !data.positions?.length) {
      showToast('No positions found. The page may use geolocation-restricted content. You can add positions manually below.', 'warning', 6000);
      // Auto-disable scan for this page since it doesn't work
      if (isAutoScanEnabled(pageUrl)) {
        toggleAutoScan(pageUrl, false);
        showToast('Auto-scan has been disabled for this page (can be re-enabled in settings).', 'info', 5000);
        renderPageDetail(document.getElementById('main-content'), pageUrl);
      }
      return;
    }

    processScrapeResults(pageUrl, data.positions);
  } catch (err) {
    showToast('Scan error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDD0D Scan page'; }
  }
}

// Process scan results (shared between manual and auto scan)
function processScrapeResults(pageUrl, scrapedOps) {
  var pd = positionData[currentMarket][pageUrl];
  if (!pd) return;

  // Record last scan timestamp and raw results
  pd.lastScanned = new Date().toISOString();
  pd.lastScanResults = scrapedOps.map(function(s) { return { raw: s.name }; });

  // Clear previous alerts for this page
  if (!scrapeAlerts[currentMarket]) scrapeAlerts[currentMarket] = {};
  scrapeAlerts[currentMarket][pageUrl] = {};

  var month = isFullYear() ? '01/26' : selectedMonth;
  var scrapedCount = scrapedOps.length;

  // Separate existing positions into named (Banner, Link) and numbered
  // Remove unsold banner/link positions during scan
  var namedPositions = [];
  var numberedPositions = [];
  pd.positions.forEach(function(pos, origIdx) {
    var nameLower = (pos.name || '').toLowerCase();
    if (nameLower === 'banner' || nameLower === 'link' || nameLower === 'operator of the month') {
      var md = getMonthDataForMonth(pos, month);
      if (md.sold && md.operator) {
        // Keep sold banner/link positions
        namedPositions.push(Object.assign({}, pos, { _origIdx: origIdx }));
      }
      // Skip unsold banner/link — they get removed
    } else {
      numberedPositions.push(Object.assign({}, pos, { _origIdx: origIdx }));
    }
  });

  var currentNumberedCount = numberedPositions.length;
  var positionsChanged = false;

  // Adjust position count to match live page
  if (scrapedCount > currentNumberedCount) {
    for (var i = currentNumberedCount; i < scrapedCount; i++) {
      var newPos = { name: String(i + 1), months: {} };
      MONTHS_2026.forEach(function(m) { newPos.months[m] = { operator: '', sold: false, price: 0 }; });
      numberedPositions.push(newPos);
    }
    positionsChanged = true;
  } else if (scrapedCount < currentNumberedCount) {
    while (numberedPositions.length > scrapedCount) {
      var last = numberedPositions[numberedPositions.length - 1];
      var md = getMonthDataForMonth(last, month);
      if (md.sold && md.operator) break;
      numberedPositions.pop();
      positionsChanged = true;
    }
  }

  // Rebuild positions array: named first, then numbered
  pd.positions = namedPositions.concat(numberedPositions).map(function(p) {
    var pos = Object.assign({}, p);
    delete pos._origIdx;
    return pos;
  });

  var numberedStartIdx = namedPositions.length;

  // Check if operator is in the operator DB for this market
  function isInOperatorDB(name) {
    var db = operatorDB[currentMarket] || {};
    // Direct match
    for (var opKey in db) {
      if (operatorsMatch(opKey, name) || operatorsMatch(db[opKey].baseName || opKey, name)) return true;
    }
    return false;
  }

  scrapedOps.forEach(function(scraped, scrIdx) {
    var posIdx = numberedStartIdx + scrIdx;
    if (posIdx >= pd.positions.length) return;

    var pos = pd.positions[posIdx];
    var md = getMonthDataForMonth(pos, month);
    var resolvedName = resolveOperatorName(scraped.name, currentMarket);

    var inDB = isInOperatorDB(resolvedName);

    if (md.sold && md.operator) {
      // Position filled & sold
      if (!operatorsMatch(md.operator, resolvedName)) {
        scrapeAlerts[currentMarket][pageUrl][posIdx] = {
          type: 'sold_mismatch',
          expected: md.operator,
          found: scraped.name + (resolvedName !== scraped.name ? ' \u2192 ' + resolvedName : '')
        };
      }
    } else if (md.operator && !md.sold) {
      // Position filled & free
      if (inDB) {
        if (!isFullYear()) {
          pos.months[month] = { operator: resolvedName, sold: false, price: 0 };
        }
      } else {
        scrapeAlerts[currentMarket][pageUrl][posIdx] = {
          type: 'unknown_operator',
          found: scraped.name + (resolvedName !== scraped.name ? ' \u2192 ' + resolvedName : ''),
          reason: 'Operator not in DB'
        };
      }
    } else {
      // Position empty
      if (inDB) {
        if (!isFullYear()) {
          pos.months[month] = { operator: resolvedName, sold: false, price: 0 };
        }
      } else {
        // Leave position empty, alert
        scrapeAlerts[currentMarket][pageUrl][posIdx] = {
          type: 'unknown_operator',
          found: scraped.name + (resolvedName !== scraped.name ? ' \u2192 ' + resolvedName : ''),
          reason: 'Operator not in DB — position left empty'
        };
      }
    }
  });

  var pg = getPage(pageUrl);
  if (pg) {
    pg.nbPos = pd.positions.length;
    pg.positions = pd.positions.map(function(p) { return p.name; });
  }

  if (Object.keys(scrapeAlerts[currentMarket][pageUrl]).length === 0) {
    delete scrapeAlerts[currentMarket][pageUrl];
  }

  savePos();
  saveAlerts();
  renderPageDetail(document.getElementById('main-content'), pageUrl);

  var alertCount = Object.keys(scrapeAlerts[currentMarket]?.[pageUrl] || {}).length;
  var msg = 'Scan: ' + scrapedCount + ' operators found.';
  if (positionsChanged) msg += ' Positions adjusted (' + currentNumberedCount + ' \u2192 ' + Math.min(scrapedCount, pd.positions.length - namedPositions.length) + ').';
  if (alertCount > 0) {
    showToast(msg + ' ' + alertCount + ' difference(s) detected!', 'warning', 6000);
  } else {
    showToast(msg + ' No differences.', 'success');
  }
}

// Add position manually
function addPositionManually(pageUrl) {
  var pd = positionData[currentMarket]?.[pageUrl];
  if (!pd) return;

  var name = prompt('Position name (e.g. "Banner", "Link", "Operator of the month", or leave empty for numbered):');
  if (name === null) return; // cancelled

  name = name.trim();
  if (!name) {
    // Auto-number: find highest numbered position
    var maxNum = 0;
    pd.positions.forEach(function(p) {
      var n = parseInt(p.name);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });
    name = String(maxNum + 1);
  }

  var newPos = { name: name, months: {} };
  MONTHS_2026.forEach(function(m) { newPos.months[m] = { operator: '', sold: false, price: 0 }; });

  // Banner/Link go to the top, numbered positions go to the end
  var nameLower = name.toLowerCase();
  if (nameLower === 'banner' || nameLower === 'link' || nameLower === 'operator of the month') {
    pd.positions.unshift(newPos);
  } else {
    pd.positions.push(newPos);
  }

  var pg = getPage(pageUrl);
  if (pg) {
    pg.nbPos = pd.positions.length;
    pg.positions = pd.positions.map(function(p) { return p.name; });
  }

  savePos();
  renderPageDetail(document.getElementById('main-content'), pageUrl);
  showToast('Position "' + name + '" added', 'success');
}

// Render last scan results block (informational only)
function renderLastScanResults(pd) {
  if (!pd || !pd.lastScanResults || !pd.lastScanResults.length) return '';

  var rows = pd.lastScanResults.map(function(r, i) {
    var resolved = resolveOperatorName(r.raw, currentMarket);
    var inDB = (function(name) {
      var db = operatorDB[currentMarket] || {};
      for (var opKey in db) {
        if (operatorsMatch(opKey, name) || operatorsMatch(db[opKey].baseName || opKey, name)) return true;
      }
      return false;
    })(resolved);

    var statusIcon = inDB
      ? '<span style="color:var(--green)" title="In Operator DB">✓</span>'
      : '<span style="color:var(--red)" title="Not in Operator DB">✗</span>';

    var resolvedCol = resolved !== r.raw
      ? '<td style="padding:4px 10px;font-size:12px;color:var(--text)">' + esc(resolved) + '</td>'
      : '<td style="padding:4px 10px;font-size:12px;color:var(--text-muted)">—</td>';

    return '<tr style="border-bottom:1px solid var(--border)">' +
      '<td style="padding:4px 10px;font-size:12px;color:var(--text-muted);text-align:center">' + (i + 1) + '</td>' +
      '<td style="padding:4px 10px;font-size:12px;font-family:monospace;color:var(--text)">' + esc(r.raw) + '</td>' +
      resolvedCol +
      '<td style="padding:4px 10px;text-align:center">' + statusIcon + '</td>' +
      '</tr>';
  }).join('');

  return '<details style="margin-top:20px">' +
    '<summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--text-muted);user-select:none">Last scan raw results (' + pd.lastScanResults.length + ' elements)</summary>' +
    '<div style="margin-top:8px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">' +
    '<table style="width:100%;border-collapse:collapse">' +
    '<thead><tr style="background:var(--surface2)">' +
    '<th style="padding:6px 10px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:center">#</th>' +
    '<th style="padding:6px 10px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Raw scraped</th>' +
    '<th style="padding:6px 10px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Resolved</th>' +
    '<th style="padding:6px 10px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:center">In DB</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div></details>';
}
