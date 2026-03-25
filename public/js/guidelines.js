// ==================== GUIDELINES MODULE ====================

function showGuidelinesScreen() {
  if (typeof hideAllScreens === 'function') hideAllScreens();
  document.getElementById('guidelines-screen').style.display = 'block';
  renderGuidelinesContent();
}

function hideGuidelinesScreen() {
  document.getElementById('guidelines-screen').style.display = 'none';
  showHomeScreen();
}

// ==================== SECTION DATA ====================
var guidelineSections = [
  { id: 'getting-started', title: 'Getting Started', icon: '🚀' },
  { id: 'rankings', title: 'Rankings Module', icon: '📊' },
  { id: 'account-managers', title: 'Account Managers', icon: '👤' },
  { id: 'proposals', title: 'Commercial Proposals', icon: '📝' },
  { id: 'operators', title: 'Operators Module', icon: '🏢' },
  { id: 'sites', title: 'Sites Module', icon: '🌐' },
  { id: 'asana', title: 'Asana Integration', icon: '🔗' },
  { id: 'tips', title: 'Tips & Best Practices', icon: '💡' }
];

// ==================== RENDER ====================
function renderGuidelinesContent() {
  var container = document.getElementById('guidelines-content');
  var activeSectionId = guidelineSections[0].id;

  container.innerHTML =
    '<div style="display:flex;min-height:calc(100vh - 56px)">' +
      // Sidebar
      '<nav id="guidelines-sidebar" style="width:240px;min-width:240px;background:var(--surface);border-right:1px solid var(--border);padding:20px 0;position:sticky;top:56px;height:calc(100vh - 56px);overflow-y:auto">' +
        '<div style="padding:0 16px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted)">Sections</div>' +
        guidelineSections.map(function(s, i) {
          return '<a href="#gl-' + s.id + '" onclick="setActiveGuidelineSection(this, event)" ' +
            'style="display:flex;align-items:center;gap:8px;padding:10px 16px;font-size:13px;font-weight:500;color:' +
            (i === 0 ? 'var(--primary)' : 'var(--text)') + ';text-decoration:none;transition:var(--transition);border-left:3px solid ' +
            (i === 0 ? 'var(--primary)' : 'transparent') + ';background:' + (i === 0 ? 'rgba(45,127,249,.06)' : 'transparent') + '">' +
            '<span>' + s.icon + '</span><span>' + s.title + '</span></a>';
        }).join('') +
      '</nav>' +
      // Main content
      '<div id="guidelines-main" style="flex:1;padding:32px 40px;max-width:860px;overflow-y:auto">' +
        getGettingStartedHTML() +
        getRankingsHTML() +
        getAccountManagersHTML() +
        getProposalsHTML() +
        getOperatorsHTML() +
        getSitesHTML() +
        getAsanaHTML() +
        getTipsHTML() +
      '</div>' +
    '</div>';
}

function setActiveGuidelineSection(el, e) {
  var links = document.querySelectorAll('#guidelines-sidebar a');
  links.forEach(function(a) {
    a.style.color = 'var(--text)';
    a.style.borderLeftColor = 'transparent';
    a.style.background = 'transparent';
  });
  el.style.color = 'var(--primary)';
  el.style.borderLeftColor = 'var(--primary)';
  el.style.background = 'rgba(45,127,249,.06)';
}

// ==================== HELPER: styled blocks ====================
function glSection(id, title) {
  return '<section id="gl-' + id + '" style="margin-bottom:48px;scroll-margin-top:72px"><h2 style="font-size:22px;font-weight:800;letter-spacing:-.3px;margin-bottom:16px;color:var(--text)">' + title + '</h2>';
}
function glSectionEnd() { return '</section>'; }
function glH3(text) { return '<h3 style="font-size:16px;font-weight:700;margin:24px 0 10px;color:var(--text)">' + text + '</h3>'; }
function glP(text) { return '<p style="font-size:14px;line-height:1.7;color:var(--text);margin-bottom:12px">' + text + '</p>'; }
function glTip(text) {
  return '<div style="background:rgba(45,127,249,.06);border-left:3px solid var(--primary);padding:12px 16px;border-radius:0 var(--radius) var(--radius) 0;margin:16px 0;font-size:13px;line-height:1.6;color:var(--text)"><strong>Tip:</strong> ' + text + '</div>';
}
function glNote(text) {
  return '<div style="background:var(--yellow-bg);border-left:3px solid var(--yellow);padding:12px 16px;border-radius:0 var(--radius) var(--radius) 0;margin:16px 0;font-size:13px;line-height:1.6;color:var(--text)"><strong>Note:</strong> ' + text + '</div>';
}
function glOL(items) {
  return '<ol style="padding-left:20px;margin:12px 0;font-size:14px;line-height:1.8;color:var(--text)">' +
    items.map(function(item) { return '<li style="margin-bottom:4px">' + item + '</li>'; }).join('') + '</ol>';
}
function glUL(items) {
  return '<ul style="padding-left:20px;margin:12px 0;font-size:14px;line-height:1.8;color:var(--text)">' +
    items.map(function(item) { return '<li style="margin-bottom:4px">' + item + '</li>'; }).join('') + '</ul>';
}
function glDivider() { return '<hr style="border:none;border-top:1px solid var(--border);margin:32px 0">'; }

