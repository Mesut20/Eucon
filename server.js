const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const nodemailer = require('nodemailer');

const rootDir = __dirname;


if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(path.join(rootDir, '.env')); } catch (e) { /* ingen .env */ }
}


const mailTransporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'mailcluster.loopia.se',
  port: parseInt(process.env.MAIL_PORT || '587'),
  secure: false, 
  auth: {
    user: process.env.MAIL_USER || 'info@eucon.se',
    pass: process.env.MAIL_PASS || ''
  }
});

const port = Number(process.env.PORT || 3000);


const instagramAccountId = process.env.INSTAGRAM_ACCOUNT_ID || 'me';
let instagramAccessToken = process.env.INSTAGRAM_ACCESS_TOKEN || '';
const fallbackFeedPath = path.join(rootDir, 'instagram-feed.json');
const envPath = path.join(rootDir, '.env');


const TOKEN_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

/* =========================================================================
   SPAM & BOT PROTECTION
========================================================================= */
const ipSubmissions = new Map(); 
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 }; 
const MIN_TIME_BETWEEN_SUBMISSIONS = 3000; 
const MAX_FIELD_LENGTH = 5000;
const MAX_MESSAGE_LENGTH = 10000; 

function getClientIp(req) {
  // Hantera proxies och CloudFlare
  return (req.headers['cf-connecting-ip'] || 
          req.headers['x-forwarded-for']?.split(',')[0].trim() ||
          req.socket.remoteAddress ||
          'unknown').replace(/^::ffff:/, '');
}

function checkRateLimit(ip) {
  const now = Date.now();
  if (!ipSubmissions.has(ip)) {
    ipSubmissions.set(ip, []);
  }
  
  const submissions = ipSubmissions.get(ip);
  // Ta bort gamla inlämningar utanför tidsfönstret
  const validSubmissions = submissions.filter(time => now - time < RATE_LIMIT.windowMs);
  
  if (validSubmissions.length >= RATE_LIMIT.max) {
    return { allowed: false, reason: 'rate-limit' };
  }
  
  if (validSubmissions.length > 0) {
    const lastSubmission = validSubmissions[validSubmissions.length - 1];
    if (now - lastSubmission < MIN_TIME_BETWEEN_SUBMISSIONS) {
      return { allowed: false, reason: 'too-fast' };
    }
  }
  
  validSubmissions.push(now);
  ipSubmissions.set(ip, validSubmissions);
  return { allowed: true };
}

function writeTokenToEnv(token) {
  try {
    let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (/^INSTAGRAM_ACCESS_TOKEN=.*$/m.test(text)) {
      text = text.replace(/^INSTAGRAM_ACCESS_TOKEN=.*$/m, 'INSTAGRAM_ACCESS_TOKEN=' + token);
    } else {
      var radslut = String.fromCharCode(10);
      if (text && !text.endsWith(radslut)) text += radslut;
      text += 'INSTAGRAM_ACCESS_TOKEN=' + token + radslut;
    }
    fs.writeFileSync(envPath, text, 'utf8');
    return true;
  } catch (error) {
    console.warn('Kunde inte spara ny token i .env:', error.message);
    return false;
  }
}

async function refreshInstagramToken() {
  if (!instagramAccessToken) return;
  try {
    const url = 'https://graph.instagram.com/refresh_access_token' +
                '?grant_type=ig_refresh_token&access_token=' +
                encodeURIComponent(instagramAccessToken);
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.access_token) {
      const orsak = (data.error && data.error.message) || ('HTTP ' + response.status);
      console.warn('Tokenförnyelse misslyckades:', orsak);
      return;
    }

    instagramAccessToken = data.access_token;
    const sparad = writeTokenToEnv(data.access_token);
    const dygn = Math.round((data.expires_in || 0) / 86400);
    console.log('Instagram-token förnyad, giltig ' + dygn + ' dygn till' +
                (sparad ? ' (sparad i .env)' : ' (kunde INTE sparas)'));
  } catch (error) {
    console.warn('Tokenförnyelse misslyckades:', error.message);
  }
}

const FEED_TTL_MS = 15 * 60 * 1000;   
const FEED_PAGE_SIZE = 100;           
const FEED_MAX_PAGES = 50;            

