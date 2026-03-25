// ==================== MARKETS MODULE ====================
function mktStatItem(val, label, color) {
  return '<div class="stat-item"><div class="stat-val" style="' + (color ? 'color:'+color : '') + '">' + val + '</div><div class="stat-lbl">' + label + '</div></div>';
}
var mktCurrentView = 'bu-list'; // bu-list | all-markets | area-list | market-list | market-detail
var mktCurrentBU = null;
var mktCurrentArea = null;
var mktCurrentMarket = null;
var mktViewHistory = [];
var mktFilter = '';

function showMarketsScreen() {
  if (typeof hideAllScreens === 'function') hideAllScreens();
  document.getElementById('markets-screen').style.display = 'block';
  mktCurrentView = 'bu-list';
  mktCurrentBU = null;
  mktCurrentArea = null;
  mktCurrentMarket = null;
  mktViewHistory = [];
  mktFilter = '';
  renderMarketsView();
}

function hideMarketsScreen() {
  document.getElementById('markets-screen').style.display = 'none';
  document.getElementById('home-screen').style.display = 'block';
}

function mktNavigate(view, data) {
  mktViewHistory.push({ view: mktCurrentView, bu: mktCurrentBU, area: mktCurrentArea, market: mktCurrentMarket, filter: mktFilter });
  mktCurrentView = view;
  mktFilter = '';
  if (view === 'area-list') { mktCurrentBU = data; }
  if (view === 'market-list') { mktCurrentArea = data; }
  if (view === 'market-detail') { mktCurrentMarket = data; }
  if (view === 'all-markets') { /* no extra state */ }
  renderMarketsView();
}

function mktGoBack() {
  if (mktViewHistory.length > 0) {
    var prev = mktViewHistory.pop();
    mktCurrentView = prev.view;
    mktCurrentBU = prev.bu;
    mktCurrentArea = prev.area;
    mktCurrentMarket = prev.market;
    mktFilter = prev.filter || '';
  } else {
    mktCurrentView = 'bu-list';
    mktCurrentBU = null;
    mktCurrentArea = null;
    mktCurrentMarket = null;
    mktFilter = '';
  }
  renderMarketsView();
}

function renderMarketsView() {
  var ct = document.getElementById('markets-content');
  var actions = document.getElementById('markets-topbar-actions');
  actions.innerHTML = '';

  if (mktCurrentView === 'market-detail' && mktCurrentMarket) {
    renderMarketDetail(ct);
  } else if (mktCurrentView === 'all-markets') {
    renderAllMarkets(ct);
  } else if (mktCurrentView === 'market-list' && mktCurrentArea) {
    renderMarketList(ct);
  } else if (mktCurrentView === 'area-list' && mktCurrentBU) {
    renderAreaList(ct);
  } else {
    renderBUList(ct);
  }
}

// ==================== HELPERS: get BU/Area maps ====================
function mktGetBUMap() {
  var mdb = window.marketsDB || {};
  var buMap = {};
  Object.keys(mdb).forEach(function(name) {
    var m = mdb[name];
    var bu = m.bu || 'Other';
    if (!buMap[bu]) buMap[bu] = [];
    buMap[bu].push(name);
  });
  return buMap;
}

function mktGetAreaMap(bu) {
  var mdb = window.marketsDB || {};
  var areaMap = {};
  Object.keys(mdb).forEach(function(name) {
    var m = mdb[name];
    if ((m.bu || 'Other') !== bu) return;
    var area = m.area || 'Other';
    if (!areaMap[area]) areaMap[area] = [];
    areaMap[area].push(name);
    // Bojoko markets also appear under a "Bojoko" area
    if (m.bojoko && area !== 'Bojoko') {
      if (!areaMap['Bojoko']) areaMap['Bojoko'] = [];
      areaMap['Bojoko'].push(name);
    }
  });
  return areaMap;
}