// ==================== SECTION CONTENT ====================

function getGettingStartedHTML() {
  return glSection('getting-started', 'Getting Started') +

  glH3('Overview') +
  glP('iGaming Manager is a comprehensive tool for managing generic page rankings, operator deals, site portfolios, and commercial proposals across multiple markets. It brings together data from your Notion databases and provides a unified interface to track positions, revenue, traffic, and operator relationships.') +

  glH3('Home Screen Navigation') +
  glP('After loading data, the home screen presents four main modules:') +
  glUL([
    '<strong>Rankings</strong> — Generic page rankings by market. View and manage positions, operators, prices, and statuses.',
    '<strong>Account Managers</strong> — Track AM performance, deals, and commercial proposals.',
    '<strong>Operators</strong> — Manage the operator database across all markets.',
    '<strong>Sites</strong> — Manage sites, pages, contacts, and per-market settings.'
  ]) +

  glSectionEnd();
}

function getRankingsHTML() {
  return glSection('rankings', 'Rankings Module') +

  glH3('Market Selection') +
  glP('From the home screen, click <strong>Rankings</strong> to see a grid of all available markets. Each card shows the market flag, name, and summary stats. Click a market to enter its dashboard.') +

  glH3('Dashboard Overview') +
  glP('The dashboard is the default view when entering a market. It provides a high-level snapshot:') +
  glUL([
    '<strong>Stats banner</strong> — Total pages, positions, sold count, revenue, traffic, and eFTD at a glance.',
    '<strong>Charts</strong> — Revenue breakdown by site, traffic distribution, revenue by operator.',
    '<strong>Top available positions</strong> — Best unsold positions ranked by eFTD.',
    '<strong>Top pages by revenue</strong> — Highest-earning pages.',
    '<strong>Position mismatches</strong> — Positions where the expected operator does not match what was found on the live page (from scanning).'
  ]) +

  glH3('By Site View') +
  glP('Lists all sites in the current market. Each row shows the site name, number of pages, positions, sold count, traffic, and revenue. Click a site to filter the page list to that site only.') +

  glH3('By Page View') +
  glP('Displays all pages across all sites in the market. Use the filters at the top to narrow down:') +
  glUL([
    '<strong>Search</strong> — Filter by page name.',
    '<strong>Site</strong> — Filter by site.',
    '<strong>Topic</strong> — Filter by topic/category.',
    '<strong>Scan status</strong> — Filter by scan result (OK, mismatch, not scanned).'
  ]) +
  glP('Click any page row to open the <strong>Page Detail</strong> view.') +

  glH3('Page Detail') +
  glP('This is the core workspace for managing a single page\'s positions. At the top you\'ll find:') +
  glUL([
    '<strong>Stats banner</strong> — Traffic, conversion rate, total positions, revenue, and eFTD for this page.',
  ]) +
  glP('Below the stats, each position is displayed as a card:') +
  glUL([
    '<strong>Position number</strong> — Rank order on the page.',
    '<strong>Operator</strong> — The assigned operator (or "Free" if unassigned).',
    '<strong>Status</strong> — Free, Sold, Draft, or Offered.',
    '<strong>Price</strong> — The monthly fee for sold positions.',
    '<strong>eFTD / M-1 status</strong> — Estimated FTDs and previous month comparison.'
  ]) +

  glP('<strong>Key actions on positions:</strong>') +
  glUL([
    '<strong>Toggle Sold/Free</strong> — Use the switch on each card to mark a position as sold or free.',
    '<strong>Set price</strong> — When a position is sold, enter the monthly price.',
    '<strong>Change operator</strong> — Click the "Change" button to assign a different operator from the database.',
    '<strong>Drag & drop</strong> — Reorder positions by dragging cards up or down.',
    '<strong>Add position</strong> — Click "+ Position" to manually add a new position at the bottom.',
    '<strong>Scan page</strong> — Click "Scan" to crawl the live page and compare current operators against expected assignments.',
    '<strong>Asana task</strong> — Click "Asana Task" to create a task in the associated Asana project for position updates (requires Asana configuration in the Sites module).'
  ]) +
  glNote('Changes to positions (status, price, operator, order) are automatically propagated to all following months. If you change something in March, April onward will reflect the same change.') +

  glH3('By Operator View') +
  glP('Lists all operators present in the current market. Each row shows the operator name, total positions, sold count, revenue, traffic, and eFTD. Useful for a quick view of operator footprint in a specific market.') +

  glH3('Available View') +
  glP('Shows all unsold (Free) positions across the market, sorted by eFTD in descending order. This is the go-to view when looking for inventory to sell or include in proposals.') +

  glH3('Sold View') +
  glP('Displays all sold positions with their assigned operator and price. Filter and sort to review your current monetization.') +

  glH3('Scan Log') +
  glP('A history of all page scans performed. Each entry shows the page, date, and results — which positions matched, which had mismatches, and any operators found that were unexpected.') +

  glSectionEnd();
}

