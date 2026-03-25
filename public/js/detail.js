// ==================== PAGE DETAIL ====================
function renderPageDetail(ct, pageUrl) {
  currentPageUrl = pageUrl;
  var pg = getPage(pageUrl);
  if (!pg) { showView('pages'); return; }
  var pd = getMarketPosData()[pageUrl];
  if (!pd) { showView('pages'); return; }

  var sold = getPageSold(pageUrl);
  var rev = getPageRevenue(pageUrl);
  var eftd = getPageEFTD(pageUrl);
  var conv = pd.conversion || 0;
  var monthLabel = isFullYear() ? 'Year 2026' : MONTH_LABELS[selectedMonth];
  var alertData = scrapeAlerts[currentMarket]?.[pageUrl] || {};

  ct.innerHTML = '\
    <button class="back-btn" onclick="goBack()">\u2190 Back</button>\
    <div class="page-header">\
      <div style="display:flex;align-items:center;gap:10px">\
        ' + (getSiteLogo(pg.siteName) ? '<img src="' + getSiteLogo(pg.siteName) + '" width="28" height="28" style="border-radius:3px;flex-shrink:0" onerror="this.style.display=\'none\'">' : '') + '\
        <h2 style="margin:0;line-height:1.2">' + esc(pg.article) + (hasAlerts(pageUrl) ? ' <span class="warn-icon">\u26A0\uFE0F</span>' : '') + '</h2>\
        <button class="btn-sm" onclick="showPageSettings(\'' + esc(pageUrl) + '\')" style="margin-left:4px" title="Page settings">\u2699\uFE0F</button>\
      </div>\
      <a href="' + esc(pg.url) + '" target="_blank" class="url">' + esc(pg.url) + '</a>\
      <div class="tags">\
        <span class="badge badge-primary">' + esc(pg.siteName) + '</span>\
        ' + (function() { var t = (pg.topic || pg.tags || ''); if (!t) return ''; return t.split(',').map(function(x) { x = x.trim(); return x ? '<span class="badge badge-purple">' + esc(x) + '</span>' : ''; }).join(' '); })() + '\
      </div>\
    </div>\
    <div class="stats-banner">\
      <div class="stat-item"><div class="stat-val cyan">' + fmt(pg.traffic) + '</div><div class="stat-lbl">Traffic</div></div>\
      <div class="stat-sep"></div>\
      <div class="stat-item"><div class="stat-val">' + (conv || 0) + '%</div><div class="stat-lbl">Conversion</div></div>\
      <div class="stat-sep"></div>\
      <div class="stat-item"><div class="stat-val" id="page-pos-value">' + pd.positions.length + '</div><div class="stat-lbl" id="page-sold-value">' + sold + ' sold / ' + (pd.positions.length - sold) + ' avail.</div></div>\
      <div class="stat-sep"></div>\
      <div class="stat-item"><div class="stat-val green" id="page-rev-value">' + fmtC(rev) + '</div><div class="stat-lbl">Revenue ' + monthLabel + '</div></div>\
      <div class="stat-sep"></div>\
      <div class="stat-item"><div class="stat-val cyan" id="page-eftd-value">' + fmt(eftd) + '</div><div class="stat-lbl">Est. eFTD</div></div>\
    </div>\
    ' + (!isFullYear() ? '<div class="propagation-note">Changes made for ' + MONTH_LABELS[selectedMonth] + ' are automatically propagated to the following months</div>' : '') + '\
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">\
      <h3 style="font-size:15px;font-weight:600">Positions</h3>\
      ' + getScanIcon(pageUrl) + '\
      ' + (function() { var ls = pd.lastScanned; if (!ls) return '<span style="font-size:11px;color:var(--text-muted)">Never scanned</span>'; var d = new Date(ls); return '<span style="font-size:11px;color:var(--text-muted)">Last scanned ' + d.toLocaleDateString("en", {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) + '</span>'; })() + '\
      ' + (pd.noRanking ? '<span class="badge" style="background:var(--yellow);color:#1a1a1a;font-size:10px;font-weight:700">No ranking</span>' : '') + '\
      <span style="font-size:12px;color:var(--text-muted)">(drag and drop to reorder)</span>\
      <button class="scrape-btn" id="scrape-btn" onclick="scrapePositions(\'' + esc(pageUrl) + '\')" ' + (isFullYear() || pd.noRanking ? 'disabled title="' + (pd.noRanking ? 'No ranking page' : 'Select a month') + '"' : '') + '>\uD83D\uDD0D Scan page</button>\
      <button class="btn-sm" onclick="addPositionManually(\'' + esc(pageUrl) + '\')" ' + (isFullYear() ? 'disabled title="Select a month"' : '') + ' style="margin-left:auto">+ Add position</button>\
      ' + (function() {
        var asanaUrl = typeof getSiteMarketAsanaUrl === 'function' ? getSiteMarketAsanaUrl(pg.siteName, currentMarket) : '';
        var disabled = isFullYear() || !asanaUrl;
        var title = !asanaUrl ? 'Configure Asana project URL in Sites Database first' : 'Create Asana task for position updates';
        return '<button class="btn-asana" onclick="showAsanaTaskModal(\'' + esc(pageUrl) + '\')" ' + (disabled ? 'disabled' : '') + ' title="' + title + '"><svg viewBox="0 0 32 32" fill="currentColor"><circle cx="16" cy="9" r="5"/><circle cx="7" cy="23" r="5"/><circle cx="25" cy="23" r="5"/></svg> Asana Task</button>';
      })() + '\
    </div>\
    <div id="positions-container"></div>\
    ' + renderLastScanResults(pd) + '';

  renderPositions(pageUrl);
}

function updateConversion(pageUrl, val) {
  var pd = positionData[currentMarket]?.[pageUrl];
  if (!pd) return;
  pd.conversion = parseFloat(val) || 0;
  savePos();
  // Update eFTD display in header and positions without full re-render
  var pg = getPage(pageUrl);
  if (!pg) return;
  var eftd = getPageEFTD(pageUrl);
  var eftdCard = document.getElementById('page-eftd-value');
  if (eftdCard) eftdCard.textContent = fmt(eftd);
  renderPositions(pageUrl);
}

function renderPositions(pageUrl) {
  var container = document.getElementById('positions-container');
  if (!container) return;
  var pd = positionData[currentMarket]?.[pageUrl];
  if (!pd) return;
  var pg = getPage(pageUrl);
  var traffic = pg?.traffic || 0;
  var conv = pd.conversion || 0;
  var alertData = scrapeAlerts[currentMarket]?.[pageUrl] || {};

  container.innerHTML = pd.positions.map(function(pos, idx) {
    var posNameLower = (pos.name || '').toLowerCase();
    var md = isFullYear() ? getMonthDataForMonth(pos, '01/26') : getMonthData(pos);
    var eftd = getPositionEFTD(traffic, conv, pos.name, idx, pd.positions.length);
    var ctr = getPositionCTR(pos.name, idx, pd.positions.length);
    var alert = alertData[idx];
    // Determine position status: free, sold, draft, offered
    var posStatus = 'free';
    var posStatusLabel = '<span style="color:var(--text-muted);font-size:11px">Free</span>';
    var isLocked = false;
    if (md.sold) {
      posStatus = 'sold';
      posStatusLabel = '<span style="color:var(--primary);font-size:11px;font-weight:600">Sold</span>';
    } else if (md.proposalStatus === 'draft') {
      posStatus = 'draft';
      posStatusLabel = '<span style="color:#8000c0;font-size:11px;font-weight:600">Draft</span>';
      isLocked = true;
    } else if (md.proposalStatus === 'offered') {
      posStatus = 'offered';
      posStatusLabel = '<span style="color:#8000c0;font-size:11px;font-weight:600">Offered</span>';
      isLocked = true;
    }
    var cardClass = alert ? 'mismatch' : (posStatus === 'sold' ? 'sold' : (isLocked ? 'proposed' : ''));
    var disabledAttr = (isFullYear() || isLocked) ? 'disabled' : '';
    // M-1 status
    var prevMonth = typeof getPreviousMonth === 'function' ? getPreviousMonth(selectedMonth) : null;
    var prevMd = prevMonth ? getMonthDataForMonth(pos, prevMonth) : {};
    var m1Label = prevMd.sold ? '<span class="badge badge-green" style="font-size:10px">Sold M-1' + (prevMd.operator ? ': ' + esc(prevMd.operator) : '') + '</span>' : '';

    // Price display: show price for sold, draft, offered
    var priceHtml = '';
    if (posStatus === 'sold') {
      priceHtml = '<input type="number" value="' + md.price + '" min="0" step="50" style="width:80px"' +
        ' oninput="updatePrice(\'' + esc(pageUrl) + '\',' + idx + ',this.value)"' +
        ' onchange="updatePrice(\'' + esc(pageUrl) + '\',' + idx + ',this.value)" ' + disabledAttr + '>';
    } else if (isLocked && md.price) {
      priceHtml = '<span style="color:#8000c0;font-size:12px;font-weight:600">' + fmtC(md.price) + '</span>';
    } else {
      priceHtml = '<span style="color:var(--text-muted);font-size:12px">-</span>';
    }

    return '<div class="pos-card ' + cardClass + '" draggable="true" data-index="' + idx + '"' +
      ' ondragstart="onDragStart(event)" ondragend="onDragEnd(event)"' +
      ' ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event,\'' + esc(pageUrl) + '\')"' +
      ' style="display:grid;grid-template-columns:24px 32px 1fr 80px 40px 60px 90px 80px 60px 28px;align-items:center;gap:8px">' +
      '<div class="drag-handle">\u2630</div>' +
      '<div class="pos-num">' + (posNameLower === 'banner' ? 'B' : posNameLower === 'link' ? 'L' : posNameLower === 'operator of the month' ? 'O' : (idx + 1)) + '</div>' +
      '<div class="pos-info">' +
        '<div class="pos-name">Position: ' + esc(pos.name) + ' \u00B7 CTR: ' + fmtP(ctr) + '</div>' +
        '<div class="pos-operator">' + (md.operator ? (function(){ var logo = getOperatorLogo(md.operator); return logo ? '<img src="' + logo + '" width="16" height="16" style="border-radius:2px;flex-shrink:0" onerror="this.style.display=\'none\'">' : ''; })() + '<span>' + esc(md.operator) + '</span>' : '<em>No operator</em>') + (alert ? ' <span class="warn-icon" title="Scrape: ' + esc(alert.found || 'absent') + ' (expected: ' + esc(alert.expected || md.operator) + ')">\u26A0\uFE0F</span>' : '') + '</div>' +
      '</div>' +
      '<div class="pos-eftd" title="Estimated eFTD">' + eftd.toFixed(1) + ' eFTD</div>' +
      '<div style="display:flex;align-items:center;justify-content:center"><label class="toggle">' +
        '<input type="checkbox" ' + (md.sold ? 'checked' : '') + ' onchange="toggleSold(\'' + esc(pageUrl) + '\',' + idx + ',this.checked)" ' + disabledAttr + '>' +
        '<span class="slider"></span>' +
      '</label></div>' +
      '<div style="display:flex;align-items:center">' + posStatusLabel + '</div>' +
      '<div>' + priceHtml + '</div>' +
      '<div>' + (m1Label || '<span style="font-size:11px;color:var(--text-muted)">-</span>') + '</div>' +
      '<div><button class="btn-sm" onclick="showOperatorSelector(\'' + esc(pageUrl) + '\',' + idx + ',this)" ' + disabledAttr + '>Change</button></div>' +
      '<div style="text-align:center"><button class="btn-sm" style="color:var(--red);border-color:var(--red);padding:2px 6px" onclick="deletePosition(\'' + esc(pageUrl) + '\',' + idx + ')" ' + disabledAttr + ' title="Delete position">\u2715</button></div>' +
    '</div>';
  }).join('');
}

// ==================== POSITION EDITING ====================
function toggleSold(pageUrl, posIdx, checked) {
  if (isFullYear()) return;
  var pd = positionData[currentMarket][pageUrl];
  var pos = pd.positions[posIdx];
  var md = Object.assign({}, getMonthData(pos), { sold: checked });
  if (!checked) md.price = 0;
  setMonthDataAndPropagate(pos, selectedMonth, md);
  savePos();
  renderPositions(pageUrl);
  // Update header stats
  var revEl = document.getElementById('page-rev-value');
  if (revEl) revEl.textContent = fmtC(getPageRevenue(pageUrl));
  var soldCount = getPageSold(pageUrl);
  var soldEl = document.getElementById('page-sold-value');
  if (soldEl) soldEl.textContent = soldCount + ' sold / ' + (pd.positions.length - soldCount) + ' available';
  var eftdEl = document.getElementById('page-eftd-value');
  if (eftdEl) eftdEl.textContent = fmt(getPageEFTD(pageUrl));
}

function updatePrice(pageUrl, posIdx, val) {
  if (isFullYear()) return;
  var pd = positionData[currentMarket][pageUrl];
  var pos = pd.positions[posIdx];
  var md = Object.assign({}, getMonthData(pos), { price: parseFloat(val) || 0 });
  setMonthDataAndPropagate(pos, selectedMonth, md);
  savePos();
  // Update header stats
  var revEl = document.getElementById('page-rev-value');
  if (revEl) revEl.textContent = fmtC(getPageRevenue(pageUrl));
  var soldCount = getPageSold(pageUrl);
  var soldEl = document.getElementById('page-sold-value');
  if (soldEl) soldEl.textContent = soldCount + ' sold / ' + (pd.positions.length - soldCount) + ' available';
  var eftdEl = document.getElementById('page-eftd-value');
  if (eftdEl) eftdEl.textContent = fmt(getPageEFTD(pageUrl));
}

// ==================== OPERATOR SELECTOR ====================
function showOperatorSelector(pageUrl, posIdx, anchor) {
  if (isFullYear()) return;
  document.querySelectorAll('.op-dropdown').forEach(function(d) { d.remove(); });
  var dd = document.createElement('div');
  dd.className = 'op-dropdown';
  var rect = anchor.getBoundingClientRect();
  dd.style.position = 'fixed';
  dd.style.top = (rect.bottom + 4) + 'px';
  dd.style.left = Math.min(rect.left, window.innerWidth - 270) + 'px';

  var ops = getMarketOperators();
  dd.innerHTML = '<input type="text" placeholder="Search..." id="op-search-input">' +
    '<div id="op-list-items"></div>';
  document.body.appendChild(dd);

  function renderList(filter) {
    var filtered = ops.filter(function(o) { return o.toLowerCase().includes(filter.toLowerCase()); });
    document.getElementById('op-list-items').innerHTML =
      filtered.map(function(o) { return '<div class="op-item" onclick="selectOperator(\'' + esc(pageUrl) + '\',' + posIdx + ',\'' + esc(o) + '\')">' + esc(o) + '</div>'; }).join('') +
      '<div class="op-item op-add" onclick="addNewOperator(\'' + esc(pageUrl) + '\',' + posIdx + ')">+ New operator...</div>';
  }
  renderList('');
  var input = document.getElementById('op-search-input');
  input.focus();
  input.oninput = function() { renderList(input.value); };

  setTimeout(function() {
    document.addEventListener('click', function close(e) {
      if (!dd.contains(e.target) && e.target !== anchor) { dd.remove(); document.removeEventListener('click', close); }
    });
  }, 10);
}

function selectOperator(pageUrl, posIdx, opName) {
  document.querySelectorAll('.op-dropdown').forEach(function(d) { d.remove(); });
  var pd = positionData[currentMarket][pageUrl];
  var pos = pd.positions[posIdx];
  var md = Object.assign({}, getMonthData(pos), { operator: opName });
  setMonthDataAndPropagate(pos, selectedMonth, md);
  savePos();
  renderPositions(pageUrl);
}

function addNewOperator(pageUrl, posIdx) {
  var name = prompt('New operator name:');
  if (!name || !name.trim()) return;
  if (!operators[currentMarket]) operators[currentMarket] = [];
  if (!operators[currentMarket].includes(name.trim())) {
    operators[currentMarket].push(name.trim());
    operators[currentMarket].sort(function(a, b) { return a.localeCompare(b, 'en'); });
    saveOps();
  }
  selectOperator(pageUrl, posIdx, name.trim());
}

// ==================== DELETE POSITION ====================
function deletePosition(pageUrl, posIdx) {
  if (!confirm('Delete position #' + (posIdx + 1) + '?')) return;
  var pd = positionData[currentMarket][pageUrl];
  if (!pd) return;
  pd.positions.splice(posIdx, 1);
  // Update page object
  var pg = getPage(pageUrl);
  if (pg) {
    pg.nbPos = pd.positions.length;
    pg.positions = pd.positions.map(function(p) { return p.name; });
  }
  // Clean alerts for this page
  if (scrapeAlerts[currentMarket]?.[pageUrl]) {
    delete scrapeAlerts[currentMarket][pageUrl];
    saveAlerts();
  }
  savePos();
  renderPageDetail(document.getElementById('main-content'), pageUrl);
}

// ==================== DRAG & DROP ====================
function onDragStart(e) {
  e.target.classList.add('dragging');
  e.dataTransfer.setData('text/plain', e.target.dataset.index);
}
function onDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.pos-card').forEach(function(c) { c.classList.remove('drag-over'); });
}
function onDragOver(e) {
  e.preventDefault();
  var card = e.target.closest('.pos-card');
  if (card) card.classList.add('drag-over');
}
function onDragLeave(e) {
  var card = e.target.closest('.pos-card');
  if (card) card.classList.remove('drag-over');
}
function onDrop(e, pageUrl) {
  e.preventDefault();
  var card = e.target.closest('.pos-card');
  if (!card) return;
  card.classList.remove('drag-over');
  var from = parseInt(e.dataTransfer.getData('text/plain'));
  var to = parseInt(card.dataset.index);
  if (from === to) return;
  var pd = positionData[currentMarket][pageUrl];
  var item = pd.positions.splice(from, 1)[0];
  pd.positions.splice(to, 0, item);
  savePos();
  renderPositions(pageUrl);
}

