// ==================== PROPOSALS MODULE ====================
var proposalCurrentView = 'list';
var proposalViewHistory = [];
var currentProposalId = null;
var proposalEditItems = []; // items being edited in create/edit view
var proposalMenuMode = false; // menu mode checkbox state
var proposalAvailSort = 'position'; // sort available positions: position, traffic, eftd

// ==================== SCREEN SHOW/HIDE ====================
function showProposalsScreen() {
  // Now proposals are inside AM screen, switch to AM + proposals tab
  showAMScreen();
  switchAMTab('proposals');
}

function hideProposalsScreen() {
  // Legacy — go back to home
  if (typeof hideAllScreens === 'function') hideAllScreens();
  document.getElementById('home-screen').style.display = 'block';
}

function proposalNavigate(view, data) {
  proposalViewHistory.push({ view: proposalCurrentView, data: currentProposalId });
  proposalCurrentView = view;
  renderProposalCurrentView(data);
}

function proposalGoBack() {
  var prev = proposalViewHistory.pop();
  if (prev) {
    proposalCurrentView = prev.view;
    currentProposalId = prev.data;
    renderProposalCurrentView();
  } else {
    proposalCurrentView = 'list';
    renderProposalCurrentView();
  }
}

function renderProposalCurrentView(data) {
  // Try AM proposals content first (when embedded in AM screen), then standalone
  var ct = document.getElementById('am-proposals-content');
  if (!ct || ct.style.display === 'none') ct = document.getElementById('proposals-content');
  if (!ct) return;
  switch (proposalCurrentView) {
    case 'list': renderProposalListView(ct); break;
    case 'create': renderProposalCreateView(ct, data); break;
    case 'detail': renderProposalDetailView(ct, data || currentProposalId); break;
  }
}

function renderProposalCurrentViewInto(ct) {
  if (!ct) return;
  switch (proposalCurrentView) {
    case 'list': renderProposalListView(ct); break;
    case 'create': renderProposalCreateView(ct); break;
    case 'detail': renderProposalDetailView(ct, currentProposalId); break;
  }
}

// ==================== ID GENERATION ====================
function generateProposalId() {
  return 'prop_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
}

// ==================== STATUS HELPERS ====================
var PROPOSAL_STATUSES = {
  draft: { label: 'Draft', color: '#888', bg: '#f0f0f0' },
  sent: { label: 'Sent', color: '#0066cc', bg: '#e6f0ff' },
  in_negotiation: { label: 'In Negotiation', color: '#cc6600', bg: '#fff3e6' },
  accepted: { label: 'Accepted', color: '#00802b', bg: '#e6f9ee' },
  refused: { label: 'Refused', color: '#cc0000', bg: '#ffe6e6' }
};

function statusBadge(status) {
  var s = PROPOSAL_STATUSES[status] || { label: status, color: '#888', bg: '#f0f0f0' };
  return '<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;color:' + s.color + ';background:' + s.bg + '">' + s.label + '</span>';
}

var PROPOSAL_TYPES = {
  new_offer: 'New Offer',
  full_package: 'Full Package',
  renewal: 'Renewal'
};