// ==================== BU LIST ====================
function renderBUList(ct) {
  var mdb = window.marketsDB || {};
  var buMap = mktGetBUMap();

  var buOrder = ['Brazil', 'Europe', 'Africa', 'Latam'];
  var buIcons = { 'Brazil': '🇧🇷', 'Europe': '🇪🇺', 'Africa': '🌍', 'Latam': '🌎' };
  var buList = buOrder.filter(function(b) { return buMap[b]; });
  // Add any other BU except Transverse (hidden from cards but data preserved)
  Object.keys(buMap).forEach(function(b) { if (buList.indexOf(b) === -1 && b !== 'Transverse' && b !== 'Other') buList.push(b); });

  var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">';
  html += '<h2 style="margin:0">Business Units</h2>';
  html += '<div style="display:flex;gap:8px">';
  html += '<button class="btn-sm" onclick="mktNavigate(\'all-markets\')">All Markets</button>';
  html += '<button class="btn-sm btn-primary" onclick="mktShowAddModal()">+ Add Market</button>';
  html += '</div>';
  html += '</div>';

  html += '<div class="stats-banner">';
  html += mktStatItem(buList.length, 'Business Units');
  html += '<div class="stat-sep"></div>';
  html += mktStatItem(Object.keys(mdb).length, 'Markets');
  html += '<div class="stat-sep"></div>';
  var pd = positionData || {};
  html += mktStatItem(Object.keys(pd).length, 'Active Markets');
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-top:16px">';
  buList.forEach(function(bu) {
    var markets = buMap[bu];
    var icon = buIcons[bu] || '📁';
    var areaMap = mktGetAreaMap(bu);
    var areaCount = Object.keys(areaMap).length;

    html += '<div class="home-card" onclick="mktNavigate(\'area-list\',\'' + bu.replace(/'/g, "\\'") + '\')" style="text-align:left;padding:20px 24px">';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">';
    html += '<span style="font-size:28px">' + icon + '</span>';
    html += '<span style="font-size:18px;font-weight:700">' + bu + '</span>';
    html += '</div>';
    html += '<div style="display:flex;gap:16px;font-size:13px;color:var(--text-muted)">';
    html += '<span>' + areaCount + ' area' + (areaCount > 1 ? 's' : '') + '</span>';
    html += '<span>' + markets.length + ' market' + (markets.length > 1 ? 's' : '') + '</span>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';
  ct.innerHTML = html;
}

// ==================== ALL MARKETS (flat list) ====================
function renderAllMarkets(ct) {
  var mdb = window.marketsDB || {};
  var pd = positionData || {};

  var allNames = Object.keys(mdb).sort();

  var html = '<div style="margin-bottom:16px">';
  html += '<button class="btn-sm" onclick="mktGoBack()" style="margin-right:8px">&larr; Back</button>';
  html += '<span style="font-size:18px;font-weight:700">All Markets</span>';
  html += '</div>';

  html += '<div class="stats-banner">';
  html += mktStatItem(allNames.length, 'Total Markets');
  html += '<div class="stat-sep"></div>';
  var active = allNames.filter(function(n) { return pd[n]; }).length;
  html += mktStatItem(active, 'With Rankings');
  html += '<div class="stat-sep"></div>';
  var regulated = allNames.filter(function(n) { return (mdb[n].regulationStatus || '') === 'Regulated'; }).length;
  html += mktStatItem(regulated, 'Regulated');
  html += '</div>';

  // Filter
  html += '<div class="filters" style="margin-bottom:16px">';
  html += '<input type="text" placeholder="Filter markets..." value="' + (mktFilter || '') + '" oninput="mktFilter=this.value;renderMarketsView()" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;width:250px;background:var(--surface)">';
  html += '</div>';

  var filtered = allNames.filter(function(name) {
    if (!mktFilter) return true;
    var q = mktFilter.toLowerCase();
    var m = mdb[name];
    return name.toLowerCase().indexOf(q) >= 0 ||
      (m.area || '').toLowerCase().indexOf(q) >= 0 ||
      (m.bu || '').toLowerCase().indexOf(q) >= 0 ||
      (m.code || '').toLowerCase().indexOf(q) >= 0;
  });

  html += mktBuildTable(filtered, true);
  ct.innerHTML = html;
}

// ==================== AREA LIST (within a BU) ====================
function renderAreaList(ct) {
  var mdb = window.marketsDB || {};
  var bu = mktCurrentBU;
  var areaMap = mktGetAreaMap(bu);
  var areas = Object.keys(areaMap).sort();

  // If only one area (like Brazil), skip to market list
  if (areas.length === 1) {
    mktCurrentArea = areas[0];
    renderMarketList(ct);
    return;
  }

  var html = '<div style="margin-bottom:16px">';
  html += '<button class="btn-sm" onclick="mktGoBack()" style="margin-right:8px">&larr; Back</button>';
  html += '<span style="font-size:18px;font-weight:700">' + bu + ' &mdash; Areas</span>';
  html += '</div>';

  html += '<div class="stats-banner">';
  html += mktStatItem(areas.length, 'Areas');
  html += '<div class="stat-sep"></div>';
  // Unique markets (Bojoko markets counted once)
  var uniqueMarkets = {};
  areas.forEach(function(a) { areaMap[a].forEach(function(n) { uniqueMarkets[n] = true; }); });
  html += mktStatItem(Object.keys(uniqueMarkets).length, 'Markets');
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-top:16px">';
  areas.forEach(function(area) {
    var markets = areaMap[area];
    var icon = area === 'Bojoko' ? '🎰' : '';
    html += '<div class="home-card" onclick="mktNavigate(\'market-list\',\'' + area.replace(/'/g, "\\'") + '\')" style="text-align:left;padding:20px 24px">';
    html += '<div style="font-size:16px;font-weight:700;margin-bottom:8px">' + (icon ? icon + ' ' : '') + area + '</div>';
    html += '<div style="font-size:13px;color:var(--text-muted)">' + markets.length + ' market' + (markets.length > 1 ? 's' : '') + '</div>';
    html += '<div style="font-size:12px;color:var(--text-muted);margin-top:6px">' + markets.join(', ') + '</div>';
    html += '</div>';
  });
  html += '</div>';
  ct.innerHTML = html;
}

// ==================== MARKET LIST (within an area) ====================
function renderMarketList(ct) {
  var mdb = window.marketsDB || {};
  var bu = mktCurrentBU;
  var area = mktCurrentArea;

  // For Bojoko area, get markets flagged bojoko in this BU
  var markets = [];
  if (area === 'Bojoko') {
    Object.keys(mdb).forEach(function(name) {
      var m = mdb[name];
      if ((m.bu || 'Other') !== bu) return;
      if (m.bojoko) markets.push(name);
    });
  } else {
    Object.keys(mdb).forEach(function(name) {
      var m = mdb[name];
      if ((m.bu || 'Other') !== bu) return;
      if ((m.area || 'Other') !== area) return;
      markets.push(name);
    });
  }
  markets.sort();

  var html = '<div style="margin-bottom:16px">';
  html += '<button class="btn-sm" onclick="mktGoBack()" style="margin-right:8px">&larr; Back</button>';
  html += '<span style="font-size:18px;font-weight:700">' + bu + ' &mdash; ' + area + '</span>';
  html += '</div>';

  var pd = positionData || {};
  html += '<div class="stats-banner">';
  html += mktStatItem(markets.length, 'Markets');
  html += '<div class="stat-sep"></div>';
  var activeMkts = markets.filter(function(n) { return pd[n]; }).length;
  html += mktStatItem(activeMkts, 'With Rankings');
  html += '</div>';

  // Filter
  html += '<div class="filters" style="margin-bottom:16px">';
  html += '<input type="text" placeholder="Filter markets..." value="' + (mktFilter || '') + '" oninput="mktFilter=this.value;renderMarketsView()" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;width:250px;background:var(--surface)">';
  html += '</div>';

  var filtered = markets.filter(function(name) {
    if (!mktFilter) return true;
    return name.toLowerCase().indexOf(mktFilter.toLowerCase()) >= 0;
  });

  html += mktBuildTable(filtered, false);
  ct.innerHTML = html;
}

// ==================== SHARED TABLE BUILDER ====================
function mktBuildTable(marketNames, showBUArea) {
  var mdb = window.marketsDB || {};
  var pd = positionData || {};

  var html = '<table class="tbl"><thead><tr>';
  html += '<th>Market</th><th>Code</th>';
  if (showBUArea) html += '<th>BU</th><th>Area</th>';
  html += '<th>Traffic Filter</th><th>Regulation</th><th>Pages</th><th>Operators</th><th>Priority</th>';
  html += '</tr></thead><tbody>';

  marketNames.forEach(function(name) {
    var m = mdb[name];
    var pageCount = pd[name] ? Object.keys(pd[name]).length : 0;
    var opCount = operatorDB[name] ? Object.keys(operatorDB[name]).length : 0;
    var regStyle = m.regulationStatus === 'Regulated' ? 'color:var(--green)' : m.regulationStatus === 'Illegal' ? 'color:var(--red)' : 'color:var(--text-muted)';

    html += '<tr onclick="mktNavigate(\'market-detail\',\'' + name.replace(/'/g, "\\'") + '\')" style="cursor:pointer">';
    html += '<td style="font-weight:600">' + mktFlag(m.code) + ' ' + name;
    if (m.bojoko) html += ' <span style="font-size:10px;background:#f0f9ff;color:#0ea5e9;padding:2px 6px;border-radius:4px">Bojoko</span>';
    html += '</td>';
    html += '<td>' + (m.code || '-') + '</td>';
    if (showBUArea) {
      html += '<td>' + (m.bu || '-') + '</td>';
      html += '<td>' + (m.area || '-') + '</td>';
    }
    html += '<td>' + (m.countryCodes || []).join(', ') + '</td>';
    html += '<td style="' + regStyle + '">' + (m.regulationStatus || '-') + '</td>';
    html += '<td>' + pageCount + '</td>';
    html += '<td>' + opCount + '</td>';
    html += '<td>' + (m.prio || '-') + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

// ==================== MARKET DETAIL ====================
function renderMarketDetail(ct) {
  var mdb = window.marketsDB || {};
  var pd = positionData || {};
  var name = mktCurrentMarket;
  var m = mdb[name] || {};

  var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">';
  html += '<div style="display:flex;align-items:center;gap:8px">';
  html += '<button class="btn-sm" onclick="mktGoBack()">&larr; Back</button>';
  html += '<span style="font-size:20px;font-weight:700">' + mktFlag(m.code) + ' ' + name + '</span>';
  if (m.bojoko) html += ' <span style="font-size:11px;background:#f0f9ff;color:#0ea5e9;padding:3px 8px;border-radius:4px">Bojoko</span>';
  html += '</div>';
  html += '<button class="btn-sm" onclick="mktShowEditModal(\'' + name.replace(/'/g, "\\'") + '\')">Edit</button>';
  html += '</div>';

  // Stats banner
  var pageCount = pd[name] ? Object.keys(pd[name]).length : 0;
  var opCount = operatorDB[name] ? Object.keys(operatorDB[name]).length : 0;
  var sites = m.sites || [];

  html += '<div class="stats-banner">';
  html += mktStatItem(m.code || '-', 'ISO Code');
  html += '<div class="stat-sep"></div>';
  html += mktStatItem((m.countryCodes || []).join(', '), 'Traffic Filter');
  html += '<div class="stat-sep"></div>';
  html += mktStatItem(m.area || '-', 'Area');
  html += '<div class="stat-sep"></div>';
  html += mktStatItem(m.bu || '-', 'Business Unit');
  html += '<div class="stat-sep"></div>';
  html += mktStatItem(pageCount, 'Pages');
  html += '<div class="stat-sep"></div>';
  html += mktStatItem(opCount, 'Operators');
  html += '<div class="stat-sep"></div>';
  html += mktStatItem(sites.length, 'Sites');
  html += '</div>';

  // Detail sections in 2 columns
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">';

  // Left column: Market Info
  html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px">';
  html += '<h3 style="margin:0 0 16px;font-size:15px">Market Info</h3>';
  html += mktInfoRow('Regulation', m.regulationStatus || '-', m.regulationStatus === 'Regulated' ? 'var(--green)' : m.regulationStatus === 'Illegal' ? 'var(--red)' : null);
  if (m.regulatorUrl) html += mktInfoRow('Regulator', '<a href="' + m.regulatorUrl + '" target="_blank" style="color:var(--primary);text-decoration:none">' + m.regulatorUrl.substring(0, 50) + '</a>');
  html += mktInfoRow('Legal', m.legal || '-');
  html += mktInfoRow('Illegal', m.illegal || '-');
  html += mktInfoRow('Restricted', m.restricted || '-');
  html += mktInfoRow('Active Players', m.activePlayers ? m.activePlayers.toLocaleString() : '-');
  html += mktInfoRow('Market Size', m.marketSize ? formatCurrency(m.marketSize) : '-');
  html += mktInfoRow('Growth YoY', m.growthYoY || '-');
  html += mktInfoRow('Player Value', m.playerValue ? formatCurrency(m.playerValue) : '-');
  html += mktInfoRow('Tax Burden', m.taxBurden || '-');
  html += '</div>';

  // Right column: Scores & SEO
  html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px">';
  html += '<h3 style="margin:0 0 16px;font-size:15px">Scores & SEO</h3>';
  html += mktInfoRow('Priority', m.prio || '-');
  html += mktInfoRow('Maturity Score', m.maturityScore || '-');
  html += mktInfoRow('Priority Score', m.priorityScore || '-');
  html += mktInfoRow('Risk Score', m.riskScore || '-');
  html += mktInfoRow('SEO Difficulty', m.seoDifficulty || '-');
  html += mktInfoRow('KW Volume Betting', m.keywordVolumeBetting ? m.keywordVolumeBetting.toLocaleString() : '-');
  html += mktInfoRow('KW Volume Casino', m.keywordVolumeCasino ? m.keywordVolumeCasino.toLocaleString() : '-');
  html += mktInfoRow('Affiliate Presence Betting', m.affiliatePresenceBetting || '-');
  html += mktInfoRow('Affiliate Presence Casino', m.affiliatePresenceCasino || '-');
  html += '</div>';

  html += '</div>';

  // Sites list
  if (sites.length > 0) {
    html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;margin-top:20px">';
    html += '<h3 style="margin:0 0 16px;font-size:15px">Sites (' + sites.length + ')</h3>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
    sites.forEach(function(site) {
      html += '<span style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:6px 12px;font-size:13px;font-weight:500">' + site + '</span>';
    });
    html += '</div></div>';
  }

  // Top operators
  var opList = operatorDB[name] ? Object.keys(operatorDB[name]) : [];
  if (opList.length > 0) {
    html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;margin-top:20px">';
    html += '<h3 style="margin:0 0 16px;font-size:15px">Operators (' + opList.length + ')</h3>';
    html += '<table class="tbl"><thead><tr><th>Operator</th><th>Account Manager</th><th>Status</th><th>License</th></tr></thead><tbody>';
    opList.sort().slice(0, 30).forEach(function(op) {
      var o = operatorDB[name][op];
      html += '<tr>';
      html += '<td style="font-weight:500">' + op + '</td>';
      html += '<td>' + (o.am || '-') + '</td>';
      html += '<td>' + (o.status || '-') + '</td>';
      html += '<td>' + (o.license || '-') + '</td>';
      html += '</tr>';
    });
    if (opList.length > 30) {
      html += '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);font-style:italic">+ ' + (opList.length - 30) + ' more operators</td></tr>';
    }
    html += '</tbody></table>';
    html += '</div>';
  }

  ct.innerHTML = html;
}

// ==================== HELPERS ====================
function mktInfoRow(label, value, color) {
  var style = color ? 'color:' + color + ';font-weight:600' : '';
  return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">' +
    '<span style="color:var(--text-muted)">' + label + '</span>' +
    '<span style="' + style + '">' + value + '</span>' +
    '</div>';
}

function mktFlag(code) {
  if (!code || code === '-') return '';
  var flags = {
    'BR':'🇧🇷','PT':'🇵🇹','FR':'🇫🇷','ES':'🇪🇸','IT':'🇮🇹','DE':'🇩🇪',
    'GB':'🇬🇧','US':'🇺🇸','CA':'🇨🇦','AU':'🇦🇺','MX':'🇲🇽','AR':'🇦🇷',
    'CL':'🇨🇱','PE':'🇵🇪','CO':'🇨🇴','EC':'🇪🇨','VE':'🇻🇪',
    'BE':'🇧🇪','CH':'🇨🇭','NL':'🇳🇱','AT':'🇦🇹','SE':'🇸🇪',
    'PL':'🇵🇱','CZ':'🇨🇿','HU':'🇭🇺','BG':'🇧🇬','RU':'🇷🇺','UA':'🇺🇦','RS':'🇷🇸','KZ':'🇰🇿','UZ':'🇺🇿',
    'ZA':'🇿🇦','NG':'🇳🇬','KE':'🇰🇪','AO':'🇦🇴','MZ':'🇲🇿',
    'SN':'🇸🇳','CM':'🇨🇲','CI':'🇨🇮','CD':'🇨🇩','MA':'🇲🇦',
    'IN':'🇮🇳','BD':'🇧🇩','JP':'🇯🇵',
    'IE':'🇮🇪','PA':'🇵🇦','SV':'🇸🇻','CR':'🇨🇷'
  };
  return flags[code] || '';
}

function formatCurrency(val) {
  if (!val) return '-';
  if (val >= 1000000) return '\u20AC' + (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return '\u20AC' + (val / 1000).toFixed(0) + 'K';
  return '\u20AC' + val;
}

// ==================== ADD MARKET MODAL ====================
function mktShowAddModal() {
  var mdb = window.marketsDB || {};
  // Collect existing BUs and areas
  var bus = {};
  var areas = {};
  Object.keys(mdb).forEach(function(n) {
    var m = mdb[n];
    if (m.bu) bus[m.bu] = true;
    if (m.area) areas[m.area] = true;
  });
  var buList = Object.keys(bus).sort();
  var areaList = Object.keys(areas).sort();

  var overlay = document.createElement('div');
  overlay.id = 'mkt-add-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';

  var buOptions = buList.map(function(b) { return '<option value="' + b + '">' + b + '</option>'; }).join('');
  var areaOptions = areaList.map(function(a) { return '<option value="' + a + '">' + a + '</option>'; }).join('');

  var regOptions = ['Regulated', 'Semi-regulated', 'Grey', 'Illegal'].map(function(r) {
    return '<option value="' + r + '">' + r + '</option>';
  }).join('');

  overlay.innerHTML = '<div style="background:var(--surface);border-radius:var(--radius-lg);padding:28px;width:520px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
    '<h2 style="margin:0 0 20px;font-size:18px">Add Market</h2>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      mktFormField('Name *', '<input id="mkt-add-name" type="text" placeholder="e.g. South Africa" ' + mktInputStyle() + '>') +
      mktFormField('ISO Code *', '<input id="mkt-add-code" type="text" placeholder="e.g. ZA" maxlength="3" ' + mktInputStyle() + ' style="text-transform:uppercase">') +
      mktFormField('Business Unit *', '<select id="mkt-add-bu" ' + mktInputStyle() + '><option value="">Select...</option>' + buOptions + '<option value="__new">+ New BU</option></select>') +
      mktFormField('Area *', '<select id="mkt-add-area" ' + mktInputStyle() + '><option value="">Select...</option>' + areaOptions + '<option value="__new">+ New Area</option></select>') +
      mktFormField('Regulation', '<select id="mkt-add-reg" ' + mktInputStyle() + '><option value="">-</option>' + regOptions + '</select>') +
      mktFormField('Bojoko', '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="mkt-add-bojoko"> This market has Bojoko presence</label>') +
      mktFormField('Traffic Filter', '<input id="mkt-add-traffic" type="text" placeholder="ISO code or &quot;all&quot;" value="" ' + mktInputStyle() + '>') +
    '</div>' +
    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">' +
      '<button class="btn-sm" onclick="mktCloseAddModal()">Cancel</button>' +
      '<button class="btn-sm btn-primary" onclick="mktSaveNewMarket()">Add Market</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) mktCloseAddModal(); });

  // Auto-fill traffic filter when code changes
  document.getElementById('mkt-add-code').addEventListener('input', function() {
    var tf = document.getElementById('mkt-add-traffic');
    if (!tf.dataset.manual) tf.value = this.value.toUpperCase();
  });
  document.getElementById('mkt-add-traffic').addEventListener('input', function() {
    this.dataset.manual = '1';
  });

  // Handle "New BU" / "New Area" selection
  document.getElementById('mkt-add-bu').addEventListener('change', function() {
    if (this.value === '__new') {
      var v = prompt('New Business Unit name:');
      if (v && v.trim()) {
        var opt = document.createElement('option');
        opt.value = v.trim();
        opt.text = v.trim();
        this.insertBefore(opt, this.querySelector('[value="__new"]'));
        this.value = v.trim();
      } else { this.value = ''; }
    }
  });
  document.getElementById('mkt-add-area').addEventListener('change', function() {
    if (this.value === '__new') {
      var v = prompt('New Area name:');
      if (v && v.trim()) {
        var opt = document.createElement('option');
        opt.value = v.trim();
        opt.text = v.trim();
        this.insertBefore(opt, this.querySelector('[value="__new"]'));
        this.value = v.trim();
      } else { this.value = ''; }
    }
  });
}

function mktInputStyle() {
  return 'style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;font-family:inherit;background:var(--surface)"';
}

function mktFormField(label, inputHtml, fullWidth) {
  return '<div style="' + (fullWidth ? '' : '') + '">' +
    '<label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">' + label + '</label>' +
    '<div>' + inputHtml + '</div>' +
  '</div>';
}

function mktCloseAddModal() {
  var el = document.getElementById('mkt-add-overlay');
  if (el) el.remove();
}

function mktSaveNewMarket() {
  var name = (document.getElementById('mkt-add-name').value || '').trim();
  var code = (document.getElementById('mkt-add-code').value || '').trim().toUpperCase();
  var bu = document.getElementById('mkt-add-bu').value;
  var area = document.getElementById('mkt-add-area').value;
  var reg = document.getElementById('mkt-add-reg').value;
  var bojoko = document.getElementById('mkt-add-bojoko').checked;
  var traffic = (document.getElementById('mkt-add-traffic').value || '').trim().toUpperCase();

  if (!name) return alert('Market name is required');
  if (!code) return alert('ISO code is required');
  if (!bu || bu === '__new') return alert('Business Unit is required');
  if (!area || area === '__new') return alert('Area is required');

  var mdb = window.marketsDB || {};
  if (mdb[name]) return alert('Market "' + name + '" already exists');

  var countryCodes = traffic ? traffic.split(',').map(function(c) { return c.trim(); }) : [code];

  mdb[name] = {
    code: code,
    countryCodes: countryCodes,
    area: area,
    bu: bu,
    bojoko: bojoko,
    activePlayers: 0,
    marketSize: 0,
    regulationStatus: reg,
    regulatorUrl: '',
    growthYoY: '',
    playerValue: 0,
    prio: 0,
    sites: [],
    legal: '',
    illegal: '',
    restricted: '',
    maturityScore: 0,
    priorityScore: 0,
    riskScore: 0,
    seoDifficulty: 0,
    taxBurden: '',
    keywordVolumeBetting: 0,
    keywordVolumeCasino: 0,
    affiliatePresenceBetting: 0,
    affiliatePresenceCasino: 0
  };

  window.marketsDB = mdb;
  mktSaveMarketsDB();
  mktCloseAddModal();
  renderMarketsView();
}

function mktSaveMarketsDB() {
  fetch('/api/markets-db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ marketsDB: window.marketsDB })
  }).then(function(r) {
    if (!r.ok) r.text().then(function(t) { console.error('[MARKETS] Save error:', t); });
  }).catch(function(e) { console.error('[MARKETS] Save error:', e); });
}

// ==================== EDIT MARKET MODAL ====================
function mktShowEditModal(marketName) {
  var mdb = window.marketsDB || {};
  var m = mdb[marketName];
  if (!m) return;

  var bus = {};
  var areas = {};
  Object.keys(mdb).forEach(function(n) {
    if (mdb[n].bu) bus[mdb[n].bu] = true;
    if (mdb[n].area) areas[mdb[n].area] = true;
  });
  var buList = Object.keys(bus).sort();
  var areaList = Object.keys(areas).sort();

  var buOptions = buList.map(function(b) { return '<option value="' + b + '"' + (b === m.bu ? ' selected' : '') + '>' + b + '</option>'; }).join('');
  var areaOptions = areaList.map(function(a) { return '<option value="' + a + '"' + (a === m.area ? ' selected' : '') + '>' + a + '</option>'; }).join('');

  var regValues = ['', 'Regulated', 'Semi-regulated', 'Grey', 'Illegal'];
  var regOptions = regValues.map(function(r) { return '<option value="' + r + '"' + (r === (m.regulationStatus || '') ? ' selected' : '') + '>' + (r || '-') + '</option>'; }).join('');

  var overlay = document.createElement('div');
  overlay.id = 'mkt-edit-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';

  var is = mktInputStyle();

  overlay.innerHTML = '<div style="background:var(--surface);border-radius:var(--radius-lg);padding:28px;width:560px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
    '<h2 style="margin:0 0 20px;font-size:18px">Edit Market: ' + marketName + '</h2>' +
    '<input type="hidden" id="mkt-edit-original" value="' + marketName.replace(/"/g, '&quot;') + '">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      mktFormField('Name', '<input id="mkt-edit-name" type="text" value="' + marketName.replace(/"/g, '&quot;') + '" ' + is + '>') +
      mktFormField('ISO Code', '<input id="mkt-edit-code" type="text" value="' + (m.code || '') + '" maxlength="3" ' + is + ' style="text-transform:uppercase">') +
      mktFormField('Business Unit', '<select id="mkt-edit-bu" ' + is + '><option value="">Select...</option>' + buOptions + '<option value="__new">+ New BU</option></select>') +
      mktFormField('Area', '<select id="mkt-edit-area" ' + is + '><option value="">Select...</option>' + areaOptions + '<option value="__new">+ New Area</option></select>') +
      mktFormField('Regulation', '<select id="mkt-edit-reg" ' + is + '>' + regOptions + '</select>') +
      mktFormField('Bojoko', '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="mkt-edit-bojoko"' + (m.bojoko ? ' checked' : '') + '> Bojoko presence</label>') +
      mktFormField('Traffic Filter', '<input id="mkt-edit-traffic" type="text" value="' + (m.countryCodes || []).join(', ') + '" ' + is + '>') +
      mktFormField('Regulator URL', '<input id="mkt-edit-regurl" type="text" value="' + (m.regulatorUrl || '') + '" ' + is + '>') +
      mktFormField('Active Players', '<input id="mkt-edit-players" type="number" value="' + (m.activePlayers || 0) + '" ' + is + '>') +
      mktFormField('Market Size (\u20AC)', '<input id="mkt-edit-size" type="number" value="' + (m.marketSize || 0) + '" ' + is + '>') +
      mktFormField('Growth YoY', '<input id="mkt-edit-growth" type="text" value="' + (m.growthYoY || '') + '" ' + is + '>') +
      mktFormField('Player Value (\u20AC)', '<input id="mkt-edit-pvalue" type="number" value="' + (m.playerValue || 0) + '" ' + is + '>') +
      mktFormField('Priority', '<input id="mkt-edit-prio" type="number" value="' + (m.prio || 0) + '" ' + is + '>') +
      mktFormField('Tax Burden', '<input id="mkt-edit-tax" type="text" value="' + (m.taxBurden || '') + '" ' + is + '>') +
      mktFormField('SEO Difficulty', '<input id="mkt-edit-seo" type="number" value="' + (m.seoDifficulty || 0) + '" ' + is + '>') +
      mktFormField('Maturity Score', '<input id="mkt-edit-maturity" type="number" value="' + (m.maturityScore || 0) + '" ' + is + '>') +
      mktFormField('KW Volume Betting', '<input id="mkt-edit-kwbet" type="number" value="' + (m.keywordVolumeBetting || 0) + '" ' + is + '>') +
      mktFormField('KW Volume Casino', '<input id="mkt-edit-kwcas" type="number" value="' + (m.keywordVolumeCasino || 0) + '" ' + is + '>') +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">' +
      mktFormField('Legal', '<input id="mkt-edit-legal" type="text" value="' + (m.legal || '').replace(/"/g, '&quot;') + '" ' + is + '>') +
      mktFormField('Illegal', '<input id="mkt-edit-illegal" type="text" value="' + (m.illegal || '').replace(/"/g, '&quot;') + '" ' + is + '>') +
      mktFormField('Restricted', '<input id="mkt-edit-restricted" type="text" value="' + (m.restricted || '').replace(/"/g, '&quot;') + '" ' + is + '>') +
    '</div>' +
    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">' +
      '<button class="btn-sm" onclick="mktCloseEditModal()">Cancel</button>' +
      '<button class="btn-sm btn-primary" onclick="mktSaveEditMarket()">Save</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) mktCloseEditModal(); });

  // Handle "New BU" / "New Area"
  document.getElementById('mkt-edit-bu').addEventListener('change', function() {
    if (this.value === '__new') {
      var v = prompt('New Business Unit name:');
      if (v && v.trim()) {
        var opt = document.createElement('option');
        opt.value = v.trim(); opt.text = v.trim();
        this.insertBefore(opt, this.querySelector('[value="__new"]'));
        this.value = v.trim();
      } else { this.value = m.bu || ''; }
    }
  });
  document.getElementById('mkt-edit-area').addEventListener('change', function() {
    if (this.value === '__new') {
      var v = prompt('New Area name:');
      if (v && v.trim()) {
        var opt = document.createElement('option');
        opt.value = v.trim(); opt.text = v.trim();
        this.insertBefore(opt, this.querySelector('[value="__new"]'));
        this.value = v.trim();
      } else { this.value = m.area || ''; }
    }
  });
}

function mktCloseEditModal() {
  var el = document.getElementById('mkt-edit-overlay');
  if (el) el.remove();
}

function mktSaveEditMarket() {
  var original = document.getElementById('mkt-edit-original').value;
  var name = (document.getElementById('mkt-edit-name').value || '').trim();
  var code = (document.getElementById('mkt-edit-code').value || '').trim().toUpperCase();
  var bu = document.getElementById('mkt-edit-bu').value;
  var area = document.getElementById('mkt-edit-area').value;
  var reg = document.getElementById('mkt-edit-reg').value;
  var bojoko = document.getElementById('mkt-edit-bojoko').checked;
  var traffic = (document.getElementById('mkt-edit-traffic').value || '').trim().toUpperCase();

  if (!name) return alert('Market name is required');
  if (!code) return alert('ISO code is required');
  if (!bu || bu === '__new') return alert('Business Unit is required');
  if (!area || area === '__new') return alert('Area is required');

  var mdb = window.marketsDB || {};

  // If name changed, check for conflicts and rename
  if (name !== original) {
    if (mdb[name]) return alert('Market "' + name + '" already exists');
    mdb[name] = mdb[original];
    delete mdb[original];
  }

  var countryCodes = traffic ? traffic.split(',').map(function(c) { return c.trim(); }).filter(Boolean) : [code];

  var entry = mdb[name];
  entry.code = code;
  entry.countryCodes = countryCodes;
  entry.bu = bu;
  entry.area = area;
  entry.bojoko = bojoko;
  entry.regulationStatus = reg;
  entry.regulatorUrl = document.getElementById('mkt-edit-regurl').value.trim();
  entry.activePlayers = parseFloat(document.getElementById('mkt-edit-players').value) || 0;
  entry.marketSize = parseFloat(document.getElementById('mkt-edit-size').value) || 0;
  entry.growthYoY = document.getElementById('mkt-edit-growth').value.trim();
  entry.playerValue = parseFloat(document.getElementById('mkt-edit-pvalue').value) || 0;
  entry.prio = parseFloat(document.getElementById('mkt-edit-prio').value) || 0;
  entry.taxBurden = document.getElementById('mkt-edit-tax').value.trim();
  entry.seoDifficulty = parseFloat(document.getElementById('mkt-edit-seo').value) || 0;
  entry.maturityScore = parseFloat(document.getElementById('mkt-edit-maturity').value) || 0;
  entry.keywordVolumeBetting = parseFloat(document.getElementById('mkt-edit-kwbet').value) || 0;
  entry.keywordVolumeCasino = parseFloat(document.getElementById('mkt-edit-kwcas').value) || 0;
  entry.legal = document.getElementById('mkt-edit-legal').value.trim();
  entry.illegal = document.getElementById('mkt-edit-illegal').value.trim();
  entry.restricted = document.getElementById('mkt-edit-restricted').value.trim();

  window.marketsDB = mdb;
  mktSaveMarketsDB();
  mktCloseEditModal();

  // If name changed, update navigation
  if (name !== original) {
    mktCurrentMarket = name;
  }
  renderMarketsView();
}