function getAccountManagersHTML() {
  return glSection('account-managers', 'Account Managers Module') +

  glH3('AM List') +
  glP('The main view shows a card for each Account Manager. Each card displays:') +
  glUL([
    'Number of operators managed.',
    'Markets they are active in.',
    'Active deals count.',
    'Total revenue generated.'
  ]) +
  glP('Click an AM card to open their detail view.') +

  glH3('AM Detail') +
  glP('The detail view shows a table of all operators assigned to this AM. For each operator you can see:') +
  glUL([
    'Fix fees and deal period (start/end month).',
    'Number of sold positions.',
    'Filter options by operator name, market, and deal status.'
  ]) +

  glH3('Deal Detail') +
  glP('Click an operator row in the AM detail to drill down into a specific deal. This view shows:') +
  glUL([
    'All positions held by this operator (across pages and sites).',
    'A monthly revenue chart for the deal.',
    'Actions to <strong>Extend Deal</strong> or <strong>Release Positions</strong>.'
  ]) +

  glH3('Extend Deal') +
  glP('To extend all sold positions for an operator:') +
  glOL([
    'Open the deal detail for the operator.',
    'Click <strong>Extend Deal</strong>.',
    'Select the target month to extend to.',
    'Confirm — all current sold positions will be carried forward through the selected month.'
  ]) +

  glH3('Release Positions') +
  glP('To release specific positions from a deal:') +
  glOL([
    'Open the deal detail for the operator.',
    'Click <strong>Release Positions</strong>.',
    'Select the individual positions you want to release.',
    'Confirm — selected positions will be set back to Free starting from the next month.'
  ]) +

  glSectionEnd();
}

