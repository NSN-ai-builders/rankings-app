const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch(e) { /* puppeteer optional */ }
let google;
try { google = require('googleapis').google; } catch(e) { /* googleapis optional */ }

// GSC credentials path
const GSC_CREDS_PATH = path.join(__dirname, '..', 'gsc-credentials.json');
let gscAuth = null;

function initGSC() {
  try {
    if (!google || !fs.existsSync(GSC_CREDS_PATH)) return;
    const creds = JSON.parse(fs.readFileSync(GSC_CREDS_PATH, 'utf8'));
    gscAuth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
    });
    console.log('[GSC] Initialized with service account:', creds.client_email);
  } catch(e) {
    console.error('[GSC] Failed to initialize:', e.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.APP_PASSWORD || 'rankings2026';
const AUTH_TOKEN = Buffer.from(PASSWORD).toString('base64');
// Auto-detect Railway volume at /data, fallback to local dir
let DATA_DIR = process.env.DATA_DIR || __dirname;
if (fs.existsSync('/data') && fs.statSync('/data').isDirectory()) {
  DATA_DIR = '/data';
}
const DATA_FILE = path.join(DATA_DIR, 'data.json');

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));

// ==================== AUTH ====================

function requireAuth(req, res, next) {
  if (req.cookies.auth_token === AUTH_TOKEN) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === PASSWORD) {
    res.cookie('auth_token', AUTH_TOKEN, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax'
    });
    res.json({ success: true });
  } else {
    res.status(403).json({ error: 'Incorrect password' });
  }
});

