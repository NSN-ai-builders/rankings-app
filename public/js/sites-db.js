// ==================== SITES DATABASE ====================

var sdbCurrentView = 'site-list'; // site-list | site-detail
var sdbCurrentSite = null;
var sdbViewHistory = [];
var sdbFilter = '';

// ==================== NAVIGATION ====================

function showSitesDBScreen() {
  if (typeof hideAllScreens === 'function') hideAllScreens();
  document.getElementById('sites-db-screen').style.display = 'block';
  sdbCurrentView = 'site-list';
  sdbCurrentSite = null;
  sdbViewHistory = [];
  sdbFilter = '';
  renderSitesDBView();
}

function hideSitesDBScreen() {
  document.getElementById('sites-db-screen').style.display = 'none';
  document.getElementById('home-screen').style.display = 'block';
}

function sdbNavigate(view, data) {
  sdbViewHistory.push({ view: sdbCurrentView, data: sdbCurrentSite });
  sdbCurrentView = view;
  if (view === 'site-detail') sdbCurrentSite = data;
  renderSitesDBView();
}

function sdbGoBack() {
  if (sdbViewHistory.length > 0) {
    var prev = sdbViewHistory.pop();
    sdbCurrentView = prev.view;
    sdbCurrentSite = prev.data;
  } else {
    sdbCurrentView = 'site-list';
    sdbCurrentSite = null;
  }
  renderSitesDBView();
}

function renderSitesDBView() {
  var ct = document.getElementById('sites-db-content');
  if (sdbCurrentView === 'site-detail' && sdbCurrentSite) {
    renderSiteDetailView(ct, sdbCurrentSite);
  } else {
    renderSiteListView(ct);
  }
}

// ==================== DATA AGGREGATION ====================

function getSitesAggregatedData() {
  // Merge data from allMarkets (ranking pages) + sitesDB (custom/business pages)
  var sites = {}; // { siteName: { domain, pages: [...], markets: Set, totalTraffic, totalPositions, soldCount } }

  // 1. Collect from allMarkets (ranking pages from CSV)
  Object.keys(allMarkets).forEach(function(market) {
    var mk = allMarkets[market];
    (mk.pages || []).forEach(function(page) {
      var siteName = page.siteName;
      if (!siteName) return;
      if (!sites[siteName]) {
        var domain = getDomainFromUrl(page.url);
        sites[siteName] = { domain: domain, pages: [], markets: new Set(), totalTraffic: 0, totalPositions: 0, soldCount: 0, freeCount: 0 };
      }
      sites[siteName].markets.add(market);

      // Get traffic (GSC or CSV) — support new format { current, previous, monthly }
      var traffic = 0;
      var gscEntry = window.gscTraffic && window.gscTraffic[market] && window.gscTraffic[market][page.url];
      if (gscEntry) {
        traffic = gscEntry.current !== undefined ? gscEntry.current : (gscEntry.clicks || 0);
      } else {
        traffic = page.traffic || 0;
      }

      // Count positions status for current month
      var posCount = 0, soldPos = 0, freePos = 0;
      var pd = positionData[market] && positionData[market][page.url];
      if (pd && pd.positions) {
        pd.positions.forEach(function(pos, idx) {
          posCount++;
          var md = pos.months && pos.months[selectedMonth];
          if (md && md.sold) soldPos++;
          else freePos++;
        });
      } else {
        posCount = page.nbPos || page.positions.length || 0;
        freePos = posCount;
      }

      sites[siteName].totalTraffic += traffic;
      sites[siteName].totalPositions += posCount;
      sites[siteName].soldCount += soldPos;
      sites[siteName].freeCount += freePos;

      sites[siteName].pages.push({
        url: page.url,
        article: page.article,
        market: market,
        traffic: traffic,
        type: 'ranking',
        positions: posCount,
        soldPositions: soldPos,
        freePositions: freePos,
        topic: page.topic || '',
        area: page.area || ''
      });
    });
  });

  // 2. Merge custom pages from sitesDB
  Object.keys(sitesDB).forEach(function(siteName) {
    var siteInfo = sitesDB[siteName];
    if (!sites[siteName]) {
      sites[siteName] = { domain: siteInfo.domain || '', pages: [], markets: new Set(), totalTraffic: 0, totalPositions: 0, soldCount: 0, freeCount: 0 };
    }
    // Apply custom site settings
    if (siteInfo.domain) sites[siteName].domain = siteInfo.domain;
    if (siteInfo.contactName) sites[siteName].contactName = siteInfo.contactName;
    if (siteInfo.contactEmail) sites[siteName].contactEmail = siteInfo.contactEmail;
    if (siteInfo.notes) sites[siteName].notes = siteInfo.notes;

    // Add custom pages (non-ranking)
    (siteInfo.pages || []).forEach(function(cp) {
      // Check if this page already exists from allMarkets
      var exists = sites[siteName].pages.some(function(p) { return p.url === cp.url && p.market === cp.market; });
      if (!exists) {
        sites[siteName].markets.add(cp.market || 'Global');
        sites[siteName].pages.push({
          url: cp.url,
          article: cp.article || cp.title || '',
          market: cp.market || 'Global',
          traffic: cp.traffic || 0,
          type: cp.type || 'business',
          positions: 0,
          soldPositions: 0,
          freePositions: 0,
          topic: cp.topic || '',
          area: ''
        });
        sites[siteName].totalTraffic += (cp.traffic || 0);
      }
    });
  });

  // Convert Set to array
  Object.values(sites).forEach(function(s) { s.markets = Array.from(s.markets).sort(); });

  return sites;
}

