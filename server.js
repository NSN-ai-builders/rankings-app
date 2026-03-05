const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.APP_PASSWORD || 'rankings2026';
const AUTH_TOKEN = Buffer.from(PASSWORD).toString('base64');
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));

// ==================== AUTH ====================

function requireAuth(req, res, next) {
  if (req.cookies.auth_token === AUTH_TOKEN) return next();
  res.status(401).json({ error: 'Non authentifié' });
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
    res.status(403).json({ error: 'Mot de passe incorrect' });
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
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      res.json(data);
    } else {
      res.json({ operators: {}, positionData: {}, scrapeAlerts: {} });
    }
  } catch (err) {
    console.error('Error reading data:', err);
    res.json({ operators: {}, positionData: {}, scrapeAlerts: {} });
  }
});

app.post('/api/data', requireAuth, (req, res) => {
  try {
    const { operators, positionData, scrapeAlerts } = req.body;
    const data = {
      operators: operators || {},
      positionData: positionData || {},
      scrapeAlerts: scrapeAlerts || {},
      lastModified: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
    res.json({ success: true });
  } catch (err) {
    console.error('Error writing data:', err);
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

function extractPositions(html) {
  let positions = [];

  // Strategy 1: Extract from first <ol> list
  const olMatch = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/i);
  if (olMatch) {
    const olContent = olMatch[1];
    let idx = 0;
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(olContent)) !== null) {
      idx++;
      const li = liMatch[1];
      let name = null;

      // Try link text, strong, or bold
      const linkMatch = li.match(/<a[^>]*>([^<]+)<\/a>/i);
      const strongMatch = li.match(/<strong>([^<]+)<\/strong>/i);
      const boldMatch = li.match(/<b>([^<]+)<\/b>/i);

      if (linkMatch) name = linkMatch[1].trim();
      else if (strongMatch) name = strongMatch[1].trim();
      else if (boldMatch) name = boldMatch[1].trim();

      // Fallback: plain text
      if (!name) {
        const text = li.replace(/<[^>]+>/g, '').trim();
        name = text.split(':')[0].trim();
      }

      // Clean emojis
      name = name.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
      if (name) positions.push({ position: idx, name });
    }
  }

  // Strategy 2: Try first <table>
  if (positions.length === 0) {
    const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    if (tableMatch) {
      const tableContent = tableMatch[1];
      let idx = 0;
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
        idx++;
        let name = cells.find(c => c.length > 1 && !/^\d+$/.test(c) && !/^#/.test(c));
        name = name || cells[0];
        if (name) {
          name = name.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
          if (name) positions.push({ position: idx, name });
        }
      }
    }
  }

  // Strategy 3: Numbered items in divs/headings
  if (positions.length === 0) {
    const divRegex = /(?:<h[2-4][^>]*>|<div[^>]*>)\s*(?:#?\d+[\.\)\-\s]+)([A-Z][a-zA-Z0-9\s]+)/gm;
    let divMatch;
    while ((divMatch = divRegex.exec(html)) !== null) {
      const name = divMatch[1].trim();
      if (name.length > 2 && name.length < 50) {
        positions.push({ position: positions.length + 1, name });
      }
    }
  }

  return positions;
}

app.get('/api/scrape', requireAuth, async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const html = await fetchPage(url);
    const positions = extractPositions(html);
    res.json({ success: true, url, positions, count: positions.length });
  } catch (err) {
    console.error('Scrape error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== STATIC FILES ====================

app.use(express.static(path.join(__dirname, 'public')));

// ==================== START ====================

app.listen(PORT, () => {
  console.log(`=== Rankings Server running on http://localhost:${PORT} ===`);
  console.log(`=== Password: ${PASSWORD} ===`);
});