function getProposalsHTML() {
  return glSection('proposals', 'Commercial Proposals') +

  glP('Commercial Proposals are managed within the Account Managers module. Switch to the <strong>Commercial Proposals</strong> tab in the AM screen.') +

  glH3('Proposal List') +
  glP('The proposals tab shows:') +
  glUL([
    '<strong>Stats banner</strong> — Total proposals, by status breakdown, total value.',
    '<strong>Filters</strong> — Search by name, filter by AM, market, or status.',
    '<strong>Table</strong> — All proposals with key details (operator, market, AM, status, value, date).'
  ]) +

  glH3('Creating a New Proposal') +
  glP('Click <strong>+ New Proposal</strong> to start the creation wizard:') +
  glOL([
    '<strong>Select market</strong> — Choose the target market first. This filters available positions and operators.',
    '<strong>Select operator</strong> — Pick the operator this proposal is for (filtered by the selected market).',
    '<strong>AM auto-fills</strong> — The Account Manager is automatically populated from the operator database.',
    '<strong>Select type</strong> — Choose from: New Offer, Full Package, or Renewal.',
    '<strong>Select months</strong> — Define the period the proposal covers.',
    '<strong>Position picker</strong> — The main step. A split-panel interface:',
  ]) +
  glUL([
    '<strong>Left panel</strong> — Available positions. Filter by site, page, max position number. Sort by position, traffic, or eFTD.',
    '<strong>Right panel</strong> — Selected positions with editable prices.',
    '<strong>Auto-suggest</strong> — Click to automatically pick the top N positions by eFTD.',
    '<strong>Custom position</strong> — Add a position that is not in the standard list (e.g., a special placement).',
    '<strong>Menu mode</strong> — Toggle this if the operator should pick from options. This changes the PDF layout to a menu-style format.'
  ]) +
  glOL([
    'Review all selected positions and prices.',
    'Click <strong>Save as Draft</strong> to save without sending, or <strong>Send</strong> to mark as sent.'
  ]) +

  glH3('Proposal Statuses') +
  glP('A proposal moves through the following lifecycle:') +
  glUL([
    '<strong>Draft</strong> — Initial state. Can be freely edited.',
    '<strong>Sent</strong> — Proposal has been sent to the operator.',
    '<strong>In Negotiation</strong> — Operator is reviewing and negotiating terms.',
    '<strong>Accepted</strong> — Deal is confirmed. Positions will be marked as Sold.',
    '<strong>Refused</strong> — Operator declined the proposal.'
  ]) +
  glNote('While a proposal is in Draft or Offered status, its positions are <strong>locked</strong> in the rankings view (shown in violet). This prevents conflicting changes while a proposal is pending.') +

  glH3('Additional Actions') +
  glUL([
    '<strong>Export PDF</strong> — Generate a professional PDF document of the proposal for sharing with the operator.',
    '<strong>Duplicate</strong> — Create an exact copy of an existing proposal. Useful for creating variations or renewals based on a previous offer.'
  ]) +

  glSectionEnd();
}

function getOperatorsHTML() {
  return glSection('operators', 'Operators Module') +

  glH3('Overview') +
  glP('The Operators module provides a centralized database of all operators across all markets. From the home screen, click <strong>Operators</strong> to access it.') +
  glP('The initial view shows a summary of operators grouped by market, with a total count and quick navigation.') +

  glH3('Market Detail') +
  glP('Select a market to see its operator list. Each entry shows:') +
  glUL([
    'Operator name and base name.',
    'Assigned Account Manager.',
    'Status (active, inactive, etc.).',
    'URL.'
  ]) +

  glH3('Add Operator') +
  glP('To add a new operator:') +
  glOL([
    'Navigate to the desired market in the Operators module.',
    'Click <strong>+ Add Operator</strong>.',
    'Fill in: market, operator name, base name, Account Manager, status, and URL.',
    'Save to add the operator to the database.'
  ]) +

  glH3('Import CSV') +
  glP('For bulk imports, use the CSV import feature:') +
  glOL([
    'Prepare a CSV file with columns matching the operator fields (market, name, base name, AM, status, URL).',
    'Click the import button in the Operators screen.',
    'Select the CSV file.',
    'Review and confirm the import.'
  ]) +

  glSectionEnd();
}

function getSitesHTML() {
  return glSection('sites', 'Sites Module') +

  glH3('Sites List') +
  glP('The Sites module shows all sites in your portfolio. Each row displays:') +
  glUL([
    'Site favicon and domain.',
    'Markets the site is active in.',
    'Page count (ranking pages from CSV + manually added business pages).',
    'Total traffic and positions.'
  ]) +
  glP('Click a site to open its detail view.') +

  glH3('Site Detail') +
  glP('The site detail view has two main sections:') +

  glP('<strong>Market Settings Cards</strong>') +
  glP('For each market the site is active in, a card shows:') +
  glUL([
    '<strong>Contact name and email</strong> — The point of contact for this site in this market.',
    '<strong>Asana project URL</strong> — The Asana project used for task creation (see Asana Integration section).',
    '<strong>Notes</strong> — Any additional notes for this market.'
  ]) +

  glP('<strong>Pages Table</strong>') +
  glP('Lists all pages for this site. Pages come from two sources:') +
  glUL([
    '<strong>Ranking pages</strong> — Imported from the CSV during initial setup.',
    '<strong>Business pages</strong> — Added manually for tracking non-ranking content.'
  ]) +
  glP('Each page shows market, type, traffic, and positions. Use filters to narrow by market, type, or search by name.') +

  glH3('Add Site') +
  glP('Click <strong>+ Add Site</strong> to create a new site entry. Fill in the site name and domain.') +

  glH3('Add Page') +
  glP('Within a site detail, click <strong>+ Add Page</strong> to add a non-ranking (business) page. These pages are tracked for informational purposes and can be included in proposals.') +

  glH3('Site Settings') +
  glP('Edit a site\'s general information: name, domain, default contact, and notes.') +

  glH3('Market Settings') +
  glP('Edit per-market settings for a site. This is where you configure:') +
  glUL([
    '<strong>Contact name and email</strong> — Used as the assignee when creating Asana tasks.',
    '<strong>Asana project URL</strong> — The Asana project where tasks will be created for this site/market combination.',
    '<strong>Notes</strong> — Per-market notes for internal reference.'
  ]) +
  glTip('Keeping market settings up to date is essential for the Asana integration to work correctly. Make sure every site/market combination has a valid contact email and Asana project URL.') +

  glSectionEnd();
}