// ==================== LIST VIEW ====================

function renderSiteListView(ct) {
  var sites = getSitesAggregatedData();
  var siteNames = Object.keys(sites).sort(function(a, b) {
    return sites[b].totalTraffic - sites[a].totalTraffic; // Sort by traffic desc
  });

  // Stats
  var totalSites = siteNames.length;
  var totalPages = 0, totalTraffic = 0, totalPositions = 0, totalSold = 0;
  siteNames.forEach(function(s) {
    totalPages += sites[s].pages.length;
    totalTraffic += sites[s].totalTraffic;
    totalPositions += sites[s].totalPositions;
    totalSold += sites[s].soldCount;
  });

  // Filter
  var filteredSites = siteNames;
  if (sdbFilter) {
    var f = sdbFilter.toLowerCase();
    filteredSites = siteNames.filter(function(s) {
      return s.toLowerCase().includes(f) || (sites[s].domain || '').toLowerCase().includes(f);
    });
  }

  ct.innerHTML = '\
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">\
      <h2 style="font-size:18px;font-weight:700">Sites Database</h2>\
      <div style="display:flex;gap:8px">\
        <button class="btn-sm" onclick="showAddSiteModal()">+ Add Site</button>\
      </div>\
    </div>\
    <div class="stats-banner">\
      <div class="stat-item"><div class="stat-val">' + totalSites + '</div><div class="stat-lbl">Sites</div></div>\
      <div class="stat-sep"></div>\
      <div class="stat-item"><div class="stat-val">' + totalPages + '</div><div class="stat-lbl">Pages</div></div>\
      <div class="stat-sep"></div>\
      <div class="stat-item"><div class="stat-val">' + fmt(totalTraffic) + '</div><div class="stat-lbl">Monthly Traffic</div></div>\
      <div class="stat-sep"></div>\
      <div class="stat-item"><div class="stat-val">' + totalPositions + '</div><div class="stat-lbl">Positions</div></div>\
      <div class="stat-sep"></div>\
      <div class="stat-item"><div class="stat-val green">' + totalSold + '</div><div class="stat-lbl">Sold</div></div>\
    </div>\
    <div style="margin-bottom:16px">\
      <input type="text" id="sdb-search" placeholder="Search site..." value="' + esc(sdbFilter) + '" oninput="sdbFilter=this.value;renderSitesDBView()" \
        style="padding:8px 12px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px;width:300px">\
    </div>\
    <div class="am-grid">' +
    filteredSites.map(function(siteName) {
      var s = sites[siteName];
      var faviconUrl = s.domain ? getFaviconUrl(s.domain) : '';
      var logoHtml = faviconUrl ? '<img src="' + faviconUrl + '" style="width:20px;height:20px;border-radius:2px;object-fit:contain;vertical-align:middle" onerror="this.style.display=\'none\'"> ' : '';
      var rankingPages = s.pages.filter(function(p) { return p.type === 'ranking'; }).length;
      var businessPages = s.pages.filter(function(p) { return p.type !== 'ranking'; }).length;
      var pagesLabel = rankingPages + ' ranking';
      if (businessPages > 0) pagesLabel += ' + ' + businessPages + ' business';

      var marketsHtml = s.markets.map(function(m) { return getFlag(m); }).join(' ');

      return '<div class="market-card" style="cursor:pointer" onclick="sdbNavigate(\'site-detail\',\'' + esc(siteName).replace(/'/g, "\\'") + '\')">' +
        '<div class="name" style="font-size:15px;font-weight:700;display:flex;align-items:center;gap:6px">' +
          logoHtml + esc(siteName) +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + esc(s.domain) + '</div>' +
        '<div style="margin-top:8px;font-size:12px;color:var(--text-muted)">' +
          '<div>' + marketsHtml + ' <span style="margin-left:4px">' + s.markets.length + ' market' + (s.markets.length > 1 ? 's' : '') + '</span></div>' +
          '<div style="margin-top:4px"><span style="color:var(--text);font-weight:600">' + s.pages.length + '</span> pages (' + pagesLabel + ')</div>' +
          '<div style="margin-top:2px">Traffic: <span style="color:var(--text);font-weight:600">' + fmt(s.totalTraffic) + '</span></div>' +
          '<div style="margin-top:2px">Positions: <span style="color:var(--text);font-weight:600">' + s.totalPositions + '</span> (' +
            '<span style="color:var(--green)">' + s.soldCount + ' sold</span> / ' +
            '<span style="color:var(--text-muted)">' + s.freeCount + ' free</span>)</div>' +
        '</div>' +
      '</div>';
    }).join('') +
    '</div>';
}

// ==================== SITE DETAIL VIEW ====================

function renderSiteDetailView(ct, siteName) {
  var sites = getSitesAggregatedData();
  var site = sites[siteName];
  if (!site) {
    ct.innerHTML = '<p>Site not found.</p>';
    return;
  }

  var faviconUrl = site.domain ? getFaviconUrl(site.domain) : '';
  var logoHtml = faviconUrl ? '<img src="' + faviconUrl + '" style="width:24px;height:24px;border-radius:2px;object-fit:contain;vertical-align:middle" onerror="this.style.display=\'none\'"> ' : '';

  // Sort pages: by market then by traffic desc
  var pages = site.pages.slice().sort(function(a, b) {
    var mc = a.market.localeCompare(b.market);
    if (mc !== 0) return mc;
    return b.traffic - a.traffic;
  });

  // Stats
  var rankingPages = pages.filter(function(p) { return p.type === 'ranking'; }).length;
  var businessPages = pages.filter(function(p) { return p.type !== 'ranking'; }).length;
  var siteInfo = sitesDB[siteName] || {};

  // Filter by market
  var marketOptions = site.markets.map(function(m) {
    return '<option value="' + esc(m) + '">' + m + '</option>';
  }).join('');

  // Build market settings cards
  var mktSettings = (siteInfo.marketSettings || {});
  var marketCardsHtml = site.markets.map(function(market) {
    var ms = mktSettings[market] || {};
    var contactName = ms.contactName || '';
    var contactEmail = ms.contactEmail || '';
    var asanaUrl = ms.asanaProjectUrl || '';
    var notes = ms.notes || '';
    var hasInfo = contactName || contactEmail || asanaUrl || notes;
    var contactLine = '';
    if (contactName && contactEmail) contactLine = esc(contactName) + ' (<a href="mailto:' + esc(contactEmail) + '" style="color:var(--primary);text-decoration:none">' + esc(contactEmail) + '</a>)';
    else if (contactName) contactLine = esc(contactName);
    else if (contactEmail) contactLine = '<a href="mailto:' + esc(contactEmail) + '" style="color:var(--primary);text-decoration:none">' + esc(contactEmail) + '</a>';
    var asanaLine = asanaUrl ? '<a href="' + esc(asanaUrl) + '" target="_blank" style="color:var(--primary);text-decoration:none;font-size:11px" title="' + esc(asanaUrl) + '">Open in Asana</a>' : '';
    return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:3px;padding:12px 16px;min-width:200px;flex:1;max-width:300px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
        '<span style="font-weight:700;font-size:13px">' + getFlag(market) + ' ' + esc(market) + '</span>' +
        '<button class="btn-sm" onclick="showMarketSettingsModal(\'' + esc(siteName).replace(/'/g, "\\'") + '\',\'' + esc(market).replace(/'/g, "\\'") + '\')" style="font-size:11px;padding:2px 8px">Edit</button>' +
      '</div>' +
      (contactLine ? '<div style="font-size:11px;color:var(--text-muted)">Contact: ' + contactLine + '</div>' : '') +
      (asanaLine ? '<div style="font-size:11px;color:var(--text-muted)">Asana: ' + asanaLine + '</div>' : '') +
      (notes ? '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + esc(notes) + '</div>' : '') +
      (!hasInfo ? '<div style="font-size:11px;color:var(--text-muted);font-style:italic">No details yet</div>' : '') +
    '</div>';
  }).join('');

  ct.innerHTML = '\
    <button class="back-btn" onclick="sdbGoBack()" style="margin-bottom:12px;background:none;border:1px solid var(--border);padding:6px 14px;border-radius:3px;cursor:pointer;font-size:13px">\u2190 Back</button>\
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">\
      <h2 style="font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px">' + logoHtml + esc(siteName) + '</h2>\
      <span style="color:var(--text-muted);font-size:13px">' + esc(site.domain) + '</span>\
      <div style="margin-left:auto;display:flex;gap:8px">\
        <button class="btn-sm" onclick="showAddPageToSiteModal(\'' + esc(siteName).replace(/'/g, "\\'") + '\')">+ Add Page</button>\
        <button class="btn-sm" onclick="showSiteSettingsModal(\'' + esc(siteName).replace(/'/g, "\\'") + '\')">Site Settings</button>\
      </div>\
    </div>' +
    ((siteInfo.contactName || siteInfo.contactEmail) ? '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Default contact: ' + esc(siteInfo.contactName || '') + (siteInfo.contactEmail ? ' (' + esc(siteInfo.contactEmail) + ')' : '') + '</div>' : '') +
    (siteInfo.notes ? '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Notes: ' + esc(siteInfo.notes) + '</div>' : '') +
    '<div style="margin-bottom:16px">\
      <h3 style="font-size:14px;font-weight:600;margin-bottom:8px">Market Details</h3>\
      <div style="display:flex;gap:10px;flex-wrap:wrap">' + marketCardsHtml + '</div>\
    </div>\
    <div class="stats-banner">\
      <div class="stat-item"><div class="stat-val">' + site.markets.length + '</div><div class="stat-lbl">Markets</div></div>\
      <div class="stat-sep"></div>\
      <div class="stat-item"><div class="stat-val">' + rankingPages + '</div><div class="stat-lbl">Ranking Pages</div></div>\
      <div class="stat-sep"></div>\
      <div class="stat-item"><div class="stat-val">' + businessPages + '</div><div class="stat-lbl">Business Pages</div></div>\
      <div class="stat-sep"></div>\
      <div class="stat-item"><div class="stat-val">' + fmt(site.totalTraffic) + '</div><div class="stat-lbl">Monthly Traffic</div></div>\
      <div class="stat-sep"></div>\
      <div class="stat-item"><div class="stat-val">' + site.totalPositions + '</div><div class="stat-lbl">Positions</div></div>\
      <div class="stat-sep"></div>\
      <div class="stat-item"><div class="stat-val green">' + site.soldCount + '</div><div class="stat-lbl">Sold</div></div>\
    </div>\
    <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">\
      <select id="sdb-market-filter" onchange="filterSiteDetailTable()" style="padding:6px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        <option value="">All markets</option>' + marketOptions + '\
      </select>\
      <select id="sdb-type-filter" onchange="filterSiteDetailTable()" style="padding:6px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        <option value="">All types</option>\
        <option value="ranking">Ranking</option>\
        <option value="business">Business</option>\
      </select>\
      <input type="text" id="sdb-page-search" placeholder="Search page..." oninput="filterSiteDetailTable()" \
        style="padding:6px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px;flex:1;max-width:300px">\
    </div>\
    <table class="data-table" id="sdb-detail-table">\
      <thead><tr>\
        <th>Market</th>\
        <th>Article</th>\
        <th>Type</th>\
        <th>URL</th>\
        <th style="text-align:right">Traffic</th>\
        <th style="text-align:center">Positions</th>\
        <th style="text-align:center">Sold</th>\
        <th style="text-align:center">Free</th>\
        <th>Actions</th>\
      </tr></thead>\
      <tbody>' +
      pages.map(function(p, idx) {
        var typeBadge = p.type === 'ranking'
          ? '<span style="background:rgba(27,118,188,0.1);color:var(--primary);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">Ranking</span>'
          : '<span style="background:rgba(46,204,113,0.1);color:var(--green);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">Business</span>';
        var shortUrl = p.url.length > 50 ? p.url.substring(0, 50) + '...' : p.url;
        var deleteBtn = p.type !== 'ranking' ? '<button class="btn-sm" onclick="removeSiteDBPage(\'' + esc(siteName).replace(/'/g, "\\'") + '\',' + idx + ')" style="color:var(--red);border-color:var(--red);font-size:11px;padding:2px 8px" title="Remove">&#x2715;</button>' : '';

        return '<tr data-market="' + esc(p.market) + '" data-type="' + p.type + '" data-article="' + esc(p.article).toLowerCase() + '">' +
          '<td>' + getFlag(p.market) + ' ' + esc(p.market) + '</td>' +
          '<td style="font-weight:600;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(p.article) + '">' + esc(p.article) + '</td>' +
          '<td>' + typeBadge + '</td>' +
          '<td><a href="' + esc(p.url) + '" target="_blank" style="color:var(--primary);text-decoration:none;font-size:12px" title="' + esc(p.url) + '">' + esc(shortUrl) + '</a></td>' +
          '<td style="text-align:right">' + fmt(p.traffic) + '</td>' +
          '<td style="text-align:center">' + (p.positions || '-') + '</td>' +
          '<td style="text-align:center;color:var(--green)">' + (p.soldPositions || '-') + '</td>' +
          '<td style="text-align:center;color:var(--text-muted)">' + (p.freePositions || '-') + '</td>' +
          '<td>' + deleteBtn + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody>\
    </table>';
}

function filterSiteDetailTable() {
  var marketFilter = document.getElementById('sdb-market-filter').value;
  var typeFilter = document.getElementById('sdb-type-filter').value;
  var search = (document.getElementById('sdb-page-search').value || '').toLowerCase();

  var table = document.getElementById('sdb-detail-table');
  if (!table) return;
  var rows = table.querySelectorAll('tbody tr');
  rows.forEach(function(row) {
    var rowMarket = row.getAttribute('data-market');
    var rowType = row.getAttribute('data-type');
    var rowArticle = row.getAttribute('data-article') || '';
    var show = true;
    if (marketFilter && rowMarket !== marketFilter) show = false;
    if (typeFilter && rowType !== typeFilter) show = false;
    if (search && !rowArticle.includes(search)) show = false;
    row.style.display = show ? '' : 'none';
  });
}

// ==================== ADD SITE MODAL ====================

function showAddSiteModal() {
  var existing = document.getElementById('sdb-modal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'sdb-modal';
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = '\
    <div class="modal-content" style="max-width:450px">\
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">\
        <h3 style="font-size:16px;font-weight:700">Add Site</h3>\
        <button onclick="closeSDBModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted)">&times;</button>\
      </div>\
      <div style="display:flex;flex-direction:column;gap:12px">\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Site Name</label>\
          <input type="text" id="sdb-add-name" placeholder="e.g. BettingPro" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        </div>\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Domain</label>\
          <input type="text" id="sdb-add-domain" placeholder="e.g. bettingpro.com" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        </div>\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Contact Name (optional)</label>\
          <input type="text" id="sdb-add-contact-name" placeholder="e.g. John Smith" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        </div>\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Contact Email (optional)</label>\
          <input type="email" id="sdb-add-contact-email" placeholder="e.g. john@site.com" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        </div>\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Notes (optional)</label>\
          <textarea id="sdb-add-notes" placeholder="Notes about this site..." rows="3" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px;resize:vertical"></textarea>\
        </div>\
        <button onclick="doAddSite()" style="padding:10px;background:var(--primary);color:#fff;border:none;border-radius:3px;font-size:14px;cursor:pointer;font-weight:600">Add Site</button>\
      </div>\
    </div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) closeSDBModal(); });
  document.getElementById('sdb-add-name').focus();
}

function doAddSite() {
  var name = (document.getElementById('sdb-add-name').value || '').trim();
  var domain = (document.getElementById('sdb-add-domain').value || '').trim();
  var contactName = (document.getElementById('sdb-add-contact-name').value || '').trim();
  var contactEmail = (document.getElementById('sdb-add-contact-email').value || '').trim();
  var notes = (document.getElementById('sdb-add-notes').value || '').trim();

  if (!name) { showToast('Site name is required', 'error'); return; }

  if (!sitesDB[name]) {
    sitesDB[name] = { name: name, domain: domain, contactName: contactName, contactEmail: contactEmail, notes: notes, pages: [], marketSettings: {} };
  } else {
    // Update existing
    if (domain) sitesDB[name].domain = domain;
    if (contactName) sitesDB[name].contactName = contactName;
    if (contactEmail) sitesDB[name].contactEmail = contactEmail;
    if (notes) sitesDB[name].notes = notes;
  }

  saveAll();
  closeSDBModal();
  showToast('Site "' + name + '" added', 'success');
  renderSitesDBView();
}

// ==================== ADD PAGE TO SITE MODAL ====================

function showAddPageToSiteModal(siteName) {
  var existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  // Build market options from positionData + allMarkets
  var mkts = {};
  Object.keys(positionData || {}).forEach(function(m) { mkts[m] = true; });
  Object.keys(allMarkets || {}).forEach(function(m) { mkts[m] = true; });
  var markets = Object.keys(mkts).sort();
  var marketOpts = markets.map(function(m) {
    return '<option value="' + esc(m) + '">' + m + '</option>';
  }).join('');

  // Build topic options from existing pages
  var topicSet = {};
  Object.values(allMarkets || {}).forEach(function(mk) {
    (mk.pages || []).forEach(function(p) { if (p.topic) topicSet[p.topic] = true; });
  });
  var topics = Object.keys(topicSet).sort();
  var topicOpts = topics.map(function(t) { return '<option>' + esc(t) + '</option>'; }).join('');

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = '<div class="modal">' +
    '<h3>Add page to ' + esc(siteName) + '</h3>' +
    '<label>Market</label>' +
    '<select id="sdb-page-market"><option value="">Select market...</option>' + marketOpts + '<option value="_custom">+ Other</option></select>' +
    '<div id="sdb-custom-market-row" style="display:none;margin-top:4px"><input type="text" id="sdb-page-custom-market" placeholder="Custom market name"></div>' +
    '<label>Page URL</label>' +
    '<input type="url" id="sdb-page-url" placeholder="https://...">' +
    '<label>Article name</label>' +
    '<input type="text" id="sdb-page-article" placeholder="e.g. Best Betting Apps">' +
    '<label>Topics</label>' +
    '<div id="sdb-topic-picker" style="display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-card);min-height:36px">' +
      topics.map(function(t) { return '<label style="display:flex;align-items:center;gap:4px;padding:3px 10px;border-radius:14px;font-size:12px;cursor:pointer;background:var(--bg-main);border:1px solid var(--border);white-space:nowrap"><input type="checkbox" class="sdb-topic-chk" value="' + esc(t) + '" style="width:13px;height:13px;margin:0">' + esc(t) + '</label>'; }).join('') +
      '<button type="button" onclick="addNewTopicToPickerSites()" style="padding:3px 10px;border-radius:14px;font-size:12px;cursor:pointer;background:none;border:1px dashed var(--border);color:var(--primary)">+ New</button>' +
    '</div>' +
    '<div style="margin-top:12px;display:flex;align-items:baseline;gap:8px"><input type="checkbox" id="sdb-page-rankings" style="width:16px;height:16px;margin:0;cursor:pointer;position:relative;top:2px"><label for="sdb-page-rankings" style="font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap">Add to rankings</label><span style="font-size:11px;color:var(--text-muted)">— also appears in rankings with positions</span></div>' +
    '<div id="sdb-page-nbpos-row" style="display:none;margin-top:8px"><label>Number of positions</label><input type="number" id="sdb-page-nbpos" value="10" min="1" max="30"></div>' +
    '<input type="hidden" id="sdb-page-type" value="business">' +
    '<div class="modal-actions">' +
      '<button class="btn-cancel" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
      '<button class="btn-primary" onclick="doAddPageToSite(\'' + esc(siteName).replace(/'/g, "\\'") + '\')">Add</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);

  // Show/hide custom market field
  document.getElementById('sdb-page-market').addEventListener('change', function() {
    document.getElementById('sdb-custom-market-row').style.display = this.value === '_custom' ? 'block' : 'none';
  });
  // Show/hide nb positions when "Add to rankings" is toggled
  document.getElementById('sdb-page-rankings').addEventListener('change', function() {
    document.getElementById('sdb-page-nbpos-row').style.display = this.checked ? 'block' : 'none';
    document.getElementById('sdb-page-type').value = this.checked ? 'ranking' : 'business';
  });
}

function addNewTopicToPickerSites() {
  var v = prompt('New topic name:');
  if (!v || !v.trim()) return;
  v = v.trim();
  var picker = document.getElementById('sdb-topic-picker');
  var btn = picker.querySelector('button');
  var lbl = document.createElement('label');
  lbl.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 10px;border-radius:14px;font-size:12px;cursor:pointer;background:var(--bg-main);border:1px solid var(--border);white-space:nowrap';
  lbl.innerHTML = '<input type="checkbox" class="sdb-topic-chk" value="' + v.replace(/"/g, '&quot;') + '" checked style="width:13px;height:13px;margin:0">' + v.replace(/</g, '&lt;');
  picker.insertBefore(lbl, btn);
}

function doAddPageToSite(siteName) {
  var marketSel = document.getElementById('sdb-page-market').value;
  var market = marketSel === '_custom' ? (document.getElementById('sdb-page-custom-market').value || '').trim() : marketSel;
  var url = (document.getElementById('sdb-page-url').value || '').trim();
  var article = (document.getElementById('sdb-page-article').value || '').trim();
  var type = document.getElementById('sdb-page-type').value;
  var topicChks = document.querySelectorAll('.sdb-topic-chk:checked');
  var topicArr = []; topicChks.forEach(function(c) { topicArr.push(c.value); });
  var topic = topicArr.join(', ');
  var traffic = 0;
  var addToRankings = document.getElementById('sdb-page-rankings').checked;
  var nbPos = parseInt(document.getElementById('sdb-page-nbpos').value) || 10;

  if (!market) { showToast('Please select a market', 'error'); return; }
  if (!url) { showToast('Page URL is required', 'error'); return; }
  if (!article) { showToast('Article title is required', 'error'); return; }

  // Ensure site entry exists
  if (!sitesDB[siteName]) {
    sitesDB[siteName] = { name: siteName, domain: '', contact: '', notes: '', pages: [] };
  }
  if (!sitesDB[siteName].pages) sitesDB[siteName].pages = [];

  // Check duplicate
  var dup = sitesDB[siteName].pages.some(function(p) { return p.url === url && p.market === market; });
  if (dup) { showToast('This page already exists for this market', 'error'); return; }

  sitesDB[siteName].pages.push({
    url: url,
    article: article,
    market: market,
    type: type,
    topic: topic,
    traffic: traffic
  });

  // Add to rankings if checked
  if (addToRankings) {
    if (!positionData[market]) positionData[market] = {};
    if (!positionData[market][url]) {
      positionData[market][url] = { positions: [], conversion: 0 };
      for (var i = 1; i <= nbPos; i++) {
        var pos = { name: String(i), months: {} };
        MONTHS_2026.forEach(function(m) { pos.months[m] = { operator: '', sold: false, price: 0 }; });
        positionData[market][url].positions.push(pos);
      }
    }
    // Also add to allMarkets if not already there
    if (allMarkets[market]) {
      var exists = allMarkets[market].pages.some(function(p) { return p.url === url; });
      if (!exists) {
        var pg = {
          article: article, siteName: siteName, url: url, positions: [],
          nbPos: nbPos, topic: topic, tags: '', area: '',
          traffic: traffic, trafficFeb: traffic, trafficSep: 0, trafficJuly: 0, fees: {},
          inRankings: true
        };
        for (var j = 1; j <= nbPos; j++) pg.positions.push(String(j));
        allMarkets[market].pages.push(pg);
      }
    }
  }

  saveAll();
  // Auto-add to traffic Google Sheet
  addUrlToTrafficSheet(url, market);
  closeSDBModal();
  showToast('Page added to ' + siteName + (addToRankings ? ' + rankings' : ''), 'success');
  renderSitesDBView();
}

// ==================== REMOVE PAGE ====================

function removeSiteDBPage(siteName, pageIndex) {
  if (!sitesDB[siteName] || !sitesDB[siteName].pages) return;

  // We need to find the correct index in sitesDB pages (not the aggregated list)
  // The pageIndex is from the aggregated view, so we need to map back
  var sites = getSitesAggregatedData();
  var site = sites[siteName];
  if (!site) return;

  var pages = site.pages.slice().sort(function(a, b) {
    var mc = a.market.localeCompare(b.market);
    if (mc !== 0) return mc;
    return b.traffic - a.traffic;
  });

  var page = pages[pageIndex];
  if (!page || page.type === 'ranking') return; // Can't remove ranking pages

  // Find and remove from sitesDB
  var sdbPages = sitesDB[siteName].pages;
  for (var i = 0; i < sdbPages.length; i++) {
    if (sdbPages[i].url === page.url && sdbPages[i].market === page.market) {
      sdbPages.splice(i, 1);
      break;
    }
  }

  saveAll();
  showToast('Page removed', 'success');
  renderSitesDBView();
}

// ==================== SITE SETTINGS MODAL ====================

function showSiteSettingsModal(siteName) {
  var existing = document.getElementById('sdb-modal');
  if (existing) existing.remove();

  var siteInfo = sitesDB[siteName] || {};
  var sc = siteConfig[siteName] || {};

  var modal = document.createElement('div');
  modal.id = 'sdb-modal';
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = '\
    <div class="modal-content" style="max-width:450px">\
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">\
        <h3 style="font-size:16px;font-weight:700">Settings: ' + esc(siteName) + '</h3>\
        <button onclick="closeSDBModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted)">&times;</button>\
      </div>\
      <div style="display:flex;flex-direction:column;gap:12px">\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Domain</label>\
          <input type="text" id="sdb-set-domain" value="' + esc(siteInfo.domain || sc.domain || '') + '" placeholder="e.g. bettingpro.com" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        </div>\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Color</label>\
          <input type="color" id="sdb-set-color" value="' + (sc.color || '#1b76bc') + '" style="width:60px;height:32px;border:1px solid var(--border);border-radius:3px;cursor:pointer">\
        </div>\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Default Contact Name</label>\
          <input type="text" id="sdb-set-contact-name" value="' + esc(siteInfo.contactName || siteInfo.contact || '') + '" placeholder="e.g. John Smith" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        </div>\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Default Contact Email</label>\
          <input type="email" id="sdb-set-contact-email" value="' + esc(siteInfo.contactEmail || '') + '" placeholder="e.g. john@site.com" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        </div>\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Notes</label>\
          <textarea id="sdb-set-notes" rows="3" placeholder="Notes..." style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px;resize:vertical">' + esc(siteInfo.notes || '') + '</textarea>\
        </div>\
        <button onclick="doSaveSiteSettings(\'' + esc(siteName).replace(/'/g, "\\'") + '\')" style="padding:10px;background:var(--primary);color:#fff;border:none;border-radius:3px;font-size:14px;cursor:pointer;font-weight:600">Save</button>\
      </div>\
    </div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) closeSDBModal(); });
}

function doSaveSiteSettings(siteName) {
  var domain = (document.getElementById('sdb-set-domain').value || '').trim();
  var color = document.getElementById('sdb-set-color').value;
  var contactName = (document.getElementById('sdb-set-contact-name').value || '').trim();
  var contactEmail = (document.getElementById('sdb-set-contact-email').value || '').trim();
  var notes = (document.getElementById('sdb-set-notes').value || '').trim();

  // Update sitesDB
  if (!sitesDB[siteName]) {
    sitesDB[siteName] = { name: siteName, domain: '', contactName: '', contactEmail: '', notes: '', pages: [] };
  }
  sitesDB[siteName].domain = domain;
  sitesDB[siteName].contactName = contactName;
  sitesDB[siteName].contactEmail = contactEmail;
  sitesDB[siteName].notes = notes;

  // Update siteConfig (used by other parts of the app)
  if (!siteConfig[siteName]) siteConfig[siteName] = {};
  if (domain) siteConfig[siteName].domain = domain;
  if (color) siteConfig[siteName].color = color;

  saveAll();
  closeSDBModal();
  showToast('Site settings saved', 'success');
  renderSitesDBView();
}

// ==================== MARKET SETTINGS MODAL ====================

function showMarketSettingsModal(siteName, market) {
  var existing = document.getElementById('sdb-modal');
  if (existing) existing.remove();

  var siteInfo = sitesDB[siteName] || {};
  var ms = (siteInfo.marketSettings && siteInfo.marketSettings[market]) || {};

  var modal = document.createElement('div');
  modal.id = 'sdb-modal';
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = '\
    <div class="modal-content" style="max-width:480px">\
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">\
        <h3 style="font-size:16px;font-weight:700">' + getFlag(market) + ' ' + esc(market) + ' — ' + esc(siteName) + '</h3>\
        <button onclick="closeSDBModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted)">&times;</button>\
      </div>\
      <div style="display:flex;flex-direction:column;gap:12px">\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Contact Name</label>\
          <input type="text" id="sdb-ms-contact-name" value="' + esc(ms.contactName || '') + '" placeholder="e.g. Jean Dupont" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        </div>\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Contact Email</label>\
          <input type="email" id="sdb-ms-contact-email" value="' + esc(ms.contactEmail || '') + '" placeholder="e.g. jean@site.com" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        </div>\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Asana Project URL</label>\
          <input type="url" id="sdb-ms-asana-url" value="' + esc(ms.asanaProjectUrl || '') + '" placeholder="https://app.asana.com/0/..." style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px">\
        </div>\
        <div>\
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Notes for this market</label>\
          <textarea id="sdb-ms-notes" rows="3" placeholder="Specific notes for this market..." style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:13px;resize:vertical">' + esc(ms.notes || '') + '</textarea>\
        </div>\
        <button onclick="doSaveMarketSettings(\'' + esc(siteName).replace(/'/g, "\\'") + '\',\'' + esc(market).replace(/'/g, "\\'") + '\')" style="padding:10px;background:var(--primary);color:#fff;border:none;border-radius:3px;font-size:14px;cursor:pointer;font-weight:600">Save</button>\
      </div>\
    </div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) closeSDBModal(); });
  document.getElementById('sdb-ms-contact-name').focus();
}

function doSaveMarketSettings(siteName, market) {
  var contactName = (document.getElementById('sdb-ms-contact-name').value || '').trim();
  var contactEmail = (document.getElementById('sdb-ms-contact-email').value || '').trim();
  var asanaProjectUrl = (document.getElementById('sdb-ms-asana-url').value || '').trim();
  var notes = (document.getElementById('sdb-ms-notes').value || '').trim();

  // Ensure site entry exists
  if (!sitesDB[siteName]) {
    sitesDB[siteName] = { name: siteName, domain: '', contact: '', notes: '', pages: [], marketSettings: {} };
  }
  if (!sitesDB[siteName].marketSettings) sitesDB[siteName].marketSettings = {};

  sitesDB[siteName].marketSettings[market] = {
    contactName: contactName,
    contactEmail: contactEmail,
    asanaProjectUrl: asanaProjectUrl,
    notes: notes
  };

  saveAll();
  closeSDBModal();
  showToast('Settings saved for ' + market, 'success');
  renderSitesDBView();
}

// Helper: get contact for a site+market (falls back to site-level contact)
function getSiteMarketContact(siteName, market) {
  var siteInfo = sitesDB[siteName];
  if (siteInfo && siteInfo.marketSettings && siteInfo.marketSettings[market]) {
    var ms = siteInfo.marketSettings[market];
    if (ms.contactName || ms.contactEmail) {
      return { name: ms.contactName || '', email: ms.contactEmail || '' };
    }
  }
  return { name: (siteInfo && siteInfo.contactName) || '', email: (siteInfo && siteInfo.contactEmail) || '' };
}

// Helper: get Asana project URL for a site+market
function getSiteMarketAsanaUrl(siteName, market) {
  var siteInfo = sitesDB[siteName];
  if (siteInfo && siteInfo.marketSettings && siteInfo.marketSettings[market]) {
    return siteInfo.marketSettings[market].asanaProjectUrl || '';
  }
  return '';
}

// ==================== MODAL HELPERS ====================

function closeSDBModal() {
  var modal = document.getElementById('sdb-modal');
  if (modal) modal.remove();
  var overlay = document.querySelector('.modal-overlay');
  if (overlay) overlay.remove();
}
