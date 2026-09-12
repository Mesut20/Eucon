const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const rootDir = __dirname;

/* Läser .env om den finns (Node 20.6+). Filen ligger i .gitignore. */
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(path.join(rootDir, '.env')); } catch (e) { /* ingen .env */ }
}

const port = Number(process.env.PORT || 3000);

/* ---------------------------------------------------------------------------
   Instagram-flöde

   Meta stängde Basic Display API den 4 december 2024. Sedan dess finns ingen
   väg att läsa ett konto — inte ens ett öppet — utan en access-token, och
   instagram.com blockerar dessutom anrop från webbläsaren via CORS. Hämtningen
   måste därför ske här på servern med en token som kontot självt utfärdat en
   gång. Besökaren loggar aldrig in på något.

   Sätt dessa innan start:
     INSTAGRAM_ACCOUNT_ID    – IG-användar-ID för @euconab (Företag/Skapare)
     INSTAGRAM_ACCESS_TOKEN  – långlivad token (~60 dygn, går att förnya)

   Saknas de serveras instagram-feed.json, som också fungerar som varm cache
   när API:et är nere.
--------------------------------------------------------------------------- */
const instagramAccountId = process.env.INSTAGRAM_ACCOUNT_ID || 'me';
let instagramAccessToken = process.env.INSTAGRAM_ACCESS_TOKEN || '';
const fallbackFeedPath = path.join(rootDir, 'instagram-feed.json');
const envPath = path.join(rootDir, '.env');

/* ---------------------------------------------------------------------------
   Tokenförnyelse

   En långlivad token gäller 60 dygn. Meta låter den bytas mot en ny med samma
   livslängd så länge den är minst 24 timmar gammal och inte hunnit gå ut.
   Vi förnyar var sjunde dag: rikligt med marginal om servern skulle stå still
   en period, utan att slösa anrop. Den nya token skrivs tillbaka till .env så
   att den överlever en omstart.
--------------------------------------------------------------------------- */
const TOKEN_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

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

const FEED_TTL_MS = 15 * 60 * 1000;   /* hur länge ett svar återanvänds  */
const FEED_PAGE_SIZE = 100;           /* max som Graph API ger per sida  */
const FEED_MAX_PAGES = 50;            /* skydd mot en trasig paging-loop */

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
    /* Bilden serveras via vår egen proxy i stället för direkt från
       scontent.cdninstagram.com. Tre skäl: annonsblockerare och webbläsarnas
       spårningsskydd blockerar fbcdn-domänerna, Instagrams bild-URL:er är
       signerade och slutar fungera efter en tid, och besökarens webbläsare
       behöver då aldrig kontakta Meta. */
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

/* Följer paging.next hela vägen, så flödet innehåller varje inlägg —
   inte bara den första sidan. */
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  const safePath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
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