let feedCache = { at: 0, payload: null };
let feedInFlight = null;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function readFallbackFeed() {
  try {
    const data = JSON.parse(fs.readFileSync(fallbackFeedPath, 'utf8'));
    return Array.isArray(data.posts) ? data : { posts: [] };
  } catch (error) {
    return { posts: [] };
  }
}

function writeFallbackFeed(payload) {
  try {
    fs.writeFileSync(fallbackFeedPath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    console.warn('Kunde inte spara instagram-feed.json:', error.message);
  }
}

function normalisePost(post) {
  /* video och karuseller saknar användbar media_url — ta miniatyren */
  const bild = post.media_type === 'VIDEO'
    ? (post.thumbnail_url || post.media_url || '')
    : (post.media_url || post.thumbnail_url || '');

  return {
    id: post.id,
    caption: post.caption || '',
   
    image: bild ? '/api/instagram/bild?u=' + encodeURIComponent(bild) : '',
    imageOriginal: bild,
    permalink: post.permalink || 'https://www.instagram.com/euconab',
    username: post.username || 'euconab',
    timestamp: post.timestamp || '',
    /* like_count utelämnas av API:et om kontot döljer gilla-markeringar */
    likes: typeof post.like_count === 'number' ? post.like_count : null,
    comments: typeof post.comments_count === 'number' ? post.comments_count : null,
    mediaType: post.media_type || 'IMAGE'
  };
}


async function fetchAllInstagramPosts() {
  const fields = [
    'id', 'caption', 'media_type', 'media_url', 'thumbnail_url',
    'permalink', 'timestamp', 'username', 'like_count', 'comments_count'
  ].join(',');

  let url = 'https://graph.instagram.com/v21.0/' + instagramAccountId +
            '/media?fields=' + fields +
            '&limit=' + FEED_PAGE_SIZE +
            '&access_token=' + encodeURIComponent(instagramAccessToken);

  const posts = [];
  for (let sida = 0; sida < FEED_MAX_PAGES && url; sida++) {
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error('Instagram svarade ' + response.status + ': ' + text.slice(0, 200));
    }
    const data = await response.json();
    if (Array.isArray(data.data)) {
      data.data.forEach((post) => posts.push(normalisePost(post)));
    }
    url = (data.paging && data.paging.next) || '';
  }
  return posts;
}