function getAsanaHTML() {
  return glSection('asana', 'Asana Integration') +

  glH3('Prerequisites') +
  glP('Before using the Asana integration, ensure:') +
  glOL([
    'An <strong>Asana Personal Access Token (PAT)</strong> is configured in the server settings.',
    'A <strong>tracking project</strong> is set in the server configuration — this project receives a copy of every task for centralized tracking.'
  ]) +

  glH3('Per-Site Setup') +
  glP('For each site and market combination, you need to configure:') +
  glOL([
    'Go to the <strong>Sites</strong> module and open the target site.',
    'Edit the <strong>market settings</strong> for the relevant market.',
    'Set the <strong>Asana project URL</strong> — this is the project where tasks for this site/market will be created.',
    'Set the <strong>contact email</strong> — this person will be assigned to the task in Asana.'
  ]) +

  glH3('Creating a Task') +
  glP('To create an Asana task from any page detail in the Rankings module:') +
  glOL([
    'Open a page\'s detail view in the Rankings module.',
    'Click the <strong>Asana Task</strong> button.',
    'Set the <strong>deadline date</strong> for the task.',
    'Review the position details — these are auto-generated from the current positions on the page.',
    'Click <strong>Create Task</strong>.',
    'The task is created in two places: the site\'s Asana project (from market settings) and the centralized tracking project.'
  ]) +
  glNote('If the Asana project URL or contact email is missing for the site/market, the Asana Task button will be disabled or show a warning. Configure these in the Sites module first.') +

  glSectionEnd();
}

function getTipsHTML() {
  return glSection('tips', 'Tips & Best Practices') +

  glH3('Data Safety') +
  glUL([
    '<strong>Always export JSON before major changes.</strong> This is your backup. If something goes wrong, import the JSON to restore your previous state.',
    'Export regularly, especially before and after bulk operations like extending deals or accepting proposals.'
  ]) +

  glH3('Position Management') +
  glUL([
    '<strong>Use the scan feature regularly</strong> to detect mismatches between expected and actual operators on live pages. This helps catch issues early.',
    'Review the <strong>Available</strong> view frequently to identify high-value unsold inventory.',
    'When reordering positions via drag and drop, remember that changes propagate to following months.'
  ]) +

  glH3('Proposals') +
  glUL([
    '<strong>Create proposals in Draft first.</strong> Review all positions and prices carefully before changing status to Sent.',
    'Use the <strong>Duplicate</strong> feature to quickly create variations of existing proposals.',
    'Remember that Draft and Offered positions are locked in the rankings view — plan accordingly.',
    'Use <strong>Auto-suggest</strong> to quickly populate proposals with the highest-value positions.'
  ]) +

  glH3('Database Hygiene') +
  glUL([
    '<strong>Keep the operator database up to date.</strong> Accurate operator data ensures correct reporting and proposal generation.',
    '<strong>Maintain site settings.</strong> Per-market contacts and Asana project URLs are essential for the Asana integration and for proper task assignment.',
    'Regularly review Account Manager assignments to ensure they reflect current responsibilities.'
  ]) +

  glH3('Asana Workflow') +
  glUL([
    'Set up Asana project URLs and contacts for all site/market combinations before you start creating tasks.',
    'Use the tracking project to get a centralized view of all pending position updates across sites.',
    'Set realistic deadlines when creating tasks to keep the workflow manageable.'
  ]) +

  glSectionEnd();
}