app.get('/api/check-auth', (req, res) => {
  if (req.cookies.auth_token === AUTH_TOKEN) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

// ==================== DATA API ====================

app.get('/api/data', requireAuth, (req, res) => {
  try {
    console.log(`[GET /api/data] Checking file: ${DATA_FILE}, exists: ${fs.existsSync(DATA_FILE)}`);
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      console.log(`[GET /api/data] File size: ${raw.length} bytes`);
      const data = JSON.parse(raw);
      console.log(`[GET /api/data] Operators keys: ${Object.keys(data.operators || {}).length}`);
      res.json(data);
    } else {
      console.log('[GET /api/data] No data file found, returning empty');
      res.json({ operators: {}, positionData: {}, scrapeAlerts: {}, operatorDB: {}, operatorVariants: {} });
    }
  } catch (err) {
    console.error('[GET /api/data] Error:', err);
    res.json({ operators: {}, positionData: {}, scrapeAlerts: {}, operatorDB: {}, operatorVariants: {} });
  }
});

app.post('/api/data', requireAuth, (req, res) => {
  try {
    const { operators, positionData, scrapeAlerts, rawPagesCSV, rawPositionsCSV, siteConfig, operatorConfig, operatorDB, operatorVariants } = req.body;
    console.log(`[POST /api/data] Received - operators: ${Object.keys(operators || {}).length}, positionData: ${Object.keys(positionData || {}).length}, hasCSV: ${!!(rawPagesCSV && rawPositionsCSV)}, operatorDB: ${Object.keys(operatorDB || {}).length}`);

    // Preserve server-side fields (gscTraffic, gscLastSync, scanConfig) that the frontend doesn't send
    let existing = {};
    try {
      if (fs.existsSync(DATA_FILE)) {
        existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      }
    } catch(e) { /* ignore */ }

    const data = {
      operators: operators || {},
      positionData: positionData || {},
      scrapeAlerts: scrapeAlerts || {},
      lastModified: new Date().toISOString()
    };
    if (rawPagesCSV) data.rawPagesCSV = rawPagesCSV;
    if (rawPositionsCSV) data.rawPositionsCSV = rawPositionsCSV;
    if (siteConfig) data.siteConfig = siteConfig;
    if (operatorConfig) data.operatorConfig = operatorConfig;
    if (operatorDB) data.operatorDB = operatorDB;
    if (operatorVariants) data.operatorVariants = operatorVariants;

    // Preserve fields from existing data if not sent by frontend
    if (!data.rawPagesCSV && existing.rawPagesCSV) data.rawPagesCSV = existing.rawPagesCSV;
    if (!data.rawPositionsCSV && existing.rawPositionsCSV) data.rawPositionsCSV = existing.rawPositionsCSV;
    // Preserve server-side only fields
    if (existing.gscTraffic) data.gscTraffic = existing.gscTraffic;
    if (existing.gscLastSync) data.gscLastSync = existing.gscLastSync;
    if (existing.scanLog) data.scanLog = existing.scanLog;

    const json = JSON.stringify(data);
    console.log(`[POST /api/data] Writing ${json.length} bytes to ${DATA_FILE}`);
    fs.writeFileSync(DATA_FILE, json, 'utf8');
    console.log(`[POST /api/data] Write successful, file exists: ${fs.existsSync(DATA_FILE)}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/data] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== SCRAPE API ====================

function fetchPage(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 3) return reject(new Error('Too many redirects'));

    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      },
      timeout: 15000
    };

    const req = client.request(options, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
        return fetchPage(redirectUrl, redirects + 1).then(resolve).catch(reject);
      }

      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function cleanName(raw) {
  if (!raw) return '';
  // Decode HTML entities
  let name = raw.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
               .replace(/&[a-z]+;/gi, ' ');
  // Remove emojis
  name = name.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '');
  // Take only the part before " – " or " - " or ":" (operator name, not description)
  name = name.split(/\s*[–—]\s*/)[0].split(/:\s/)[0].trim();
  // Remove leading numbers like "1. " or "1) "
  name = name.replace(/^\d+[\.\)\-\s]+/, '').trim();
  // Remove common suffixes: "app", "app de apostas", "aplicativo", "bônus"
  name = name.replace(/\s+app\b.*$/i, '').trim();
  name = name.replace(/\s+aplicativo\b.*$/i, '').trim();
  // Remove trailing ":" or " -"
  name = name.replace(/[\s:\-]+$/, '').trim();
  return name;
}

function extractFromOl(olContent) {
  const items = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liRegex.exec(olContent)) !== null) {
    const li = liMatch[1];
    let name = null;

    // Try strong/bold first (usually the operator name)
    const strongMatch = li.match(/<strong>([^<]+)<\/strong>/i);
    const boldMatch = li.match(/<b>([^<]+)<\/b>/i);
    const linkMatch = li.match(/<a[^>]*>([^<]+)<\/a>/i);

    if (strongMatch) name = strongMatch[1].trim();
    else if (boldMatch) name = boldMatch[1].trim();
    else if (linkMatch) name = linkMatch[1].trim();

    // Fallback: plain text before any separator
    if (!name) {
      const text = li.replace(/<[^>]+>/g, '').trim();
      name = text.split(/[:\-–—]/)[0].trim();
    }

    name = cleanName(name);
    if (name && name.length > 1 && name.length < 60) {
      items.push(name);
    }
  }
  return items;
}

function looksLikeOperatorList(items) {
  if (items.length < 3) return false;
  // Operator names are typically short (1-4 words), start with uppercase, no common phrases
  const commonWords = /^(legal|sites?|anos?|como|apostar|o que|por que|confira|escolha|veja|acesse|busque|defina|preencha|conclua|fa[cç]a|entre|toque|comece|vantagem|desvantagem|prós|contras|sim|não|slots?|roleta|jogos?\s+de|poker|black\s*jack|baccarat|crash|mines|aviator|licen[cç]a|dom[ií]nio|passo|etapa|dica|regra|resultado|data|hor[aá]rio|local|capacidade|tv\s|streaming|show|hino|dura[cç][aã]o|curiosidade|banca|b[oô]nus|cartinha|demo|funcionalidade|linha|multiplicador|rtp|slot|tabuleiro|turbo|wild|s[ií]mbolo|aposta[rs]?|m[eé]todo|valor|modo|limite|auto|hist[oó]ric|busque|preencha|aguarde|envie|confirme|acompanhe|crie|sele[cç]ione|navegue|informe|revise|grupos?\s+de)/i;
  let validNames = items.filter(n =>
    n.split(/\s+/).length <= 5 &&
    n.length >= 2 && n.length < 40 &&
    /^[A-Z0-9]/.test(n) &&
    !commonWords.test(n) &&
    // Reject items that look like definitions (contain ":")
    !/:/.test(n)
  );
  return validNames.length >= items.length * 0.6;
}

function extractFromTable(tableContent) {
  const rows = [];
  let idx = 0;
  let isFirstRow = true;
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(tableContent)) !== null) {
    const row = trMatch[1];
    if (/<th/i.test(row)) continue;
    const cells = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(row)) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cells.length === 0) continue;
    // Skip first row if it looks like a header (contains common header words)
    if (isFirstRow) {
      isFirstRow = false;
      const rowText = cells.join(' ').toLowerCase();
      if (/plataforma|operador|licen[cç]a|destaque|caracter|crit[eé]rio|s[ií]mbolo|pagamento|ranking|posi[cç][aã]o|#|nome|site|casas?\s+(?:com|de|para)|visite|melhor|grupos?\s+de/i.test(rowText)) continue;
    }
    idx++;
    // Skip rows that look like step instructions or non-operator content
    let name = cells.find(c => c.length > 1 && c.length < 50 && !/^\d+$/.test(c) && !/^#/.test(c) && !/^(vantagem|desvantagem|prós|contras|sim|não|✓|✗|—|n\/a)/i.test(c));
    name = name || cells[0];
    name = cleanName(name);
    if (name && name.length > 1 && name.length < 50) rows.push({ position: idx, name });
  }
  return rows;
}

function extractFromUl(ulContent) {
  const items = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liRegex.exec(ulContent)) !== null) {
    const li = liMatch[1];
    const fullText = li.replace(/<[^>]+>/g, '').trim();
    // Skip items that are clearly definitions (key: long explanation)
    const beforeSep = fullText.split(/[:\-–—]/)[0].trim();
    if (/:\s/.test(fullText) && beforeSep.length < fullText.length * 0.3 && fullText.length > 40) continue;

    let name = null;

    // Try strong/bold first
    const strongMatch = li.match(/<strong>([^<]+)<\/strong>/i);
    const boldMatch = li.match(/<b>([^<]+)<\/b>/i);
    const linkMatch = li.match(/<a[^>]*>([^<]+)<\/a>/i);

    if (strongMatch) name = strongMatch[1].trim();
    else if (boldMatch) name = boldMatch[1].trim();
    else if (linkMatch) name = linkMatch[1].trim();

    // Fallback: plain text
    if (!name) {
      name = fullText.split(/[:\-–—]/)[0].trim();
    }

    name = cleanName(name);
    if (name && name.length > 1 && name.length < 40 && name.split(/\s+/).length <= 4) {
      items.push(name);
    }
  }
  return items;
}

function extractPositions(html, pageUrl) {
  let positions = [];

  // Strategy 0: Tip/palpites pages ONLY — extract operators from bookmaker images or affiliate links
  // Only run this for pages that are actually tip/palpites pages (detected by URL or content)
  const isTipPage = pageUrl ? /palpite|\/tip|dica|prono/i.test(pageUrl) : /palpites?\s+de\s+hoje|dicas?\s+de\s+apostas|wrapper-tip|bookmaker-tip/i.test(html);

  if (isTipPage && positions.length === 0) {
    const tipOps = [];
    const tipOpsSet = new Set();

    // Pattern A: bookmaker images with alt text (lakersbrasil pattern)
    const bookmakerImgRegex = /<img[^>]*class="[^"]*bookmaker[^"]*"[^>]*alt="([^"]+)"[^>]*>/gi;
    const altRegex2 = /<div[^>]*class="[^"]*bookmaker[^"]*"[^>]*>[\s\S]*?<img[^>]*alt="([^"]+)"[^>]*>/gi;
    let bkMatch;
    const imgOps = [];

    while ((bkMatch = bookmakerImgRegex.exec(html)) !== null) {
      const name = cleanName(bkMatch[1]);
      if (name && name.length > 1) imgOps.push(name);
    }
    if (imgOps.length === 0) {
      while ((bkMatch = altRegex2.exec(html)) !== null) {
        const name = cleanName(bkMatch[1]);
        if (name && name.length > 1) imgOps.push(name);
      }
    }
    // Only use image-based operators if they have multiple unique names (not just site name)
    const uniqueImgOps = [...new Set(imgOps.map(n => n.toLowerCase()))];
    if (uniqueImgOps.length >= 2) {
      imgOps.forEach(name => {
        if (!tipOpsSet.has(name.toLowerCase())) {
          tipOpsSet.add(name.toLowerCase());
          tipOps.push(name);
        }
      });
    }

    // Pattern B: /go-{operator}-tips affiliate link slugs (unique operators)
    if (tipOps.length < 2) {
      const goLinkRegex = /\/go-([a-z0-9][a-z0-9-]*?)(?:-(?:tips|casas|slots|cassino|apostas|bonus|review))?(?:\/|"|')/gi;
      let goMatch;
      const goOpsSet = new Set();
      while ((goMatch = goLinkRegex.exec(html)) !== null) {
        let slug = goMatch[1].toLowerCase().replace(/-+$/, '');
        if (slug.length < 2 || /^(to|go|the|and|or|for|at|in|on|up)$/.test(slug)) continue;
        const sitePrefixes = ['trivela', 'lance', 'placar', 'umdois', 'gazeta', 'lakers'];
        sitePrefixes.forEach(prefix => {
          if (slug.startsWith(prefix + '-') && slug.length > prefix.length + 2) {
            slug = slug.substring(prefix.length + 1);
          }
        });
        if (/telegram|whatsapp|youtube|instagram/i.test(slug)) continue;
        goOpsSet.add(slug);
      }
      if (goOpsSet.size >= 2) {
        tipOps.length = 0; tipOpsSet.clear(); // Reset — prefer /go- links over single-name images
        goOpsSet.forEach(slug => {
          const name = slug.split('-').map((w, i) => i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');
          if (!tipOpsSet.has(name.toLowerCase())) {
            tipOpsSet.add(name.toLowerCase());
            tipOps.push(name);
          }
        });
      }
    }

    // Pattern C: Table with "Casa" or "Casa de aposta" column
    if (tipOps.length === 0) {
      const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
      let tMatch;
      while ((tMatch = tableRegex.exec(html)) !== null) {
        const tableHtml = tMatch[1];
        if (/<th[^>]*>[^<]*casa/i.test(tableHtml)) {
          const headerMatch = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
          if (headerMatch) {
            const ths = [];
            const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
            let thMatch;
            while ((thMatch = thRegex.exec(headerMatch[1])) !== null) {
              ths.push(thMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase());
            }
            const casaIdx = ths.findIndex(t => t.includes('casa'));
            if (casaIdx >= 0) {
              const trRegex2 = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
              let trMatch2;
              const casaOpsSet = new Set();
              while ((trMatch2 = trRegex2.exec(tableHtml)) !== null) {
                if (/<th/i.test(trMatch2[1])) continue;
                const tds = [];
                const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                let tdMatch;
                while ((tdMatch = tdRegex.exec(trMatch2[1])) !== null) {
                  tds.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
                }
                if (tds[casaIdx]) {
                  const name = cleanName(tds[casaIdx]);
                  if (name && name.length > 1 && !casaOpsSet.has(name.toLowerCase())) {
                    casaOpsSet.add(name.toLowerCase());
                    tipOps.push(name);
                  }
                }
              }
            }
          }
        }
      }
    }

    if (tipOps.length >= 2) {
      positions = tipOps.map((name, i) => ({ position: i + 1, name }));
    }
  }

  // --- Collect candidates from multiple strategies and pick the best ---

  // Candidate: beauty_table
  let beautyTablePositions = [];
  {
    const btStart = html.indexOf('beauty_table');
    if (btStart !== -1) {
      const btSection = html.substring(btStart, Math.min(html.length, btStart + 50000));
      const rowRegex = /<strong>\s*(\d+)\.\s*([^<]+)<\/strong>/gi;
      let rMatch;
      while ((rMatch = rowRegex.exec(btSection)) !== null) {
        const name = cleanName(rMatch[2]);
        if (name && name.length > 1 && name.length < 50) {
          beautyTablePositions.push({ position: parseInt(rMatch[1]), name });
        }
      }
    }
  }

  // Candidate: Best <table> with operator names (try all tables)
  let bestTablePositions = [];
  {
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    let bestScore = 0;
    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableContent = tableMatch[1];
      if (/<th[^>]*>[^<]*casa/i.test(tableContent)) continue;
      const headerText = (tableContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i) || ['',''])[1].replace(/<[^>]+>/g, '').toLowerCase();
      if (/s[ií]mbolo|pagamento|crit[eé]rio|caracter[ií]stica/i.test(headerText)) continue;

      const rows = extractFromTable(tableContent);
      if (rows.length >= 3 && looksLikeOperatorList(rows.map(r => r.name))) {
        let score = rows.length;
        if (rows.length > 50) score = 0;
        if (rows.length >= 5 && rows.length <= 30) score *= 2;
        if (/plataforma|operador|site|casa|bet|aposta/i.test(headerText)) score *= 3;
        if (score > bestScore) {
          bestScore = score;
          bestTablePositions = rows;
        }
      }
    }
  }

  // Candidate: Best <ol> with operator names
  let bestOlPositions = [];
  {
    const olRegex = /<ol[^>]*>([\s\S]*?)<\/ol>/gi;
    let olMatch;
    let bestOlScore = 0;

    while ((olMatch = olRegex.exec(html)) !== null) {
      if (/breadcrumb/i.test(olMatch[0])) continue;
      const items = extractFromOl(olMatch[1]);
      if (items.length >= 3 && looksLikeOperatorList(items)) {
        let score = items.length;
        if (items.length > 50) score = 0;
        if (items.length >= 5 && items.length <= 30) score *= 2;
        if (score > bestOlScore) {
          bestOlScore = score;
          bestOlPositions = items.map((name, i) => ({ position: i + 1, name }));
        }
      }
    }
  }

  // Candidate: Numbered headings
  let headingPositions = [];
  {
    const headingRegex = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi;
    let hMatch;
    const numbered = [];
    let lastNum = 0;
    while ((hMatch = headingRegex.exec(html)) !== null) {
      const text = hMatch[1].replace(/<[^>]+>/g, '').trim();
      const numMatch = text.match(/^(\d+)[\.\)\s]+(.+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1]);
        if (numbered.length >= 3 && num <= lastNum && num <= 2) break;
        let name = cleanName(numMatch[2]);
        if (name && name.length > 1 && name.length < 50) {
          numbered.push({ position: num, name });
          lastNum = num;
        }
      }
    }
    if (numbered.length >= 3 && looksLikeOperatorList(numbered.map(n => n.name))) {
      headingPositions = numbered;
    }
  }

  // Candidate: Best <ul> with operator names (bullet point lists)
  let bestUlPositions = [];
  {
    const ulRegex = /<ul[^>]*>([\s\S]*?)<\/ul>/gi;
    let ulMatch;
    let bestUlScore = 0;

    while ((ulMatch = ulRegex.exec(html)) !== null) {
      // Skip nav, menu, footer, sidebar, breadcrumb ULs
      if (/nav|menu|footer|sidebar|breadcrumb|social|widget/i.test(ulMatch[0].substring(0, 200))) continue;
      const items = extractFromUl(ulMatch[1]);
      if (items.length >= 3 && items.length <= 25 && looksLikeOperatorList(items)) {
        let score = items.length;
        if (items.length >= 5 && items.length <= 20) score *= 2;
        if (score > bestUlScore) {
          bestUlScore = score;
          bestUlPositions = items.map((name, i) => ({ position: i + 1, name }));
        }
      }
    }
  }

  // Pick the best result among all candidates
  if (positions.length === 0) {
    const candidates = [
      { source: 'beauty_table', items: beautyTablePositions },
      { source: 'table', items: bestTablePositions },
      { source: 'ol', items: bestOlPositions },
      { source: 'headings', items: headingPositions },
      { source: 'ul', items: bestUlPositions }
    ].filter(c => c.items.length >= 3);

    if (candidates.length > 0) {
      // Prefer the candidate with the most operators
      candidates.sort((a, b) => b.items.length - a.items.length);
      positions = candidates[0].items;
    }
  }

  // Strategy fallback: Standalone headings after "melhores" section
  if (positions.length === 0) {
    const sectionMatch = html.match(/melhor(?:es)?\s+(?:bets|casas|sites|plataformas)[^<]*/i);
    if (sectionMatch) {
      const sectionStart = html.indexOf(sectionMatch[0]);
      const afterSection = html.substring(sectionStart);
      const headingRegex = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi;
      let hMatch;
      const ops = [];
      while ((hMatch = headingRegex.exec(afterSection)) !== null) {
        const text = hMatch[1].replace(/<[^>]+>/g, '').trim();
        const name = cleanName(text);
        if (name && name.length > 1 && name.length < 30 &&
            name.split(/\s+/).length <= 4 &&
            !/^(como|o que|onde|por que|perguntas|outros|palpite|vantagens|desvantagens|prós|contras|conclus|legal|sites?|anos?|apostar|confira|escolha|veja|defina|preencha|conclua|fa[cç]a|entre|toque|comece|licen[cç]a|dom[ií]nio)/i.test(name)) {
          ops.push({ position: ops.length + 1, name });
        }
        if (ops.length > 0 && /^(perguntas|como|o que|onde|por que|outros palpites|conclus)/i.test(name)) break;
      }
      if (ops.length >= 2) {
        positions = ops;
      }
    }
  }

  return positions;
}

// Fetch page with headless browser (for JS-rendered content)
async function fetchPageWithBrowser(url) {
  if (!puppeteer) throw new Error('Puppeteer not installed');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // Wait a bit more for lazy-loaded content
    await new Promise(r => setTimeout(r, 3000));
    const html = await page.content();
    return html;
  } finally {
    await browser.close();
  }
}

app.get('/api/scrape', requireAuth, async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    // Try basic HTTP first (faster)
    let html = await fetchPage(url);
    let positions = extractPositions(html, url);
    let method = 'http';

    // If no positions found and Puppeteer available, try headless browser
    if (positions.length === 0 && puppeteer) {
      console.log('[SCRAPE] HTTP found 0 positions, trying headless browser for', url);
      try {
        html = await fetchPageWithBrowser(url);
        positions = extractPositions(html, url);
        method = 'browser';
        console.log('[SCRAPE] Browser found', positions.length, 'positions');
      } catch (browserErr) {
        console.error('[SCRAPE] Browser fallback failed:', browserErr.message);
      }
    }

    res.json({ success: true, url, positions, count: positions.length, method });
  } catch (err) {
    console.error('Scrape error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Parse manually pasted HTML
app.post('/api/scrape-html', requireAuth, (req, res) => {
  const { html } = req.body;
  if (!html) return res.status(400).json({ error: 'Missing html' });
  try {
    const positions = extractPositions(html);
    res.json({ success: true, positions, count: positions.length, method: 'manual' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== GSC API ====================

// List available GSC sites
app.get('/api/gsc/sites', requireAuth, async (req, res) => {
  if (!gscAuth) return res.status(500).json({ error: 'GSC not configured' });
  try {
    const client = await gscAuth.getClient();
    const webmasters = google.webmasters({ version: 'v3', auth: client });
    const result = await webmasters.sites.list();
    const sites = (result.data.siteEntry || []).map(s => ({
      siteUrl: s.siteUrl,
      permission: s.permissionLevel
    }));
    res.json({ success: true, sites });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Get traffic (clicks) per page for a site
app.get('/api/gsc/traffic', requireAuth, async (req, res) => {
  if (!gscAuth) return res.status(500).json({ error: 'GSC not configured' });
  const { siteUrl, startDate, endDate } = req.query;
  if (!siteUrl) return res.status(400).json({ error: 'Missing siteUrl' });

  // Default: last 28 days
  const end = endDate || new Date().toISOString().split('T')[0];
  const start = startDate || new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    const client = await gscAuth.getClient();
    const webmasters = google.webmasters({ version: 'v3', auth: client });
    const result = await webmasters.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: start,
        endDate: end,
        dimensions: ['page'],
        rowLimit: 25000
      }
    });

    const pages = (result.data.rows || []).map(r => ({
      url: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position
    }));

    res.json({ success: true, siteUrl, startDate: start, endDate: end, pages, count: pages.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Core GSC sync function (reusable for manual + auto)
async function runGSCSync() {
  if (!gscAuth) throw new Error('GSC not configured');

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const positionData = data.positionData || {};

  const client = await gscAuth.getClient();
  const webmasters = google.webmasters({ version: 'v3', auth: client });
  const sitesResult = await webmasters.sites.list();
  const gscSites = (sitesResult.data.siteEntry || []).map(s => s.siteUrl);

  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let updatedCount = 0;
  let matchedSites = 0;

  for (const market of Object.keys(positionData)) {
    const marketPd = positionData[market];
    const pageUrls = Object.keys(marketPd);
    if (pageUrls.length === 0) continue;

    const hostMap = {};
    pageUrls.forEach(url => {
      try {
        const hostname = new URL(url).hostname.replace('www.', '');
        if (!hostMap[hostname]) hostMap[hostname] = [];
        hostMap[hostname].push(url);
      } catch(e) {}
    });

    for (const [hostname, urls] of Object.entries(hostMap)) {
      const possibleSites = [
        'sc-domain:' + hostname,
        'https://www.' + hostname + '/',
        'https://' + hostname + '/'
      ];
      const gscSite = possibleSites.find(s => gscSites.includes(s));
      if (!gscSite) continue;

      matchedSites++;
      console.log(`[GSC] Fetching traffic for ${gscSite} (${urls.length} pages)`);

      try {
        const result = await webmasters.searchanalytics.query({
          siteUrl: gscSite,
          requestBody: {
            startDate: start,
            endDate: end,
            dimensions: ['page'],
            rowLimit: 25000
          }
        });

        const clickMap = {};
        (result.data.rows || []).forEach(r => {
          clickMap[r.keys[0]] = r.clicks;
        });

        if (!data.gscTraffic) data.gscTraffic = {};
        if (!data.gscTraffic[market]) data.gscTraffic[market] = {};

        urls.forEach(pageUrl => {
          let clicks = clickMap[pageUrl] || clickMap[pageUrl + '/'] || clickMap[pageUrl.replace(/\/$/, '')] || 0;
          if (clicks === 0) {
            const altUrl = pageUrl.includes('://www.') ? pageUrl.replace('://www.', '://') : pageUrl.replace('://', '://www.');
            clicks = clickMap[altUrl] || clickMap[altUrl + '/'] || clickMap[altUrl.replace(/\/$/, '')] || 0;
          }
          if (clicks > 0) {
            data.gscTraffic[market][pageUrl] = { clicks, lastUpdated: end };
            updatedCount++;
          }
        });

        await new Promise(r => setTimeout(r, 1000));
      } catch(e) {
        console.error(`[GSC] Error fetching ${gscSite}:`, e.message);
      }
    }
  }

  data.gscLastSync = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
  console.log(`[GSC] Sync complete: ${matchedSites} sites matched, ${updatedCount} pages updated`);
  return { matchedSites, updatedPages: updatedCount, period: { start, end } };
}

// Manual GSC sync endpoint
app.post('/api/gsc/sync-traffic', requireAuth, async (req, res) => {
  try {
    const result = await runGSCSync();
    res.json({ success: true, ...result });
  } catch(e) {
    console.error('[GSC] Sync error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Daily GSC auto-sync scheduler
let gscTimer = null;

function scheduleGSCSync() {
  if (gscTimer) clearTimeout(gscTimer);
  if (!gscAuth) return;

  // Schedule for next occurrence of 5:00 AM (1h before weekly scan)
  const now = new Date();
  const next = new Date(now);
  next.setHours(5, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - Date.now();

  console.log(`[GSC] Next auto-sync scheduled for ${next.toISOString()} (in ${Math.round(delay/1000/60)} min)`);
  gscTimer = setTimeout(async () => {
    console.log('[GSC] Starting daily auto-sync...');
    try {
      await runGSCSync();
    } catch(e) {
      console.error('[GSC] Auto-sync failed:', e.message);
    }
    // Schedule next one (tomorrow)
    setTimeout(scheduleGSCSync, 5000);
  }, delay);
}

// Get last sync info
app.get('/api/gsc/status', requireAuth, (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json({
      configured: !!gscAuth,
      lastSync: data.gscLastSync || null,
      trafficPages: Object.values(data.gscTraffic || {}).reduce((sum, m) => sum + Object.keys(m).length, 0)
    });
  } catch(e) {
    res.json({ configured: !!gscAuth, lastSync: null, trafficPages: 0 });
  }
});

// ==================== AUTO-SCAN SCHEDULER ====================

let scanConfig = { enabled: true, dayOfWeek: 1, hour: 6, minute: 0 }; // Monday 6:00 AM
let scanLog = [];
let scanTimer = null;

function loadScanConfig() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (data.scanConfig) scanConfig = data.scanConfig;
      if (data.scanLog) scanLog = data.scanLog;
    }
  } catch(e) { console.error('[SCAN] Failed to load config:', e.message); }
}

function saveScanData() {
  try {
    let data = {};
    if (fs.existsSync(DATA_FILE)) {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
    data.scanConfig = scanConfig;
    data.scanLog = scanLog.slice(-200); // keep last 200 entries
    fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
  } catch(e) { console.error('[SCAN] Failed to save scan data:', e.message); }
}

function getNextScanTime() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(scanConfig.hour, scanConfig.minute, 0, 0);
  // Set to next occurrence of dayOfWeek
  const daysAhead = ((scanConfig.dayOfWeek - now.getDay()) + 7) % 7;
  if (daysAhead === 0 && now > next) {
    next.setDate(next.getDate() + 7);
  } else {
    next.setDate(next.getDate() + daysAhead);
  }
  return next;
}

function scheduleNextScan() {
  if (scanTimer) clearTimeout(scanTimer);
  if (!scanConfig.enabled) {
    console.log('[SCAN] Auto-scan disabled');
    return;
  }
  const next = getNextScanTime();
  const delay = next.getTime() - Date.now();
  console.log(`[SCAN] Next auto-scan scheduled for ${next.toISOString()} (in ${Math.round(delay/1000/60)} min)`);
  scanTimer = setTimeout(() => {
    runAutoScan();
    // Schedule next one
    setTimeout(scheduleNextScan, 5000);
  }, delay);
}

async function scrapeUrl(url, useBrowser) {
  try {
    let html = await fetchPage(url);
    let positions = extractPositions(html, url);
    // Only use Puppeteer for single-page manual scans, not bulk
    if (positions.length === 0 && useBrowser && puppeteer) {
      try {
        html = await fetchPageWithBrowser(url);
        positions = extractPositions(html, url);
      } catch(e) { /* browser fallback failed */ }
    }
    return positions;
  } catch(e) {
    return null; // error
  }
}

async function runAutoScan(manualType) {
  console.log('[SCAN] Starting auto-scan...');
  let data;
  try {
    if (!fs.existsSync(DATA_FILE)) { console.log('[SCAN] No data file'); return; }
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch(e) { console.error('[SCAN] Failed to read data:', e.message); return; }

  const positionData = data.positionData || {};
  const scrapeAlerts = data.scrapeAlerts || {};

  // Current month as MM/26
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0') + '/26';
  console.log('[SCAN] Current month:', month);

  const markets = Object.keys(positionData);
  let totalScanned = 0, totalAlerts = 0, totalErrors = 0, totalSkipped = 0;
  const logEntry = {
    timestamp: now.toISOString(),
    type: manualType || 'auto',
    results: []
  };

  try {
  for (const market of markets) {
    const marketPd = positionData[market] || {};
    const pageUrls = Object.keys(marketPd);
    console.log('[SCAN] Market:', market, '- Pages:', pageUrls.length);

    for (const pageUrl of pageUrls) {
      const pd = marketPd[pageUrl];
      if (pd.autoScan === false || pd.noRanking) {
        totalSkipped++;
        continue;
      }

      console.log('[SCAN] Scanning:', pageUrl.substring(0, 80));

      // Rate limit: wait between requests (1s for HTTP-only)
      if (totalScanned > 0) await new Promise(r => setTimeout(r, 1000));

      let positions;
      try {
        positions = await scrapeUrl(pageUrl, false); // no browser fallback for bulk
      } catch(scrapeErr) {
        console.error('[SCAN] Scrape error for', pageUrl, ':', scrapeErr.message);
        positions = null;
      }
      const pageResult = { market, url: pageUrl, status: 'ok', found: 0, alerts: 0 };

      if (positions === null) {
        pageResult.status = 'error';
        totalErrors++;
      } else if (positions.length === 0) {
        pageResult.status = 'no_results';
        totalErrors++;
      } else {
        pageResult.found = positions.length;
        const currentCount = pd.positions.filter(p => {
          const nl = (p.name || '').toLowerCase();
          return nl !== 'banner' && nl !== 'link' && nl !== 'operator of the month';
        }).length;

        // Detect suspicious results
        let pageAlerts = [];
        if (positions.length !== currentCount && currentCount > 0) {
          const diff = Math.abs(positions.length - currentCount);
          if (diff >= 3 || diff / currentCount > 0.3) {
            pageAlerts.push('Position count changed significantly: ' + currentCount + ' → ' + positions.length);
          }
        }

        // Check for operator mismatches on sold positions
        const namedPositions = pd.positions.filter(p => {
          const nl = (p.name || '').toLowerCase();
          return nl === 'banner' || nl === 'link' || nl === 'operator of the month';
        });
        const numberedPositions = pd.positions.filter(p => {
          const nl = (p.name || '').toLowerCase();
          return nl !== 'banner' && nl !== 'link' && nl !== 'operator of the month';
        });

        let mismatchCount = 0;
        positions.forEach((scraped, i) => {
          if (i >= numberedPositions.length) return;
          const pos = numberedPositions[i];
          const md = pos.months?.[month] || {};
          if (md.sold && md.operator) {
            // Simple name comparison (server-side doesn't have full matching)
            const scrapedLower = scraped.name.toLowerCase().replace(/\s+/g, '');
            const expectedLower = md.operator.toLowerCase().replace(/\s+/g, '');
            if (scrapedLower !== expectedLower && !scrapedLower.includes(expectedLower) && !expectedLower.includes(scrapedLower)) {
              mismatchCount++;
            }
          }
        });

        if (mismatchCount > 0) {
          pageAlerts.push(mismatchCount + ' operator mismatch(es) detected');
        }

        if (pageAlerts.length > 0) {
          pageResult.alerts = pageAlerts.length;
          pageResult.alertDetails = pageAlerts;
          totalAlerts += pageAlerts.length;
          // Store alerts in scrapeAlerts for frontend display
          if (!scrapeAlerts[market]) scrapeAlerts[market] = {};
          if (!scrapeAlerts[market][pageUrl]) scrapeAlerts[market][pageUrl] = {};
          scrapeAlerts[market][pageUrl]._autoScan = {
            timestamp: new Date().toISOString(),
            alerts: pageAlerts
          };
        }

        // Record last scan timestamp
        pd.lastScanned = new Date().toISOString();

        // Helper: check if operator name is in the operatorDB for this market, returns resolved name or null
        const resolveFromDB = (name) => {
          const db = data.operatorDB?.[market] || {};
          const nameCompact = name.toLowerCase().replace(/[^a-z0-9]/g, '');
          // Also check custom variants
          const variants = data.operatorVariants?.[market] || {};
          for (const opKey of Object.keys(db)) {
            const opCompact = opKey.toLowerCase().replace(/[^a-z0-9]/g, '');
            const baseCompact = (db[opKey].baseName || opKey).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (nameCompact === opCompact || nameCompact === baseCompact) return opKey;
            // Check custom variants for this operator
            const opVariants = variants[opKey] || [];
            for (const v of opVariants) {
              if (v.toLowerCase().replace(/[^a-z0-9]/g, '') === nameCompact) return opKey;
            }
          }
          return null;
        };

        // Update positions for non-sold slots — only if operator is in DB
        positions.forEach((scraped, i) => {
          if (i >= numberedPositions.length) {
            const newPos = { name: String(namedPositions.length + numberedPositions.length + 1), months: {} };
            numberedPositions.push(newPos);
          }
          const pos = numberedPositions[i];
          if (!pos.months) pos.months = {};
          const md = pos.months[month] || {};
          const resolved = resolveFromDB(scraped.name);
          if (!md.sold) {
            if (resolved) {
              pos.months[month] = { operator: resolved, sold: false, price: 0 };
            } else {
              // Unknown operator — leave empty, record alert
              pageAlerts.push('Position ' + (i + 1) + ': unknown operator "' + scraped.name + '" not in DB');
            }
          } else if (md.sold && md.operator) {
            // Check for mismatch on sold positions (more detailed per-position alert)
            if (resolved && resolved.toLowerCase().replace(/[^a-z0-9]/g, '') !== md.operator.toLowerCase().replace(/[^a-z0-9]/g, '')) {
              if (!scrapeAlerts[market]) scrapeAlerts[market] = {};
              if (!scrapeAlerts[market][pageUrl]) scrapeAlerts[market][pageUrl] = {};
              scrapeAlerts[market][pageUrl][namedPositions.length + i] = {
                type: 'sold_mismatch',
                expected: md.operator,
                found: scraped.name + (resolved !== scraped.name ? ' → ' + resolved : '')
              };
            }
          }
        });

        // Remove unsold banner/link/ootm
        const soldNamed = namedPositions.filter(p => {
          const md = p.months?.[month] || {};
          return md.sold && md.operator;
        });

        pd.positions = soldNamed.concat(numberedPositions);
      }

      totalScanned++;
      logEntry.results.push(pageResult);
    }
  }

  } catch(loopErr) {
    console.error('[SCAN] Error during scan loop:', loopErr.message, loopErr.stack);
  }

  logEntry.summary = {
    scanned: totalScanned,
    skipped: totalSkipped,
    alerts: totalAlerts,
    errors: totalErrors
  };

  scanLog.push(logEntry);
  data.positionData = positionData;
  data.scrapeAlerts = scrapeAlerts;
  data.scanLog = scanLog.slice(-200);

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
    console.log(`[SCAN] Auto-scan complete: ${totalScanned} scanned, ${totalSkipped} skipped, ${totalAlerts} alerts, ${totalErrors} errors`);
  } catch(e) {
    console.error('[SCAN] Failed to save results:', e.message);
  }
}

// Scan config API
app.get('/api/scan-config', requireAuth, (req, res) => {
  res.json({ config: scanConfig, nextScan: scanConfig.enabled ? getNextScanTime().toISOString() : null });
});

app.post('/api/scan-config', requireAuth, (req, res) => {
  const { enabled, dayOfWeek, hour, minute } = req.body;
  if (typeof enabled === 'boolean') scanConfig.enabled = enabled;
  if (typeof dayOfWeek === 'number') scanConfig.dayOfWeek = dayOfWeek;
  if (typeof hour === 'number') scanConfig.hour = hour;
  if (typeof minute === 'number') scanConfig.minute = minute;
  saveScanData();
  scheduleNextScan();
  res.json({ success: true, config: scanConfig, nextScan: scanConfig.enabled ? getNextScanTime().toISOString() : null });
});

// Scan log API
app.get('/api/scan-log', requireAuth, (req, res) => {
  res.json({ log: scanLog.slice(-50).reverse() });
});

// Manual bulk scan trigger
app.post('/api/scan-all', requireAuth, async (req, res) => {
  res.json({ success: true, message: 'Scan started' });
  // Run async so response returns immediately
  runAutoScan('manual').catch(e => console.error('[SCAN] Manual scan failed:', e.message));
});

// ==================== STATIC FILES ====================

app.use(express.static(path.join(__dirname, 'public')));

// ==================== START ====================

app.listen(PORT, () => {
  console.log(`=== Rankings Server running on http://localhost:${PORT} ===`);
  console.log(`=== Password: ${PASSWORD} ===`);
  console.log(`=== Data file: ${DATA_FILE} ===`);
  // Init GSC + daily sync
  initGSC();
  scheduleGSCSync();
  // Load scan config and start scheduler
  loadScanConfig();
  scheduleNextScan();
});
