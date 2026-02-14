const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');

const UI_DIR = '/home/sprite/custom-ui';
const GW_PORT = 3001;
const PORT = 8080;
const CUSTOMER_EMAIL = process.env.CUSTOMER_EMAIL || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_MAX_AGE = 86400;

// Rate limiting: max 5 attempts per 15 minutes per IP
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }
  entry.count++;
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count };
}

function resetRateLimit(ip) {
  loginAttempts.delete(ip);
}

// Clean up stale rate limit entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000);

const MIME = {
  '.html':'text/html; charset=utf-8','.js':'application/javascript',
  '.css':'text/css','.json':'application/json','.png':'image/png',
  '.svg':'image/svg+xml','.ico':'image/x-icon'
};

function signSession(data) {
  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(data);
  return data + '.' + hmac.digest('hex');
}

function verifySession(cookie) {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf('.');
  if (dot === -1) return null;
  const data = cookie.substring(0, dot);
  const sig = cookie.substring(dot + 1);
  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(data);
  const expected = hmac.digest('hex');
  // Constant-time comparison
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;
  try {
    const parsed = JSON.parse(data);
    if (parsed.exp && Date.now() / 1000 > parsed.exp) return null;
    return parsed;
  } catch { return null; }
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

const LOGIN_HTML = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n  <title>Login - Arcamatrix</title>\n  <style>\n    *{margin:0;padding:0;box-sizing:border-box}\n    body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a1a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}\n    .card{width:100%;max-width:400px;padding:40px 30px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px}\n    .logo{text-align:center;margin-bottom:24px}\n    .logo-box{display:inline-block;width:40px;height:40px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:8px;margin-bottom:8px}\n    h1{text-align:center;font-size:22px;margin-bottom:6px}\n    .sub{text-align:center;color:#9ca3af;font-size:14px;margin-bottom:24px}\n    label{display:block;font-size:13px;color:#d1d5db;margin-bottom:4px}\n    input{width:100%;padding:12px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;font-size:15px;outline:none;margin-bottom:12px}\n    input:focus{border-color:#667eea}\n    input::placeholder{color:#6b7280}\n    button{width:100%;padding:12px;background:#667eea;border:none;border-radius:8px;color:#fff;font-size:15px;font-weight:500;cursor:pointer;transition:background 0.2s}\n    button:hover{background:#764ba2}\n    button:disabled{opacity:0.5;cursor:not-allowed}\n    .error{color:#f87171;font-size:13px;margin-bottom:12px;display:none}\n  </style>\n</head>\n<body>\n  <div class="card">\n    <div class="logo"><div class="logo-box"></div></div>\n    <h1>AI Workspace</h1>\n    <p class="sub">Sign in to access your assistant</p>\n    <form id="loginForm">\n      <label for="password">Password</label>\n      <input type="password" id="password" placeholder="Your password" required autofocus>\n      <div class="error" id="error"></div>\n      <button type="submit" id="btn">Sign In</button>\n    </form>\n  </div>\n  <script>\n    const form = document.getElementById("loginForm");\n    const btn = document.getElementById("btn");\n    const err = document.getElementById("error");\n    form.addEventListener("submit", async (e) => {\n      e.preventDefault();\n      btn.disabled = true; btn.textContent = "Signing in...";\n      err.style.display = "none";\n      try {\n        const res = await fetch("/auth/login", {\n          method: "POST",\n          headers: {"Content-Typ<form id="loginForm">\n      <label for="password">Password</label>\n      <input type="password" id="password" placeholder="Your password" required autofocus>\n      <div class="error" id="error"></div>\n      <button type="submit" id="btn">Sign In</button>\n    </form>\n  </div>\n  <script>\n    const form = document.getElementById("loginForm");\n    const btn = document.getElementById("btn");\n    const err = document.getElementById("error");\n    form.addEventListener("submit", async (e) => {\n      e.preventDefault();\n      btn.disabled = true; btn.textContent = "Signing in...";\n      err.style.display = "none";\n      try {\n        const res = await fetch("/auth/login", {\n          method: "POST",\n          headers: {"Content-Type":"application/json"},\n          body: JSON.stringify({password: document.getElementById("password").value})\n        });\n        const data = await res.json();\n        if (data.success) { window.location.reload(); }\n        else { err.textContent = data.error || "Invalid password"; err.style.display = "block"; }\n      } catch { err.textContent = "Connection error"; err.style.display = "block"; }\n      btn.disabled = false; btn.textContent = "Sign In";\n    });\n  </script>\n</body>\n</html>';

const server = http.createServer(async (req, res) => {
  if (req.url === '/auth/login' && req.method === 'POST') {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.writeHead(429, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({ error: 'Too many login attempts. Please try again in 15 minutes.' }));
    }

    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { password } = JSON.parse(body);
        // Verify password via Arcamatrix portal API (has its own rate limiting + Stripe verification)
        const verifyRes = await fetch('https://arcamatrix.com/api/portal', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ email: CUSTOMER_EMAIL, password })
        });
        const result = await verifyRes.json();
        if (result.sessionToken) {
          // Password correct — reset rate limit and create local session
          resetRateLimit(clientIp);
          const sessionData = JSON.stringify({ email: CUSTOMER_EMAIL, exp: Math.floor(Date.now()/1000) + SESSION_MAX_AGE });
          const signed = signSession(sessionData);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': 'arca_session=' + encodeURIComponent(signed) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + SESSION_MAX_AGE
          });
          return res.end(JSON.stringify({ success: true }));
        }
        res.writeHead(401, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ error: result.error || 'Invalid password' }));
      } catch(e) {
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ error: 'Server error' }));
      }
    });
    return;
  }

  if (req.url === '/auth/logout') {
    res.writeHead(302, {
      'Set-Cookie': 'arca_session=; Path=/; HttpOnly; Max-Age=0',
      'Location': '/'
    });
    return res.end();
  }

  const session = verifySession(getCookie(req, 'arca_session'));
  if (!session) {
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    return res.end(LOGIN_HTML);
  }

  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(UI_DIR, urlPath);
  if (!filePath.startsWith(UI_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(filePath, (err, data) => {
    if (!err) {
      const ext = path.extname(filePath);
      res.writeHead(200, {'Content-Type': MIME[ext]||'application/octet-stream','Cache-Control':'no-cache'});
      return res.end(data);
    }
    const opts = {
      hostname:'127.0.0.1', port:GW_PORT, path:req.url, method:req.method,
      headers:{...req.headers, host:'localhost:'+GW_PORT, 'x-forwarded-proto':'https', 'x-forwarded-ssl':'on'}
    };
    const proxy = http.request(opts, (pRes) => { res.writeHead(pRes.statusCode, pRes.headers); pRes.pipe(res); });
    proxy.on('error', () => { res.writeHead(502); res.end('Gateway unavailable'); });
    req.pipe(proxy);
  });
});

server.on('upgrade', (req, socket, head) => {
  const session = verifySession(getCookie(req, 'arca_session'));
  if (!session) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }

  const proxy = net.connect(GW_PORT, '127.0.0.1', () => {
    const hdrs = {...req.headers};
    hdrs['x-forwarded-proto'] = 'https';
    hdrs['x-forwarded-ssl'] = 'on';
    const reqLine = req.method+' '+req.url+' HTTP/'+req.httpVersion+'\r\n';
    const headerStr = Object.entries(hdrs).map(([k,v])=>k+': '+v).join('\r\n');
    proxy.write(reqLine+headerStr+'\r\n\r\n');
    if (head && head.length) proxy.write(head);
    socket.pipe(proxy); proxy.pipe(socket);
  });
  proxy.on('error', () => socket.destroy());
  socket.on('error', () => proxy.destroy());
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Arcamatrix proxy on :'+PORT+' -> gateway :'+GW_PORT+' (auth enabled, email: '+CUSTOMER_EMAIL+')');
});