// ==================== LIST VIEW ====================
function renderProposalListView(ct) {
  var propList = Object.values(proposals).sort(function(a, b) {
    return new Date(b.updated || b.created) - new Date(a.updated || a.created);
  });

  // Collect filter options
  var ams = {}, markets = {}, statuses = {};
  propList.forEach(function(p) {
    if (p.am) ams[p.am] = true;
    if (p.market) markets[p.market] = true;
    if (p.status) statuses[p.status] = true;
  });

  // Stats
  var totalValue = 0, byStatus = {};
  propList.forEach(function(p) {
    totalValue += p.globalPrice || 0;
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  });

  var statsHtml = '<div class="stats-banner">' +
    '<div class="stat-item"><div class="stat-val">' + propList.length + '</div><div class="stat-lbl">Total</div></div>' +
    '<div class="stat-sep"></div>' +
    '<div class="stat-item"><div class="stat-val">' + (byStatus.draft || 0) + '</div><div class="stat-lbl">Draft</div></div>' +
    '<div class="stat-sep"></div>' +
    '<div class="stat-item"><div class="stat-val primary">' + (byStatus.sent || 0) + '</div><div class="stat-lbl">Sent</div></div>' +
    '<div class="stat-sep"></div>' +
    '<div class="stat-item"><div class="stat-val orange">' + (byStatus.in_negotiation || 0) + '</div><div class="stat-lbl">Negotiation</div></div>' +
    '<div class="stat-sep"></div>' +
    '<div class="stat-item"><div class="stat-val green">' + (byStatus.accepted || 0) + '</div><div class="stat-lbl">Accepted</div></div>' +
    '<div class="stat-sep"></div>' +
    '<div class="stat-item"><div class="stat-val">' + (byStatus.refused || 0) + '</div><div class="stat-lbl">Refused</div></div>' +
    '<div class="stat-sep"></div>' +
    '<div class="stat-item"><div class="stat-val green">' + fmtC(totalValue) + '</div><div class="stat-lbl">Total Value</div></div>' +
    '</div>';

  // Filters
  var filtersHtml = '<div class="filters" style="margin:12px 0">' +
    '<input type="text" id="prop-filter-search" placeholder="Search operator..." style="min-width:180px" oninput="filterProposalList()">' +
    '<select id="prop-filter-am" onchange="filterProposalList()"><option value="">All AMs</option>' +
    Object.keys(ams).sort().map(function(a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join('') +
    '</select>' +
    '<select id="prop-filter-market" onchange="filterProposalList()"><option value="">All Markets</option>' +
    Object.keys(markets).sort().map(function(m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('') +
    '</select>' +
    '<select id="prop-filter-status" onchange="filterProposalList()"><option value="">All Statuses</option>' +
    Object.keys(statuses).map(function(s) { return '<option value="' + s + '">' + (PROPOSAL_STATUSES[s] || {}).label + '</option>'; }).join('') +
    '</select>' +
    '</div>';

  // Table
  var tableHtml = '<table class="data-table" id="proposals-table"><thead><tr>' +
    '<th data-sort="date">Date</th>' +
    '<th data-sort="operator">Operator</th>' +
    '<th data-sort="market">Market</th>' +
    '<th data-sort="am">AM</th>' +
    '<th data-sort="type">Type</th>' +
    '<th>Status</th>' +
    '<th data-sort="price">Price</th>' +
    '<th>Items</th>' +
    '</tr></thead><tbody>';

  propList.forEach(function(p) {
    var date = p.updated || p.created;
    var dateStr = date ? new Date(date).toLocaleDateString('en-GB') : '';
    tableHtml += '<tr class="clickable prop-row" data-id="' + p.id + '" ' +
      'data-operator="' + esc(p.operator || '').toLowerCase() + '" ' +
      'data-am="' + esc(p.am || '') + '" ' +
      'data-market="' + esc(p.market || '') + '" ' +
      'data-status="' + (p.status || '') + '" ' +
      'onclick="proposalNavigate(\'detail\',\'' + p.id + '\')">' +
      '<td>' + dateStr + '</td>' +
      '<td>' + esc(p.operator) + '</td>' +
      '<td>' + (typeof getFlag === 'function' ? getFlag(p.market) : '') + ' ' + esc(p.market) + '</td>' +
      '<td>' + esc(p.am) + '</td>' +
      '<td>' + (PROPOSAL_TYPES[p.type] || p.type) + '</td>' +
      '<td>' + statusBadge(p.status) + '</td>' +
      '<td style="text-align:right">' + fmtC(p.globalPrice || 0) + '</td>' +
      '<td style="text-align:center">' + (p.items || []).length + '</td>' +
      '</tr>';
  });

  tableHtml += '</tbody></table>';

  if (propList.length === 0) {
    tableHtml = '<div style="text-align:center;padding:60px 20px;color:var(--text-muted)">' +
      '<div style="font-size:48px;margin-bottom:16px">📋</div>' +
      '<div style="font-size:16px;margin-bottom:8px">No proposals yet</div>' +
      '<div style="font-size:13px">Click "+ New Proposal" to create your first commercial proposal</div>' +
      '</div>';
  }

  ct.innerHTML = statsHtml + filtersHtml + tableHtml;
  if (propList.length > 0) setupSort('proposals-table', function() { filterProposalList(); });
}

function filterProposalList() {
  var search = (document.getElementById('prop-filter-search') || {}).value || '';
  var am = (document.getElementById('prop-filter-am') || {}).value || '';
  var market = (document.getElementById('prop-filter-market') || {}).value || '';
  var status = (document.getElementById('prop-filter-status') || {}).value || '';
  var searchLc = search.toLowerCase();

  document.querySelectorAll('#proposals-table .prop-row').forEach(function(row) {
    var show = true;
    if (searchLc && row.dataset.operator.indexOf(searchLc) === -1) show = false;
    if (am && row.dataset.am !== am) show = false;
    if (market && row.dataset.market !== market) show = false;
    if (status && row.dataset.status !== status) show = false;
    row.style.display = show ? '' : 'none';
  });
}

// ==================== CREATE/EDIT VIEW ====================
function renderProposalCreateView(ct, editId) {
  var isEdit = !!editId;
  var prop = isEdit ? proposals[editId] : null;

  // Defaults
  var selOperator = prop ? prop.operator : '';
  var selMarket = prop ? prop.market : '';
  var selAM = prop ? prop.am : '';
  var selType = prop ? prop.type : 'new_offer';
  var selMonths = prop ? (prop.items[0] || {}).months || [] : [];
  var showPriceDetail = prop ? prop.showPriceDetail : true;
  var packageDetails = prop ? (prop.packageDetails || '') : '';
  var notes = prop ? (prop.notes || '') : '';
  var globalPrice = prop ? prop.globalPrice : 0;
  proposalMenuMode = prop ? (prop.menuMode || false) : false;

  // Build items from existing proposal
  proposalEditItems = prop ? JSON.parse(JSON.stringify(prop.items)) : [];

  // Build market options
  var marketOptions = '<option value="">-- Select market --</option>';
  Object.keys(operatorDB).sort().forEach(function(mk) {
    var selected = mk === selMarket ? ' selected' : '';
    marketOptions += '<option value="' + esc(mk) + '"' + selected + '>' + (typeof getFlag === 'function' ? getFlag(mk) : '') + ' ' + esc(mk) + '</option>';
  });

  // Build operator options for selected market
  var opOptions = buildOperatorOptionsForMarket(selMarket, selOperator);

  // Month checkboxes
  var monthsHtml = MONTHS_2026.map(function(m) {
    var checked = selMonths.indexOf(m) >= 0 ? ' checked' : '';
    return '<label style="display:inline-flex;align-items:center;gap:3px;margin-right:8px;font-size:13px"><input type="checkbox" class="prop-month-cb" value="' + m + '"' + checked + ' onchange="refreshAvailablePositions()">' + MONTH_LABELS[m].split(' ')[0] + '</label>';
  }).join('');

  ct.innerHTML = '<div style="max-width:1200px;margin:0 auto">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">' +
      '<button class="back-btn" onclick="proposalGoBack()" style="margin:0">&larr;</button>' +
      '<h2 style="margin:0;font-size:18px;line-height:1">' + (isEdit ? 'Edit Proposal' : 'New Proposal') + '</h2>' +
    '</div>' +

    // Form row 1: market, operator, AM, type
    '<div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap">' +
      '<div style="min-width:180px">' +
        '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Market</label>' +
        '<select id="prop-market" onchange="onProposalMarketChange()" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;background:var(--surface)">' + marketOptions + '</select>' +
      '</div>' +
      '<div style="flex:1;min-width:250px">' +
        '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Operator</label>' +
        '<select id="prop-operator" onchange="onProposalOperatorChange()" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;background:var(--surface)">' + opOptions + '</select>' +
      '</div>' +
      '<div style="min-width:140px">' +
        '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">AM</label>' +
        '<input id="prop-am" value="' + esc(selAM) + '" readonly style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;background:var(--surface2)">' +
      '</div>' +
      '<div style="min-width:160px">' +
        '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Type</label>' +
        '<select id="prop-type" onchange="onProposalTypeChange()" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;background:var(--surface)">' +
          '<option value="new_offer"' + (selType === 'new_offer' ? ' selected' : '') + '>New Offer</option>' +
          '<option value="full_package"' + (selType === 'full_package' ? ' selected' : '') + '>Full Package</option>' +
          '<option value="renewal"' + (selType === 'renewal' ? ' selected' : '') + '>Renewal</option>' +
        '</select>' +
      '</div>' +
    '</div>' +

    // Full package details (hidden by default)
    '<div id="prop-package-details-wrap" style="margin-bottom:12px;display:' + (selType === 'full_package' ? 'block' : 'none') + '">' +
      '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Package Details</label>' +
      '<textarea id="prop-package-details" rows="3" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:3px;font-size:13px;resize:vertical">' + esc(packageDetails) + '</textarea>' +
    '</div>' +

    // Months
    '<div style="margin-bottom:12px">' +
      '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Months Covered</label>' +
      '<div>' + monthsHtml + '</div>' +
    '</div>' +

    // Position Picker (2 panels)
    '<div style="display:flex;gap:16px;margin-bottom:16px;min-height:300px">' +
      // Left: available positions
      '<div style="flex:1;border:1px solid var(--border);border-radius:3px;overflow:hidden;display:flex;flex-direction:column">' +
        '<div style="padding:8px 12px;background:var(--surface2);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">' +
          '<strong style="font-size:13px">Available Positions</strong>' +
          '<span id="prop-avail-count" style="font-size:12px;color:var(--text-muted)"></span>' +
        '</div>' +
        // Filters row
        '<div style="padding:6px 12px;background:var(--surface2);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
          '<select id="prop-filter-site" onchange="refreshAvailablePositions()" style="padding:4px;border:1px solid var(--border);border-radius:3px;font-size:12px;max-width:140px"><option value="">All sites</option></select>' +
          '<input type="text" id="prop-filter-page" placeholder="Filter page..." style="padding:4px 8px;border:1px solid var(--border);border-radius:3px;font-size:12px;width:130px" oninput="refreshAvailablePositions()">' +
          '<select id="prop-filter-maxpos" onchange="refreshAvailablePositions()" style="padding:4px;border:1px solid var(--border);border-radius:3px;font-size:12px">' +
            '<option value="0">All positions</option>' +
            '<option value="3">Max P3</option>' +
            '<option value="5" selected>Max P5</option>' +
            '<option value="8">Max P8</option>' +
            '<option value="10">Max P10</option>' +
          '</select>' +
          '<select id="prop-sort-avail" onchange="proposalAvailSort=this.value;refreshAvailablePositions()" style="padding:4px;border:1px solid var(--border);border-radius:3px;font-size:12px">' +
            '<option value="position"' + (proposalAvailSort === 'position' ? ' selected' : '') + '>Sort: Position</option>' +
            '<option value="traffic"' + (proposalAvailSort === 'traffic' ? ' selected' : '') + '>Sort: Traffic</option>' +
            '<option value="eftd"' + (proposalAvailSort === 'eftd' ? ' selected' : '') + '>Sort: eFTD</option>' +
          '</select>' +
        '</div>' +
        // Actions row
        '<div style="padding:6px 12px;background:var(--surface2);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">' +
          '<button class="btn-sm btn-primary" onclick="autoSuggestAndAdd()">Auto-suggest</button>' +
          '<input type="number" id="prop-suggest-count" value="10" min="1" max="50" style="width:50px;padding:4px;border:1px solid var(--border);border-radius:3px;font-size:12px" title="Number of positions to suggest">' +
          '<span style="color:var(--border);font-size:14px">|</span>' +
          '<button class="btn-sm" onclick="showAddCustomPosition()" style="color:var(--green);border-color:rgba(22,163,74,.3)">+ Custom position</button>' +
        '</div>' +
        '<div id="prop-avail-list" style="flex:1;overflow-y:auto;max-height:400px"></div>' +
      '</div>' +
      // Right: selected positions
      '<div style="flex:1;border:1px solid var(--border);border-radius:3px;overflow:hidden;display:flex;flex-direction:column">' +
        '<div style="padding:8px 12px;background:var(--surface2);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">' +
          '<strong style="font-size:13px">Selected Positions</strong>' +
          '<span id="prop-selected-count" style="font-size:12px;color:var(--text-muted)">(' + proposalEditItems.length + ')</span>' +
        '</div>' +
        '<div id="prop-selected-list" style="flex:1;overflow-y:auto;max-height:400px"></div>' +
        '<div style="padding:8px 12px;background:var(--surface2);border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">' +
          '<strong style="font-size:13px">Total: <span id="prop-total-price">' + fmtC(globalPrice) + '</span></strong>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // Options row
    '<div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap;align-items:center">' +
      '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px">' +
        '<input type="checkbox" id="prop-show-price"' + (showPriceDetail ? ' checked' : '') + '> Include price details in proposal document' +
      '</label>' +
      '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px">' +
        '<input type="checkbox" id="prop-menu-mode"' + (proposalMenuMode ? ' checked' : '') + ' onchange="proposalMenuMode=this.checked"> Menu mode (operator picks from options)' +
      '</label>' +
    '</div>' +

    // Notes
    '<div style="margin-bottom:16px">' +
      '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Notes</label>' +
      '<textarea id="prop-notes" rows="2" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:3px;font-size:13px;resize:vertical">' + esc(notes) + '</textarea>' +
    '</div>' +

    // Actions
    '<div style="display:flex;gap:8px;margin-bottom:24px">' +
      '<button class="btn-sm" onclick="saveProposal(\'' + (editId || '') + '\', \'draft\')">Save as Draft</button>' +
      '<button class="btn-sm btn-primary" onclick="saveProposal(\'' + (editId || '') + '\', \'sent\')">Send Proposal</button>' +
    '</div>' +
  '</div>';

  // Populate site filter and panels
  populateSiteFilter();
  refreshAvailablePositions();
  refreshSelectedPositions();

  // If renewal, load existing deal positions
  if (selType === 'renewal' && selOperator && selMarket && !isEdit) {
    loadRenewalPositions(selOperator, selMarket);
  }
}

function buildOperatorOptionsForMarket(market, selectedOp) {
  var html = '<option value="">-- Select operator --</option>';
  if (!market || !operatorDB[market]) return html;
  Object.keys(operatorDB[market]).sort().forEach(function(opName) {
    var selected = opName === selectedOp ? ' selected' : '';
    html += '<option value="' + esc(opName) + '"' + selected + '>' + esc(operatorDB[market][opName].baseName || opName) + '</option>';
  });
  return html;
}

function onProposalMarketChange() {
  var market = (document.getElementById('prop-market') || {}).value;
  var opSelect = document.getElementById('prop-operator');
  if (opSelect) opSelect.innerHTML = buildOperatorOptionsForMarket(market, '');
  document.getElementById('prop-am').value = '';

  // Clear items and refresh
  proposalEditItems = [];
  populateSiteFilter();
  refreshAvailablePositions();
  refreshSelectedPositions();
}

function onProposalOperatorChange() {
  var opName = (document.getElementById('prop-operator') || {}).value;
  var market = (document.getElementById('prop-market') || {}).value;
  if (!opName || !market) {
    document.getElementById('prop-am').value = '';
    return;
  }
  var dbEntry = (operatorDB[market] || {})[opName] || {};
  document.getElementById('prop-am').value = dbEntry.am || '';

  // Clear items and refresh
  proposalEditItems = [];
  refreshAvailablePositions();
  refreshSelectedPositions();

  // If renewal, load existing positions
  if (document.getElementById('prop-type').value === 'renewal') {
    loadRenewalPositions(opName, market);
  }
}

function onProposalTypeChange() {
  var type = document.getElementById('prop-type').value;
  var wrap = document.getElementById('prop-package-details-wrap');
  if (wrap) wrap.style.display = type === 'full_package' ? 'block' : 'none';

  if (type === 'renewal') {
    var opName = (document.getElementById('prop-operator') || {}).value;
    var market = (document.getElementById('prop-market') || {}).value;
    if (opName && market) loadRenewalPositions(opName, market);
  }
}

function populateSiteFilter() {
  var market = (document.getElementById('prop-market') || {}).value;
  var siteSelect = document.getElementById('prop-filter-site');
  if (!siteSelect) return;
  var sites = {};
  if (market && allMarkets[market]) {
    (allMarkets[market].pages || []).forEach(function(p) {
      if (p.siteName) sites[p.siteName] = true;
    });
  }
  // Also include sites from positionData pages not in allMarkets
  if (market && positionData[market]) {
    Object.keys(positionData[market]).forEach(function(pageUrl) {
      var info = getPageInfo(pageUrl, market);
      if (info && info.siteName) sites[info.siteName] = true;
    });
  }
  siteSelect.innerHTML = '<option value="">All sites</option>' +
    Object.keys(sites).sort().map(function(s) {
      return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
    }).join('');
}

function loadRenewalPositions(opName, market) {
  var pd = positionData[market] || {};
  var currentMonth = selectedMonth === 'full_year' ? MONTHS_2026[new Date().getMonth()] : selectedMonth;
  proposalEditItems = [];

  Object.keys(pd).forEach(function(pageUrl) {
    var page = pd[pageUrl];
    var pageInfo = getPageInfo(pageUrl, market);
    (page.positions || []).forEach(function(pos, idx) {
      var md = pos.months ? pos.months[currentMonth] : null;
      if (md && md.sold && md.operator && operatorsMatch(md.operator, opName)) {
        proposalEditItems.push({
          market: market,
          pageUrl: pageUrl,
          pageTitle: pageInfo ? pageInfo.article : pageUrl,
          siteName: pageInfo ? pageInfo.siteName : '',
          positionName: pos.name,
          positionIndex: idx,
          traffic: pageInfo ? (pageInfo.traffic || 0) : 0,
          eftd: 0,
          price: md.price || 0,
          months: [currentMonth]
        });
      }
    });
  });

  refreshSelectedPositions();
  refreshAvailablePositions();
  showToast('Loaded ' + proposalEditItems.length + ' existing positions for renewal', 'info');
}

function getPageInfo(pageUrl, market) {
  // First try allMarkets
  if (allMarkets[market]) {
    var pages = allMarkets[market].pages || [];
    var found = pages.find(function(p) { return p.url === pageUrl; });
    if (found) return found;
  }
  // Fallback: build info from URL
  try {
    var urlObj = new URL(pageUrl);
    var domain = urlObj.hostname.replace('www.', '');
    var siteName = domain.split('.')[0].toUpperCase();
    // Try to extract article title from path
    var pathParts = urlObj.pathname.split('/').filter(function(p) { return p; });
    var article = pathParts.length > 0 ? pathParts[pathParts.length - 1].replace(/-/g, ' ').replace(/\.html$/, '') : pageUrl;
    return { url: pageUrl, siteName: siteName, article: article, traffic: 0 };
  } catch(e) {
    return { url: pageUrl, siteName: '', article: pageUrl, traffic: 0 };
  }
}

// ==================== AVAILABLE POSITIONS PANEL ====================
function getAvailablePositions() {
  var market = (document.getElementById('prop-market') || {}).value;
  if (!market) return [];

  var pd = positionData[market] || {};
  var selectedMonths = getSelectedProposalMonths();
  if (selectedMonths.length === 0) return [];

  // Read filters
  var filterSite = (document.getElementById('prop-filter-site') || {}).value || '';
  var filterPage = ((document.getElementById('prop-filter-page') || {}).value || '').toLowerCase();
  var filterMaxPos = parseInt((document.getElementById('prop-filter-maxpos') || {}).value) || 0;

  var available = [];
  var alreadySelected = {};
  proposalEditItems.forEach(function(item) {
    alreadySelected[item.pageUrl + '|' + item.positionName] = true;
  });

  Object.keys(pd).forEach(function(pageUrl) {
    var page = pd[pageUrl];
    var pageInfo = getPageInfo(pageUrl, market);
    var traffic = pageInfo ? (pageInfo.traffic || 0) : 0;
    var conversion = page.conversion || 0;
    var siteName = pageInfo ? pageInfo.siteName : '';
    var pageTitle = pageInfo ? (pageInfo.article || '') : '';

    // Apply site filter
    if (filterSite && siteName !== filterSite) return;
    // Apply page filter
    if (filterPage && pageTitle.toLowerCase().indexOf(filterPage) === -1) return;

    (page.positions || []).forEach(function(pos, idx) {
      // Apply max position filter
      if (filterMaxPos > 0) {
        var posNum = parseInt((pos.name || '').replace(/\D/g, ''));
        if (posNum && posNum > filterMaxPos) return;
      }

      // Check if free for ALL selected months
      // Only exclude if sold, draft or offered — having an operator listed (from scan) doesn't block
      var freeForAll = selectedMonths.every(function(m) {
        var md = pos.months ? pos.months[m] : null;
        if (!md) return true;
        if (md.sold) return false;
        if (md.proposalStatus === 'draft' || md.proposalStatus === 'offered') return false;
        return true;
      });

      var isProposed = isPositionProposed(pageUrl, pos.name, market, selectedMonths);

      if (freeForAll && !isProposed && !alreadySelected[pageUrl + '|' + pos.name]) {
        var eftd = typeof getPositionEFTD === 'function' ? getPositionEFTD(traffic, conversion, pos.name, idx, page.positions.length) : 0;
        available.push({
          market: market,
          pageUrl: pageUrl,
          pageTitle: pageTitle,
          siteName: siteName,
          positionName: pos.name,
          positionIndex: idx,
          traffic: traffic,
          eftd: eftd,
          price: 0,
          months: selectedMonths
        });
      }
    });
  });

  return available;
}

function isPositionProposed(pageUrl, posName, market, months) {
  return Object.values(proposals).some(function(p) {
    if (p.status !== 'sent' && p.status !== 'in_negotiation') return false;
    return p.items.some(function(item) {
      return item.pageUrl === pageUrl && item.positionName === posName && item.market === market &&
        months.some(function(m) { return (item.months || []).indexOf(m) >= 0; });
    });
  });
}

function getSelectedProposalMonths() {
  var months = [];
  document.querySelectorAll('.prop-month-cb:checked').forEach(function(cb) {
    months.push(cb.value);
  });
  return months;
}

function refreshAvailablePositions() {
  var container = document.getElementById('prop-avail-list');
  if (!container) return;

  var available = getAvailablePositions();

  // Sort
  if (proposalAvailSort === 'traffic') {
    available.sort(function(a, b) { return b.traffic - a.traffic; });
  } else if (proposalAvailSort === 'eftd') {
    available.sort(function(a, b) { return b.eftd - a.eftd; });
  } else {
    // Sort by position number (P1 first)
    available.sort(function(a, b) {
      var posA = parseInt((a.positionName || '').replace(/\D/g, '')) || 99;
      var posB = parseInt((b.positionName || '').replace(/\D/g, '')) || 99;
      if (posA !== posB) return posA - posB;
      return b.traffic - a.traffic;
    });
  }

  var countEl = document.getElementById('prop-avail-count');
  if (countEl) countEl.textContent = '(' + available.length + ')';

  if (available.length === 0) {
    var market = (document.getElementById('prop-market') || {}).value;
    var msg = !market ? 'Select a market and months to see available positions' :
      getSelectedProposalMonths().length === 0 ? 'Select at least one month' :
      'No available positions matching your filters';
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">' + msg + '</div>';
    container._available = [];
    return;
  }

  // Determine previous month for "Sold M-1" column
  var selMonths = getSelectedProposalMonths();
  var firstMonthIdx = selMonths.length > 0 ? MONTHS_2026.indexOf(selMonths[0]) : -1;
  var prevMonth = firstMonthIdx > 0 ? MONTHS_2026[firstMonthIdx - 1] : null;
  var market = (document.getElementById('prop-market') || {}).value;

  var html = '<table style="width:100%;font-size:12px;border-collapse:collapse">' +
    '<thead><tr style="background:var(--surface2);position:sticky;top:0">' +
    '<th style="padding:4px 8px;text-align:left">Site</th>' +
    '<th style="padding:4px 8px;text-align:left">Page</th>' +
    '<th style="padding:4px 8px;text-align:center">Pos</th>' +
    '<th style="padding:4px 8px;text-align:right">Traffic</th>' +
    '<th style="padding:4px 8px;text-align:right">eFTD</th>' +
    '<th style="padding:4px 8px;text-align:center">Sold M-1</th>' +
    '<th style="padding:4px 8px;text-align:center">Add</th>' +
    '</tr></thead><tbody>';

  available.forEach(function(pos, i) {
    var shortTitle = pos.pageTitle.length > 40 ? pos.pageTitle.substring(0, 40) + '...' : pos.pageTitle;
    // Check if sold in previous month
    var soldM1 = false;
    if (prevMonth && market) {
      var pd = positionData[market] || {};
      var page = pd[pos.pageUrl];
      if (page && page.positions && page.positions[pos.positionIndex]) {
        var md = page.positions[pos.positionIndex].months;
        if (md && md[prevMonth] && md[prevMonth].sold) soldM1 = true;
      }
    }
    var soldM1Html = soldM1 ? '<span style="color:#cc0000;font-weight:600">Yes</span>' : '<span style="color:#00802b">No</span>';
    html += '<tr class="prop-avail-row" style="border-bottom:1px solid var(--border)">' +
      '<td style="padding:4px 8px">' + esc(pos.siteName) + '</td>' +
      '<td style="padding:4px 8px" title="' + esc(pos.pageTitle) + '">' + esc(shortTitle) + '</td>' +
      '<td style="padding:4px 8px;text-align:center">' + esc(pos.positionName) + '</td>' +
      '<td style="padding:4px 8px;text-align:right">' + fmt(pos.traffic) + '</td>' +
      '<td style="padding:4px 8px;text-align:right">' + pos.eftd.toFixed(1) + '</td>' +
      '<td style="padding:4px 8px;text-align:center">' + soldM1Html + '</td>' +
      '<td style="padding:4px 8px;text-align:center"><button class="btn-sm btn-primary" onclick="addPositionToProposal(' + i + ')" style="padding:2px 8px;font-size:11px">+</button></td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
  container._available = available;
}

function addPositionToProposal(index) {
  var container = document.getElementById('prop-avail-list');
  var available = container._available;
  if (!available || !available[index]) return;

  var pos = JSON.parse(JSON.stringify(available[index]));
  pos.months = getSelectedProposalMonths();
  proposalEditItems.push(pos);
  refreshAvailablePositions();
  refreshSelectedPositions();
}

function removePositionFromProposal(index) {
  proposalEditItems.splice(index, 1);
  refreshAvailablePositions();
  refreshSelectedPositions();
}

// ==================== CUSTOM POSITION ====================
function showAddCustomPosition() {
  var market = (document.getElementById('prop-market') || {}).value;
  if (!market) { showToast('Select a market first', 'warning'); return; }

  // Get sites for selected market
  var pd = positionData[market] || {};
  var sites = {};
  Object.keys(pd).forEach(function(pageUrl) {
    var pageInfo = getPageInfo(pageUrl, market);
    var siteName = pageInfo ? pageInfo.siteName : '';
    if (siteName) sites[siteName] = true;
  });

  var siteOptions = '<option value="">-- Select site --</option>' +
    Object.keys(sites).sort().map(function(s) {
      return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
    }).join('');

  var modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'custom-pos-modal';
  modal.innerHTML = '<div class="modal" style="max-width:500px">' +
    '<div class="modal-header"><h3 style="margin:0;font-size:16px">Add Custom Position</h3>' +
    '<button onclick="document.getElementById(\'custom-pos-modal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">&times;</button></div>' +
    '<div style="padding:16px;display:flex;flex-direction:column;gap:12px">' +
      '<div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Site</label>' +
        '<select id="custom-pos-site" onchange="onCustomPosSiteChange()" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:3px;font-size:13px">' + siteOptions + '</select></div>' +
      '<div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Page</label>' +
        '<select id="custom-pos-page" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:3px;font-size:13px"><option value="">-- Select site first --</option></select></div>' +
      '<div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Position Name</label>' +
        '<input type="text" id="custom-pos-name" placeholder="e.g. Operator of the Month, Banner Top, Special P1..." style="width:100%;padding:8px;border:1px solid var(--border);border-radius:3px;font-size:13px"></div>' +
      '<div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Price (\u20ac)</label>' +
        '<input type="number" id="custom-pos-price" value="0" min="0" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:3px;font-size:13px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button class="btn-sm" onclick="document.getElementById(\'custom-pos-modal\').remove()">Cancel</button>' +
        '<button class="btn-sm btn-primary" onclick="addCustomPosition()">Add</button>' +
      '</div>' +
    '</div></div>';
  document.body.appendChild(modal);
}

function onCustomPosSiteChange() {
  var site = (document.getElementById('custom-pos-site') || {}).value;
  var market = (document.getElementById('prop-market') || {}).value;
  var pageSelect = document.getElementById('custom-pos-page');
  if (!pageSelect) return;

  if (!site) {
    pageSelect.innerHTML = '<option value="">-- Select site first --</option>';
    return;
  }

  var pd = positionData[market] || {};
  var pages = [];
  Object.keys(pd).forEach(function(pageUrl) {
    var pageInfo = getPageInfo(pageUrl, market);
    if (pageInfo && pageInfo.siteName === site) {
      pages.push({ url: pageUrl, title: pageInfo.article || pageUrl });
    }
  });
  pages.sort(function(a, b) { return a.title.localeCompare(b.title); });

  pageSelect.innerHTML = '<option value="">-- Select page --</option>' +
    pages.map(function(p) {
      return '<option value="' + esc(p.url) + '">' + esc(p.title) + '</option>';
    }).join('');
}

function addCustomPosition() {
  var pageUrl = (document.getElementById('custom-pos-page') || {}).value;
  var posName = (document.getElementById('custom-pos-name') || {}).value.trim();
  var price = parseFloat((document.getElementById('custom-pos-price') || {}).value) || 0;
  var market = (document.getElementById('prop-market') || {}).value;

  if (!pageUrl) { showToast('Select a page', 'warning'); return; }
  if (!posName) { showToast('Enter a position name', 'warning'); return; }

  var pageInfo = getPageInfo(pageUrl, market);
  var months = getSelectedProposalMonths();

  proposalEditItems.push({
    market: market,
    pageUrl: pageUrl,
    pageTitle: pageInfo ? pageInfo.article : pageUrl,
    siteName: pageInfo ? pageInfo.siteName : '',
    positionName: posName,
    positionIndex: -1, // custom position, not an existing index
    traffic: pageInfo ? (pageInfo.traffic || 0) : 0,
    eftd: 0,
    price: price,
    months: months,
    custom: true
  });

  document.getElementById('custom-pos-modal').remove();
  refreshAvailablePositions();
  refreshSelectedPositions();
  showToast('Custom position "' + posName + '" added', 'success');
}

// ==================== SELECTED POSITIONS PANEL ====================
function refreshSelectedPositions() {
  var container = document.getElementById('prop-selected-list');
  var countEl = document.getElementById('prop-selected-count');
  var totalEl = document.getElementById('prop-total-price');
  if (!container) return;

  if (countEl) countEl.textContent = '(' + proposalEditItems.length + ')';

  if (proposalEditItems.length === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">No positions selected</div>';
    if (totalEl) totalEl.textContent = fmtC(0);
    return;
  }

  var html = '<table style="width:100%;font-size:12px;border-collapse:collapse">' +
    '<thead><tr style="background:var(--surface2);position:sticky;top:0">' +
    '<th style="padding:4px 8px;text-align:left">Site</th>' +
    '<th style="padding:4px 8px;text-align:left">Page</th>' +
    '<th style="padding:4px 8px;text-align:center">Pos</th>' +
    '<th style="padding:4px 8px;text-align:right">Traffic</th>' +
    '<th style="padding:4px 8px;text-align:right;width:80px">Price (€)</th>' +
    '<th style="padding:4px 8px;text-align:center">Remove</th>' +
    '</tr></thead><tbody>';

  var total = 0;
  proposalEditItems.forEach(function(item, i) {
    var shortTitle = item.pageTitle.length > 35 ? item.pageTitle.substring(0, 35) + '...' : item.pageTitle;
    total += item.price || 0;
    var customBadge = item.custom ? ' <span style="font-size:10px;background:#e6f9ee;color:#00802b;padding:1px 4px;border-radius:3px">custom</span>' : '';
    html += '<tr style="border-bottom:1px solid var(--border)">' +
      '<td style="padding:4px 8px">' + esc(item.siteName) + '</td>' +
      '<td style="padding:4px 8px" title="' + esc(item.pageTitle) + '">' + esc(shortTitle) + customBadge + '</td>' +
      '<td style="padding:4px 8px;text-align:center">' + esc(item.positionName) + '</td>' +
      '<td style="padding:4px 8px;text-align:right">' + fmt(item.traffic) + '</td>' +
      '<td style="padding:4px 8px;text-align:right"><input type="number" value="' + (item.price || 0) + '" min="0" style="width:70px;padding:3px;border:1px solid var(--border);border-radius:3px;font-size:12px;text-align:right" onchange="updateItemPrice(' + i + ', this.value)"></td>' +
      '<td style="padding:4px 8px;text-align:center"><button class="btn-sm btn-danger" onclick="removePositionFromProposal(' + i + ')" style="padding:2px 8px;font-size:11px">&times;</button></td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
  if (totalEl) totalEl.textContent = fmtC(total);
}

function updateItemPrice(index, value) {
  proposalEditItems[index].price = parseFloat(value) || 0;
  var total = proposalEditItems.reduce(function(s, item) { return s + (item.price || 0); }, 0);
  var totalEl = document.getElementById('prop-total-price');
  if (totalEl) totalEl.textContent = fmtC(total);
}

// ==================== AUTO-SUGGEST ====================
function autoSuggestPositions(market, months, maxCount) {
  var pd = positionData[market] || {};
  var candidates = [];

  var currentMonthIdx = months.length > 0 ? MONTHS_2026.indexOf(months[0]) : -1;
  var prevMonth = currentMonthIdx > 0 ? MONTHS_2026[currentMonthIdx - 1] : null;

  var alreadySelected = {};
  proposalEditItems.forEach(function(item) {
    alreadySelected[item.pageUrl + '|' + item.positionName] = true;
  });

  Object.keys(pd).forEach(function(pageUrl) {
    var page = pd[pageUrl];
    var pageInfo = getPageInfo(pageUrl, market);
    var traffic = pageInfo ? (pageInfo.traffic || 0) : 0;
    var conversion = page.conversion || 0;
    var articleType = pageInfo ? (pageInfo.article || '') : '';

    (page.positions || []).forEach(function(pos, idx) {
      var freeForAll = months.every(function(m) {
        var md = pos.months ? pos.months[m] : null;
        if (!md) return true;
        return !md.sold && !md.operator;
      });

      var isProposed = isPositionProposed(pageUrl, pos.name, market, months);
      if (!freeForAll || isProposed || alreadySelected[pageUrl + '|' + pos.name]) return;

      var eftd = typeof getPositionEFTD === 'function' ? getPositionEFTD(traffic, conversion, pos.name, idx, page.positions.length) : 0;

      var wasSold = false;
      if (prevMonth && pos.months && pos.months[prevMonth]) {
        wasSold = pos.months[prevMonth].sold;
      }

      var score = (eftd * 100) + (traffic * 0.01) + (wasSold ? 500 : 0);

      candidates.push({
        market: market,
        pageUrl: pageUrl,
        pageTitle: articleType,
        siteName: pageInfo ? pageInfo.siteName : '',
        positionName: pos.name,
        positionIndex: idx,
        traffic: traffic,
        eftd: eftd,
        price: 0,
        months: months,
        _score: score,
        _articleType: normalizeArticleType(articleType),
        _site: pageInfo ? pageInfo.siteName : ''
      });
    });
  });

  candidates.sort(function(a, b) { return b._score - a._score; });

  // Apply diversity: max 3 per page, max 2 per article type
  var selected = [];
  var perPage = {}, perType = {};

  candidates.forEach(function(c) {
    if (selected.length >= maxCount) return;
    var pageKey = c.pageUrl;
    var typeKey = c._articleType;

    if ((perPage[pageKey] || 0) >= 3) return;
    if ((perType[typeKey] || 0) >= 2) return;

    selected.push(c);
    perPage[pageKey] = (perPage[pageKey] || 0) + 1;
    perType[typeKey] = (perType[typeKey] || 0) + 1;
  });

  // Relax constraints if needed
  if (selected.length < maxCount) {
    candidates.forEach(function(c) {
      if (selected.length >= maxCount) return;
      if (selected.some(function(s) { return s.pageUrl === c.pageUrl && s.positionName === c.positionName; })) return;
      selected.push(c);
    });
  }

  return selected;
}

function normalizeArticleType(title) {
  var lower = (title || '').toLowerCase();
  if (lower.match(/dep[oó]sito\s*m[ií]nimo|mindep/)) return 'min_deposit';
  if (lower.match(/b[oô]nus|bonus/)) return 'bonus';
  if (lower.match(/melhor|best|top/)) return 'best_of';
  if (lower.match(/novo|new|nova/)) return 'new';
  if (lower.match(/paga.*mais|higher.*pay|que.*paga/)) return 'highest_paying';
  if (lower.match(/app|aplicativo|mobile/)) return 'app';
  if (lower.match(/cassino|casino|slot/)) return 'casino';
  if (lower.match(/aposta|bet|sport/)) return 'betting';
  if (lower.match(/poker/)) return 'poker';
  if (lower.match(/free.*spin|rodada/)) return 'free_spins';
  return 'other';
}

function autoSuggestAndAdd() {
  var market = (document.getElementById('prop-market') || {}).value;
  var months = getSelectedProposalMonths();
  var count = parseInt((document.getElementById('prop-suggest-count') || {}).value) || 10;

  if (!market) { showToast('Select a market first', 'warning'); return; }
  if (months.length === 0) { showToast('Select at least one month', 'warning'); return; }

  var suggested = autoSuggestPositions(market, months, count);
  suggested.forEach(function(s) {
    delete s._score;
    delete s._articleType;
    delete s._site;
    proposalEditItems.push(s);
  });

  refreshAvailablePositions();
  refreshSelectedPositions();
  showToast('Added ' + suggested.length + ' suggested positions', 'success');
}

// ==================== SAVE PROPOSAL ====================
function saveProposal(editId, status) {
  var operator = (document.getElementById('prop-operator') || {}).value;
  var market = (document.getElementById('prop-market') || {}).value;
  if (!operator) { showToast('Select an operator', 'warning'); return; }
  if (!market) { showToast('Select a market', 'warning'); return; }

  var am = (document.getElementById('prop-am') || {}).value;
  var type = (document.getElementById('prop-type') || {}).value;
  var showPriceDetail = (document.getElementById('prop-show-price') || {}).checked;
  var menuMode = (document.getElementById('prop-menu-mode') || {}).checked;
  var packageDetails = (document.getElementById('prop-package-details') || {}).value || '';
  var notes = (document.getElementById('prop-notes') || {}).value || '';
  var months = getSelectedProposalMonths();

  if (proposalEditItems.length === 0) { showToast('Add at least one position', 'warning'); return; }
  if (months.length === 0) { showToast('Select at least one month', 'warning'); return; }

  // Update months on items
  proposalEditItems.forEach(function(item) { item.months = months; });

  var globalPrice = proposalEditItems.reduce(function(s, item) { return s + (item.price || 0); }, 0);
  var now = new Date().toISOString();

  var id = editId || generateProposalId();
  var existing = editId ? proposals[editId] : null;

  var proposal = {
    id: id,
    operator: operator,
    market: market,
    am: am,
    type: type,
    status: status,
    showPriceDetail: showPriceDetail,
    menuMode: menuMode,
    globalPrice: globalPrice,
    packageDetails: packageDetails,
    notes: notes,
    created: existing ? existing.created : now,
    updated: now,
    sentDate: status === 'sent' ? now : (existing ? existing.sentDate : null),
    closedDate: null,
    history: existing ? existing.history.slice() : [],
    items: JSON.parse(JSON.stringify(proposalEditItems))
  };

  // Log status change
  if (existing && existing.status !== status) {
    proposal.history.push({ from: existing.status, to: status, date: now });
  } else if (!existing) {
    proposal.history.push({ from: null, to: status, date: now });
  }

  // Release old positions if editing
  if (existing) releaseProposalPositions(existing);

  proposals[id] = proposal;

  // Apply position status
  if (status === 'draft') {
    applyProposalPositionStatus(proposal, 'draft');
  } else if (status === 'sent') {
    applyProposalPositionStatus(proposal, 'offered');
  }

  saveAll();
  showToast('Proposal ' + (status === 'sent' ? 'sent' : 'saved as draft'), 'success');
  proposalCurrentView = 'detail';
  currentProposalId = id;
  renderProposalCurrentView(id);
}

// ==================== DETAIL VIEW ====================
function renderProposalDetailView(ct, propId) {
  currentProposalId = propId;
  var prop = proposals[propId];
  if (!prop) { proposalGoBack(); return; }

  var createdStr = prop.created ? new Date(prop.created).toLocaleDateString('en-GB') : '';
  var updatedStr = prop.updated ? new Date(prop.updated).toLocaleDateString('en-GB') : '';
  var sentStr = prop.sentDate ? new Date(prop.sentDate).toLocaleDateString('en-GB') : '-';

  var logoHtml = typeof getOperatorLogoHtml === 'function' ? getOperatorLogoHtml(prop.operator, prop.market, 20) : '';

  // Header
  var html = '<div style="max-width:1000px;margin:0 auto">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">' +
      '<div class="logo" onclick="proposalGoBack()" style="cursor:pointer">&larr; Proposals</div>' +
      '<h2 style="margin:0;font-size:18px;margin-left:8px">' + logoHtml + ' ' + esc(prop.operator) + '</h2>' +
      '<div style="margin-left:8px">' + statusBadge(prop.status) + '</div>' +
    '</div>' +

    // Info bar
    '<div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;padding:12px;background:var(--surface2);border:1px solid var(--border);border-radius:3px;font-size:13px">' +
      '<span><strong>Market:</strong> ' + (typeof getFlag === 'function' ? getFlag(prop.market) : '') + ' ' + esc(prop.market) + '</span>' +
      '<span><strong>AM:</strong> ' + esc(prop.am) + '</span>' +
      '<span><strong>Type:</strong> ' + (PROPOSAL_TYPES[prop.type] || prop.type) + '</span>' +
      '<span><strong>Created:</strong> ' + createdStr + '</span>' +
      '<span><strong>Sent:</strong> ' + sentStr + '</span>' +
      '<span><strong>Updated:</strong> ' + updatedStr + '</span>' +
    '</div>';

  // Package details
  if (prop.type === 'full_package' && prop.packageDetails) {
    html += '<div style="padding:10px 14px;background:rgba(251,146,60,.1);border:1px solid var(--orange);border-radius:8px;margin-bottom:16px;font-size:13px">' +
      '<strong>Package Details:</strong> ' + esc(prop.packageDetails) +
    '</div>';
  }

  // Items table
  html += '<table class="data-table"><thead><tr>' +
    '<th>Site</th>' +
    '<th>Page</th>' +
    '<th>Position</th>' +
    '<th style="text-align:right">Traffic</th>' +
    '<th style="text-align:right">eFTD</th>' +
    '<th style="text-align:right">Price</th>' +
    '<th>Months</th>' +
    '</tr></thead><tbody>';

  var totalPrice = 0;
  (prop.items || []).forEach(function(item) {
    totalPrice += item.price || 0;
    var shortTitle = (item.pageTitle || '').length > 45 ? item.pageTitle.substring(0, 45) + '...' : (item.pageTitle || '');
    var monthsStr = (item.months || []).map(function(m) { return (MONTH_LABELS[m] || m).split(' ')[0]; }).join(', ');
    html += '<tr>' +
      '<td>' + esc(item.siteName) + '</td>' +
      '<td title="' + esc(item.pageTitle) + '">' + esc(shortTitle) + '</td>' +
      '<td style="text-align:center">' + esc(item.positionName) + '</td>' +
      '<td style="text-align:right">' + fmt(item.traffic) + '</td>' +
      '<td style="text-align:right">' + (item.eftd || 0).toFixed(1) + '</td>' +
      '<td style="text-align:right">' + fmtC(item.price || 0) + '</td>' +
      '<td style="font-size:12px">' + monthsStr + '</td>' +
      '</tr>';
  });

  html += '<tr style="font-weight:700;background:var(--surface2)">' +
    '<td colspan="5" style="text-align:right">TOTAL</td>' +
    '<td style="text-align:right">' + fmtC(totalPrice) + '</td>' +
    '<td></td></tr>';

  html += '</tbody></table>';

  // Notes
  if (prop.notes) {
    html += '<div style="padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:3px;margin:16px 0;font-size:13px">' +
      '<strong>Notes:</strong> ' + esc(prop.notes) +
    '</div>';
  }

  // History
  if (prop.history && prop.history.length > 0) {
    html += '<div style="margin:16px 0;font-size:12px;color:var(--text-muted)">' +
      '<strong>History:</strong><br>';
    prop.history.forEach(function(h) {
      var dateStr = h.date ? new Date(h.date).toLocaleString('en-GB') : '';
      html += dateStr + ' — ' + (h.from || 'new') + ' → ' + h.to + '<br>';
    });
    html += '</div>';
  }

  // Action buttons
  html += '<div style="display:flex;gap:8px;margin:20px 0;flex-wrap:wrap">';

  if (prop.status === 'draft') {
    html += '<button class="btn-sm" onclick="proposalNavigate(\'create\',\'' + prop.id + '\')">Edit</button>';
    html += '<button class="btn-sm btn-primary" onclick="changeProposalStatus(\'' + prop.id + '\', \'sent\')">Send</button>';
  } else if (prop.status === 'sent') {
    html += '<button class="btn-sm" onclick="changeProposalStatus(\'' + prop.id + '\', \'in_negotiation\')" style="color:var(--orange);border-color:rgba(234,88,12,.3)">In Negotiation</button>';
    html += '<button class="btn-sm" onclick="changeProposalStatus(\'' + prop.id + '\', \'accepted\')" style="color:var(--green);border-color:rgba(22,163,74,.3)">Accept</button>';
    html += '<button class="btn-sm btn-danger" onclick="changeProposalStatus(\'' + prop.id + '\', \'refused\')">Refuse</button>';
  } else if (prop.status === 'in_negotiation') {
    html += '<button class="btn-sm" onclick="proposalNavigate(\'create\',\'' + prop.id + '\')">Edit & Resend</button>';
    html += '<button class="btn-sm" onclick="changeProposalStatus(\'' + prop.id + '\', \'accepted\')" style="color:var(--green);border-color:rgba(22,163,74,.3)">Accept</button>';
    html += '<button class="btn-sm btn-danger" onclick="changeProposalStatus(\'' + prop.id + '\', \'refused\')">Refuse</button>';
  }

  // Duplicate always available for accepted/refused
  if (prop.status === 'accepted' || prop.status === 'refused') {
    html += '<button class="btn-sm" onclick="duplicateProposal(\'' + prop.id + '\')">Duplicate as New</button>';
  }

  html += '<button class="btn-sm" onclick="exportProposalPDF(\'' + prop.id + '\')" style="color:var(--primary);border-color:var(--primary)">Export PDF</button>';
  // Delete always available
  html += '<button class="btn-sm btn-danger" onclick="deleteProposal(\'' + prop.id + '\')">Delete</button>';

  html += '</div></div>';

  ct.innerHTML = html;
}

// ==================== STATUS CHANGES ====================
function changeProposalStatus(propId, newStatus) {
  var prop = proposals[propId];
  if (!prop) return;

  var now = new Date().toISOString();
  prop.history.push({ from: prop.status, to: newStatus, date: now });
  var oldStatus = prop.status;
  prop.status = newStatus;
  prop.updated = now;

  if (newStatus === 'sent' && !prop.sentDate) prop.sentDate = now;
  if (newStatus === 'accepted' || newStatus === 'refused') prop.closedDate = now;

  // Impact on positions
  if (newStatus === 'draft') {
    applyProposalPositionStatus(prop, 'draft');
  } else if (newStatus === 'sent' || newStatus === 'in_negotiation') {
    applyProposalPositionStatus(prop, 'offered');
  } else if (newStatus === 'accepted') {
    applyAcceptedProposal(prop);
  } else if (newStatus === 'refused') {
    releaseProposalPositions(prop);
  }

  saveAll();
  showToast('Status changed to ' + (PROPOSAL_STATUSES[newStatus] || {}).label, 'success');
  renderProposalCurrentView(propId);
}

function applyProposalPositionStatus(prop, proposalStatus) {
  // Mark positions as draft/offered with operator name (not sold)
  (prop.items || []).forEach(function(item) {
    if (item.custom || item.positionIndex < 0) return;
    var pd = positionData[item.market];
    if (!pd || !pd[item.pageUrl]) return;
    var page = pd[item.pageUrl];
    var pos = page.positions[item.positionIndex];
    if (!pos) return;

    (item.months || []).forEach(function(m) {
      if (!pos.months) pos.months = {};
      pos.months[m] = {
        operator: prop.operator,
        sold: false,
        price: item.price || 0,
        proposalStatus: proposalStatus,
        proposalId: prop.id
      };
    });
  });
}

function applyAcceptedProposal(prop) {
  (prop.items || []).forEach(function(item) {
    if (item.custom || item.positionIndex < 0) return;
    var pd = positionData[item.market];
    if (!pd || !pd[item.pageUrl]) return;
    var page = pd[item.pageUrl];
    var pos = page.positions[item.positionIndex];
    if (!pos) return;

    (item.months || []).forEach(function(m) {
      if (!pos.months) pos.months = {};
      pos.months[m] = {
        operator: prop.operator,
        sold: true,
        price: item.price || 0
      };
    });
  });
}

function releaseProposalPositions(prop) {
  // Clear positions that were marked as draft/offered by this proposal
  (prop.items || []).forEach(function(item) {
    if (item.custom || item.positionIndex < 0) return;
    var pd = positionData[item.market];
    if (!pd || !pd[item.pageUrl]) return;
    var page = pd[item.pageUrl];
    var pos = page.positions[item.positionIndex];
    if (!pos) return;

    (item.months || []).forEach(function(m) {
      if (pos.months && pos.months[m] && pos.months[m].proposalId === prop.id) {
        pos.months[m] = { operator: '', sold: false, price: 0 };
      }
    });
  });
}

function deleteProposal(propId) {
  if (!confirm('Delete this proposal? Positions will be released.')) return;
  var prop = proposals[propId];
  if (prop) {
    releaseProposalPositions(prop);
  }
  delete proposals[propId];
  saveAll();
  showToast('Proposal deleted', 'info');
  proposalGoBack();
}

function duplicateProposal(propId) {
  var original = proposals[propId];
  if (!original) return;

  var newId = generateProposalId();
  var now = new Date().toISOString();
  var dup = JSON.parse(JSON.stringify(original));
  dup.id = newId;
  dup.status = 'draft';
  dup.created = now;
  dup.updated = now;
  dup.sentDate = null;
  dup.closedDate = null;
  dup.history = [{ from: null, to: 'draft', date: now }];

  proposals[newId] = dup;
  saveAll();
  showToast('Proposal duplicated as draft', 'success');
  proposalNavigate('detail', newId);
}

// ==================== PDF EXPORT ====================
function exportProposalPDF(propId) {
  window.open('/api/proposal-pdf?id=' + propId, '_blank');
}

// ==================== HELPER: check if position is proposed ====================
function getPositionProposalStatus(pageUrl, posName, market, month) {
  var found = null;
  Object.values(proposals).forEach(function(p) {
    if (p.status !== 'sent' && p.status !== 'in_negotiation') return;
    p.items.forEach(function(item) {
      if (item.pageUrl === pageUrl && item.positionName === posName && item.market === market) {
        if ((item.months || []).indexOf(month) >= 0) {
          found = { proposalId: p.id, operator: p.operator, status: p.status };
        }
      }
    });
  });
  return found;
}