async function getInstagramFeed() {
  if (!instagramAccountId || !instagramAccessToken) {
    const fallback = readFallbackFeed();
    return { posts: fallback.posts, source: 'fallback', reason: 'saknar-token' };
  }

  const nu = Date.now();
  if (feedCache.payload && nu - feedCache.at < FEED_TTL_MS) return feedCache.payload;

  /* samla samtidiga anrop till en enda hämtning */
  if (feedInFlight) return feedInFlight;

  feedInFlight = (async () => {
    try {
      const posts = await fetchAllInstagramPosts();
      const payload = { posts, source: 'instagram', fetchedAt: new Date().toISOString() };
      feedCache = { at: Date.now(), payload };
      writeFallbackFeed(payload);          /* varm cache inför nästa avbrott */
      return payload;
    } catch (error) {
      console.warn('Instagram-hämtning misslyckades:', error.message);
      const fallback = readFallbackFeed();
      return { posts: fallback.posts, source: 'fallback', reason: 'api-fel' };
    } finally {
      feedInFlight = null;
    }
  })();

  return feedInFlight;
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.webp': 'image/webp'
    };

    /* HTML far aldrig cachas: den pekar ut vilka versioner av CSS och JS
       som galler, och en gammal HTML med ny CSS (eller tvartom) ger fel
       som ser ut som kodfel men bara ar cache. Ovrigt revalideras. */
    const cache = ext === '.html'
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=0, must-revalidate';

    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': cache
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  /* Bildproxy: hämtar en Instagram-bild på serversidan och skickar vidare.
     Bara Instagrams egna värdnamn tillåts, annars vore detta en öppen proxy
     som vem som helst kunde använda för att dölja sin trafik. */
  if (requestUrl.pathname === '/api/instagram/bild') {
    const malUrl = requestUrl.searchParams.get('u') || '';
    let mal;
    try {
      mal = new URL(malUrl);
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Ogiltig adress');
      return;
    }

    const tillaten = mal.protocol === 'https:' &&
      /(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(mal.hostname);
    if (!tillaten) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Otillaten vard');
      return;
    }

    try {
      const bildSvar = await fetch(mal.href);
      if (!bildSvar.ok) throw new Error('CDN svarade ' + bildSvar.status);
      const buffert = Buffer.from(await bildSvar.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': bildSvar.headers.get('content-type') || 'image/jpeg',
        'Content-Length': buffert.length,
        /* Bilden ändras aldrig för ett givet inlägg — cacha länge. */
        'Cache-Control': 'public, max-age=86400, immutable'
      });
      res.end(buffert);
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Kunde inte hamta bilden');
    }
    return;
  }

  if (requestUrl.pathname === '/api/instagram') {
    try {
      const feed = await getInstagramFeed();
      sendJson(res, 200, feed);
    } catch (error) {
      sendJson(res, 500, { posts: [], error: 'Unable to fetch Instagram posts.' });
    }
    return;
  }

  /* Kontaktformulär - hanterar POST-förfrågningar */
  if (requestUrl.pathname === '/contact-handler.php' && req.method === 'POST') {
    const clientIp = getClientIp(req);
    const contentType = req.headers['content-type'] || '';
    let body = Buffer.alloc(0);
    
    // Check rate limit
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      console.log('[FORM BLOCKED]', rateCheck.reason, 'from IP:', clientIp);
      sendJson(res, 429, { 
        success: false, 
        message: rateCheck.reason === 'too-fast' 
          ? 'Formuläret skickades för snabbt. Vänta några sekunder.' 
          : 'För många försök från din IP. Försök igen senare.' 
      });
      return;
    }
    
    req.on('data', chunk => {
      body = Buffer.concat([body, chunk]);
    });
    
    req.on('end', () => {
      try {
        let name, email, organization, subject, message, honeypot;
        
        // Handle application/x-www-form-urlencoded
        if (contentType.includes('application/x-www-form-urlencoded')) {
          const bodyStr = body.toString('utf8');
          const params = new URLSearchParams(bodyStr);
          name = (params.get('name') || '').trim();
          email = (params.get('email') || '').trim();
          organization = (params.get('organization') || '').trim();
          subject = (params.get('subject') || '').trim();
          message = (params.get('message') || '').trim();
          honeypot = (params.get('website') || '').trim(); // Honeypot field
        } 
        // Handle multipart/form-data (from FormData)
        else if (contentType.includes('multipart/form-data')) {
          const bodyStr = body.toString('utf8');
          const nameMatch = bodyStr.match(/name="name"\r?\n\r?\n([^\r\n]+)/);
          const emailMatch = bodyStr.match(/name="email"\r?\n\r?\n([^\r\n]+)/);
          const orgMatch = bodyStr.match(/name="organization"\r?\n\r?\n([^\r\n]+)/);
          const subjMatch = bodyStr.match(/name="subject"\r?\n\r?\n([^\r\n]+)/);
          const msgMatch = bodyStr.match(/name="message"\r?\n\r?\n([\s\S]*?)(?:\r?\n--)/);
          const honeypotMatch = bodyStr.match(/name="website"\r?\n\r?\n([^\r\n]*)/);
          
          name = (nameMatch ? nameMatch[1] : '').trim();
          email = (emailMatch ? emailMatch[1] : '').trim();
          organization = (orgMatch ? orgMatch[1] : '').trim();
          subject = (subjMatch ? subjMatch[1] : '').trim();
          message = (msgMatch ? msgMatch[1] : '').trim();
          honeypot = (honeypotMatch ? honeypotMatch[1] : '').trim();
        } else {
          const params = new URLSearchParams(body.toString('utf8'));
          name = (params.get('name') || '').trim();
          email = (params.get('email') || '').trim();
          organization = (params.get('organization') || '').trim();
          subject = (params.get('subject') || '').trim();
          message = (params.get('message') || '').trim();
          honeypot = (params.get('website') || '').trim();
        }

        // HONEYPOT CHECK - botar fyller i dolda fält
        if (honeypot) {
          console.log('[FORM BLOCKED] Honeypot triggered from IP:', clientIp);
          sendJson(res, 400, { success: false, message: 'Formulär validering misslyckades.' });
          return;
        }

        // Validera längd på fält
        const errors = [];
        if (!name) errors.push('Namn är obligatoriskt');
        if (name && name.length > MAX_FIELD_LENGTH) errors.push('Namn är för långt');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Giltig e-post är obligatorisk');
        if (email && email.length > MAX_FIELD_LENGTH) errors.push('E-post är för lång');
        if (organization && organization.length > MAX_FIELD_LENGTH) errors.push('Organisation är för lång');
        if (subject && subject.length > MAX_FIELD_LENGTH) errors.push('Ämne är för långt');
        if (!message) errors.push('Meddelande är obligatoriskt');
        if (message && message.length > MAX_MESSAGE_LENGTH) errors.push('Meddelandet är för långt');

        // SPAM PATTERNS - detektera vanliga spam-mönster
        const spamPatterns = [
          /viagra|cialis|casino|poker|lottery|prize|winner|click here|buy now|limited offer/i,
          /http|https|www\./i, // URLs i namn/organisation (ofta spam)
          /[{}<>[\]]/g // Kod-tecken
        ];
        
        for (const pattern of spamPatterns) {
          if (pattern.test(name) || pattern.test(organization) || pattern.test(subject)) {
            console.log('[FORM BLOCKED] Spam pattern detected from IP:', clientIp);
            errors.push('Formuläret innehåller otillåtna tecken eller ord');
          }
        }

        if (errors.length > 0) {
          console.log('[FORM VALIDATION FAILED]', errors, 'from IP:', clientIp);
          sendJson(res, 400, { success: false, errors });
          return;
        }

        // Logg framgångsrik inlämning
        console.log('✓ Nytt kontaktmeddelande mottaget (IP: ' + clientIp + '):');
        console.log('  Namn:', name);
        console.log('  E-post:', email);
        if (organization) console.log('  Organisation:', organization);
        if (subject) console.log('  Ämne:', subject);
        console.log('  Meddelande:', message.substring(0, 100) + (message.length > 100 ? '...' : ''));

        // Skicka e-post till info@eucon.se
        const mailContent = `
Nytt meddelande från kontaktformuläret på eucon.se

Namn: ${name}
E-post: ${email}
${organization ? `Organisation: ${organization}` : ''}
${subject ? `Ämne: ${subject}` : ''}

Meddelande:
${message}

---
Denna e-post skickades från kontaktformuläret på eucon.se
Tid: ${new Date().toISOString()}
`;

        mailTransporter.sendMail({
          from: process.env.MAIL_FROM || 'info@eucon.se',
          to: 'info@eucon.se',
          replyTo: email,
          subject: subject ? `[Eucon] ${subject}` : `[Eucon] Nytt meddelande från ${name}`,
          text: mailContent,
          headers: {
            'X-Mailer': 'Eucon Contact Form',
            'X-Priority': '3'
          }
        }, (err, info) => {
          if (err) {
            console.error('✗ E-post misslyckades:', err.message);
          } else {
            console.log('✓ E-post skickad till info@eucon.se, messageId:', info.messageId);
          }
        });

        console.log('---');

        sendJson(res, 200, { 
          success: true, 
          message: 'Tack! Ditt meddelande har mottagits. Vi återkommer inom 1-2 arbetsdagar.' 
        });
      } catch (error) {
        console.error('[FORM ERROR]', error.message);
        sendJson(res, 500, { success: false, message: 'Ett fel uppstod. Försök igen senare.' });
      }
    });
    return;
  }

  const safePath = requestUrl.pathname === '/' 
    ? '/index.html'
    : requestUrl.pathname.replace(/\/$/, '') === '/-en'
    ? '/index-en.html'
    : requestUrl.pathname.replace(/\/$/, '') === '/-tr'
    ? '/index-tr.html'
    : requestUrl.pathname;
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveFile(filePath, res);
    return;
  }

  if (fs.existsSync(path.join(rootDir, 'index.html'))) {
    serveFile(path.join(rootDir, 'index.html'), res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, () => {
  console.log(`Eucon gallery server running at http://localhost:${port}`);

  if (instagramAccessToken) {
    /* En gång vid start, sedan var sjunde dag. unref() gör att timern
       inte håller processen vid liv om servern stängs ner. */
    refreshInstagramToken();
    const timer = setInterval(refreshInstagramToken, TOKEN_REFRESH_MS);
    if (timer.unref) timer.unref();
  } else {
    console.log('Ingen INSTAGRAM_ACCESS_TOKEN satt - flodet visar instagram-feed.json.');
  }
});
