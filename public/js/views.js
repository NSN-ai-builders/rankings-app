// ==================== MARKET SCREEN ====================
function showMarketScreen() {
  document.getElementById('market-screen').style.display = 'block';
  document.getElementById('app-screen').style.display = 'none';
  currentMarket = null;

  var grid = document.getElementById('market-grid');
  var markets = Object.keys(allMarkets).sort(function(a, b) {
    return allMarkets[b].pages.length - allMarkets[a].pages.length;
  });

  grid.innerHTML = markets.map(function(market) {
    var mk = allMarkets[market];
    var pd = positionData[market] || {};
    var totalPos = 0, soldPos = 0, totalRev = 0;
    Object.values(pd).forEach(function(pageData) {
      pageData.positions?.forEach(function(pos) {
        totalPos++;
        var md = getMonthDataForMonth(pos, '01/26');
        if (md.sold) { soldPos++; totalRev += md.price; }
      });
    });
    return '<div class="market-card" onclick="enterMarket(\'' + esc(market) + '\')">' +
      '<div class="name">' + getFlag(market) + ' ' + esc(market) + '</div>' +
      '<div class="stats">' +
        '<span>' + mk.sites.length + '</span> sites \u00B7 <span>' + mk.pages.length + '</span> pages \u00B7 <span>' + totalPos + '</span> positions<br>' +
        '<span class="text-green">' + soldPos + '</span> sold \u00B7 <span class="text-green">' + fmtC(totalRev) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function enterMarket(market) {
  currentMarket = market;
  if (typeof applyGSCTraffic === 'function') applyGSCTraffic();
  document.getElementById('market-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('market-flag-top').textContent = getFlag(market);
  document.getElementById('market-name-top').textContent = market;
  buildMonthSelector();
  buildTabs();
  showView('dashboard');
}

// ==================== TABS ====================
function buildTabs() {
  var tabs = document.getElementById('main-tabs');
  var views = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'sites', label: 'By Site' },
    { id: 'pages', label: 'By Page' },
    { id: 'operators', label: 'By Operator' },
    { id: 'available', label: 'Available' },
    { id: 'sold', label: 'Sold' },
    { id: 'scan-log', label: 'Scan Log' }
  ];
  tabs.innerHTML = views.map(function(v) {
    return '<button data-view="' + v.id + '" onclick="showView(\'' + v.id + '\')">' + v.label + '</button>';
  }).join('');
}

function buildMonthSelector() {
  var sel = document.getElementById('month-select');
  sel.innerHTML = MONTHS_2026.map(function(m) {
    return '<option value="' + m + '" ' + (m === selectedMonth ? 'selected' : '') + '>' + MONTH_LABELS[m] + '</option>';
  }).join('') + '<option value="full_year" ' + (selectedMonth === 'full_year' ? 'selected' : '') + '>Full year</option>';
}

function onMonthChange() {
  selectedMonth = document.getElementById('month-select').value;
  renderCurrentView();
}

// ==================== VIEW SYSTEM ====================
var viewHistory = [];

function goBack() {
  if (viewHistory.length > 0) {
    var prev = viewHistory.pop();
    showView(prev.name, prev.data, true);
  } else {
    showView('dashboard', null, true);
  }
}

function showView(name, data, isBack) {
  // Push current view to history (unless navigating back or same view)
  if (!isBack && currentView && !(currentView === name && !data)) {
    var historyEntry = { name: currentView };
    if (currentView === 'page-detail' && currentPageUrl) historyEntry.data = currentPageUrl;
    if (currentView === 'op-detail' && currentOperator) historyEntry.data = currentOperator;
    viewHistory.push(historyEntry);
    // Limit history size
    if (viewHistory.length > 50) viewHistory.shift();
  }

  currentView = name;
  if (name !== 'page-detail') currentPageUrl = null;
  if (name !== 'op-detail') currentOperator = null;

  // Update tab active state
  document.querySelectorAll('#main-tabs button').forEach(function(b) {
    b.classList.toggle('active', b.dataset.view === name);
  });

  renderCurrentView(data);
}

function renderCurrentView(data) {
  destroyCharts();
  var ct = document.getElementById('main-content');

  switch (currentView) {
    case 'dashboard': renderDashboard(ct); break;
    case 'sites': renderSitesView(ct); break;
    case 'pages': renderPagesView(ct); break;
    case 'operators': renderOperatorsListView(ct); break;
    case 'available': renderAvailableView(ct); break;
    case 'sold': renderSoldView(ct); break;
    case 'scan-log': renderScanLogView(ct); break;
    case 'op-detail': renderOperatorDetail(ct, data || currentOperator); break;
    case 'page-detail': renderPageDetail(ct, data || currentPageUrl); break;
    default: renderDashboard(ct);
  }
}

// ==================== DASHBOARD ====================
function renderDashboard(ct) {
  var pages = getMarketPages();
  var pd = getMarketPosData();
  var months = getActiveMonths();

  // Compute stats
  var totalPos = 0, soldPos = 0, totalRev = 0, totalTraffic = 0, totalEFTD = 0;
  var siteRevenue = {};
  var siteTraffic = {};
  var opRevenue = {};

  // Collect available positions (unsold, with eFTD)
  var availablePositions = [];
  // Collect all mismatches
  var allMismatches = [];

  pages.forEach(function(pg) {
    totalTraffic += pg.traffic;
    var pgPd = pd[pg.url];
    if (!pgPd) return;
    var conv = pgPd.conversion || 0;

    pgPd.positions.forEach(function(pos, idx) {
      totalPos++;
      var md = getMonthData(pos);
      if (md.sold) {
        soldPos++;
        totalRev += md.price;
        // Aggregate revenue by operator
        if (md.operator) {
          if (!opRevenue[md.operator]) opRevenue[md.operator] = 0;
          opRevenue[md.operator] += md.price;
        }
      } else {
        // Available position
        var eftd = getPositionEFTD(pg.traffic, conv, pos.name, idx, pgPd.positions.length);
        if (eftd > 0) {
          availablePositions.push({
            page: pg.article, pageUrl: pg.url, siteName: pg.siteName,
            posName: pos.name, posIdx: idx, eftd: eftd, traffic: pg.traffic,
            operator: md.operator || ''
          });
        }
      }
      totalEFTD += getPositionEFTD(pg.traffic, conv, pos.name, idx, pgPd.positions.length);
    });

    // Per-site aggregation
    if (!siteRevenue[pg.siteName]) siteRevenue[pg.siteName] = 0;
    if (!siteTraffic[pg.siteName]) siteTraffic[pg.siteName] = 0;
    siteRevenue[pg.siteName] += getPageRevenue(pg.url);
    siteTraffic[pg.siteName] += pg.traffic;

    // Collect mismatches
    var pageAlerts = scrapeAlerts[currentMarket]?.[pg.url] || {};
    Object.keys(pageAlerts).forEach(function(posIdx) {
      var alert = pageAlerts[posIdx];
      allMismatches.push({
        page: pg.article, pageUrl: pg.url, siteName: pg.siteName,
        posIdx: parseInt(posIdx), expected: alert.expected, found: alert.found
      });
    });
  });

  // Sort available positions by eFTD desc
  availablePositions.sort(function(a, b) { return b.eftd - a.eftd; });
  var topAvailable = availablePositions.slice(0, 10);

  // Top pages by revenue
  var topRevPages = pages.slice().sort(function(a, b) { return getPageRevenue(b.url) - getPageRevenue(a.url); }).slice(0, 10);

  // Top operators by revenue
  var topOpRevenue = Object.entries(opRevenue).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);

  var monthLabel = isFullYear() ? 'Year 2026' : MONTH_LABELS[selectedMonth];

  ct.innerHTML = '\
    <div class="stats-bar">\
      <div class="stat-card"><div class="label">Sites</div><div class="value">' + getMarketSites().length + '</div></div>\
      <div class="stat-card"><div class="label">Pages</div><div class="value">' + pages.length + '</div></div>\
      <div class="stat-card"><div class="label">Positions</div><div class="value">' + fmt(totalPos) + '</div>\
        <div class="sub">' + fmt(soldPos) + ' sold / ' + fmt(totalPos - soldPos) + ' available</div></div>\
      <div class="stat-card"><div class="label">Total Traffic</div><div class="value">' + fmt(totalTraffic) + '</div></div>\
      <div class="stat-card"><div class="label">Revenue ' + monthLabel + '</div><div class="value green">' + fmtC(totalRev) + '</div></div>\
      <div class="stat-card"><div class="label">Estimated eFTD</div><div class="value cyan">' + fmt(totalEFTD) + '</div></div>\
    </div>\
    <div class="charts-grid" style="grid-template-columns:repeat(3,1fr)">\
      <div class="chart-card"><h3>Revenue by site</h3><canvas id="chart-site-rev"></canvas></div>\
      <div class="chart-card"><h3>Traffic by site</h3><canvas id="chart-site-traffic"></canvas></div>\
      <div class="chart-card"><h3>Revenue by operator (Top 10)</h3><canvas id="chart-op-rev"></canvas></div>\
    </div>\
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">\
      <div>\
        <h3 style="font-size:14px;margin-bottom:10px">Top 10 available positions (by eFTD)</h3>\
        <table><thead><tr><th>Page</th><th>Site</th><th>Rank</th><th>eFTD</th><th>Current operator</th></tr></thead><tbody>' +
        topAvailable.map(function(p) { return '<tr class="clickable" onclick="showView(\'page-detail\',\'' + esc(p.pageUrl) + '\')">' +
          '<td>' + esc(p.page) + '</td>' +
          '<td>' + esc(p.siteName) + '</td>' +
          '<td>#' + p.posName + '</td>' +
          '<td class="text-cyan">' + fmt(p.eftd) + '</td>' +
          '<td>' + (p.operator ? esc(p.operator) : '<span class="text-muted">-</span>') + '</td>' +
        '</tr>'; }).join('') +
        '</tbody></table>\
        <a href="#" onclick="showView(\'available\');return false" style="font-size:12px;color:var(--primary);margin-top:8px;display:block">View all available positions \u2192</a>\
      </div>\
      <div>\
        <h3 style="font-size:14px;margin-bottom:10px">Top 10 pages by revenue</h3>\
        <table><thead><tr><th>Page</th><th>Site</th><th>Revenue</th><th>Sold</th></tr></thead><tbody>' +
        topRevPages.map(function(pg) { return '<tr class="clickable" onclick="showView(\'page-detail\',\'' + esc(pg.url) + '\')">' +
          '<td>' + esc(pg.article) + '</td>' +
          '<td>' + esc(pg.siteName) + '</td>' +
          '<td class="text-green">' + fmtC(getPageRevenue(pg.url)) + '</td>' +
          '<td><span class="badge badge-green">' + getPageSold(pg.url) + ' / ' + (positionData[currentMarket]?.[pg.url]?.positions?.length || 0) + '</span></td>' +
        '</tr>'; }).join('') +
        '</tbody></table>\
      </div>\
    </div>\
    <div>\
      <h3 style="font-size:14px;margin-bottom:10px">Position mismatches (' + allMismatches.length + ')</h3>' +
      (allMismatches.length === 0 ? '<p style="color:var(--text-muted);font-size:13px">No mismatches detected. Run scans to check positions.</p>' :
      '<table><thead><tr><th>Page</th><th>Site</th><th>Position</th><th>Expected</th><th>Found</th></tr></thead><tbody>' +
      allMismatches.map(function(mm) { return '<tr class="clickable" onclick="showView(\'page-detail\',\'' + esc(mm.pageUrl) + '\')">' +
        '<td>' + esc(mm.page) + '</td>' +
        '<td>' + esc(mm.siteName) + '</td>' +
        '<td>#' + (mm.posIdx + 1) + '</td>' +
        '<td>' + esc(mm.expected) + '</td>' +
        '<td style="color:var(--red)">' + esc(mm.found) + '</td>' +
      '</tr>'; }).join('') +
      '</tbody></table>') +
    '</div>';

  // Draw charts
  setTimeout(function() {
    drawSiteRevenueChart(siteRevenue);
    drawSiteTrafficChart(siteTraffic);
    drawOperatorRevenueChart(topOpRevenue);
  }, 50);
}

// ==================== CHARTS ====================
function destroyCharts() {
  chartInstances.forEach(function(c) { c.destroy(); });
  chartInstances = [];
}

var CHART_COLORS = ['#3b82f6','#22c55e','#f97316','#a855f7','#ef4444','#eab308','#06b6d4','#ec4899','#84cc16','#f43f5e','#8b5cf6','#14b8a6','#f59e0b'];

function drawSiteRevenueChart(data) {
  var el = document.getElementById('chart-site-rev');
  if (!el) return;
  var sorted = Object.entries(data).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);
  if (!sorted.length) return;
  var ch = new Chart(el, {
    type: 'doughnut',
    data: {
      labels: sorted.map(function(s) { return s[0]; }),
      datasets: [{ data: sorted.map(function(s) { return s[1]; }), backgroundColor: CHART_COLORS }]
    },
    options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } } } }
  });
  chartInstances.push(ch);
}