// ==================== OPERATOR DETAIL ====================
function renderOperatorDetail(ct, opName) {
  currentOperator = opName;
  var allOps = computeOperatorStats();
  var op = allOps.find(function(o) { return o.name === opName; });
  if (!op) { showView('operators'); return; }

  var monthLabel = isFullYear() ? 'Year 2026' : MONTH_LABELS[selectedMonth];
  var opNames = allOps.map(function(o) { return o.name; }).sort(function(a, b) { return a.localeCompare(b, 'en'); });

  // Deduplicate entries
  var seen = new Set();
  var uniqueEntries = op.entries.filter(function(e) {
    var key = e.pageUrl + '|' + e.posName;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Compute free/paid split
  var freeCount = op.totalCount - op.soldCount;
  var freeTraffic = 0, paidTraffic = 0, freeEFTD = 0, paidEFTD = 0;
  uniqueEntries.forEach(function(e) {
    if (e.sold) { paidTraffic += e.traffic; paidEFTD += e.eftd; }
    else { freeTraffic += e.traffic; freeEFTD += e.eftd; }
  });

  // Per-site breakdown
  var siteStats = {};
  uniqueEntries.forEach(function(e) {
    if (!siteStats[e.siteName]) siteStats[e.siteName] = { positions: 0, sold: 0, free: 0, traffic: 0, eftd: 0 };
    siteStats[e.siteName].positions++;
    if (e.sold) siteStats[e.siteName].sold++;
    else siteStats[e.siteName].free++;
    siteStats[e.siteName].traffic += e.traffic;
    siteStats[e.siteName].eftd += e.eftd;
  });

  // Operator DB info
  var dbInfo = getOperatorDBInfo(opName, currentMarket);
  var logo = getOperatorLogo(opName);
  var dbInfoHtml = '';
  if (dbInfo) {
    var infoParts = [];
    if (dbInfo.am) infoParts.push('<span style="margin-right:16px"><strong>AM:</strong> ' + esc(dbInfo.am) + '</span>');
    if (dbInfo.status) infoParts.push('<span style="margin-right:16px"><strong>Status:</strong> ' + esc(dbInfo.status) + '</span>');
    if (dbInfo.url) infoParts.push('<span style="margin-right:16px"><strong>URL:</strong> <a href="https://' + esc(dbInfo.url) + '" target="_blank" style="color:var(--primary)">' + esc(dbInfo.url) + '</a></span>');
    if (dbInfo.keyAccount) infoParts.push('<span class="badge badge-yellow" style="margin-left:8px">Key Account</span>');
    if (infoParts.length) {
      dbInfoHtml = '<div style="padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:3px;margin-bottom:16px;font-size:13px;display:flex;flex-wrap:wrap;align-items:center;gap:4px">' +
        infoParts.join('') + '</div>';
    }
  }

  // Variants count for settings button label
  var customVariants = getCustomVariants(opName);
  var variantsBadge = customVariants.length > 0 ? ' (' + customVariants.length + ' variant' + (customVariants.length > 1 ? 's' : '') + ')' : '';

  var statItem = function(val, label, color) { return '<div style="text-align:center"><div style="font-size:16px;font-weight:700;' + (color ? 'color:'+color : '') + '">' + val + '</div><div style="font-size:12px;color:var(--text-muted)">' + label + '</div></div>'; };

  ct.innerHTML = '\
    <button class="back-btn" onclick="goBack()">\u2190 Back</button>\
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:10px 16px;background:var(--surface);border:1px solid var(--border);border-radius:3px">\
      ' + (logo ? '<img src="' + logo + '" width="28" height="28" style="border-radius:3px" onerror="this.style.display=\'none\'">' : '') + '\
      <span style="font-size:18px;font-weight:700">' + esc(opName) + '</span>\
      <select onchange="showView(\'op-detail\', this.value)" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:3px;font-size:12px;margin-left:12px">\
        ' + opNames.map(function(n) { return '<option value="' + esc(n) + '" ' + (n === opName ? 'selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '\
      </select>\
      <button class="btn-sm" onclick="showOperatorSettings(\'' + esc(opName) + '\')" style="margin-left:8px" title="Operator settings">\u2699\uFE0F</button>\
      <div style="display:flex;gap:24px;margin-left:48px;flex:1;align-items:center;justify-content:space-around">' +
        statItem(op.totalCount, 'positions', '') +
        statItem(fmtC(op.totalRevenue), 'revenue', 'var(--green)') +
        statItem(fmt(op.totalTraffic), 'traffic', '') +
        statItem(fmt(op.totalEFTD), 'eFTD', 'var(--cyan)') +
      '</div>\
    </div>\
    ' + dbInfoHtml + '\
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">\
      <div style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:3px;display:flex;align-items:center;justify-content:space-around">\
        <h4 style="font-size:13px;color:var(--text-muted)">Paid positions</h4>' +
          statItem(op.soldCount, 'positions', 'var(--green)') +
          statItem(fmt(paidTraffic), 'traffic', '') +
          statItem(fmt(paidEFTD), 'eFTD', 'var(--cyan)') +
      '</div>\
      <div style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:3px;display:flex;align-items:center;justify-content:space-around">\
        <h4 style="font-size:13px;color:var(--text-muted)">Free positions</h4>' +
          statItem(freeCount, 'positions', '') +
          statItem(fmt(freeTraffic), 'traffic', '') +
          statItem(fmt(freeEFTD), 'eFTD', 'var(--cyan)') +
      '</div>\
    </div>\
    <h3 style="font-size:14px;margin-bottom:10px">Breakdown by site</h3>\
    <table style="margin-bottom:24px"><thead><tr><th>Site</th><th>Positions</th><th>Sold</th><th>Free</th><th>Traffic</th><th>eFTD</th></tr></thead><tbody>' +
    Object.entries(siteStats).sort(function(a, b) { return b[1].positions - a[1].positions; }).map(function(entry) {
      var siteLogo = getSiteLogo(entry[0]);
      return '<tr><td>' + (siteLogo ? '<img src="' + siteLogo + '" width="16" height="16" style="vertical-align:middle;margin-right:6px;border-radius:2px" onerror="this.style.display=\'none\'">' : '') + '<strong>' + esc(entry[0]) + '</strong></td>' +
        '<td>' + entry[1].positions + '</td>' +
        '<td><span class="badge badge-green">' + entry[1].sold + '</span></td>' +
        '<td>' + entry[1].free + '</td>' +
        '<td class="text-cyan">' + fmt(entry[1].traffic) + '</td>' +
        '<td class="text-cyan">' + fmt(entry[1].eftd) + '</td></tr>';
    }).join('') +
    '</tbody></table>\
    <h3 style="font-size:14px;margin-bottom:10px">Positions (' + uniqueEntries.length + ')</h3>\
    <table id="op-positions-table"><thead><tr>\
      <th data-sort="page">Page</th><th data-sort="site">Site</th><th data-sort="rank">Ranking</th><th data-sort="status">Status</th>\
      <th data-sort="price">Price</th><th data-sort="eftd">eFTD</th><th data-sort="traffic">Traffic</th>\
    </tr></thead><tbody id="op-positions-tbody">' +
    uniqueEntries.map(function(e) { return '<tr>' +
      '<td><strong class="clickable" onclick="showView(\'page-detail\',\'' + esc(e.pageUrl) + '\')" style="cursor:pointer;color:var(--primary)">' + esc(e.page) + '</strong><br><a href="' + esc(e.pageUrl) + '" target="_blank" style="font-size:11px;color:var(--text-muted)" onclick="event.stopPropagation()">' + esc(e.pageUrl) + '</a></td>' +
      '<td>' + esc(e.siteName) + '</td>' +
      '<td>#' + (e.posIdx + 1) + '</td>' +
      '<td>' + (e.sold ? '<span class="badge badge-green">Sold</span>' : '<span class="badge" style="background:var(--surface2)">Free</span>') + '</td>' +
      '<td class="text-green">' + (e.sold ? fmtC(e.price) : '-') + '</td>' +
      '<td class="text-cyan">' + e.eftd.toFixed(1) + '</td>' +
      '<td class="text-cyan">' + fmt(e.traffic) + '</td>' +
    '</tr>'; }).join('') +
    '</tbody></table>';

  setupSort('op-positions-table', function() {});
}

// ==================== OPERATOR SETTINGS MODAL ====================
function showOperatorSettings(opName) {
  // Find the market for this operator in operatorDB
  var opMarket = currentMarket || '';
  if (operatorDB[currentMarket] && operatorDB[currentMarket][opName]) {
    opMarket = currentMarket;
  } else {
    // Try to find by baseName match
    if (operatorDB[currentMarket]) {
      Object.keys(operatorDB[currentMarket]).forEach(function(key) {
        if (operatorsMatch(key, opName) || operatorsMatch(operatorDB[currentMarket][key].baseName || key, opName)) {
          opName = key;
          opMarket = currentMarket;
        }
      });
    }
  }
  // Open the unified modal from views.js
  showOperatorAMSettings(opName, opMarket);
}

// ==================== ADD PAGE MODAL ====================
function showAddPageModal() {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var sites = getMarketSites();
  var topicSet = {};
  getMarketPages().forEach(function(p) { if (p.topic) topicSet[p.topic] = true; });
  var topics = Object.keys(topicSet).sort();

  overlay.innerHTML = '<div class="modal">' +
    '<h3>Add a page</h3>' +
    '<label>Page URL</label>' +
    '<input type="url" id="add-url" placeholder="https://...">' +
    '<label>Article name</label>' +
    '<input type="text" id="add-article" placeholder="Article name">' +
    '<label>Site</label>' +
    '<select id="add-site"><option value="">Select...</option>' + sites.map(function(s) { return '<option>' + esc(s) + '</option>'; }).join('') + '<option value="__new">+ New site</option></select>' +
    '<label>Topic</label>' +
    '<select id="add-topic"><option value="">None</option>' + topics.map(function(t) { return '<option>' + esc(t) + '</option>'; }).join('') + '<option value="__new">+ New topic</option></select>' +
    '<label>Number of positions</label>' +
    '<input type="number" id="add-nbpos" value="10" min="1" max="30">' +
    '<label>Traffic (estimate)</label>' +
    '<input type="number" id="add-traffic" value="0" min="0">' +
    '<div class="modal-actions">' +
      '<button class="btn-cancel" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
      '<button class="btn-primary" onclick="addPage()">Add</button>' +
    '</div>' +
  '</div>';
  document.body.appendChild(overlay);
}

function addPage() {
  var url = document.getElementById('add-url').value.trim();
  var article = document.getElementById('add-article').value.trim();
  var site = document.getElementById('add-site').value;
  var topic = document.getElementById('add-topic').value;
  var nbPos = parseInt(document.getElementById('add-nbpos').value) || 10;
  var traffic = parseInt(document.getElementById('add-traffic').value) || 0;

  if (!url || !article) { showToast('URL and name required', 'warning'); return; }
  if (site === '__new') { site = prompt('New site name:'); if (!site) return; }
  if (topic === '__new') { topic = prompt('New topic name:'); if (!topic) return; }

  // Check if URL already exists
  if (getMarketPages().find(function(p) { return p.url === url; })) { showToast('This URL already exists', 'warning'); return; }

  // Add to allMarkets
  var pg = {
    article: article, siteName: site, url: url, positions: [],
    nbPos: nbPos, topic: topic || '', tags: '', area: '',
    traffic: traffic, trafficFeb: traffic, trafficSep: 0, trafficJuly: 0, fees: {}
  };
  for (var i = 1; i <= nbPos; i++) {
    pg.positions.push(String(i));
  }
  allMarkets[currentMarket].pages.push(pg);
  if (site && !allMarkets[currentMarket].sites.includes(site)) {
    allMarkets[currentMarket].sites.push(site);
    allMarkets[currentMarket].sites.sort();
  }

  // Add to positionData
  if (!positionData[currentMarket]) positionData[currentMarket] = {};
  positionData[currentMarket][url] = { positions: [], conversion: 0 };
  pg.positions.forEach(function(posName) {
    var pos = { name: posName, months: {} };
    MONTHS_2026.forEach(function(m) { pos.months[m] = { operator: '', sold: false, price: 0 }; });
    positionData[currentMarket][url].positions.push(pos);
  });

  savePos();
  document.querySelector('.modal-overlay')?.remove();
  showView('page-detail', url);
}

// ==================== SITE SETTINGS MODAL ====================
function showSiteConfig(siteName, event) {
  if (event) event.stopPropagation();
  var cfg = siteConfig[siteName] || {};

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'site-settings-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = '<div class="modal" style="max-width:480px">' +
    '<h3>\u2699\uFE0F ' + esc(siteName) + '</h3>' +

    '<div style="margin-bottom:16px">' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">' +
        '<label style="font-size:12px;width:80px">Name</label>' +
        '<input type="text" id="site-set-name" value="' + esc(siteName) + '" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">' +
        '<label style="font-size:12px;width:80px">URL</label>' +
        '<input type="text" id="site-set-url" value="' + esc(cfg.domain || '') + '" placeholder="site.com" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">' +
        '<label style="font-size:12px;width:80px">Logo URL</label>' +
        '<input type="text" id="site-set-logo" value="' + esc(cfg.logo || '') + '" placeholder="https://..." style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
        (cfg.logo ? '<img src="' + esc(cfg.logo) + '" width="24" height="24" style="border-radius:3px" onerror="this.style.display=\'none\'">' : '') +
      '</div>' +
    '</div>' +

    '<div style="padding-top:16px;border-top:1px solid var(--border)">' +
      '<button onclick="deleteSite(\'' + esc(siteName) + '\')" style="background:none;border:1px solid var(--red);color:var(--red);padding:6px 14px;border-radius:3px;cursor:pointer;font-size:13px">Delete this site and all its pages</button>' +
    '</div>' +

    '<div class="modal-actions">' +
      '<button class="btn-cancel" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
      '<button class="btn-primary" onclick="saveSiteSettings(\'' + esc(siteName) + '\')">Save</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);
}

function saveSiteSettings(oldName) {
  var newName = document.getElementById('site-set-name')?.value?.trim() || oldName;
  var url = document.getElementById('site-set-url')?.value?.trim();
  var logo = document.getElementById('site-set-logo')?.value?.trim();

  if (!siteConfig[oldName]) siteConfig[oldName] = {};
  if (url) {
    siteConfig[oldName].domain = url;
    if (!logo) siteConfig[oldName].logo = getFaviconUrl(url.replace(/^https?:\/\//, '').replace(/\/.*/, ''));
  }
  if (logo) siteConfig[oldName].logo = logo;

  // Rename site if changed
  if (newName !== oldName) {
    renameSite(oldName, newName);
  }

  saveAll();
  document.getElementById('site-settings-overlay')?.remove();
  renderCurrentView();
  showToast('Site settings saved', 'success');
}

function renameSite(oldName, newName) {
  // Update all pages in allMarkets
  Object.values(allMarkets).forEach(function(market) {
    market.pages.forEach(function(pg) {
      if (pg.siteName === oldName) pg.siteName = newName;
    });
    var idx = market.sites.indexOf(oldName);
    if (idx !== -1) { market.sites[idx] = newName; market.sites.sort(); }
  });
  // Transfer siteConfig
  if (siteConfig[oldName]) {
    siteConfig[newName] = Object.assign({}, siteConfig[oldName]);
    delete siteConfig[oldName];
  }
  saveAll();
}

function deleteSite(siteName) {
  if (!confirm('Delete "' + siteName + '" and ALL its pages? This cannot be undone.')) return;

  Object.keys(allMarkets).forEach(function(market) {
    var mk = allMarkets[market];
    // Remove position data for all pages of this site
    mk.pages.forEach(function(pg) {
      if (pg.siteName === siteName) {
        if (positionData[market]) delete positionData[market][pg.url];
        if (scrapeAlerts[market]) delete scrapeAlerts[market][pg.url];
      }
    });
    // Remove pages
    mk.pages = mk.pages.filter(function(pg) { return pg.siteName !== siteName; });
    // Remove site
    mk.sites = mk.sites.filter(function(s) { return s !== siteName; });
  });

  // Remove site config
  delete siteConfig[siteName];

  saveAll();
  document.getElementById('site-settings-overlay')?.remove();
  showView('sites');
  showToast('Site "' + siteName + '" deleted', 'success');
}

// ==================== PAGE SETTINGS MODAL ====================
function showPageSettings(pageUrl) {
  var pg = getPage(pageUrl);
  if (!pg) return;
  var pd = getMarketPosData()[pageUrl];
  var conv = pd ? (pd.conversion || 0) : 0;

  var sites = getMarketSites();
  var topicSet = {};
  getMarketPages().forEach(function(p) {
    if (p.topic) p.topic.split(',').forEach(function(t) { t = t.trim(); if (t) topicSet[t] = true; });
    if (p.tags) p.tags.split(',').forEach(function(t) { t = t.trim(); if (t) topicSet[t] = true; });
  });
  var topics = Object.keys(topicSet).sort();

  // Current topics for this page (merge topic + tags, deduplicate)
  // Preserve in-progress edits if re-opening for the same page
  if (window._pageSettingsUrl !== pageUrl || !window._pageSettingsTopics) {
    var currentTopicSet = {};
    if (pg.topic) pg.topic.split(',').forEach(function(t) { t = t.trim(); if (t) currentTopicSet[t] = true; });
    if (pg.tags) pg.tags.split(',').forEach(function(t) { t = t.trim(); if (t) currentTopicSet[t] = true; });
    window._pageSettingsTopics = Object.keys(currentTopicSet);
    window._pageSettingsUrl = pageUrl;
  }
  var currentTopics = window._pageSettingsTopics;

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'page-settings-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = '<div class="modal" style="max-width:480px">' +
    '<h3>\u2699\uFE0F Page settings</h3>' +

    '<div style="margin-bottom:16px">' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">' +
        '<label style="font-size:12px;width:60px">Name</label>' +
        '<input type="text" id="page-set-name" value="' + esc(pg.article) + '" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">' +
        '<label style="font-size:12px;width:60px">URL</label>' +
        '<input type="text" id="page-set-url" value="' + esc(pg.url) + '" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">' +
        '<label style="font-size:12px;width:60px">Site</label>' +
        '<select id="page-set-site" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
          sites.map(function(s) { return '<option value="' + esc(s) + '" ' + (s === pg.siteName ? 'selected' : '') + '>' + esc(s) + '</option>'; }).join('') +
        '</select>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:start">' +
        '<label style="font-size:12px;width:60px;margin-top:6px">Topics</label>' +
        '<div style="flex:1">' +
          '<div id="page-set-topics-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">' +
            currentTopics.map(function(t) {
              return '<span class="badge badge-purple" style="font-size:12px;display:inline-flex;align-items:center;gap:4px">' +
                esc(t) +
                '<button onclick="removePageTopic(this,\'' + esc(t) + '\')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:0 2px;line-height:1">\u2715</button>' +
              '</span>';
            }).join('') +
          '</div>' +
          '<div style="display:flex;gap:6px">' +
            '<select id="page-set-topic-select" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
              '<option value="">Add a topic...</option>' +
              topics.filter(function(t) { return !currentTopics.includes(t); }).map(function(t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('') +
              '<option value="__new">+ New topic...</option>' +
            '</select>' +
            '<button class="btn-sm" onclick="addPageTopic()">Add</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">' +
        '<label style="font-size:12px;width:60px">Traffic</label>' +
        '<input type="number" id="page-set-traffic" value="' + (pg.traffic || 0) + '" min="0" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">' +
        '<label style="font-size:12px;width:60px">Conv. %</label>' +
        '<input type="number" id="page-set-conversion" value="' + conv + '" min="0" max="100" step="0.1" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
      '</div>' +
    '</div>' +

    '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">' +
      '<label style="font-size:12px;width:60px">Auto-scan</label>' +
      '<label class="toggle" style="margin:0">' +
        '<input type="checkbox" id="page-set-autoscan" ' + (isAutoScanEnabled(pageUrl) ? 'checked' : '') + '>' +
        '<span class="slider"></span>' +
      '</label>' +
      '<span style="font-size:12px;color:var(--text-muted)">' + (isAutoScanEnabled(pageUrl) ? 'Enabled — page will be scanned weekly' : 'Disabled — positions are managed manually') + '</span>' +
    '</div>' +

    '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">' +
      '<label style="font-size:12px;width:60px">No ranking</label>' +
      '<label class="toggle" style="margin:0">' +
        '<input type="checkbox" id="page-set-noranking" ' + (pd && pd.noRanking ? 'checked' : '') + '>' +
        '<span class="slider"></span>' +
      '</label>' +
      '<span style="font-size:12px;color:var(--text-muted)">Mark as article without ranking</span>' +
    '</div>' +

    '<div style="padding-top:16px;border-top:1px solid var(--border)">' +
      '<button onclick="deletePage(\'' + esc(pageUrl) + '\')" style="background:none;border:1px solid var(--red);color:var(--red);padding:6px 14px;border-radius:3px;cursor:pointer;font-size:13px">Delete this page</button>' +
    '</div>' +

    '<div class="modal-actions">' +
      '<button class="btn-cancel" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
      '<button class="btn-primary" onclick="savePageSettings(\'' + esc(pageUrl) + '\')">Save</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);
}

function savePageSettings(oldUrl) {
  var pg = getPage(oldUrl);
  if (!pg) return;

  var newName = document.getElementById('page-set-name')?.value?.trim();
  var newUrl = document.getElementById('page-set-url')?.value?.trim();
  var newSite = document.getElementById('page-set-site')?.value;
  var topicsArr = window._pageSettingsTopics || [];
  var topicStr = topicsArr.join(', ');
  var newTraffic = parseInt(document.getElementById('page-set-traffic')?.value) || 0;
  var newConv = parseFloat(document.getElementById('page-set-conversion')?.value) || 0;

  if (newName) pg.article = newName;
  if (newSite) pg.siteName = newSite;
  pg.topic = topicStr;
  pg.tags = topicStr;
  pg.traffic = newTraffic;

  // Save conversion, auto-scan, and no-ranking in position data
  var pd = getMarketPosData()[oldUrl];
  if (pd) {
    pd.conversion = newConv;
    pd.autoScan = document.getElementById('page-set-autoscan')?.checked !== false;
    var wasNoRanking = pd.noRanking || false;
    pd.noRanking = document.getElementById('page-set-noranking')?.checked || false;
    // If noRanking is enabled, auto-disable scan and clear all positions
    if (pd.noRanking) {
      pd.autoScan = false;
      if (!wasNoRanking && pd.positions && pd.positions.length > 0) {
        pd.positions = [];
        var pgRef = getPage(oldUrl);
        if (pgRef) { pgRef.nbPos = 0; pgRef.positions = []; }
      }
    }
  }

  // URL changed — migrate position data
  if (newUrl && newUrl !== oldUrl) {
    if (positionData[currentMarket]) {
      positionData[currentMarket][newUrl] = positionData[currentMarket][oldUrl];
      delete positionData[currentMarket][oldUrl];
    }
    if (scrapeAlerts[currentMarket]?.[oldUrl]) {
      scrapeAlerts[currentMarket][newUrl] = scrapeAlerts[currentMarket][oldUrl];
      delete scrapeAlerts[currentMarket][oldUrl];
    }
    pg.url = newUrl;
  }

  window._pageSettingsTopics = null;
  window._pageSettingsUrl = null;
  saveAll();
  document.getElementById('page-settings-overlay')?.remove();
  renderPageDetail(document.getElementById('main-content'), pg.url);
  showToast('Page settings saved', 'success');
}

function addPageTopic() {
  var select = document.getElementById('page-set-topic-select');
  if (!select) return;
  var val = select.value;
  if (!val) return;
  if (val === '__new') {
    val = prompt('New topic name:');
    if (!val || !val.trim()) return;
    val = val.trim();
  }
  if (!window._pageSettingsTopics.includes(val)) {
    window._pageSettingsTopics.push(val);
  }
  // Re-render the modal
  document.getElementById('page-settings-overlay')?.remove();
  showPageSettings(window._pageSettingsUrl);
}

function removePageTopic(btn, topic) {
  window._pageSettingsTopics = window._pageSettingsTopics.filter(function(t) { return t !== topic; });
  document.getElementById('page-settings-overlay')?.remove();
  showPageSettings(window._pageSettingsUrl);
}

function deletePage(pageUrl) {
  if (!confirm('Delete this page and all its position data? This cannot be undone.')) return;

  // Remove from allMarkets
  Object.keys(allMarkets).forEach(function(market) {
    allMarkets[market].pages = allMarkets[market].pages.filter(function(pg) { return pg.url !== pageUrl; });
  });
  // Remove position data
  if (positionData[currentMarket]) delete positionData[currentMarket][pageUrl];
  if (scrapeAlerts[currentMarket]) delete scrapeAlerts[currentMarket][pageUrl];

  saveAll();
  document.getElementById('page-settings-overlay')?.remove();
  showView('pages');
  showToast('Page deleted', 'success');
}

// ==================== OPERATOR MANAGEMENT MODAL ====================
function showOpMgmt() {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'op-mgmt-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var ops = getMarketOperators();
  overlay.innerHTML = '<div class="modal">' +
    '<h3>Manage operators (' + currentMarket + ')</h3>' +
    '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<input type="text" id="new-op-name" placeholder="New operator...">' +
      '<button class="btn-primary" style="padding:8px 16px;border-radius:3px;border:none;background:var(--primary);color:#fff;cursor:pointer" onclick="addOpFromMgmt()">Add</button>' +
    '</div>' +
    '<div id="op-mgmt-list" style="max-height:400px;overflow-y:auto">' +
      ops.map(function(o) {
        var cfg = operatorConfig[o] || {};
        return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">' +
        (cfg.logo ? '<img src="' + esc(cfg.logo) + '" width="20" height="20" style="border-radius:2px" onerror="this.style.display=\'none\'">' : '<div style="width:20px;height:20px;background:var(--surface2);border-radius:2px"></div>') +
        '<span style="flex:1;font-weight:500">' + esc(o) + '</span>' +
        '<input type="color" value="' + (cfg.color || '#1b76bc') + '" title="Color" style="width:28px;height:28px;border:1px solid var(--border);border-radius:2px;cursor:pointer;padding:1px"' +
          ' onchange="updateOpConfig(\'' + esc(o) + '\',\'color\',this.value)">' +
        '<button onclick="promptOpLogo(\'' + esc(o) + '\')" style="background:var(--surface2);border:1px solid var(--border);border-radius:3px;padding:4px 8px;font-size:10px;cursor:pointer;color:var(--text)">Logo</button>' +
        '<button onclick="removeOp(\'' + esc(o) + '\')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px">\u2715</button>' +
      '</div>';
      }).join('') +
    '</div>' +
    '<div class="modal-actions"><button class="btn-cancel" onclick="this.closest(\'.modal-overlay\').remove()">Close</button></div>' +
  '</div>';
  document.body.appendChild(overlay);
}

function addOpFromMgmt() {
  var input = document.getElementById('new-op-name');
  var name = input.value.trim();
  if (!name) return;
  if (!operators[currentMarket]) operators[currentMarket] = [];
  if (!operators[currentMarket].includes(name)) {
    operators[currentMarket].push(name);
    operators[currentMarket].sort(function(a, b) { return a.localeCompare(b, 'en'); });
    saveOps();
  }
  document.getElementById('op-mgmt-overlay').remove();
  showOpMgmt();
}

function updateOpConfig(name, field, value) {
  if (!operatorConfig[name]) operatorConfig[name] = {};
  operatorConfig[name][field] = value;
  saveAll();
}
function promptOpLogo(name) {
  var url = prompt('Logo URL for ' + name + ':', (operatorConfig[name]?.logo || ''));
  if (url !== null) {
    updateOpConfig(name, 'logo', url);
    document.getElementById('op-mgmt-overlay').remove();
    showOpMgmt();
  }
}
function removeOp(name) {
  if (!operators[currentMarket]) return;
  operators[currentMarket] = operators[currentMarket].filter(function(o) { return o !== name; });
  saveOps();
  document.getElementById('op-mgmt-overlay').remove();
  showOpMgmt();
}

// ==================== OPERATOR DB IMPORT MODAL ====================
function showOperatorDBImport() {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'opdb-import-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var dbStats = '';
  var dbMarkets = Object.keys(operatorDB);
  if (dbMarkets.length > 0) {
    var totalOps = 0;
    dbMarkets.forEach(function(m) { totalOps += Object.keys(operatorDB[m]).length; });
    dbStats = '<div style="margin-bottom:16px;padding:10px 14px;background:var(--surface2);border-radius:3px;font-size:13px">' +
      '<strong>Current database:</strong> ' + totalOps + ' operators across ' + dbMarkets.length + ' market(s)' +
      '<div style="margin-top:6px;color:var(--text-muted);font-size:12px">' + dbMarkets.map(function(m) {
        return m + ' (' + Object.keys(operatorDB[m]).length + ')';
      }).join(', ') + '</div>' +
    '</div>';
  }

  overlay.innerHTML = '<div class="modal">' +
    '<h3>Operator Database Import</h3>' +
    '<p style="font-size:13px;color:var(--text-muted);margin-bottom:14px">Import a CSV file exported from Notion (BU - Operators) to enrich operator data with AM, status, license, traffic info.</p>' +
    dbStats +
    '<label>Operator CSV file</label>' +
    '<input type="file" id="opdb-file" accept=".csv" style="margin-bottom:12px">' +
    '<div id="opdb-result" style="display:none;margin-bottom:12px;padding:10px 14px;background:var(--surface2);border-radius:3px;font-size:13px"></div>' +
    '<div class="modal-actions">' +
      '<button class="btn-cancel" onclick="this.closest(\'.modal-overlay\').remove()">Close</button>' +
      '<button class="btn-primary" id="opdb-import-btn" onclick="processOperatorDBImport()">Import</button>' +
    '</div>' +
  '</div>';
  document.body.appendChild(overlay);
}

function processOperatorDBImport() {
  var fileInput = document.getElementById('opdb-file');
  if (!fileInput || !fileInput.files[0]) {
    showToast('Please select a CSV file', 'warning');
    return;
  }
  var btn = document.getElementById('opdb-import-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var result = parseOperatorCSV(e.target.result);
      var resultDiv = document.getElementById('opdb-result');
      if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<strong style="color:var(--green)">Import successful!</strong><br>' +
          result.totalOps + ' operators imported across ' + result.marketCount + ' market(s).<br>' +
          '<span style="color:var(--text-muted);font-size:12px">Markets: ' + Object.keys(result.markets).join(', ') + '</span>';
      }
      showToast('Operator DB imported: ' + result.totalOps + ' operators, ' + result.marketCount + ' markets', 'success');
    } catch(err) {
      showToast('Import error: ' + err.message, 'error');
      var resultDiv = document.getElementById('opdb-result');
      if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<strong style="color:var(--red)">Error:</strong> ' + esc(err.message);
      }
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Import'; }
  };
  reader.readAsText(fileInput.files[0]);
}

// ==================== ASANA TASK CREATION ====================

function showAsanaTaskModal(pageUrl) {
  var pg = getPage(pageUrl);
  var pd = getMarketPosData()[pageUrl];
  if (!pg || !pd) return;

  var existing = document.getElementById('asana-modal');
  if (existing) existing.remove();

  var contact = typeof getSiteMarketContact === 'function' ? getSiteMarketContact(pg.siteName, currentMarket) : { name: '', email: '' };
  var asanaUrl = typeof getSiteMarketAsanaUrl === 'function' ? getSiteMarketAsanaUrl(pg.siteName, currentMarket) : '';

  // Default deadline: 7 days from now
  var defDate = new Date();
  defDate.setDate(defDate.getDate() + 7);
  var defDateStr = defDate.toISOString().split('T')[0];

  // Build positions list with checkboxes
  var posRows = pd.positions.map(function(pos, idx) {
    var md = getMonthData(pos);
    var statusText = 'Free';
    var statusColor = 'var(--text-muted)';
    if (md.sold) { statusText = 'Sold'; statusColor = 'var(--primary)'; }
    else if (md.proposalStatus === 'draft') { statusText = 'Draft'; statusColor = '#8000c0'; }
    else if (md.proposalStatus === 'offered') { statusText = 'Offered'; statusColor = '#8000c0'; }

    var opDisplay = md.operator ? esc(md.operator) : '<em style="color:var(--text-muted)">—</em>';

    return '<tr>' +
      '<td style="text-align:center"><input type="checkbox" class="asana-pos-check" data-idx="' + idx + '" checked></td>' +
      '<td style="font-weight:600">' + esc(pos.name) + '</td>' +
      '<td>' + opDisplay + '</td>' +
      '<td style="color:' + statusColor + ';font-weight:600">' + statusText + '</td>' +
    '</tr>';
  }).join('');

  var contactDisplay = '';
  if (contact.name && contact.email) contactDisplay = esc(contact.name) + ' (' + esc(contact.email) + ')';
  else if (contact.email) contactDisplay = esc(contact.email);
  else if (contact.name) contactDisplay = esc(contact.name);
  else contactDisplay = '<span style="color:var(--red)">No contact configured</span>';

  var overlay = document.createElement('div');
  overlay.id = 'asana-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '\
    <div class="modal" style="width:700px">\
      <div class="modal-header">\
        <h3 style="font-size:16px;font-weight:700;margin:0">Create Asana Task</h3>\
        <button onclick="closeAsanaModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted)">&times;</button>\
      </div>\
      <div style="display:flex;flex-direction:column;gap:14px">\
        <div style="background:var(--surface2);padding:10px 14px;border-radius:3px;font-size:13px">\
          <strong>' + esc(pg.article) + '</strong><br>\
          <span style="color:var(--text-muted)">' + esc(pg.siteName) + ' \u00B7 ' + getFlag(currentMarket) + ' ' + esc(currentMarket) + '</span>\
        </div>\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Task Title</label>\
          <input type="text" id="asana-task-title" value="Position update: ' + esc(pg.article).replace(/"/g, '&quot;') + ' (' + esc(currentMarket) + ')" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        </div>\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px">Positions to include</label>\
          <table class="data-table" style="font-size:12px">\
            <thead><tr>\
              <th style="text-align:center;width:30px"><input type="checkbox" checked onchange="toggleAllAsanaPos(this.checked)"></th>\
              <th>Position</th>\
              <th>Operator</th>\
              <th>Status</th>\
            </tr></thead>\
            <tbody>' + posRows + '</tbody>\
          </table>\
        </div>\
        <div style="display:flex;gap:12px">\
          <div style="flex:1">\
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Deadline</label>\
            <input type="date" id="asana-deadline" value="' + defDateStr + '" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
          </div>\
          <div style="flex:1">\
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Assignee</label>\
            <div style="padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface2);font-size:13px">' + contactDisplay + '</div>\
          </div>\
        </div>\
        <div style="font-size:12px;color:var(--text-muted)">\
          Project: <a href="' + esc(asanaUrl) + '" target="_blank" style="color:var(--primary)">' + esc(asanaUrl || 'Not configured') + '</a>\
        </div>\
        <div class="modal-actions">\
          <button class="btn-cancel" onclick="closeAsanaModal()">Cancel</button>\
          <button class="btn-primary" id="asana-submit-btn" onclick="doCreateAsanaTask(\'' + esc(pageUrl).replace(/'/g, "\\'") + '\')">Create Task</button>\
        </div>\
      </div>\
    </div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeAsanaModal(); });
}

function toggleAllAsanaPos(checked) {
  document.querySelectorAll('.asana-pos-check').forEach(function(cb) { cb.checked = checked; });
}

function closeAsanaModal() {
  var modal = document.getElementById('asana-modal');
  if (modal) modal.remove();
}

async function doCreateAsanaTask(pageUrl) {
  var pg = getPage(pageUrl);
  var pd = getMarketPosData()[pageUrl];
  if (!pg || !pd) return;

  var btn = document.getElementById('asana-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

  var taskName = (document.getElementById('asana-task-title').value || '').trim();
  var deadline = document.getElementById('asana-deadline').value;
  var contact = typeof getSiteMarketContact === 'function' ? getSiteMarketContact(pg.siteName, currentMarket) : { name: '', email: '' };
  var asanaUrl = typeof getSiteMarketAsanaUrl === 'function' ? getSiteMarketAsanaUrl(pg.siteName, currentMarket) : '';

  // Gather selected positions
  var checks = document.querySelectorAll('.asana-pos-check');
  var selectedPositions = [];
  checks.forEach(function(cb) {
    if (cb.checked) {
      var idx = parseInt(cb.getAttribute('data-idx'));
      var pos = pd.positions[idx];
      var md = getMonthData(pos);
      selectedPositions.push({ name: pos.name, idx: idx, md: md });
    }
  });

  if (selectedPositions.length === 0) {
    showToast('Select at least one position', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Create Task'; }
    return;
  }

  // Build Asana html_notes (Asana supports limited HTML: p, strong, em, ul, ol, li, a, br)
  var htmlNotes = '<body>';
  htmlNotes += '<strong>Page:</strong> ' + escHtml(pg.article) + '\n';
  htmlNotes += '<a href="' + escHtml(pg.url) + '">' + escHtml(pg.url) + '</a>\n\n';
  htmlNotes += '<strong>Site:</strong> ' + escHtml(pg.siteName) + ' | <strong>Market:</strong> ' + escHtml(currentMarket) + '\n\n';
  htmlNotes += '<strong>Positions:</strong>\n';
  htmlNotes += '<ul>';
  selectedPositions.forEach(function(sp) {
    var status = sp.md.sold ? 'Sold' : 'Free';
    if (sp.md.proposalStatus === 'draft') status = 'Draft';
    else if (sp.md.proposalStatus === 'offered') status = 'Offered';
    var line = '<strong>' + escHtml(sp.name) + '</strong>';
    line += ' — ' + status;
    if (sp.md.operator) line += ' — ' + escHtml(sp.md.operator);
    htmlNotes += '<li>' + line + '</li>';
  });
  htmlNotes += '</ul>\n';
  htmlNotes += '<em>Created from Rankings Management App</em>';
  htmlNotes += '</body>';

  try {
    var resp = await fetch('/api/asana/create-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        taskName: taskName,
        htmlNotes: htmlNotes,
        dueDate: deadline,
        assigneeEmail: contact.email || '',
        projectUrl: asanaUrl
      })
    });
    var result = await resp.json();
    if (result.success) {
      closeAsanaModal();
      var warningMsg = result.warnings && result.warnings.length ? ' (' + result.warnings.join(', ') + ')' : '';
      showToast('Asana task created!' + warningMsg, 'success', 6000);
    } else {
      showToast('Error: ' + (result.error || 'Unknown error'), 'error', 6000);
      if (btn) { btn.disabled = false; btn.textContent = 'Create Task'; }
    }
  } catch(e) {
    showToast('Network error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Create Task'; }
  }
}

// HTML escape helper for Asana notes
function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
