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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'favicon.svg')));
app.get('/favicon.svg', (req, res) => res.sendFile(path.join(__dirname, 'favicon.svg')));
app.get('/og-image.svg', (req, res) => res.sendFile(path.join(__dirname, 'og-image.svg')));

// ===== AI CHAT (Gemini muna, OpenRouter fallback) =====
app.post('/api/ai', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  try { jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  try {
    const { prompt } = req.body;
    if (!prompt || prompt.trim().length < 1) return res.status(400).json({ error: 'Message is required' });

    const systemPrompt = `You are Fov.it AI — a helpful assistant. Write COMPLETE code without truncation. Use markdown code blocks. User: ${prompt}`;

    // ===== TRY GEMINI FIRST =====
    if (GEMINI_API_KEY) {
      const geminiModels = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
      
      for (const model of geminiModels) {
        try {
          console.log(`[Gemini] Trying: ${model}`);
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 65536 }
              })
            }
          );

          if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) {
              console.log(`✅ Gemini success: ${model} (${text.length} chars)`);
              return res.status(200).json({ success: true, result: text });
            }
          } else {
            console.error(`❌ Gemini ${model}: ${response.status}`);
          }
        } catch (err) {
          console.error(`❌ Gemini ${model}: ${err.message}`);
        }
      }
    }

    // ===== FALLBACK TO OPENROUTER =====
    if (OPENROUTER_API_KEY) {
      const openrouterModels = [
        'inclusionai/ling-3.0-flash-vl:free',
        'nex-agi/nex-n2.5-pro:free',
        'nex-agi/nex-n2.5-mini:free',
        'inclusionai/ling-3.0-flash-fin:free'
      ];

      for (const model of openrouterModels) {
        try {
          console.log(`[OpenRouter] Trying: ${model}`);
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
              'HTTP-Referer': 'https://fov-it.onrender.com',
              'X-Title': 'Fov.it AI'
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
              ],
              temperature: 0.7,
              max_tokens: 16000
            })
          });

          if (response.ok) {
            const data = await response.json();
            const text = data.choices?.[0]?.message?.content || '';
            if (text) {
              console.log(`✅ OpenRouter success: ${model}`);
              return res.status(200).json({ success: true, result: text });
            }
          } else {
            console.error(`❌ OpenRouter ${model}: ${response.status}`);
          }
        } catch (err) {
          console.error(`❌ OpenRouter ${model}: ${err.message}`);
        }
      }
    }

    return res.status(503).json({ error: 'AI is busy. Please try again in a moment.' });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== REGISTER =====
