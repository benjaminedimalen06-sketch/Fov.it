import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));
app.use(express.static('public'));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const JWT_SECRET = process.env.JWT_SECRET || 'fov-it-secret-change-me';

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ===== FAVICON =====
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'favicon.svg')));
app.get('/favicon.svg', (req, res) => res.sendFile(path.join(__dirname, 'favicon.svg')));
app.get('/og-image.svg', (req, res) => res.sendFile(path.join(__dirname, 'og-image.svg')));

// ===== REGISTER =====
app.post('/api/register', async (req, res) => {
  try {
    const { name, gmail, password, age } = req.body;

    if (!name || !gmail || !password || !age) {
      return res.status(400).json({ error: 'Lahat ng fields ay kailangan' });
    }
    if (name.length < 3) return res.status(400).json({ error: 'Name min 3 characters' });
    if (!gmail.includes('@')) return res.status(400).json({ error: 'Invalid Gmail' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 characters' });
    if (age < 10 || age > 100) return res.status(400).json({ error: 'Age must be 10-100' });

    const { data: existing } = await supabase
      .from('users')
      .select('id, name, gmail')
      .or(`name.eq.${name},gmail.eq.${gmail}`)
      .maybeSingle();

    if (existing) {
      if (existing.name === name) return res.status(400).json({ error: 'Name already taken' });
      if (existing.gmail === gmail) return res.status(400).json({ error: 'Gmail already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = name === 'Zyrox' ? 'owner' : 'user';

    const { data, error } = await supabase
      .from('users')
      .insert({ name, gmail, password: hashedPassword, age: parseInt(age), role })
      .select('id, name, gmail, role')
      .single();

    if (error) return res.status(500).json({ error: 'Failed to create account: ' + error.message });

    return res.status(201).json({ success: true, user: data });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== LOGIN =====
app.post('/api/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'Name at password ay kailangan' });

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('name', name)
      .maybeSingle();

    if (error || !user) return res.status(401).json({ error: 'Maling name o password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Maling name o password' });

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      token,
      user: { id: user.id, name: user.name, gmail: user.gmail, role: user.role, age: user.age }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== UPLOAD =====
app.post('/api/upload', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Hindi naka-login' });

  let user;
  try {
    user = jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title at content ay kailangan' });

    const link = Math.random().toString(36).substring(2, 12);

    const { data, error } = await supabase
      .from('scripts')
      .insert({ user_id: user.id, title, content, public_link: link })
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to upload: ' + error.message });

    return res.status(201).json({ success: true, script: data, link });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== LIST =====
app.get('/api/list', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Hindi naka-login' });

  let user;
  try {
    user = jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const isOwner = user.role === 'owner';
    let query = supabase
      .from('scripts')
      .select('id, title, public_link, user_id, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (!isOwner) query = query.eq('user_id', user.id);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Failed to fetch: ' + error.message });

    return res.status(200).json({ scripts: data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== RAW (browser = loadstring command + copy, executor = totoong script) =====
app.get('/api/raw', async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.send(`<!DOCTYPE html><html><head><title>Fov.it</title></head><body style="background:#0a0a0a;color:#ff6666;font-family:sans-serif;text-align:center;padding:50px;"><h1>❌ Invalid Link</h1></body></html>`);
  }

  const { data: script, error } = await supabase
    .from('scripts')
    .select('id, title, content, public_link, user_id')
    .eq('public_link', id)
    .maybeSingle();

  if (error || !script) {
    return res.send(`<!DOCTYPE html><html><head><title>Fov.it</title></head><body style="background:#0a0a0a;color:#ff6666;font-family:sans-serif;text-align:center;padding:50px;"><h1>❌ Script Not Found</h1></body></html>`);
  }

  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const isBrowser = /mozilla|chrome|safari|firefox|edge|opera|trident/i.test(userAgent);

  // ===== EXECUTOR =====
  if (!isBrowser) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(script.content);
  }

  // ===== BROWSER =====
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host');
  const loadstringCmd = `loadstring(game:HttpGet("${protocol}://${host}/api/raw?id=${id}"))()`;

  return res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fov.it — ${escapeHtml(script.title)}</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <meta property="og:title" content="Fov.it — ${escapeHtml(script.title)}">
      <meta property="og:description" content="Protektadong Lua script.">
      <meta property="og:image" content="${protocol}://${host}/og-image.svg">
      <meta property="og:url" content="${protocol}://${host}/api/raw?id=${id}">
      <meta name="twitter:card" content="summary_large_image">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: #0a0a0a; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .container { background: #141414; padding: 40px; border-radius: 12px; border: 1px solid #222; width: 100%; max-width: 700px; }
        .logo { color: #00ff88; font-size: 24px; font-weight: bold; text-align: center; margin-bottom: 8px; }
        .subtitle { color: #666; font-size: 12px; text-align: center; margin-bottom: 30px; }
        h1 { color: #fff; font-size: 20px; margin-bottom: 8px; }
        .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
        .code-box { background: #0a0a0a; border: 1px solid #00ff88; border-radius: 8px; padding: 16px; margin-bottom: 16px; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; color: #00ff88; word-break: break-all; line-height: 1.5; }
        .copy-btn { width: 100%; padding: 14px; background: #00ff88; color: #0a0a0a; border: none; border-radius: 6px; font-size: 14px; font-weight: bold; cursor: pointer; margin-bottom: 12px; }
        .copy-btn:hover { background: #00cc6a; }
        .copy-btn.copied { background: #0a2a0a; color: #00ff88; border: 1px solid #00ff88; }
        .note { color: #666; font-size: 12px; text-align: center; margin-top: 16px; line-height: 1.6; }
        .footer { text-align: center; color: #666; font-size: 11px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #222; }
        .footer a { color: #00ff88; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">Fov.it</div>
        <div class="subtitle">Script Protection System</div>
        <h1>📋 ${escapeHtml(script.title)}</h1>
        <p class="meta">I-copy ang loadstring command sa ibaba at i-paste sa Roblox executor.</p>
        <div class="code-box" id="code">${escapeHtml(loadstringCmd)}</div>
        <button class="copy-btn" id="copyBtn" onclick="copyCode()">📋 Copy Loadstring</button>
        <div class="note">I-paste ito sa Roblox executor (Krnl, Fluxus, Synapse, etc.).</div>
        <div class="footer">Protektado ng <a href="/">Fov.it</a></div>
      </div>
      <script>
        function copyCode() {
          const code = document.getElementById('code').textContent;
          const btn = document.getElementById('copyBtn');
          const done = () => {
            btn.textContent = '✅ Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.textContent = '📋 Copy Loadstring';
              btn.classList.remove('copied');
            }, 2000);
          };
          if (navigator.clipboard) {
            navigator.clipboard.writeText(code).then(done).catch(() => {
              const ta = document.createElement('textarea');
              ta.value = code; document.body.appendChild(ta);
              ta.select(); document.execCommand('copy');
              document.body.removeChild(ta); done();
            });
          } else {
            const ta = document.createElement('textarea');
            ta.value = code; document.body.appendChild(ta);
            ta.select(); document.execCommand('copy');
            document.body.removeChild(ta); done();
          }
        }
      </script>
    </body>
    </html>
  `);
});

// ===== DELETE =====
app.post('/api/delete', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Hindi naka-login' });

  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID kailangan' });

    const { error } = await supabase.from('scripts').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to delete: ' + error.message });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== EDIT =====
app.post('/api/edit', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Hindi naka-login' });

  try {
    const { id, title, content } = req.body;
    if (!id) return res.status(400).json({ error: 'ID kailangan' });

    const updates = { updated_at: new Date().toISOString() };
    if (title) updates.title = title;
    if (content) updates.content = content;

    const { data, error } = await supabase
      .from('scripts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to update: ' + error.message });

    return res.status(200).json({ success: true, script: data });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== SINGLE =====
app.get('/api/single', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID kailangan' });

  const { data, error } = await supabase
    .from('scripts')
    .select('id, title, content, public_link, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return res.status(404).json({ error: 'Script not found' });

  return res.status(200).json({ script: data });
});

// ===== ADMIN: USERS =====
app.get('/api/admin/users', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Hindi naka-login' });

  let user;
  try {
    user = jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, gmail, age, role, created_at')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Failed: ' + error.message });

    const { data: scripts } = await supabase.from('scripts').select('user_id');
    const scriptCount = {};
    (scripts || []).forEach(s => { scriptCount[s.user_id] = (scriptCount[s.user_id] || 0) + 1; });

    const usersWithCounts = users.map(u => ({ ...u, script_count: scriptCount[u.id] || 0 }));

    return res.status(200).json({ users: usersWithCounts });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== ADMIN: ALL SCRIPTS =====
app.get('/api/admin/scripts', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Hindi naka-login' });

  let user;
  try {
    user = jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

  try {
    const { data: scripts, error } = await supabase
      .from('scripts')
      .select('id, title, public_link, user_id, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Failed: ' + error.message });

    const userIds = [...new Set((scripts || []).map(s => s.user_id).filter(Boolean))];
    let userMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, name, gmail').in('id', userIds);
      (users || []).forEach(u => { userMap[u.id] = u; });
    }

    const scriptsWithOwner = (scripts || []).map(s => ({
      ...s,
      owner_name: userMap[s.user_id]?.name || 'unknown',
      owner_gmail: userMap[s.user_id]?.gmail || 'unknown'
    }));

    return res.status(200).json({ scripts: scriptsWithOwner });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== SERVE HTML =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/editor.html', (req, res) => res.sendFile(path.join(__dirname, 'editor.html')));
app.get('/view.html', (req, res) => res.sendFile(path.join(__dirname, 'view.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/s/:link', (req, res) => res.sendFile(path.join(__dirname, 'view.html')));

app.listen(PORT, () => {
  console.log(`Fov.it server running on port ${PORT}`);
});