function drawMonthlyChart(id, data, label, type, colorVar) {
  var el = document.getElementById(id);
  if (!el) return;
  var color = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim() || '#3b82f6';
  var ch = new Chart(el, {
    type: type,
    data: {
      labels: MONTHS_2026.map(function(m) { return MONTH_LABELS[m]; }),
      datasets: [{
        label: label,
        data: MONTHS_2026.map(function(m) { return data[m] || 0; }),
        borderColor: color, backgroundColor: type === 'bar' ? color + '99' : color + '20',
        fill: type === 'line', tension: 0.3, borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(71,85,105,.2)' } },
        y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(71,85,105,.2)' } }
      }
    }
  });
  chartInstances.push(ch);
}

function drawSiteTrafficChart(data) {
  var el = document.getElementById('chart-site-traffic');
  if (!el) return;
  var sorted = Object.entries(data).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);
  if (!sorted.length) return;
  var ch = new Chart(el, {
    type: 'bar',
    data: {
      labels: sorted.map(function(s) { return s[0]; }),
      datasets: [{ label: 'Traffic', data: sorted.map(function(s) { return s[1]; }), backgroundColor: '#06b6d499' }]
    },
    options: {
      indexAxis: 'y', responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(71,85,105,.2)' } },
        y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
  chartInstances.push(ch);
}

function drawOperatorRevenueChart(data) {
  var el = document.getElementById('chart-op-rev');
  if (!el || !data.length) return;
  var ch = new Chart(el, {
    type: 'bar',
    data: {
      labels: data.map(function(d) { return d[0]; }),
      datasets: [{ label: 'Revenue', data: data.map(function(d) { return d[1]; }), backgroundColor: '#22c55e99' }]
    },
    options: {
      indexAxis: 'y', responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(71,85,105,.2)' } },
        y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
  chartInstances.push(ch);
}

// ==================== SITES VIEW ====================
function renderSitesView(ct) {
  var pages = getMarketPages();
  var pd = getMarketPosData();
  var sites = {};

  pages.forEach(function(pg) {
    if (!sites[pg.siteName]) sites[pg.siteName] = { pages: 0, positions: 0, sold: 0, traffic: 0, revenue: 0, hasAlert: false };
    var s = sites[pg.siteName];
    s.pages++;
    s.traffic += pg.traffic;
    s.revenue += getPageRevenue(pg.url);
    var pgPd = pd[pg.url];
    if (pgPd) {
      s.positions += pgPd.positions.length;
      s.sold += getPageSold(pg.url);
    }
    if (hasAlerts(pg.url)) s.hasAlert = true;
  });

  var rows = Object.entries(sites).sort(function(a, b) { return b[1].revenue - a[1].revenue; });
  var monthLabel = isFullYear() ? 'Year 2026' : MONTH_LABELS[selectedMonth];

  // Global stats
  var totalPos = 0, totalSold = 0, totalRev = 0, totalTraffic = 0;
  rows.forEach(function(entry) { var s = entry[1]; totalPos += s.positions; totalSold += s.sold; totalRev += s.revenue; totalTraffic += s.traffic; });

  ct.innerHTML = '\
    <div class="stats-bar">\
      <div class="stat-card"><div class="label">Sites</div><div class="value">' + rows.length + '</div></div>\
      <div class="stat-card"><div class="label">Pages</div><div class="value">' + pages.length + '</div></div>\
      <div class="stat-card"><div class="label">Positions</div><div class="value">' + fmt(totalPos) + '</div><div class="sub">' + fmt(totalSold) + ' sold / ' + fmt(totalPos - totalSold) + ' available</div></div>\
      <div class="stat-card"><div class="label">Traffic</div><div class="value">' + fmt(totalTraffic) + '</div></div>\
      <div class="stat-card"><div class="label">Revenue ' + monthLabel + '</div><div class="value green">' + fmtC(totalRev) + '</div></div>\
    </div>\
    <div class="filters"><input type="text" placeholder="Search for a site..." id="site-search" oninput="filterSites()"></div>\
    <table id="sites-table"><thead><tr>\
      <th data-sort="name">Site</th><th data-sort="pages">Pages</th><th data-sort="positions">Positions</th>\
      <th data-sort="sold">Sold</th><th data-sort="traffic">Traffic</th><th data-sort="revenue">Revenue</th><th data-sort="revpage">Rev/Page</th><th style="width:30px"></th>\
    </tr></thead><tbody id="sites-tbody"></tbody></table>';

  window._sitesData = rows;
  filterSites();
  setupSort('sites-table', function() { filterSites(); });
}

function filterSites() {
  var q = (document.getElementById('site-search')?.value || '').toLowerCase();
  var tbody = document.getElementById('sites-tbody');
  if (!tbody) return;
  var rows = window._sitesData.filter(function(entry) { return entry[0].toLowerCase().includes(q); });
  tbody.innerHTML = rows.map(function(entry) {
    var name = entry[0], s = entry[1];
    return '<tr class="clickable" onclick="showView(\'pages\');document.getElementById(\'site-filter\').value=\'' + esc(name) + '\';filterPages();updateSiteHeader()">' +
      '<td><img src="' + getSiteLogo(name) + '" width="16" height="16" style="vertical-align:middle;margin-right:6px;border-radius:2px" onerror="this.style.display=\'none\'"><strong>' + esc(name) + '</strong>' + (s.hasAlert ? ' <span class="warn-icon" title="Scrape alerts">\u26A0\uFE0F</span>' : '') + '</td>' +
      '<td>' + s.pages + '</td><td>' + s.positions + '</td>' +
      '<td><span class="badge badge-green">' + s.sold + ' / ' + s.positions + '</span></td>' +
      '<td class="text-cyan">' + fmt(s.traffic) + '</td>' +
      '<td class="text-green">' + fmtC(s.revenue) + '</td>' +
      '<td>' + (s.pages ? fmtC(Math.round(s.revenue / s.pages)) : '0 \u20AC') + '</td>' +
      '<td><button onclick="showSiteConfig(\'' + esc(name) + '\', event)" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--text-muted)" title="Configure">&#9881;</button></td>' +
    '</tr>';
  }).join('');
}

// ==================== PAGES VIEW ====================
function renderPagesView(ct) {
  var pages = getMarketPages();
  var sites = getMarketSites();
  var topics = [].concat(new Set(pages.map(function(p) { return p.topic; }).filter(Boolean))).sort();
  // Deduplicate topics properly
  var topicSet = {};
  pages.forEach(function(p) { if (p.topic) topicSet[p.topic] = true; });
  topics = Object.keys(topicSet).sort();
  var pd = getMarketPosData();
  var monthLabel = isFullYear() ? 'Year 2026' : MONTH_LABELS[selectedMonth];

  // Stats
  var totalPos = 0, totalSold = 0, totalRev = 0, totalTraffic = 0;
  pages.forEach(function(pg) {
    totalTraffic += pg.traffic;
    totalRev += getPageRevenue(pg.url);
    var pgPd = pd[pg.url];
    if (pgPd) { totalPos += pgPd.positions.length; totalSold += getPageSold(pg.url); }
  });

  ct.innerHTML = '\
    <div id="site-header-banner" style="display:none;align-items:center;gap:10px;margin-bottom:16px;padding:10px 16px;background:var(--surface);border:1px solid var(--border);border-radius:3px">\
      <img id="site-header-logo" width="28" height="28" style="border-radius:3px" onerror="this.style.display=\'none\'">\
      <span id="site-header-name" style="font-size:18px;font-weight:700"></span>\
      <div id="site-header-stats" style="display:flex;gap:24px;margin-left:48px;flex:1;align-items:center;justify-content:space-around"></div>\
    </div>\
    <div id="pages-stats-bar" class="stats-bar">\
      <div class="stat-card"><div class="label">Pages</div><div class="value">' + pages.length + '</div></div>\
      <div class="stat-card"><div class="label">Positions</div><div class="value">' + fmt(totalPos) + '</div><div class="sub">' + fmt(totalSold) + ' sold</div></div>\
      <div class="stat-card"><div class="label">Traffic</div><div class="value">' + fmt(totalTraffic) + '</div></div>\
      <div class="stat-card"><div class="label">Revenue ' + monthLabel + '</div><div class="value green">' + fmtC(totalRev) + '</div></div>\
    </div>\
    <div class="filters">\
      <input type="text" placeholder="Search..." id="page-search" oninput="filterPages()">\
      <select id="site-filter" onchange="filterPages();updateSiteHeader()"><option value="">All sites</option>' + sites.map(function(s) { return '<option>' + esc(s) + '</option>'; }).join('') + '</select>\
      <select id="topic-filter" onchange="filterPages()"><option value="">All topics</option>' + topics.map(function(t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select>\
      <select id="scan-filter" onchange="filterPages()"><option value="">All scan status</option><option value="active">\u25CF Scan active</option><option value="inactive">\u25CF Scan inactive</option></select>\
      <button class="btn" onclick="showAddPageModal()">+ Add page</button>\
    </div>\
    <table id="pages-table"><thead><tr>\
      <th data-sort="article">Page</th><th data-sort="site">Site</th><th data-sort="topic">Topic</th>\
      <th data-sort="positions">Pos.</th><th data-sort="sold">Sold</th>\
      <th data-sort="traffic">Traffic</th><th data-sort="eftd">eFTD</th><th data-sort="revenue">Revenue</th>\
    </tr></thead><tbody id="pages-tbody"></tbody></table>';

  filterPages();
  updateSiteHeader();
  setupSort('pages-table', function() { filterPages(); });
}

function updateSiteHeader() {
  var site = document.getElementById('site-filter')?.value || '';
  var banner = document.getElementById('site-header-banner');
  var statsBar = document.getElementById('pages-stats-bar');
  if (!banner) return;
  if (site) {
    var logo = getSiteLogo(site);
    var logoEl = document.getElementById('site-header-logo');
    if (logo) { logoEl.src = logo; logoEl.style.display = ''; } else { logoEl.style.display = 'none'; }
    document.getElementById('site-header-name').textContent = site;

    // Calculate site-specific stats
    var pages = getMarketPages().filter(function(p) { return (p.siteName || new URL(p.url).hostname.replace('www.','')) === site; });
    var pd = getMarketPosData();
    var monthLabel = isFullYear() ? 'Year 2026' : MONTH_LABELS[selectedMonth];
    var sPages = pages.length, sPos = 0, sSold = 0, sTraffic = 0, sRev = 0, sEFTD = 0;
    pages.forEach(function(pg) {
      sTraffic += pg.traffic;
      sRev += getPageRevenue(pg.url);
      sEFTD += getPageEFTD(pg.url);
      var pgPd = pd[pg.url];
      if (pgPd) { sPos += pgPd.positions.length; sSold += getPageSold(pg.url); }
    });

    var statItem = function(val, label, color) { return '<div style="text-align:center"><div style="font-size:16px;font-weight:700;' + (color ? 'color:'+color : '') + '">' + val + '</div><div style="font-size:12px;color:var(--text-muted)">' + label + '</div></div>'; };
    document.getElementById('site-header-stats').innerHTML =
      statItem(sPages, 'pages', '') +
      statItem(fmt(sPos), 'positions', '') +
      statItem(fmt(sSold), 'sold', 'var(--blue)') +
      statItem(fmt(sTraffic), 'traffic', '') +
      statItem(fmt(sEFTD), 'eFTD', 'var(--cyan)') +
      statItem(fmtC(sRev), 'revenue', 'var(--green)');
    banner.style.display = 'flex';
    if (statsBar) statsBar.style.display = 'none';
  } else {
    banner.style.display = 'none';
    if (statsBar) statsBar.style.display = '';
  }
}

function filterPages() {
  var q = (document.getElementById('page-search')?.value || '').toLowerCase();
  var site = document.getElementById('site-filter')?.value || '';
  var topic = document.getElementById('topic-filter')?.value || '';
  var scanFilter = document.getElementById('scan-filter')?.value || '';
  var pd = getMarketPosData();

  var pages = getMarketPages().filter(function(pg) {
    if (q && !pg.article.toLowerCase().includes(q) && !pg.url.toLowerCase().includes(q)) return false;
    if (site && pg.siteName !== site) return false;
    if (topic && pg.topic !== topic) return false;
    if (scanFilter === 'active' && !isAutoScanEnabled(pg.url)) return false;
    if (scanFilter === 'inactive' && isAutoScanEnabled(pg.url)) return false;
    return true;
  });

  // Sort by traffic desc by default
  pages.sort(function(a, b) { return b.traffic - a.traffic; });

  var tbody = document.getElementById('pages-tbody');
  if (!tbody) return;
  tbody.innerHTML = pages.map(function(pg) {
    var pgPd = pd[pg.url];
    var nPos = pgPd?.positions?.length || pg.nbPos || 0;
    var sold = getPageSold(pg.url);
    var rev = getPageRevenue(pg.url);
    var eftd = getPageEFTD(pg.url);
    var alert = hasAlerts(pg.url);
    var scanIcon = getScanIcon(pg.url);
    return '<tr class="clickable" onclick="showView(\'page-detail\',\'' + esc(pg.url) + '\')">' +
      '<td>' + scanIcon + ' <strong>' + esc(pg.article) + '</strong>' + (alert ? ' <span class="warn-icon" title="Scrape alert">\u26A0\uFE0F</span>' : '') + '<br><span class="text-muted" style="font-size:11px">' + esc(pg.url) + '</span></td>' +
      '<td>' + esc(pg.siteName) + '</td>' +
      '<td>' + (pg.topic ? '<span class="badge badge-primary">' + esc(pg.topic) + '</span>' : '') + '</td>' +
      '<td>' + nPos + '</td>' +
      '<td><span class="badge ' + (sold > 0 ? 'badge-green' : 'badge-red') + '">' + sold + ' / ' + nPos + '</span></td>' +
      '<td class="text-cyan">' + fmt(pg.traffic) + '</td>' +
      '<td class="text-cyan">' + fmt(eftd) + '</td>' +
      '<td class="text-green">' + fmtC(rev) + '</td>' +
    '</tr>';
  }).join('');
}

// ==================== OPERATORS LIST VIEW ====================
function computeOperatorStats() {
  var pages = getMarketPages();
  var pd = getMarketPosData();
  var months = getActiveMonths();
  var opMap = {};

  pages.forEach(function(pg) {
    var pgPd = pd[pg.url];
    if (!pgPd) return;
    var conv = pgPd.conversion || 0;

    pgPd.positions.forEach(function(pos, idx) {
      months.forEach(function(m) {
        var md = getMonthDataForMonth(pos, m);
        if (!md.operator) return;
        if (!opMap[md.operator]) opMap[md.operator] = {
          name: md.operator, entries: [], pageSet: new Set(),
          totalCount: 0, soldCount: 0, totalRevenue: 0, totalTraffic: 0, totalEFTD: 0
        };
        var op = opMap[md.operator];
        op.totalCount++;
        if (md.sold) { op.soldCount++; op.totalRevenue += md.price; }
        if (!op.pageSet.has(pg.url)) {
          op.pageSet.add(pg.url);
          op.totalTraffic += pg.traffic;
        }
        // Only count eFTD once per position (not per month)
        if (m === months[0]) {
          op.totalEFTD += getPositionEFTD(pg.traffic, conv, pos.name, idx, pgPd.positions.length);
        }
        op.entries.push({
          page: pg.article, pageUrl: pg.url, siteName: pg.siteName,
          posName: pos.name, posIdx: idx, sold: md.sold, price: md.price,
          traffic: pg.traffic, eftd: getPositionEFTD(pg.traffic, conv, pos.name, idx, pgPd.positions.length)
        });
      });
    });
  });

  return Object.values(opMap).map(function(op) {
    return Object.assign({}, op, { pageCount: op.pageSet.size });
  }).sort(function(a, b) { return b.totalRevenue - a.totalRevenue; });
}

function renderOperatorsListView(ct) {
  var opStats = computeOperatorStats();
  var monthLabel = isFullYear() ? 'Year 2026' : MONTH_LABELS[selectedMonth];

  ct.innerHTML = '\
    <div class="stats-bar">\
      <div class="stat-card"><div class="label">Operators</div><div class="value">' + opStats.length + '</div></div>\
      <div class="stat-card"><div class="label">Total positions</div><div class="value">' + fmt(opStats.reduce(function(s, o) { return s + o.totalCount; }, 0)) + '</div></div>\
      <div class="stat-card"><div class="label">Sold</div><div class="value green">' + fmt(opStats.reduce(function(s, o) { return s + o.soldCount; }, 0)) + '</div></div>\
      <div class="stat-card"><div class="label">Revenue ' + monthLabel + '</div><div class="value green">' + fmtC(opStats.reduce(function(s, o) { return s + o.totalRevenue; }, 0)) + '</div></div>\
    </div>\
    <div class="filters"><input type="text" placeholder="Search for an operator..." id="op-list-search" oninput="filterOpList()"></div>\
    <table id="op-list-table"><thead><tr>\
      <th data-sort="name">Operator</th><th data-sort="positions">Positions</th>\
      <th data-sort="sold">Sold</th><th data-sort="free">Free</th><th data-sort="ratio">Ratio</th>\
      <th data-sort="revenue">Revenue</th><th data-sort="traffic">Traffic</th><th data-sort="eftd">eFTD</th>\
    </tr></thead><tbody id="op-list-tbody"></tbody></table>';

  window._opListData = opStats;
  filterOpList();
  setupSort('op-list-table', function() { filterOpList(); });
}

function filterOpList() {
  var q = (document.getElementById('op-list-search')?.value || '').toLowerCase();
  var data = window._opListData.filter(function(op) { return op.name.toLowerCase().includes(q); });
  var tbody = document.getElementById('op-list-tbody');
  if (!tbody) return;
  tbody.innerHTML = data.map(function(op) {
    var ratio = op.totalCount > 0 ? ((op.soldCount / op.totalCount) * 100).toFixed(0) : 0;
    var dbInfo = getOperatorDBInfo(op.name, currentMarket);
    var amText = dbInfo && dbInfo.am ? '<br><span style="font-size:11px;color:var(--text-muted)">AM: ' + esc(dbInfo.am) + '</span>' : '';
    var statusBadge = '';
    if (dbInfo && dbInfo.status) {
      var statusClass = dbInfo.status === 'live' ? 'badge-green' : (dbInfo.status === 'closed' ? 'badge-red' : (dbInfo.status === 'no program' ? 'badge-red' : 'badge-primary'));
      statusBadge = ' <span class="badge ' + statusClass + '" style="font-size:10px">' + esc(dbInfo.status) + '</span>';
    }
    var freeCount = op.totalCount - op.soldCount;
    return '<tr class="clickable" onclick="showView(\'op-detail\',\'' + esc(op.name) + '\')">' +
      '<td>' + (getOperatorLogo(op.name) ? '<img src="' + getOperatorLogo(op.name) + '" width="16" height="16" style="vertical-align:middle;margin-right:6px;border-radius:2px" onerror="this.style.display=\'none\'">' : '') + '<strong>' + esc(op.name) + '</strong>' + statusBadge + amText + '</td>' +
      '<td>' + op.totalCount + '</td>' +
      '<td><span class="badge badge-green">' + op.soldCount + '</span></td>' +
      '<td>' + freeCount + '</td>' +
      '<td>' + ratio + '%</td>' +
      '<td class="text-green">' + fmtC(op.totalRevenue) + '</td>' +
      '<td class="text-cyan">' + fmt(op.totalTraffic) + '</td>' +
      '<td class="text-cyan">' + fmt(op.totalEFTD) + '</td>' +
    '</tr>';
  }).join('');
}

// ==================== AVAILABLE POSITIONS VIEW ====================
function getAllAvailablePositions() {
  var pages = getMarketPages();
  var pd = getMarketPosData();
  var results = [];

  pages.forEach(function(pg) {
    var pgPd = pd[pg.url];
    if (!pgPd) return;
    var conv = pgPd.conversion || 0;

    pgPd.positions.forEach(function(pos, idx) {
      var md = getMonthData(pos);
      if (md.sold) return;
      var eftd = getPositionEFTD(pg.traffic, conv, pos.name, idx, pgPd.positions.length);
      // Check M-1 status
      var prevMonth = getPreviousMonth(selectedMonth);
      var prevMd = prevMonth ? getMonthDataForMonth(pos, prevMonth) : {};
      results.push({
        page: pg.article, pageUrl: pg.url, siteName: pg.siteName,
        posName: pos.name, posIdx: idx, eftd: eftd, traffic: pg.traffic,
        operator: md.operator || '',
        wasSoldM1: prevMd.sold || false,
        operatorM1: prevMd.operator || ''
      });
    });
  });

  return results.sort(function(a, b) { return b.eftd - a.eftd; });
}

function getPreviousMonth(month) {
  if (month === 'full_year' || !month) return null;
  var idx = MONTHS_2026.indexOf(month);
  return idx > 0 ? MONTHS_2026[idx - 1] : null;
}

function renderAvailableView(ct) {
  var positions = getAllAvailablePositions();
  var monthLabel = isFullYear() ? 'Year 2026' : MONTH_LABELS[selectedMonth];

  ct.innerHTML = '\
    <div class="stats-bar">\
      <div class="stat-card"><div class="label">Available positions</div><div class="value">' + positions.length + '</div></div>\
      <div class="stat-card"><div class="label">Total est. eFTD</div><div class="value cyan">' + fmt(positions.reduce(function(s, p) { return s + p.eftd; }, 0)) + '</div></div>\
    </div>\
    <div class="filters"><input type="text" placeholder="Search..." id="avail-search" oninput="filterAvailable()"></div>\
    <table id="avail-table"><thead><tr>\
      <th data-sort="page">Page</th><th data-sort="site">Site</th><th data-sort="rank">Rank</th>\
      <th data-sort="traffic">Traffic</th><th data-sort="eftd">eFTD</th>\
      <th data-sort="operator">Current operator</th><th data-sort="m1">Sold M-1</th><th data-sort="opm1">Operator M-1</th>\
    </tr></thead><tbody id="avail-tbody"></tbody></table>';

  window._availData = positions;
  filterAvailable();
  setupSort('avail-table', function() { filterAvailable(); });
}

function filterAvailable() {
  var q = (document.getElementById('avail-search')?.value || '').toLowerCase();
  var data = (window._availData || []).filter(function(p) {
    return p.page.toLowerCase().includes(q) || p.siteName.toLowerCase().includes(q) || p.operator.toLowerCase().includes(q);
  });
  var tbody = document.getElementById('avail-tbody');
  if (!tbody) return;
  tbody.innerHTML = data.map(function(p) {
    return '<tr class="clickable" onclick="showView(\'page-detail\',\'' + esc(p.pageUrl) + '\')">' +
      '<td>' + esc(p.page) + '</td>' +
      '<td>' + esc(p.siteName) + '</td>' +
      '<td>#' + p.posName + '</td>' +
      '<td class="text-cyan">' + fmt(p.traffic) + '</td>' +
      '<td class="text-cyan">' + fmt(p.eftd) + '</td>' +
      '<td>' + (p.operator ? esc(p.operator) : '<span class="text-muted">-</span>') + '</td>' +
      '<td>' + (p.wasSoldM1 ? '<span class="badge badge-green">Yes</span>' : '<span class="text-muted">No</span>') + '</td>' +
      '<td>' + (p.operatorM1 ? esc(p.operatorM1) : '<span class="text-muted">-</span>') + '</td>' +
    '</tr>';
  }).join('');
}

// ==================== SOLD POSITIONS VIEW ====================
function renderSoldView(ct) {
  var pages = getMarketPages();
  var pd = getMarketPosData();
  var sold = [];
  var opSet = {};

  pages.forEach(function(pg) {
    var pgPd = pd[pg.url];
    if (!pgPd) return;
    var conv = pgPd.conversion || 0;
    pgPd.positions.forEach(function(pos, idx) {
      var md = getMonthData(pos);
      if (!md.sold) return;
      var eftd = getPositionEFTD(pg.traffic, conv, pos.name, idx, pgPd.positions.length);
      sold.push({
        page: pg.article, pageUrl: pg.url, siteName: pg.siteName,
        posName: pos.name, operator: md.operator || '', price: md.price || 0,
        traffic: pg.traffic, eftd: eftd
      });
      if (md.operator) opSet[md.operator] = true;
    });
  });

  var operators = Object.keys(opSet).sort();
  var monthLabel = isFullYear() ? 'Year 2026' : MONTH_LABELS[selectedMonth];
  var totalRev = sold.reduce(function(s, p) { return s + p.price; }, 0);

  ct.innerHTML = '\
    <div class="stats-bar">\
      <div class="stat-card"><div class="label">Sold positions</div><div class="value">' + sold.length + '</div></div>\
      <div class="stat-card"><div class="label">Operators</div><div class="value">' + operators.length + '</div></div>\
      <div class="stat-card"><div class="label">Revenue ' + monthLabel + '</div><div class="value green">' + fmtC(totalRev) + '</div></div>\
    </div>\
    <div class="filters">\
      <input type="text" placeholder="Search..." id="sold-search" oninput="filterSold()">\
      <select id="sold-op-filter" onchange="filterSold()"><option value="">All operators</option>' + operators.map(function(o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>\
    </div>\
    <table id="sold-table"><thead><tr>\
      <th data-sort="page">Page</th><th data-sort="site">Site</th><th data-sort="rank">Rank</th>\
      <th data-sort="operator">Operator</th><th data-sort="price">Price</th>\
      <th data-sort="traffic">Traffic</th><th data-sort="eftd">eFTD</th>\
    </tr></thead><tbody id="sold-tbody"></tbody></table>';

  window._soldData = sold;
  filterSold();
  setupSort('sold-table', function() { filterSold(); });
}

function filterSold() {
  var q = (document.getElementById('sold-search')?.value || '').toLowerCase();
  var opFilter = document.getElementById('sold-op-filter')?.value || '';
  var data = (window._soldData || []).filter(function(p) {
    if (opFilter && p.operator !== opFilter) return false;
    return p.page.toLowerCase().includes(q) || p.siteName.toLowerCase().includes(q) || p.operator.toLowerCase().includes(q);
  });
  var tbody = document.getElementById('sold-tbody');
  if (!tbody) return;
  tbody.innerHTML = data.map(function(p) {
    return '<tr class="clickable" onclick="showView(\'page-detail\',\'' + esc(p.pageUrl) + '\')">' +
      '<td>' + esc(p.page) + '</td>' +
      '<td>' + esc(p.siteName) + '</td>' +
      '<td>#' + p.posName + '</td>' +
      '<td><strong>' + esc(p.operator) + '</strong></td>' +
      '<td class="text-green">' + fmtC(p.price) + '</td>' +
      '<td class="text-cyan">' + fmt(p.traffic) + '</td>' +
      '<td class="text-cyan">' + fmt(p.eftd) + '</td>' +
    '</tr>';
  }).join('');
}

// ==================== SCAN LOG VIEW ====================
// ==================== AM VIEWS (CROSS-MARKET) ====================

var amSelectedMonth = null; // separate month selector for AM screen
var amViewHistory = [];
var amCurrentView = 'am-list'; // am-list | am-detail | deal-detail

function showAMScreen() {
  document.getElementById('market-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('am-screen').style.display = 'block';
  amSelectedMonth = selectedMonth;
  amViewHistory = [];
  amCurrentView = 'am-list';
  buildAMMonthSelector();
  renderAMCurrentView();
}

function hideAMScreen() {
  document.getElementById('am-screen').style.display = 'none';
  document.getElementById('market-screen').style.display = 'block';
}

function buildAMMonthSelector() {
  var sel = document.getElementById('am-month-select');
  if (!sel) return;
  sel.innerHTML = MONTHS_2026.map(function(m) {
    return '<option value="' + m + '" ' + (m === amSelectedMonth ? 'selected' : '') + '>' + MONTH_LABELS[m] + '</option>';
  }).join('') + '<option value="full_year" ' + (amSelectedMonth === 'full_year' ? 'selected' : '') + '>Full year</option>';
}

function onAMMonthChange() {
  amSelectedMonth = document.getElementById('am-month-select').value;
  renderAMCurrentView();
}

function amIsFullYear() { return amSelectedMonth === 'full_year'; }
function amGetActiveMonths() { return amIsFullYear() ? MONTHS_2026 : [amSelectedMonth]; }

function amGoBack() {
  if (amViewHistory.length > 0) {
    var prev = amViewHistory.pop();
    amCurrentView = prev.view;
    renderAMCurrentView(prev.data);
  } else {
    amCurrentView = 'am-list';
    renderAMCurrentView();
  }
}

function amNavigate(view, data) {
  amViewHistory.push({ view: amCurrentView, data: amCurrentView === 'am-detail' ? currentAM : (amCurrentView === 'deal-detail' ? currentDealOp : null) });
  if (amViewHistory.length > 50) amViewHistory.shift();
  amCurrentView = view;
  renderAMCurrentView(data);
}

function renderAMCurrentView(data) {
  destroyCharts();
  var ct = document.getElementById('am-content');
  switch (amCurrentView) {
    case 'am-list': renderAMListView(ct); break;
    case 'am-detail': renderAMDetailView(ct, data || currentAM); break;
    case 'deal-detail': renderDealDetailView(ct, data || currentDealOp); break;
    default: renderAMListView(ct);
  }
}

// Get all AMs and their operators across ALL markets
function getAMDataGlobal() {
  var amMap = {}; // { amName: { operators: [ { name, market, dbInfo } ], ... } }

  Object.keys(operatorDB).forEach(function(market) {
    var db = operatorDB[market] || {};
    Object.keys(db).forEach(function(opName) {
      var info = db[opName];
      var am = info.am || 'Unassigned';
      if (!amMap[am]) amMap[am] = { operators: [] };
      amMap[am].operators.push({ name: opName, market: market, dbInfo: info });
    });
  });

  return amMap;
}

// Pre-compute ALL operator fees/positions in a single pass (much faster than per-operator)
var _amCache = null;
var _amCacheKey = null;

function buildAMCache() {
  var cacheKey = Object.keys(positionData).length + '_' + amSelectedMonth;
  if (_amCache && _amCacheKey === cacheKey) return _amCache;

  // Build per-market per-operator cache: key = "market|opNameLower"
  var opFees = {};

  function ensureKey(key) {
    if (!opFees[key]) {
      opFees[key] = { fees: {}, soldMonths: {} };
      MONTHS_2026.forEach(function(mm) { opFees[key].fees[mm] = 0; opFees[key].soldMonths[mm] = 0; });
    }
  }

  Object.keys(positionData).forEach(function(market) {
    var pd = positionData[market] || {};
    Object.keys(pd).forEach(function(pageUrl) {
      var page = pd[pageUrl];
      if (!page.positions) return;
      page.positions.forEach(function(pos) {
        MONTHS_2026.forEach(function(m) {
          var md = pos.months?.[m];
          if (!md || !md.sold || !md.operator) return;
          var opKey = market + '|' + compactNormalize(md.operator);
          ensureKey(opKey);
          opFees[opKey].fees[m] += md.price || 0;
          opFees[opKey].soldMonths[m]++;
        });
      });
    });
  });

  _amCache = opFees;
  _amCacheKey = cacheKey;
  return opFees;
}

// Resolve an operatorDB entry (name + market) to the cache key
function resolveOpCacheKey(opName, market) {
  var cache = buildAMCache();
  // Try compact normalized name
  var key = market + '|' + compactNormalize(opName);
  if (cache[key]) return key;
  // Try baseName
  var dbEntry = operatorDB[market] && operatorDB[market][opName];
  if (dbEntry && dbEntry.baseName) {
    var baseKey = market + '|' + compactNormalize(dbEntry.baseName);
    if (cache[baseKey]) return baseKey;
  }
  // Try without common suffixes
  var stripped = opName.replace(/\s+(BR|MX|CL|CO|PE|AR|EC|PT|ES|FR|IT|UK|US|CA|AU|IN|NG|ZA|JP|RU|PL|BE|NL|HU|BG|CZ|RS|SE|CH|UA|VE|KZ|BD|PA|SV|CR|UZ|AFR|LATAM)$/i, '').trim();
  if (stripped !== opName) {
    var strippedKey = market + '|' + compactNormalize(stripped);
    if (cache[strippedKey]) return strippedKey;
  }
  return null;
}

function getCachedOpFees(opName, market) {
  var cache = buildAMCache();
  var key = resolveOpCacheKey(opName, market);
  return key ? cache[key] : null;
}

function getCachedMonthlyFee(opName, market, m, fullYear) {
  var data = getCachedOpFees(opName, market);
  if (!data) return 0;
  if (fullYear) return MONTHS_2026.reduce(function(s, mm) { return s + data.fees[mm]; }, 0);
  return data.fees[m] || 0;
}

function getCachedSoldCount(opName, market, m, fullYear) {
  var data = getCachedOpFees(opName, market);
  if (!data) return 0;
  if (fullYear) return MONTHS_2026.reduce(function(s, mm) { return s + data.soldMonths[mm]; }, 0);
  return data.soldMonths[m] || 0;
}

function renderAMListView(ct) {
  _amCache = null; // invalidate cache on render
  buildAMCache(); // single pass build

  var amData = getAMDataGlobal();
  var amNames = Object.keys(amData).sort(function(a, b) {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  var m = amIsFullYear() ? '01/26' : amSelectedMonth;
  var fy = amIsFullYear();
  var monthLabel = fy ? 'Year 2026' : MONTH_LABELS[amSelectedMonth];

  ct.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
    '<h2 style="font-size:18px;font-weight:700">Account Managers \u2014 All Markets</h2>' +
    '<div style="display:flex;gap:8px">' +
      '<button class="btn-sm" onclick="showAddOperatorToDBModal()">+ Add Operator</button>' +
    '</div>' +
  '</div>' +
    '<div class="am-grid">' +
    amNames.map(function(amName) {
      var data = amData[amName];
      var activeDeals = 0;
      var totalFeesMonth = 0;
      var totalPosMonth = 0;
      var marketsSet = {};

      data.operators.forEach(function(op) {
        marketsSet[op.market] = true;
        var monthFee = getCachedMonthlyFee(op.name, op.market, m, fy);
        if (monthFee > 0) {
          activeDeals++;
          totalFeesMonth += monthFee;
        }
        totalPosMonth += getCachedSoldCount(op.name, op.market, m, fy);
      });

      var marketCount = Object.keys(marketsSet).length;

      return '<div class="market-card" style="cursor:pointer" onclick="amNavigate(\'am-detail\',\'' + esc(amName).replace(/'/g, "\\'") + '\')">' +
        '<div class="name" style="font-size:15px;font-weight:700">' + esc(amName) + '</div>' +
        '<div class="stats">' +
          '<span>' + data.operators.length + '</span> operators \u00B7 ' +
          '<span>' + marketCount + '</span> market(s)<br>' +
          '<span class="text-green">' + activeDeals + '</span> active fix fees deals \u00B7 ' +
          '<span class="text-green">' + fmtC(totalFeesMonth) + '</span>' +
        '</div>' +
      '</div>';
    }).join('') +
    '</div>';
}

function getOpTrafficEFTDGlobal(opName, market, month, fullYear) {
  var traffic = 0, eftd = 0, soldCount = 0, freeCount = 0;
  var months = fullYear ? MONTHS_2026 : [month];
  var marketsToSearch = market ? [market] : Object.keys(positionData);

  // Also try baseName matching
  var dbEntry = market && operatorDB[market] && operatorDB[market][opName];
  var baseName = dbEntry ? (dbEntry.baseName || opName) : opName;

  marketsToSearch.forEach(function(mk) {
    var pd = positionData[mk] || {};
    Object.keys(pd).forEach(function(pageUrl) {
      var page = pd[pageUrl];
      if (!page || !page.positions) return;
      var pgInfo = null;
      var mkData = allMarkets[mk];
      if (mkData) pgInfo = mkData.pages.find(function(p) { return p.url === pageUrl; });
      var pgTraffic = pgInfo ? pgInfo.traffic : 0;
      var conv = page.conversion || 0;
      page.positions.forEach(function(pos, idx) {
        months.forEach(function(mm) {
          var md = getMonthDataForMonth(pos, mm);
          if (md.operator && (operatorsMatch(md.operator, opName) || operatorsMatch(md.operator, baseName))) {
            traffic += pgTraffic;
            eftd += getPositionEFTD(pgTraffic, conv, pos.name, idx, page.positions.length);
            if (md.sold && md.price > 0) {
              soldCount++;
            } else {
              freeCount++;
            }
          }
        });
      });
    });
  });
  if (fullYear && months.length > 1) {
    traffic = Math.round(traffic / months.length);
    eftd = Math.round(eftd / months.length);
    soldCount = Math.round(soldCount / months.length);
    freeCount = Math.round(freeCount / months.length);
  }
  return { traffic: traffic, eftd: eftd, soldCount: soldCount, freeCount: freeCount };
}

function renderAMDetailView(ct, amName) {
  currentAM = amName;
  var amData = getAMDataGlobal();
  var data = amData[amName];
  if (!data) { amCurrentView = 'am-list'; renderAMCurrentView(); return; }

  var m = amIsFullYear() ? '01/26' : amSelectedMonth;
  var monthLabel = amIsFullYear() ? 'Year 2026' : MONTH_LABELS[amSelectedMonth];

  var fy = amIsFullYear();

  // Build operator rows with deal info (cross-market) — using cache
  var opRows = data.operators.map(function(op) {
    var monthlyFee = getCachedMonthlyFee(op.name, op.market, m, fy);
    var stats = getOpTrafficEFTDGlobal(op.name, op.market, m, fy);

    // Determine deal period from cache
    var cachedData = getCachedOpFees(op.name, op.market);
    var dealStart = null, dealEnd = null;
    if (cachedData) {
      MONTHS_2026.forEach(function(mm) {
        if (cachedData.fees[mm] > 0) {
          if (!dealStart) dealStart = mm;
          dealEnd = mm;
        }
      });
    }

    // Also check actual sold positions for deal period if fixFees don't show it
    if (!dealStart && stats.soldCount > 0) {
      // Fallback: check actual position data for sold months
      var marketsToCheck = op.market ? [op.market] : Object.keys(positionData);
      var bName = op.dbInfo.baseName || op.name;
      marketsToCheck.forEach(function(mk) {
        var pd = positionData[mk] || {};
        Object.keys(pd).forEach(function(pageUrl) {
          var page = pd[pageUrl];
          if (!page || !page.positions) return;
          page.positions.forEach(function(pos) {
            MONTHS_2026.forEach(function(mm) {
              var md = getMonthDataForMonth(pos, mm);
              if (md.sold && md.operator && (operatorsMatch(md.operator, op.name) || operatorsMatch(md.operator, bName))) {
                if (!dealStart) dealStart = mm;
                dealEnd = mm;
              }
            });
          });
        });
      });
    }
    // hasDeal = has fixFees for the selected month
    var hasDeal = monthlyFee > 0;
    // Deal period: only show if deal is currently active (dealEnd >= current selected month)
    var currentMonthStr = amIsFullYear() ? '12/26' : amSelectedMonth;
    var dealActive = dealEnd && dealEnd >= currentMonthStr;
    var dealPeriod = (dealStart && dealActive) ? (MONTH_LABELS[dealStart] + ' \u2192 ' + MONTH_LABELS[dealEnd]) : '';
    var displayName = op.dbInfo.baseName || op.name;

    return {
      name: op.name,
      displayName: displayName,
      market: op.market,
      dbInfo: op.dbInfo,
      monthlyFee: monthlyFee,
      soldCount: stats.soldCount,
      freeCount: stats.freeCount,
      traffic: stats.traffic,
      eftd: stats.eftd,
      dealPeriod: dealPeriod,
      dealStart: dealStart,
      dealEnd: dealEnd,
      hasDeal: hasDeal
    };
  }).sort(function(a, b) {
    if (a.hasDeal && !b.hasDeal) return -1;
    if (!a.hasDeal && b.hasDeal) return 1;
    return b.monthlyFee - a.monthlyFee;
  });

  var totalFees = opRows.reduce(function(s, r) { return s + r.monthlyFee; }, 0);
  var activeCount = opRows.filter(function(r) { return r.hasDeal; }).length;
  var totalSoldPos = opRows.reduce(function(s, r) { return s + r.soldCount; }, 0);
  var totalTraffic = opRows.reduce(function(s, r) { return s + r.traffic; }, 0);
  var totalEFTD = opRows.reduce(function(s, r) { return s + r.eftd; }, 0);
  var marketsSet = {};
  data.operators.forEach(function(op) { marketsSet[op.market] = true; });

  // Collect unique markets for filter
  var uniqueMarkets = Object.keys(marketsSet).sort();

  // Monthly revenue chart data — using cache
  var chartData = MONTHS_2026.map(function(mm) {
    return data.operators.reduce(function(total, op) {
      var cached = getCachedOpFees(op.name, op.market);
      return total + (cached ? cached.fees[mm] : 0);
    }, 0);
  });

  ct.innerHTML = '\
    <button class="back-btn" onclick="amGoBack()">\u2190 Back</button>\
    <div class="page-header">\
      <h2 style="font-size:18px;font-weight:700">' + esc(amName) + '</h2>\
    </div>\
    <div class="stat-cards" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">\
      <div class="stat-card"><div class="label">Operators</div><div class="value">' + data.operators.length + '</div></div>\
      <div class="stat-card"><div class="label">Active FF deals</div><div class="value">' + activeCount + '</div></div>\
      <div class="stat-card"><div class="label">Fix Fees (' + monthLabel + ')</div><div class="value green">' + fmtC(totalFees) + '</div></div>\
    </div>\
    <div style="margin-bottom:20px"><canvas id="am-revenue-chart" height="80"></canvas></div>\
    <div style="display:flex;gap:8px;margin-bottom:12px">\
      <input type="text" id="am-filter-op" placeholder="Filter by operator..." oninput="filterAMOpsTable()" style="padding:6px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px;flex:1;max-width:250px">\
      <select id="am-filter-market" onchange="filterAMOpsTable()" style="padding:6px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        <option value="">All markets</option>\
        ' + uniqueMarkets.map(function(mk) { return '<option value="' + esc(mk) + '">' + getFlag(mk) + ' ' + esc(mk) + '</option>'; }).join('') + '\
      </select>\
    </div>\
    <table class="data-table" id="am-ops-table">\
      <thead><tr>\
        <th data-sort="operator">Operator</th>\
        <th data-sort="market">Market</th>\
        <th data-sort="sold">Sold</th>\
        <th data-sort="free">Free</th>\
        <th data-sort="traffic">Traffic</th>\
        <th data-sort="eftd">eFTDs</th>\
        <th data-sort="fees">Fix Fees</th>\
        <th data-sort="deal">Deal Period</th>\
      </tr></thead>\
      <tbody>' +
      opRows.map(function(r) {
        var logoUrl = r.dbInfo.url ? '<img src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(r.dbInfo.url.replace(/^https?:\/\//, '').split('/')[0]) + '&sz=16" style="width:16px;height:16px;margin-right:6px;vertical-align:middle;border-radius:2px" onerror="this.style.display=\'none\'">' : '';
        return '<tr data-opname="' + esc(r.displayName.toLowerCase()) + '" data-market="' + esc(r.market) + '" style="' + (r.hasDeal ? '' : 'opacity:0.6') + ';cursor:pointer">\
          <td style="font-weight:600" onclick="amNavigate(\'deal-detail\',{name:\'' + esc(r.name).replace(/'/g, "\\'") + '\',market:\'' + esc(r.market).replace(/'/g, "\\'") + '\'})">' + logoUrl + esc(r.displayName) + ' <button class="btn-sm" style="font-size:11px;padding:1px 5px;margin-left:4px" onclick="event.stopPropagation();showOperatorAMSettings(\'' + esc(r.name).replace(/'/g, "\\'") + '\',\'' + esc(r.market).replace(/'/g, "\\'") + '\')" title="Operator settings">\u2699\uFE0F</button></td>\
          <td>' + getFlag(r.market) + ' ' + esc(r.market) + '</td>\
          <td>' + r.soldCount + '</td>\
          <td>' + r.freeCount + '</td>\
          <td class="text-cyan">' + fmt(r.traffic) + '</td>\
          <td class="text-cyan">' + fmt(r.eftd) + '</td>\
          <td class="text-green">' + fmtC(r.monthlyFee) + '</td>\
          <td>' + esc(r.dealPeriod) + '</td>\
        </tr>';
      }).join('') +
      '</tbody>\
    </table>';

  setupSort('am-ops-table');

  // Render chart
  if (typeof Chart !== 'undefined') {
    var canvas = document.getElementById('am-revenue-chart');
    if (canvas) {
      var ctx = canvas.getContext('2d');
      var chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: MONTHS_2026.map(function(m) { return MONTH_LABELS[m].split(' ')[0]; }),
          datasets: [{
            label: 'Fix Fees',
            data: chartData,
            backgroundColor: 'rgba(46, 204, 113, 0.6)',
            borderColor: 'rgba(46, 204, 113, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { callback: function(v) { return v.toLocaleString() + ' \u20AC'; } } }
          }
        }
      });
      chartInstances.push(chart);
    }
  }
}

function filterAMOpsTable() {
  var filterOp = (document.getElementById('am-filter-op').value || '').toLowerCase();
  var filterMk = document.getElementById('am-filter-market').value;
  var rows = document.querySelectorAll('#am-ops-table tbody tr');
  rows.forEach(function(tr) {
    var opName = tr.getAttribute('data-opname') || '';
    var market = tr.getAttribute('data-market') || '';
    var show = true;
    if (filterOp && opName.indexOf(filterOp) === -1) show = false;
    if (filterMk && market !== filterMk) show = false;
    tr.style.display = show ? '' : 'none';
  });
}

function renderDealDetailView(ct, dealData) {
  // dealData can be { name, market } or just opName string (legacy)
  var opName, dealMarket;
  if (typeof dealData === 'object' && dealData.name) {
    opName = dealData.name;
    dealMarket = dealData.market;
  } else {
    opName = dealData;
    dealMarket = null;
  }
  currentDealOp = dealData;

  // Find operator DB info
  var dbInfo = {};
  var amName = 'Unassigned';
  if (dealMarket && operatorDB[dealMarket]) {
    dbInfo = operatorDB[dealMarket][opName] || {};
    amName = dbInfo.am || 'Unassigned';
  } else {
    Object.keys(operatorDB).forEach(function(market) {
      if (operatorDB[market][opName]) {
        dbInfo = operatorDB[market][opName];
        amName = dbInfo.am || 'Unassigned';
        if (!dealMarket) dealMarket = market;
      }
    });
  }

  // Get ALL positions for this operator (sold + free)
  var allPositions = [];
  var marketsToSearch = dealMarket ? [dealMarket] : Object.keys(positionData);
  var opBaseName = dbInfo.baseName || opName;

  marketsToSearch.forEach(function(market) {
    var pd = positionData[market] || {};
    Object.keys(pd).forEach(function(pageUrl) {
      var page = pd[pageUrl];
      if (!page || !page.positions) return;
      page.positions.forEach(function(pos, idx) {
        var hasAnyRelation = false;
        var hasSoldMonth = false;
        var hasPaidMonth = false;
        MONTHS_2026.forEach(function(mm) {
          var md = getMonthDataForMonth(pos, mm);
          if (md.operator && (operatorsMatch(md.operator, opName) || operatorsMatch(md.operator, opBaseName))) {
            hasAnyRelation = true;
            if (md.sold) {
              hasSoldMonth = true;
              if (md.price > 0) hasPaidMonth = true;
            }
          }
        });
        if (hasAnyRelation) {
          var pgInfo = null;
          var mk = allMarkets[market];
          if (mk) pgInfo = mk.pages.find(function(p) { return p.url === pageUrl; });
          var pgTraffic = pgInfo ? pgInfo.traffic : 0;
          var conv = page.conversion || 0;
          var posEFTD = getPositionEFTD(pgTraffic, conv, pos.name, idx, page.positions.length);
          allPositions.push({
            pageUrl: pageUrl,
            posIndex: idx,
            posName: pos.name,
            pos: pos,
            page: pgInfo,
            market: market,
            traffic: pgTraffic,
            eftd: posEFTD,
            hasSoldMonth: hasPaidMonth,
            siteName: pgInfo ? pgInfo.siteName : ''
          });
        }
      });
    });
  });

  var soldPositions = allPositions.filter(function(dp) { return dp.hasSoldMonth; });
  var freePositions = allPositions.filter(function(dp) { return !dp.hasSoldMonth; });

  // Calculate monthly revenue (from sold only)
  var monthlyRevenue = {};
  var monthlyPositions = {};
  MONTHS_2026.forEach(function(mm) {
    monthlyRevenue[mm] = 0;
    monthlyPositions[mm] = 0;
    soldPositions.forEach(function(dp) {
      var md = getMonthDataForMonth(dp.pos, mm);
      if (md.sold && md.operator && (operatorsMatch(md.operator, opName) || operatorsMatch(md.operator, opBaseName))) {
        monthlyRevenue[mm] += md.price || 0;
        monthlyPositions[mm]++;
      }
    });
  });

  var dealStart = null, dealEnd = null;
  MONTHS_2026.forEach(function(mm) {
    if (monthlyPositions[mm] > 0) {
      if (!dealStart) dealStart = mm;
      dealEnd = mm;
    }
  });

  var m = amIsFullYear() ? '01/26' : amSelectedMonth;
  var monthLabel = amIsFullYear() ? 'Year 2026' : MONTH_LABELS[amSelectedMonth];
  var currentFees = amIsFullYear()
    ? MONTHS_2026.reduce(function(s, mm) { return s + monthlyRevenue[mm]; }, 0)
    : monthlyRevenue[m];
  var currentSoldCount = amIsFullYear()
    ? Math.max.apply(null, MONTHS_2026.map(function(mm) { return monthlyPositions[mm]; }))
    : monthlyPositions[m];
  var totalTraffic = soldPositions.reduce(function(s, dp) { return s + dp.traffic; }, 0);
  var totalEFTD = soldPositions.reduce(function(s, dp) { return s + dp.eftd; }, 0);

  // Collect unique sites for filter
  var sitesSet = {};
  allPositions.forEach(function(dp) { if (dp.siteName) sitesSet[dp.siteName] = true; });
  var uniqueSites = Object.keys(sitesSet).sort();

  ct.innerHTML = '\
    <button class="back-btn" onclick="amGoBack()">\u2190 Back</button>\
    <div class="page-header">\
      <h2 style="font-size:18px;font-weight:700">' + esc(dbInfo.baseName || opName) + ' \u2014 Deal Details</h2>\
      <div class="tags">\
        <span class="badge badge-primary">AM: ' + esc(amName) + '</span>\
        ' + (dealMarket ? '<span class="badge">' + getFlag(dealMarket) + ' ' + esc(dealMarket) + '</span>' : '') + '\
      </div>\
    </div>\
    <div class="stat-cards" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">\
      <div class="stat-card"><div class="label">Fix Fees (' + monthLabel + ')</div><div class="value green">' + fmtC(currentFees) + '</div></div>\
      <div class="stat-card"><div class="label">Fix Fees (Year 2026)</div><div class="value green">' + fmtC(MONTHS_2026.reduce(function(s, mm) { return s + monthlyRevenue[mm]; }, 0)) + '</div></div>\
      <div class="stat-card"><div class="label">Sold Positions</div><div class="value">' + currentSoldCount + '</div></div>\
      <div class="stat-card"><div class="label">Free Positions</div><div class="value">' + freePositions.length + '</div></div>\
      <div class="stat-card"><div class="label">Traffic</div><div class="value cyan">' + fmt(totalTraffic) + '</div></div>\
      <div class="stat-card"><div class="label">eFTDs</div><div class="value cyan">' + fmt(totalEFTD) + '</div></div>\
      <div class="stat-card"><div class="label">Deal Start</div><div class="value">' + (dealStart ? MONTH_LABELS[dealStart].split(' ')[0] : '-') + '</div></div>\
      <div class="stat-card"><div class="label">Deal End</div><div class="value">' + (dealEnd ? MONTH_LABELS[dealEnd].split(' ')[0] : '-') + '</div></div>\
    </div>\
    <div style="margin-bottom:24px">\
      <h3 style="font-size:14px;font-weight:700;margin-bottom:8px">Monthly Overview</h3>\
      <div style="display:flex;gap:4px">' +
      MONTHS_2026.map(function(mm) {
        var hasPos = monthlyPositions[mm] > 0;
        var bgColor = hasPos ? 'var(--green)' : 'var(--surface)';
        var textColor = hasPos ? '#fff' : 'var(--text-muted)';
        var label = MONTH_LABELS[mm].split(' ')[0];
        return '<div style="padding:6px 10px;border-radius:3px;background:' + bgColor + ';color:' + textColor + ';font-size:11px;text-align:center;flex:1;border:1px solid var(--border)">' +
          '<div style="font-weight:700">' + label + '</div>' +
          '<div>' + monthlyPositions[mm] + ' pos</div>' +
          '<div>' + fmtC(monthlyRevenue[mm]) + '</div>' +
        '</div>';
      }).join('') +
      '</div>\
    </div>\
    <div style="margin-bottom:16px;display:flex;gap:8px">\
      <button class="btn" onclick="showExtendDealModal(\'' + esc(opName).replace(/'/g, "\\'") + '\',\'' + esc(dealMarket || '').replace(/'/g, "\\'") + '\')">\uD83D\uDCC5 Extend Deal</button>\
      <button class="btn" onclick="showReleasePosModal(\'' + esc(opName).replace(/'/g, "\\'") + '\',\'' + esc(dealMarket || '').replace(/'/g, "\\'") + '\')" style="background:var(--surface);color:var(--text);border:1px solid var(--border)">\u2702\uFE0F Release Positions</button>\
    </div>\
    <div style="margin-bottom:12px">\
      <select id="deal-filter-site" onchange="filterDealTables()" style="padding:6px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        <option value="">All sites</option>\
        ' + uniqueSites.map(function(s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('') + '\
      </select>\
    </div>' +
    buildDealPositionsTable('Sold Positions', soldPositions, opName, opBaseName, m, 'sold', dealMarket) +
    buildDealPositionsTable('Free Positions', freePositions, opName, opBaseName, m, 'free', dealMarket) +
  '';

  setupSort('deal-sold-table');
  setupSort('deal-free-table');
}

function buildDealPositionsTable(title, positions, opName, opBaseName, m, type, dealMarket) {
  var tableId = 'deal-' + type + '-table';
  var isFree = type === 'free';

  return '\
    <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;margin-top:20px;color:' + (isFree ? 'var(--text-muted)' : 'var(--text)') + '">' + title + ' (' + positions.length + ')</h3>\
    <table class="data-table deal-pos-table" id="' + tableId + '">\
      <thead><tr>\
        <th data-sort="article">Article</th>\
        <th data-sort="site">Site</th>\
        <th data-sort="ranking">Ranking</th>\
        <th data-sort="traffic">Traffic</th>\
        <th data-sort="eftd">eFTDs</th>\
        <th data-sort="price">Price</th>\
        <th>' + MONTHS_2026.map(function(mm) { return '<span style="font-size:10px">' + MONTH_LABELS[mm].split(' ')[0].substring(0, 1) + '</span>'; }).join('') + '</th>\
      </tr></thead>\
      <tbody>' +
      positions.map(function(dp) {
        var pg = dp.page;
        var article = pg ? pg.article : dp.pageUrl.replace(/^https?:\/\//, '').substring(0, 50);
        var siteName = pg ? pg.siteName : '';
        var posLabel = (function() {
          var nl = (dp.posName || '').toLowerCase();
          if (nl === 'banner') return 'B';
          if (nl === 'link') return 'L';
          if (nl === 'operator of the month') return 'O';
          return '#' + (dp.posIndex + 1);
        })();

        var displayMd = getMonthDataForMonth(dp.pos, m);
        var price = displayMd.price || 0;
        var priceStyle = isFree ? 'color:var(--text-muted)' : 'color:var(--green)';

        // Determine current month for yellow dot logic
        var now = new Date();
        var currentMonthKey = String(now.getMonth() + 1).padStart(2, '0') + '/' + String(now.getFullYear()).slice(-2);

        var monthDots = MONTHS_2026.map(function(mm) {
          var md = getMonthDataForMonth(dp.pos, mm);
          var isSold = md.sold && md.operator && (operatorsMatch(md.operator, opName) || operatorsMatch(md.operator, opBaseName));
          var dotColor;
          if (isSold) {
            dotColor = 'var(--green)';
          } else if (isFree) {
            // Yellow only for past/current months, grey for future
            dotColor = mm <= currentMonthKey ? '#f1c40f' : 'var(--border)';
          } else {
            dotColor = 'var(--border)';
          }
          return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 1px;background:' +
            dotColor + '" title="' + MONTH_LABELS[mm] + (isSold ? ': ' + fmtC(md.price) : ': Free') + '"></span>';
        }).join('');

        var pageClickMarket = dp.market || dealMarket || '';

        var rowId = type + '-row-' + dp.pageUrl.replace(/[^a-zA-Z0-9]/g, '_') + '-' + dp.posIndex;
        return '<tr id="' + rowId + '" data-site="' + esc(siteName) + '">\
          <td><a href="javascript:void(0)" onclick="showDealArticleDetail(\'' + esc(dp.pageUrl).replace(/'/g, "\\'") + '\',\'' + esc(pageClickMarket).replace(/'/g, "\\'") + '\',\'' + rowId + '\')" style="font-weight:600;color:var(--primary);text-decoration:none;cursor:pointer">' + esc(article) + '</a><div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px"><a href="' + esc(dp.pageUrl) + '" target="_blank" style="color:var(--text-muted);text-decoration:none">' + esc(dp.pageUrl.replace(/^https?:\/\//, '').substring(0, 60)) + '</a></div></td>\
          <td>' + esc(siteName) + '</td>\
          <td style="text-align:center">' + esc(posLabel) + '</td>\
          <td class="text-cyan">' + fmt(dp.traffic) + '</td>\
          <td class="text-cyan">' + fmt(Math.round(dp.eftd)) + '</td>\
          <td style="' + priceStyle + '">' + fmtC(price) + '</td>\
          <td style="white-space:nowrap">' + monthDots + '</td>\
        </tr>';
      }).join('') +
      '</tbody>\
    </table>';
}

function enterMarketAndShowPage(market, pageUrl) {
  // Hide AM screen if visible
  var amScreen = document.getElementById('am-screen');
  if (amScreen) amScreen.style.display = 'none';
  // Enter market (shows app-screen)
  if (market && market !== currentMarket) {
    enterMarket(market);
  } else {
    document.getElementById('market-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
  }
  showView('page-detail', pageUrl);
}

function filterDealTables() {
  var filterSite = document.getElementById('deal-filter-site').value;
  document.querySelectorAll('.deal-pos-table tbody tr').forEach(function(tr) {
    var site = tr.getAttribute('data-site') || '';
    tr.style.display = (!filterSite || site === filterSite) ? '' : 'none';
  });
}

function showDealArticleDetail(pageUrl, market, sourceRowId) {
  // Remove any existing article detail
  var existing = document.getElementById('deal-article-detail');
  if (existing) existing.remove();

  // Get page data from the correct market WITHOUT switching the main view
  var pgInfo = null;
  var mkData = allMarkets[market];
  if (mkData) pgInfo = mkData.pages.find(function(p) { return p.url === pageUrl; });
  var pd = positionData[market] && positionData[market][pageUrl];
  if (!pgInfo && !pd) {
    showToast('Page not found', 'error');
    return;
  }

  var article = pgInfo ? pgInfo.article : pageUrl;
  var siteName = pgInfo ? pgInfo.siteName : '';
  var pgTraffic = pgInfo ? pgInfo.traffic : 0;
  var conv = pd ? (pd.conversion || 0) : 0;
  var positions = pd ? (pd.positions || []) : [];

  var m = amIsFullYear() ? '01/26' : amSelectedMonth;
  var monthLabel = amIsFullYear() ? 'Year 2026' : MONTH_LABELS[amSelectedMonth];

  // Build positions table for this page
  var posHtml = positions.map(function(pos, idx) {
    var posLabel = (function() {
      var nl = (pos.name || '').toLowerCase();
      if (nl === 'banner') return 'B';
      if (nl === 'link') return 'L';
      if (nl === 'operator of the month') return 'O';
      return '#' + (idx + 1);
    })();
    var md = getMonthDataForMonth(pos, m);
    var op = md.operator || '-';
    var isSold = md.sold;
    var price = md.price || 0;
    var eftd = getPositionEFTD(pgTraffic, conv, pos.name, idx, positions.length);
    return '<tr>\
      <td style="text-align:center">' + esc(posLabel) + '</td>\
      <td style="font-weight:600;color:' + (isSold ? 'var(--green)' : 'var(--text)') + '">' + esc(op) + '</td>\
      <td><span style="padding:2px 8px;border-radius:10px;font-size:11px;background:' + (isSold ? 'var(--green-bg)' : 'var(--surface)') + ';color:' + (isSold ? 'var(--green)' : 'var(--text-muted)') + '">' + (isSold ? 'Sold' : 'Free') + '</span></td>\
      <td class="text-green">' + fmtC(price) + '</td>\
      <td class="text-cyan">' + fmt(Math.round(eftd)) + '</td>\
    </tr>';
  }).join('');

  var totalEFTD = positions.reduce(function(s, pos, idx) {
    return s + getPositionEFTD(pgTraffic, conv, pos.name, idx, positions.length);
  }, 0);
  var totalRevenue = positions.reduce(function(s, pos) {
    var md = getMonthDataForMonth(pos, m);
    return s + (md.sold ? (md.price || 0) : 0);
  }, 0);
  var soldCount = positions.filter(function(pos) {
    var md = getMonthDataForMonth(pos, m);
    return md.sold;
  }).length;

  var detailDiv = document.createElement('div');
  detailDiv.id = 'deal-article-detail';
  detailDiv.style.cssText = 'margin-top:30px;padding:20px;border:1px solid var(--border);border-radius:6px;background:var(--surface)';
  detailDiv.innerHTML = '\
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">\
      <h3 style="font-size:16px;font-weight:700">' + esc(article) + '</h3>\
      <div style="display:flex;gap:8px">\
        <button class="btn-sm" onclick="enterMarketAndShowPage(\'' + esc(market).replace(/'/g, "\\'") + '\',\'' + esc(pageUrl).replace(/'/g, "\\'") + '\')" style="font-size:12px">\uD83D\uDD17 View in Rankings</button>\
        <button class="btn-sm" onclick="scrollBackToRow(\'' + sourceRowId + '\')" style="font-size:12px">\u2191 Back to list</button>\
      </div>\
    </div>\
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">' + esc(siteName) + ' \u00B7 <a href="' + esc(pageUrl) + '" target="_blank" style="color:var(--text-muted)">' + esc(pageUrl.replace(/^https?:\/\//, '').substring(0, 80)) + '</a></div>\
    <div class="stat-cards" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">\
      <div class="stat-card"><div class="label">Positions</div><div class="value">' + positions.length + '</div></div>\
      <div class="stat-card"><div class="label">Sold</div><div class="value green">' + soldCount + '</div></div>\
      <div class="stat-card"><div class="label">Revenue (' + monthLabel + ')</div><div class="value green">' + fmtC(totalRevenue) + '</div></div>\
      <div class="stat-card"><div class="label">Traffic</div><div class="value cyan">' + fmt(pgTraffic) + '</div></div>\
      <div class="stat-card"><div class="label">eFTDs</div><div class="value cyan">' + fmt(Math.round(totalEFTD)) + '</div></div>\
    </div>\
    <table class="data-table">\
      <thead><tr><th>Ranking</th><th>Operator</th><th>Status</th><th>Price</th><th>eFTDs</th></tr></thead>\
      <tbody>' + posHtml + '</tbody>\
    </table>';

  // Append at the bottom of the AM content area
  var ct = document.getElementById('am-content');
  ct.appendChild(detailDiv);

  // Scroll to the detail
  detailDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollBackToRow(rowId) {
  var row = document.getElementById(rowId);
  if (row) {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Highlight briefly
    row.style.background = 'var(--primary)';
    row.style.color = '#fff';
    setTimeout(function() { row.style.background = ''; row.style.color = ''; }, 1500);
  }
  // Remove the detail section
  var detail = document.getElementById('deal-article-detail');
  if (detail) detail.remove();
}

// ==================== AM / OPERATOR MANAGEMENT MODALS ====================

// Get list of all known AM names
function getAllAMNames() {
  var ams = new Set();
  Object.keys(operatorDB).forEach(function(market) {
    Object.keys(operatorDB[market]).forEach(function(opName) {
      var am = operatorDB[market][opName].am;
      if (am) ams.add(am);
    });
  });
  return Array.from(ams).sort();
}

// Get list of all known markets
function getAllMarketNames() {
  var mkts = {};
  Object.keys(allMarkets).forEach(function(m) { mkts[m] = true; });
  Object.keys(operatorDB).forEach(function(m) { mkts[m] = true; });
  return Object.keys(mkts).sort();
}

// Modal: Add operator to operatorDB
function showAddOperatorToDBModal(preselectedMarket) {
  var allAMs = getAllAMNames();
  var allMkts = getAllMarketNames();

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = '<div class="modal" style="max-width:450px">' +
    '<h3>Add Operator</h3>' +
    '<div style="margin-bottom:12px">' +
      '<label style="font-size:12px;display:block;margin-bottom:4px">Operator name *</label>' +
      '<input type="text" id="add-op-name" placeholder="e.g. Betano BR" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
    '</div>' +
    '<div style="margin-bottom:12px">' +
      '<label style="font-size:12px;display:block;margin-bottom:4px">Market *</label>' +
      '<select id="add-op-market" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
        '<option value="">Select market...</option>' +
        allMkts.map(function(m) { return '<option value="' + esc(m) + '" ' + (preselectedMarket && m === preselectedMarket ? 'selected' : '') + '>' + getFlag(m) + ' ' + esc(m) + '</option>'; }).join('') +
      '</select>' +
    '</div>' +
    '<div style="margin-bottom:12px">' +
      '<label style="font-size:12px;display:block;margin-bottom:4px">Account Manager</label>' +
      '<div style="display:flex;gap:8px">' +
        '<select id="add-op-am" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
          '<option value="">Unassigned</option>' +
          allAMs.map(function(am) { return '<option value="' + esc(am) + '">' + esc(am) + '</option>'; }).join('') +
          '<option value="__new__">+ New AM...</option>' +
        '</select>' +
      '</div>' +
      '<input type="text" id="add-op-am-new" placeholder="New AM name" style="display:none;width:100%;margin-top:6px;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
    '</div>' +
    '<div style="margin-bottom:12px">' +
      '<label style="font-size:12px;display:block;margin-bottom:4px">URL</label>' +
      '<input type="text" id="add-op-url" placeholder="https://..." style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
    '</div>' +
    '<div class="modal-actions">' +
      '<button class="btn-cancel" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
      '<button class="btn-primary" onclick="addOperatorToDB()">Add Operator</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);

  // Toggle new AM input
  document.getElementById('add-op-am').addEventListener('change', function() {
    document.getElementById('add-op-am-new').style.display = this.value === '__new__' ? 'block' : 'none';
  });
}

function addOperatorToDB() {
  var name = (document.getElementById('add-op-name').value || '').trim();
  var market = document.getElementById('add-op-market').value;
  var amSelect = document.getElementById('add-op-am').value;
  var amNew = (document.getElementById('add-op-am-new').value || '').trim();
  var url = (document.getElementById('add-op-url').value || '').trim();

  if (!name) { showToast('Operator name is required', 'error'); return; }
  if (!market) { showToast('Market is required', 'error'); return; }

  var am = amSelect === '__new__' ? amNew : amSelect;

  if (!operatorDB[market]) operatorDB[market] = {};
  if (operatorDB[market][name]) { showToast('Operator already exists in this market', 'error'); return; }

  operatorDB[market][name] = {
    baseName: name,
    displayName: name,
    am: am || '',
    url: url,
    status: '',
    license: '',
    visits: 0,
    keyAccount: false,
    company: '',
    fixFees: {},
    nbPositions: {}
  };

  // Also add to operators list for this market
  if (!operators[market]) operators[market] = [];
  if (!operators[market].includes(name)) {
    operators[market].push(name);
    operators[market].sort(function(a, b) { return a.localeCompare(b, 'en'); });
  }

  saveAll();
  document.querySelector('.modal-overlay')?.remove();
  showToast('Operator "' + name + '" added to ' + market, 'success');
  _amCache = null;
  renderAMCurrentView();
}

// Modal: Unified operator settings (identity, AM, variants, merge, delete)
function showOperatorAMSettings(opName, market) {
  var allAMs = getAllAMNames();
  var dbInfo = (operatorDB[market] || {})[opName] || {};
  var currentAMVal = dbInfo.am || '';
  var cfg = operatorConfig[opName] || {};
  var customVariants = getCustomVariants(opName);
  var allOps = getMarketOperators().filter(function(o) { return o !== opName; });
  // Also include operators from operatorDB for this market
  if (operatorDB[market]) {
    Object.keys(operatorDB[market]).forEach(function(op) {
      var bn = operatorDB[market][op].baseName || op;
      if (!allOps.includes(bn) && bn !== opName && op !== opName) allOps.push(bn);
    });
    allOps.sort();
  }

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'op-settings-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = '<div class="modal" style="max-width:520px;max-height:90vh;overflow-y:auto">' +
    '<h3>\u2699\uFE0F ' + esc(dbInfo.baseName || opName) + '</h3>' +
    '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">' + getFlag(market) + ' ' + esc(market) + '</div>' +

    // --- Identity section ---
    '<div style="margin-bottom:20px">' +
      '<h4 style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Identity</h4>' +
      '<div style="margin-bottom:8px">' +
        '<label style="font-size:12px;display:block;margin-bottom:4px">Display name</label>' +
        '<input type="text" id="op-set-name" value="' + esc(opName) + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
      '</div>' +
      '<div style="margin-bottom:8px">' +
        '<label style="font-size:12px;display:block;margin-bottom:4px">URL</label>' +
        '<input type="text" id="op-set-url" value="' + esc(dbInfo.url || cfg.url || '') + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
      '</div>' +
      '<div style="margin-bottom:8px">' +
        '<label style="font-size:12px;display:block;margin-bottom:4px">Market</label>' +
        '<select id="op-set-market" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
          getAllMarketNames().map(function(mk) { return '<option value="' + esc(mk) + '" ' + (mk === market ? 'selected' : '') + '>' + getFlag(mk) + ' ' + esc(mk) + '</option>'; }).join('') +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom:8px">' +
        '<label style="font-size:12px;display:block;margin-bottom:4px">Account status</label>' +
        '<select id="op-set-status" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
          '<option value="not opened"' + (dbInfo.status === 'not opened' ? ' selected' : '') + '>Not opened</option>' +
          '<option value="live"' + (dbInfo.status === 'live' ? ' selected' : '') + '>Live</option>' +
          '<option value="closed"' + (dbInfo.status === 'closed' ? ' selected' : '') + '>Closed</option>' +
          '<option value="no program"' + (dbInfo.status === 'no program' ? ' selected' : '') + '>No program</option>' +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom:8px">' +
        '<label style="font-size:12px;display:block;margin-bottom:4px">Account Manager</label>' +
        '<select id="op-set-am" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
          '<option value="">Unassigned</option>' +
          allAMs.map(function(am) { return '<option value="' + esc(am) + '" ' + (am === currentAMVal ? 'selected' : '') + '>' + esc(am) + '</option>'; }).join('') +
          '<option value="__new__">+ New AM...</option>' +
        '</select>' +
        '<input type="text" id="op-set-am-new" placeholder="New AM name" style="display:none;width:100%;margin-top:6px;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
      '</div>' +
    '</div>' +

    // --- Variants section ---
    '<div style="margin-bottom:20px;padding-top:16px;border-top:1px solid var(--border)">' +
      '<h4 style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Name variants</h4>' +
      '<p style="font-size:11px;color:var(--text-muted);margin-bottom:10px">When a scan finds one of these names, it will be automatically matched to this operator. Adding a variant also merges existing data.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">' +
        '<span class="badge badge-primary" style="font-size:12px">' + esc(dbInfo.baseName || opName) + '</span>' +
        customVariants.map(function(v) {
          return '<span class="badge" style="font-size:12px;background:var(--surface2);display:inline-flex;align-items:center;gap:4px">' +
            esc(v) +
            '<button onclick="doRemoveVariantDB(\'' + esc(opName).replace(/'/g, "\\'") + '\',\'' + esc(v).replace(/'/g, "\\'") + '\',\'' + esc(market).replace(/'/g, "\\'") + '\')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:0 2px;line-height:1">\u2715</button>' +
          '</span>';
        }).join('') +
      '</div>' +
      '<div style="display:flex;gap:6px">' +
        '<input type="text" id="op-set-variant" placeholder="Add variant name..." style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:12px">' +
        '<button class="btn-sm" onclick="doAddVariantDB(\'' + esc(opName).replace(/'/g, "\\'") + '\',\'' + esc(market).replace(/'/g, "\\'") + '\')">Add</button>' +
      '</div>' +
    '</div>' +

    // --- Merge section ---
    '<div style="margin-bottom:20px;padding-top:16px;border-top:1px solid var(--border)">' +
      '<h4 style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Merge another operator</h4>' +
      '<p style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Absorb another operator into this one. All positions will be transferred.</p>' +
      '<div style="display:flex;gap:6px">' +
        '<select id="op-set-merge" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
          '<option value="">Select operator to merge...</option>' +
          allOps.map(function(o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('') +
        '</select>' +
        '<button class="btn-sm" style="background:var(--red);color:#fff;border:none;padding:5px 14px" onclick="doMergeOpDB(\'' + esc(opName).replace(/'/g, "\\'") + '\',\'' + esc(market).replace(/'/g, "\\'") + '\')">Merge</button>' +
      '</div>' +
    '</div>' +

    // --- Actions ---
    '<div class="modal-actions" style="justify-content:space-between">' +
      '<button class="btn-cancel" style="color:var(--red);border-color:var(--red)" onclick="deleteOperatorFromDB(\'' + esc(opName).replace(/'/g, "\\'") + '\',\'' + esc(market).replace(/'/g, "\\'") + '\')">Delete</button>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn-cancel" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
        '<button class="btn-primary" onclick="saveOperatorAMSettings(\'' + esc(opName).replace(/'/g, "\\'") + '\',\'' + esc(market).replace(/'/g, "\\'") + '\')">Save</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);

  document.getElementById('op-set-am').addEventListener('change', function() {
    document.getElementById('op-set-am-new').style.display = this.value === '__new__' ? 'block' : 'none';
  });
}

// Variant/Merge helpers for the unified modal
function doAddVariantDB(opName, market) {
  var input = document.getElementById('op-set-variant');
  if (!input || !input.value.trim()) return;
  var variant = input.value.trim();
  addCustomVariant(opName, variant);
  document.getElementById('op-settings-overlay')?.remove();
  showOperatorAMSettings(opName, market);
  showToast('Variant "' + variant + '" added and merged', 'success');
}

function doRemoveVariantDB(opName, variant, market) {
  removeCustomVariant(opName, variant);
  document.getElementById('op-settings-overlay')?.remove();
  showOperatorAMSettings(opName, market);
}

function doMergeOpDB(targetName, market) {
  var select = document.getElementById('op-set-merge');
  var sourceName = select?.value;
  if (!sourceName) { showToast('Select an operator to merge', 'warning'); return; }
  if (!confirm('Merge "' + sourceName + '" into "' + targetName + '"?\n\nAll positions will be transferred and "' + sourceName + '" will be removed.')) return;
  var count = mergeOperators(targetName, sourceName);
  document.getElementById('op-settings-overlay')?.remove();
  showToast('Merged ' + sourceName + ' into ' + targetName + ' (' + count + ' positions transferred)', 'success');
  // Refresh current view
  _amCache = null;
  if (opdbCurrentView === 'market-detail') renderOperatorsDBView();
  else if (amCurrentView) renderAMCurrentView();
}

function saveOperatorAMSettings(oldName, oldMarket) {
  var amSelect = document.getElementById('op-set-am').value;
  var amNew = (document.getElementById('op-set-am-new').value || '').trim();
  var newName = (document.getElementById('op-set-name').value || '').trim();
  var newMarket = document.getElementById('op-set-market').value;
  var newUrl = (document.getElementById('op-set-url').value || '').trim();
  var newStatus = (document.getElementById('op-set-status').value || '').trim();

  var am = amSelect === '__new__' ? amNew : amSelect;

  if (!newName) { showToast('Operator name is required', 'error'); return; }
  if (!newMarket) { showToast('Market is required', 'error'); return; }
  if (!operatorDB[oldMarket] || !operatorDB[oldMarket][oldName]) { showToast('Operator not found', 'error'); return; }

  // Update fields
  operatorDB[oldMarket][oldName].am = am || '';
  operatorDB[oldMarket][oldName].url = newUrl;
  operatorDB[oldMarket][oldName].status = newStatus;

  // Handle market change
  if (newMarket !== oldMarket) {
    if (!operatorDB[newMarket]) operatorDB[newMarket] = {};
    operatorDB[newMarket][oldName] = operatorDB[oldMarket][oldName];
    delete operatorDB[oldMarket][oldName];
    if (Object.keys(operatorDB[oldMarket]).length === 0) delete operatorDB[oldMarket];
  }

  // Handle rename (after potential market move)
  var targetMarket = newMarket || oldMarket;
  if (newName !== oldName) {
    operatorDB[targetMarket][newName] = operatorDB[targetMarket][oldName];
    operatorDB[targetMarket][newName].displayName = newName;
    operatorDB[targetMarket][newName].baseName = newName;
    delete operatorDB[targetMarket][oldName];

    // Also rename in operators list and positionData
    renameOperator(oldName, newName);
  }

  saveAll();
  document.querySelector('.modal-overlay')?.remove();
  showToast('Operator settings saved', 'success');
  _amCache = null;
  // Refresh whichever view is active
  var opdbScreen = document.getElementById('operators-db-screen');
  var amScreen = document.getElementById('am-screen');
  var appScreen = document.getElementById('app-screen');
  if (opdbScreen && opdbScreen.style.display !== 'none') {
    renderOperatorsDBView();
  } else if (amScreen && amScreen.style.display !== 'none') {
    renderAMCurrentView(currentAM || currentDealOp);
  } else if (appScreen && appScreen.style.display !== 'none') {
    // Refresh the current ranking view
    var ct = document.getElementById('main-content');
    if (ct && typeof renderOperatorDetail === 'function') {
      renderOperatorDetail(ct, newName || oldName);
    }
  }
}

function deleteOperatorFromDB(opName, market) {
  if (!confirm('Delete "' + opName + '" from ' + market + '? This will remove it from the operator database but NOT from position data.')) return;

  if (operatorDB[market]) {
    delete operatorDB[market][opName];
    if (Object.keys(operatorDB[market]).length === 0) delete operatorDB[market];
  }

  saveAll();
  document.querySelector('.modal-overlay')?.remove();
  showToast('Operator "' + opName + '" deleted from ' + market, 'success');
  _amCache = null;
  // Refresh whichever view is active
  var opdbScreen = document.getElementById('operators-db-screen');
  if (opdbScreen && opdbScreen.style.display !== 'none') {
    renderOperatorsDBView();
  } else {
    renderAMCurrentView();
  }
}

// ==================== DEAL MANAGEMENT MODALS ====================

function showExtendDealModal(opName, dealMarket) {
  // Find current deal end month across relevant markets
  var lastSoldMonth = null;
  var marketsToSearch = dealMarket ? [dealMarket] : Object.keys(positionData);

  marketsToSearch.forEach(function(market) {
    var pd = positionData[market] || {};
    Object.keys(pd).forEach(function(pageUrl) {
      var page = pd[pageUrl];
      if (!page.positions) return;
      page.positions.forEach(function(pos) {
        MONTHS_2026.forEach(function(m) {
          var md = getMonthDataForMonth(pos, m);
          if (md.sold && md.operator && operatorsMatch(md.operator, opName)) {
            lastSoldMonth = m;
          }
        });
      });
    });
  });

  var lastIdx = lastSoldMonth ? MONTHS_2026.indexOf(lastSoldMonth) : -1;
  var remainingMonths = MONTHS_2026.slice(lastIdx + 1);

  if (remainingMonths.length === 0) {
    showToast('Deal already covers all months of 2026', 'info');
    return;
  }

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = '<div class="modal" style="max-width:450px">' +
    '<h3>\uD83D\uDCC5 Extend Deal \u2014 ' + esc(opName) + '</h3>' +
    '<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">' +
      (lastSoldMonth ? 'Current deal ends: <strong>' + MONTH_LABELS[lastSoldMonth] + '</strong>' : 'No active deal found') +
    '</p>' +
    '<div style="margin-bottom:16px">' +
      '<label style="font-size:12px;display:block;margin-bottom:4px">Extend deal to:</label>' +
      '<select id="extend-to-month" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
        remainingMonths.map(function(m) {
          return '<option value="' + m + '">' + MONTH_LABELS[m] + '</option>';
        }).join('') +
      '</select>' +
    '</div>' +
    '<p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">This will copy the sold status and prices from ' +
      (lastSoldMonth ? MONTH_LABELS[lastSoldMonth] : 'the current month') + ' to all months up to and including the selected month.</p>' +
    '<div class="modal-actions">' +
      '<button class="btn-cancel" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
      '<button class="btn-primary" onclick="extendDeal(\'' + esc(opName).replace(/'/g, "\\'") + '\',\'' + esc(dealMarket || '').replace(/'/g, "\\'") + '\')">Extend Deal</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);
}

function extendDeal(opName, dealMarket) {
  var targetMonth = document.getElementById('extend-to-month').value;
  if (!targetMonth) return;

  var targetIdx = MONTHS_2026.indexOf(targetMonth);
  var extended = 0;
  var marketsToSearch = dealMarket ? [dealMarket] : Object.keys(positionData);

  marketsToSearch.forEach(function(market) {
    var pd = positionData[market] || {};
    Object.keys(pd).forEach(function(pageUrl) {
      var page = pd[pageUrl];
      if (!page.positions) return;
      page.positions.forEach(function(pos) {
        var lastSoldData = null;
        var lastSoldIdx = -1;
        MONTHS_2026.forEach(function(m, idx) {
          var md = getMonthDataForMonth(pos, m);
          if (md.sold && md.operator && operatorsMatch(md.operator, opName)) {
            lastSoldData = md;
            lastSoldIdx = idx;
          }
        });

        if (lastSoldData && lastSoldIdx < targetIdx) {
          for (var i = lastSoldIdx + 1; i <= targetIdx; i++) {
            if (!pos.months) pos.months = {};
            pos.months[MONTHS_2026[i]] = {
              operator: lastSoldData.operator,
              sold: true,
              price: lastSoldData.price
            };
            extended++;
          }
        }
      });
    });
  });

  document.querySelector('.modal-overlay')?.remove();

  if (extended > 0) {
    savePos();
    showToast('Deal extended: ' + extended + ' position-months added up to ' + MONTH_LABELS[targetMonth], 'success');
    renderAMCurrentView(currentDealOp);
  } else {
    showToast('No positions found to extend', 'info');
  }
}

function showReleasePosModal(opName, dealMarket) {
  var soldPositions = [];
  var marketsToSearch = dealMarket ? [dealMarket] : Object.keys(positionData);

  marketsToSearch.forEach(function(market) {
    var pd = positionData[market] || {};
    Object.keys(pd).forEach(function(pageUrl) {
      var page = pd[pageUrl];
      if (!page.positions) return;
      page.positions.forEach(function(pos, idx) {
        MONTHS_2026.forEach(function(m) {
          var md = getMonthDataForMonth(pos, m);
          if (md.sold && md.operator && operatorsMatch(md.operator, opName)) {
            var pgInfo = null;
            var mk = allMarkets[market];
            if (mk) pgInfo = mk.pages.find(function(p) { return p.url === pageUrl; });
            soldPositions.push({
              pageUrl: pageUrl,
              posIndex: idx,
              posName: pos.name,
              month: m,
              price: md.price,
              market: market,
              article: pgInfo ? pgInfo.article : pageUrl.replace(/^https?:\/\//, '').substring(0, 40)
            });
          }
        });
      });
    });
  });

  if (soldPositions.length === 0) {
    showToast('No sold positions found for this operator', 'info');
    return;
  }

  // Group by month
  var byMonth = {};
  soldPositions.forEach(function(sp) {
    if (!byMonth[sp.month]) byMonth[sp.month] = [];
    byMonth[sp.month].push(sp);
  });

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var monthsHtml = Object.keys(byMonth).sort().map(function(m) {
    var positions = byMonth[m];
    return '<div style="margin-bottom:12px">' +
      '<div style="font-weight:700;font-size:13px;margin-bottom:4px;color:var(--primary)">' + MONTH_LABELS[m] + ' (' + positions.length + ' positions, ' + fmtC(positions.reduce(function(s, p) { return s + p.price; }, 0)) + ')</div>' +
      positions.map(function(sp) {
        var posLabel = (function() {
          var nl = (sp.posName || '').toLowerCase();
          if (nl === 'banner') return 'B';
          if (nl === 'link') return 'L';
          if (nl === 'operator of the month') return 'O';
          return sp.posName;
        })();
        return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-left:8px;margin-bottom:2px;cursor:pointer">' +
          '<input type="checkbox" class="release-cb" data-month="' + sp.month + '" data-market="' + esc(sp.market) + '" data-pageurl="' + esc(sp.pageUrl) + '" data-posindex="' + sp.posIndex + '">' +
          '<span>P' + posLabel + ' \u2014 ' + esc(sp.article.substring(0, 40)) + ' (' + fmtC(sp.price) + ')</span>' +
        '</label>';
      }).join('') +
    '</div>';
  }).join('');

  overlay.innerHTML = '<div class="modal" style="max-width:550px;max-height:80vh;overflow-y:auto">' +
    '<h3>\u2702\uFE0F Release Positions \u2014 ' + esc(opName) + '</h3>' +
    '<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Select positions to release (set to free). This cannot be undone.</p>' +
    '<div style="margin-bottom:12px;display:flex;gap:8px">' +
      '<button class="btn-sm" onclick="document.querySelectorAll(\'.release-cb\').forEach(function(c){c.checked=true})">Select all</button>' +
      '<button class="btn-sm" onclick="document.querySelectorAll(\'.release-cb\').forEach(function(c){c.checked=false})">Deselect all</button>' +
    '</div>' +
    monthsHtml +
    '<div class="modal-actions">' +
      '<button class="btn-cancel" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
      '<button class="btn-primary" style="background:var(--red)" onclick="releasePositions(\'' + esc(opName).replace(/'/g, "\\'") + '\')">Release Selected</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);
}

function releasePositions(opName) {
  var checkboxes = document.querySelectorAll('.release-cb:checked');
  var released = 0;

  checkboxes.forEach(function(cb) {
    var month = cb.dataset.month;
    var market = cb.dataset.market;
    var pageUrl = cb.dataset.pageurl;
    var posIndex = parseInt(cb.dataset.posindex);

    var pd = positionData[market];
    if (!pd) return;
    var page = pd[pageUrl];
    if (!page || !page.positions || !page.positions[posIndex]) return;

    var pos = page.positions[posIndex];
    if (pos.months && pos.months[month]) {
      pos.months[month] = { operator: '', sold: false, price: 0 };
      released++;
    }
  });

  document.querySelector('.modal-overlay')?.remove();

  if (released > 0) {
    savePos();
    showToast(released + ' position(s) released for ' + opName, 'success');
    renderAMCurrentView(currentDealOp);
  } else {
    showToast('No positions selected', 'info');
  }
}

async function renderScanLogView(ct) {
  ct.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
    '<h2 style="font-size:18px;font-weight:700">Scan Log</h2>' +
    '<div style="display:flex;gap:8px;align-items:center">' +
      '<button class="btn" id="scan-all-btn" onclick="triggerScanAll()">\uD83D\uDD0D Scan all pages now</button>' +
      '<button class="btn" id="gsc-sync-btn" onclick="triggerGSCSync()" style="background:var(--surface);color:var(--text);border:1px solid var(--border)">\uD83D\uDCC8 Sync GSC traffic</button>' +
      '<button class="btn-sm" onclick="showScanConfig()">\u2699\uFE0F Schedule settings</button>' +
    '</div>' +
  '</div>' +
  '<div id="scan-config-info" style="margin-bottom:16px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:3px;font-size:13px">Loading scan config...</div>' +
  '<div id="gsc-status-info" style="margin-bottom:16px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:3px;font-size:13px">Loading GSC status...</div>' +
  '<div id="scan-log-content">Loading...</div>';

  // Load config
  try {
    var resp = await fetch('/api/scan-config');
    var data = await resp.json();
    var cfg = data.config;
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var statusHtml = cfg.enabled
      ? '<span style="color:var(--green)">\u25CF Enabled</span> \u2014 Every <strong>' + days[cfg.dayOfWeek] + '</strong> at <strong>' + String(cfg.hour).padStart(2, '0') + ':' + String(cfg.minute).padStart(2, '0') + '</strong>'
      : '<span style="color:var(--red)">\u25CF Disabled</span>';
    if (data.nextScan) {
      var next = new Date(data.nextScan);
      statusHtml += ' \u2014 Next scan: <strong>' + next.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</strong>';
    }
    document.getElementById('scan-config-info').innerHTML = statusHtml;
  } catch(e) {
    document.getElementById('scan-config-info').innerHTML = 'Failed to load scan config';
  }

  // Load GSC status
  try {
    var gscResp = await fetch('/api/gsc/status');
    var gscData = await gscResp.json();
    var gscHtml = '';
    if (gscData.configured) {
      gscHtml = '<span style="color:var(--green)">\u25CF GSC connected</span>';
      if (gscData.lastSync) {
        var syncDate = new Date(gscData.lastSync);
        gscHtml += ' \u2014 Last sync: <strong>' + syncDate.toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</strong>';
      } else {
        gscHtml += ' \u2014 Never synced';
      }
      gscHtml += ' \u2014 <strong>' + gscData.trafficPages + '</strong> pages with traffic data';
    } else {
      gscHtml = '<span style="color:var(--red)">\u25CF GSC not configured</span> \u2014 Place gsc-credentials.json in project root';
    }
    document.getElementById('gsc-status-info').innerHTML = '\uD83D\uDCC8 ' + gscHtml;
  } catch(e) {
    document.getElementById('gsc-status-info').innerHTML = 'Failed to load GSC status';
  }

  // Load log
  try {
    var resp2 = await fetch('/api/scan-log');
    var logData = await resp2.json();
    var logs = logData.log || [];

    if (logs.length === 0) {
      document.getElementById('scan-log-content').innerHTML = '<p style="color:var(--text-muted)">No scans have been run yet.</p>';
      return;
    }

    var html = logs.map(function(entry) {
      var ts = new Date(entry.timestamp);
      var dateStr = ts.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      var typeBadge = entry.type === 'auto'
        ? '<span class="badge badge-primary">Auto</span>'
        : '<span class="badge badge-purple">Manual</span>';

      // Compute summary for current market only
      var marketResults = (entry.results || []).filter(function(r) { return r.market === currentMarket; });
      var mScanned = marketResults.filter(function(r) { return r.status !== 'skipped'; }).length;
      var mSkipped = marketResults.filter(function(r) { return r.status === 'skipped'; }).length;
      var mAlerts = marketResults.reduce(function(sum, r) { return sum + (r.alerts || 0); }, 0);
      var mErrors = marketResults.filter(function(r) { return r.status === 'error'; }).length;

      if (marketResults.length === 0) return ''; // skip entries with no results for this market

      var summaryHtml = '<strong>' + mScanned + '</strong> scanned';
      if (mSkipped) summaryHtml += ', <strong>' + mSkipped + '</strong> skipped';
      if (mAlerts) summaryHtml += ', <span style="color:var(--yellow)"><strong>' + mAlerts + '</strong> alert(s)</span>';
      if (mErrors) summaryHtml += ', <span style="color:var(--red)"><strong>' + mErrors + '</strong> error(s)</span>';

      // Results details — filter by current market
      var resultsHtml = '';
      var alertResults = (entry.results || []).filter(function(r) {
        return (r.market === currentMarket) && (r.status !== 'ok' || r.alerts > 0);
      });
      if (alertResults.length > 0) {
        resultsHtml = '<div style="margin-top:8px;padding:8px;background:var(--surface2);border-radius:3px;font-size:12px">' +
          alertResults.map(function(r) {
            var icon = r.status === 'error' ? '\u274C' : r.status === 'no_results' ? '\u26A0\uFE0F' : '\uD83D\uDD14';
            var details = r.alertDetails ? r.alertDetails.join(', ') : r.status;
            var pageName = '';
            var pg = getPage(r.url);
            pageName = pg ? pg.name : r.url.replace(/^https?:\/\//, '').substring(0, 60);
            return '<div style="margin-bottom:4px">' + icon + ' <a href="#" onclick="event.preventDefault();showView(\'page-detail\',\'' + esc(r.url).replace(/'/g, "\\'") + '\')" style="font-weight:600;color:var(--primary);text-decoration:underline;cursor:pointer">' + esc(pageName) + '</a> \u2014 ' + esc(details) + '</div>';
          }).join('') +
        '</div>';
      }

      return '<div style="padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:3px;margin-bottom:8px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          typeBadge +
          '<span style="font-size:13px;font-weight:600">' + dateStr + '</span>' +
          '<span style="font-size:13px;color:var(--text-muted);margin-left:auto">' + summaryHtml + '</span>' +
        '</div>' +
        resultsHtml +
      '</div>';
    }).join('');

    document.getElementById('scan-log-content').innerHTML = html || '<p style="color:var(--text-muted)">No scan results for this market.</p>';
  } catch(e) {
    document.getElementById('scan-log-content').innerHTML = '<p style="color:var(--red)">Failed to load scan log</p>';
  }
}

async function triggerGSCSync() {
  var btn = document.getElementById('gsc-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = '\u23F3 Syncing...'; }
  try {
    var resp = await fetch('/api/gsc/sync-traffic', { method: 'POST' });
    var data = await resp.json();
    if (data.success) {
      showToast('GSC sync complete: ' + data.matchedSites + ' sites, ' + data.updatedPages + ' pages updated (' + data.period.start + ' to ' + data.period.end + ')', 'success', 6000);
      // Reload data to get updated traffic
      await loadPersisted();
      if (typeof applyGSCTraffic === 'function') applyGSCTraffic();
      renderScanLogView(document.getElementById('main-content'));
    } else {
      showToast('GSC sync failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch(e) {
    showToast('GSC sync error: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDCC8 Sync GSC traffic'; }
  }
}

async function triggerScanAll() {
  var btn = document.getElementById('scan-all-btn');
  if (btn) { btn.disabled = true; btn.textContent = '\u23F3 Scanning...'; }
  try {
    await fetch('/api/scan-all', { method: 'POST' });
    showToast('Scan started in background. Refresh the page in a few minutes to see results.', 'success', 6000);
  } catch(e) {
    showToast('Failed to start scan: ' + e.message, 'error');
  }
  setTimeout(function() {
    if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDD0D Scan all pages now'; }
  }, 10000);
}

function showScanConfig() {
  fetch('/api/scan-config').then(function(r) { return r.json(); }).then(function(data) {
    var cfg = data.config;
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = '<div class="modal" style="max-width:400px">' +
      '<h3>\u2699\uFE0F Auto-scan schedule</h3>' +
      '<div style="margin-bottom:16px">' +
        '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">' +
          '<label style="font-size:12px;width:70px">Enabled</label>' +
          '<label class="toggle" style="margin:0"><input type="checkbox" id="scan-cfg-enabled" ' + (cfg.enabled ? 'checked' : '') + '><span class="slider"></span></label>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">' +
          '<label style="font-size:12px;width:70px">Day</label>' +
          '<select id="scan-cfg-day" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
            days.map(function(d, i) { return '<option value="' + i + '" ' + (i === cfg.dayOfWeek ? 'selected' : '') + '>' + d + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">' +
          '<label style="font-size:12px;width:70px">Time</label>' +
          '<input type="time" id="scan-cfg-time" value="' + String(cfg.hour).padStart(2, '0') + ':' + String(cfg.minute).padStart(2, '0') + '" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">' +
        '</div>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn-cancel" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
        '<button class="btn-primary" onclick="saveScanConfig()">Save</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(overlay);
  });
}

function saveScanConfig() {
  var enabled = document.getElementById('scan-cfg-enabled')?.checked;
  var dayOfWeek = parseInt(document.getElementById('scan-cfg-day')?.value);
  var timeParts = (document.getElementById('scan-cfg-time')?.value || '06:00').split(':');
  var hour = parseInt(timeParts[0]) || 6;
  var minute = parseInt(timeParts[1]) || 0;

  fetch('/api/scan-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: enabled, dayOfWeek: dayOfWeek, hour: hour, minute: minute })
  }).then(function(r) { return r.json(); }).then(function() {
    document.querySelector('.modal-overlay')?.remove();
    showToast('Scan schedule saved', 'success');
    renderScanLogView(document.getElementById('main-content'));
  }).catch(function(e) {
    showToast('Failed to save: ' + e.message, 'error');
  });
}

// ==================== OPERATORS DB SCREEN ====================

function showOperatorsScreen() {
  document.getElementById('market-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('am-screen').style.display = 'none';
  document.getElementById('operators-db-screen').style.display = 'block';
  opdbCurrentView = 'market-list';
  opdbCurrentMarket = null;
  opdbViewHistory = [];
  renderOperatorsDBView();
}

function hideOperatorsScreen() {
  document.getElementById('operators-db-screen').style.display = 'none';
  document.getElementById('market-screen').style.display = 'block';
}

var opdbCurrentView = 'market-list'; // market-list | market-detail
var opdbCurrentMarket = null;
var opdbViewHistory = [];

function renderOperatorsDBView() {
  var ct = document.getElementById('operators-db-content');
  if (opdbCurrentView === 'market-detail' && opdbCurrentMarket) {
    renderOpDBMarketDetail(ct, opdbCurrentMarket);
  } else {
    renderOpDBMarketList(ct);
  }
}

function opdbNavigate(view, data) {
  opdbViewHistory.push({ view: opdbCurrentView, data: opdbCurrentMarket });
  opdbCurrentView = view;
  if (view === 'market-detail') opdbCurrentMarket = data;
  renderOperatorsDBView();
}

function opdbGoBack() {
  if (opdbViewHistory.length > 0) {
    var prev = opdbViewHistory.pop();
    opdbCurrentView = prev.view;
    opdbCurrentMarket = prev.data;
  } else {
    opdbCurrentView = 'market-list';
    opdbCurrentMarket = null;
  }
  renderOperatorsDBView();
}

function renderOpDBMarketList(ct) {
  var allMkts = Object.keys(operatorDB).sort();
  var totalOps = 0, totalWithAM = 0;
  allMkts.forEach(function(m) {
    var ops = Object.keys(operatorDB[m] || {});
    totalOps += ops.length;
    ops.forEach(function(op) { if (operatorDB[m][op].am) totalWithAM++; });
  });

  ct.innerHTML = '\
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">\
      <h2 style="font-size:18px;font-weight:700">Operators Database</h2>\
      <div style="display:flex;gap:8px">\
        <button class="btn-sm" onclick="showAddOperatorToDBModal()">+ Add Operator</button>\
        <button class="btn-sm" onclick="showOperatorDBImport()">Import CSV</button>\
      </div>\
    </div>\
    <div class="stat-cards" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">\
      <div class="stat-card"><div class="label">Total Operators</div><div class="value">' + totalOps + '</div></div>\
      <div class="stat-card"><div class="label">Markets</div><div class="value">' + allMkts.length + '</div></div>\
      <div class="stat-card"><div class="label">With AM</div><div class="value">' + totalWithAM + '</div></div>\
    </div>\
    <div class="am-grid">' +
    allMkts.map(function(market) {
      var ops = Object.keys(operatorDB[market] || {});
      var withAM = ops.filter(function(op) { return operatorDB[market][op].am; }).length;
      return '<div class="market-card" style="cursor:pointer" onclick="opdbNavigate(\'market-detail\',\'' + esc(market).replace(/'/g, "\\'") + '\')">' +
        '<div class="name" style="font-size:15px;font-weight:700">' + getFlag(market) + ' ' + esc(market) + '</div>' +
        '<div class="stats">' +
          '<span>' + ops.length + '</span> operators \u00B7 ' +
          '<span>' + withAM + '</span> with AM' +
        '</div>' +
      '</div>';
    }).join('') +
    '</div>';
}

function renderOpDBMarketDetail(ct, market) {
  var ops = operatorDB[market] || {};
  var opList = [];
  Object.keys(ops).forEach(function(opName) {
    var info = ops[opName];
    opList.push({
      name: opName,
      displayName: info.baseName || opName,
      am: info.am || '',
      url: info.url || '',
      status: info.status || '',
      info: info
    });
  });
  opList.sort(function(a, b) { return a.displayName.localeCompare(b.displayName); });

  var withAM = opList.filter(function(o) { return o.am; }).length;
  var withURL = opList.filter(function(o) { return o.url; }).length;

  ct.innerHTML = '\
    <button class="back-btn" onclick="opdbGoBack()">\u2190 Back</button>\
    <div class="page-header">\
      <h2 style="font-size:18px;font-weight:700">' + getFlag(market) + ' ' + esc(market) + '</h2>\
    </div>\
    <div class="stat-cards" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">\
      <div class="stat-card"><div class="label">Operators</div><div class="value">' + opList.length + '</div></div>\
      <div class="stat-card"><div class="label">With AM</div><div class="value">' + withAM + '</div></div>\
      <div class="stat-card"><div class="label">With URL</div><div class="value">' + withURL + '</div></div>\
    </div>\
    <div style="display:flex;gap:8px;margin-bottom:12px">\
      <input type="text" id="opdb-filter-name" placeholder="Search operator..." oninput="filterOpDBMarketTable()" style="padding:6px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px;flex:1;max-width:300px">\
      <button class="btn-sm" onclick="showAddOperatorToDBModal(\'' + esc(market).replace(/'/g, "\\'") + '\')">+ Add Operator</button>\
    </div>\
    <table class="data-table" id="opdb-detail-table">\
      <thead><tr>\
        <th data-sort="name">Operator</th>\
        <th data-sort="am">Account Manager</th>\
        <th data-sort="status">Status</th>\
        <th data-sort="url">URL</th>\
        <th>Actions</th>\
      </tr></thead>\
      <tbody>' +
      opList.map(function(op) {
        var logoUrl = op.url ? '<img src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(op.url.replace(/^https?:\/\//, '').split('/')[0]) + '&sz=16" style="width:16px;height:16px;margin-right:6px;vertical-align:middle;border-radius:2px" onerror="this.style.display=\'none\'">' : '';
        var urlShort = op.url ? op.url.replace(/^https?:\/\//, '').split('/')[0] : '';
        return '<tr data-opname="' + esc(op.displayName.toLowerCase()) + '">\
          <td style="font-weight:600">' + logoUrl + esc(op.displayName) + '</td>\
          <td>' + (op.am ? esc(op.am) : '<span style="color:var(--text-muted)">Unassigned</span>') + '</td>\
          <td>' + (op.status ? esc(op.status) : '<span style="color:var(--text-muted)">-</span>') + '</td>\
          <td style="font-size:12px">' + (urlShort ? '<a href="' + esc(op.url) + '" target="_blank" style="color:var(--text-muted)">' + esc(urlShort) + '</a>' : '') + '</td>\
          <td>\
            <button class="btn-sm" style="font-size:11px;padding:1px 5px" onclick="showOperatorAMSettings(\'' + esc(op.name).replace(/'/g, "\\'") + '\',\'' + esc(market).replace(/'/g, "\\'") + '\')" title="Edit">\u2699\uFE0F</button>\
            <button class="btn-sm" style="font-size:11px;padding:1px 5px;color:var(--red)" onclick="deleteOperatorFromDB(\'' + esc(op.name).replace(/'/g, "\\'") + '\',\'' + esc(market).replace(/'/g, "\\'") + '\')" title="Delete">\u2716</button>\
          </td>\
        </tr>';
      }).join('') +
      '</tbody>\
    </table>';

  setupSort('opdb-detail-table');
}

function filterOpDBMarketTable() {
  var filterName = (document.getElementById('opdb-filter-name').value || '').toLowerCase();
  document.querySelectorAll('#opdb-detail-table tbody tr').forEach(function(tr) {
    var opName = tr.getAttribute('data-opname') || '';
    tr.style.display = (!filterName || opName.indexOf(filterName) !== -1) ? '' : 'none';
  });
}