app.post('/api/register', async (req, res) => {
  try {
    const { name, gmail, password, age } = req.body;
    if (!name || !gmail || !password || !age) return res.status(400).json({ error: 'All fields are required' });
    if (name.length < 3) return res.status(400).json({ error: 'Name must be at least 3 characters' });
    if (!gmail.includes('@')) return res.status(400).json({ error: 'Invalid Gmail' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (age < 10 || age > 100) return res.status(400).json({ error: 'Age must be 10-100' });

    const { data: existing } = await supabase.from('users').select('id, name, gmail')
      .or(`name.eq.${name},gmail.eq.${gmail}`).maybeSingle();

    if (existing) {
      if (existing.name === name) return res.status(400).json({ error: 'Name already taken' });
      if (existing.gmail === gmail) return res.status(400).json({ error: 'Gmail already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = name === 'Zyrox' ? 'owner' : 'user';

    const { data, error } = await supabase.from('users')
      .insert({ name, gmail, password: hashedPassword, age: parseInt(age), role })
      .select('id, name, gmail, role').single();

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
    if (!name || !password) return res.status(400).json({ error: 'Name and password are required' });

    const { data: user, error } = await supabase.from('users').select('*').eq('name', name).maybeSingle();
    if (error || !user) return res.status(401).json({ error: 'Incorrect name or password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Incorrect name or password' });

    const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      success: true, token,
      user: { id: user.id, name: user.name, gmail: user.gmail, role: user.role, age: user.age }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== UPLOAD =====
app.post('/api/upload', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  let user;
  try { user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });
    const link = Math.random().toString(36).substring(2, 12);
    const { data, error } = await supabase.from('scripts')
      .insert({ user_id: user.id, title, content, public_link: link }).select().single();
    if (error) return res.status(500).json({ error: 'Failed to upload: ' + error.message });
    return res.status(201).json({ success: true, script: data, link });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== LIST =====
app.get('/api/list', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  let user;
  try { user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  try {
    const isOwner = user.role === 'owner';
    let query = supabase.from('scripts')
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

// ===== RAW =====
app.get('/api/raw', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.send(`<!DOCTYPE html><html><head><title>Fov.it</title></head><body style="background:#0a0a0a;color:#ff6666;font-family:sans-serif;text-align:center;padding:50px;"><h1>❌ Invalid Link</h1></body></html>`);

  const { data: script, error } = await supabase.from('scripts')
    .select('id, title, content, public_link, user_id').eq('public_link', id).maybeSingle();

  if (error || !script) return res.send(`<!DOCTYPE html><html><head><title>Fov.it</title></head><body style="background:#0a0a0a;color:#ff6666;font-family:sans-serif;text-align:center;padding:50px;"><h1>❌ Script Not Found</h1></body></html>`);

  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const isBrowser = /mozilla|chrome|safari|firefox|edge|opera|trident/i.test(userAgent);

  if (!isBrowser) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(script.content);
  }

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host');
  const loadstringCmd = `loadstring(game:HttpGet("${protocol}://${host}/api/raw?id=${id}"))()`;

  return res.send(`
    <!DOCTYPE html><html><head>
      <title>Fov.it — ${escapeHtml(script.title)}</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <meta property="og:title" content="Fov.it — ${escapeHtml(script.title)}">
      <meta property="og:description" content="Protected Lua script.">
      <meta property="og:image" content="${protocol}://${host}/og-image.svg">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: #0a0a0a; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .container { background: #141414; padding: 48px 40px; border-radius: 16px; border: 1px solid #222; width: 100%; max-width: 720px; }
        .logo { color: #00ff88; font-size: 32px; font-weight: bold; text-align: center; margin-bottom: 6px; }
        .subtitle { color: #666; font-size: 12px; text-align: center; letter-spacing: 2px; margin-bottom: 24px; }
        .title-section { margin-bottom: 24px; }
        .title-section h1 { color: #fff; font-size: 22px; margin-bottom: 6px; }
        .badge { display: inline-block; background: #ff4444; color: #fff; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: bold; }
        .code-box { background: #0a0a0a; border: 1px solid #00ff88; border-radius: 10px; padding: 18px; font-family: 'Consolas', monospace; font-size: 12px; color: #00ff88; word-break: break-all; line-height: 1.6; }
        .copy-btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #00ff88, #00cc6a); color: #0a0a0a; border: none; border-radius: 10px; font-size: 14px; font-weight: bold; cursor: pointer; margin-top: 16px; }
        .footer { text-align: center; color: #444; font-size: 11px; margin-top: 24px; padding-top: 20px; border-top: 1px solid #1a1a1a; }
        .footer a { color: #00ff88; text-decoration: none; }
      </style>
    </head><body>
      <div class="container">
        <div class="logo">Fov.it</div>
        <div class="subtitle">Script Protection System</div>
        <div class="title-section">
          <h1>📋 ${escapeHtml(script.title)}</h1>
          <span class="badge">🔒 Protected</span>
        </div>
        <div class="code-box" id="code">${escapeHtml(loadstringCmd)}</div>
        <button class="copy-btn" onclick="copyCode()">📋 COPY LOADSTRING</button>
        <div class="footer">Protected by <a href="/">Fov.it</a></div>
      </div>
      <script>
        function copyCode() {
          const code = document.getElementById('code').textContent;
          navigator.clipboard.writeText(code).then(() => {
            event.target.textContent = '✅ COPIED!';
            setTimeout(() => event.target.textContent = '📋 COPY LOADSTRING', 2000);
          });
        }
      </script>
    </body></html>
  `);
});

// ===== DELETE =====
app.post('/api/delete', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  let user;
  try { user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID required' });
    const { data: script } = await supabase.from('scripts').select('user_id').eq('id', id).single();
    if (!script) return res.status(404).json({ error: 'Script not found' });
    if (user.role !== 'owner' && script.user_id !== user.id) return res.status(403).json({ error: 'You cannot delete this' });

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
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  let user;
  try { user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  try {
    const { id, title, content } = req.body;
    if (!id) return res.status(400).json({ error: 'ID required' });
    const { data: script } = await supabase.from('scripts').select('user_id').eq('id', id).single();
    if (!script) return res.status(404).json({ error: 'Script not found' });
    if (user.role !== 'owner' && script.user_id !== user.id) return res.status(403).json({ error: 'You cannot edit this' });

    const updates = { updated_at: new Date().toISOString() };
    if (title) updates.title = title;
    if (content) updates.content = content;

    const { data, error } = await supabase.from('scripts').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: 'Failed to update: ' + error.message });
    return res.status(200).json({ success: true, script: data });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== SINGLE =====
app.get('/api/single', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID required' });
  const { data, error } = await supabase.from('scripts')
    .select('id, title, content, public_link, created_at, updated_at').eq('id', id).maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Script not found' });
  return res.status(200).json({ script: data });
});

// ===== ADMIN: USERS =====
app.get('/api/admin/users', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  let user;
  try { user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }
  if (user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

  try {
    const { data: users, error } = await supabase.from('users')
      .select('id, name, gmail, age, role, created_at').order('created_at', { ascending: false });
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
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  let user;
  try { user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }
  if (user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

  try {
    const { data: scripts, error } = await supabase.from('scripts')
      .select('id, title, public_link, user_id, created_at, updated_at').order('created_at', { ascending: false });
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
app.get('/ai.html', (req, res) => res.sendFile(path.join(__dirname, 'ai.html')));
app.get('/s/:link', (req, res) => res.sendFile(path.join(__dirname, 'view.html')));

app.listen(PORT, () => {
  console.log(`Fov.it server running on port ${PORT}`);
});
