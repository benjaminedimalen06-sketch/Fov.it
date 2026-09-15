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

// ===== HELPER =====
function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ===== FAVICON =====
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'favicon.svg')));
app.get('/favicon.svg', (req, res) => res.sendFile(path.join(__dirname, 'favicon.svg')));
app.get('/og-image.svg', (req, res) => res.sendFile(path.join(__dirname, 'og-image.svg')));

// ===== AI CHAT (OpenRouter — DYNAMIC MODEL LIST) =====
app.post('/api/ai', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  try { jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OpenRouter API key not configured. Add OPENROUTER_API_KEY in Render.' });

  try {
    const { prompt, action = 'chat' } = req.body;
    if (!prompt || prompt.trim().length < 1) return res.status(400).json({ error: 'Message is required' });

    const systemPrompt = `You are Fov.it AI — a helpful, friendly, and knowledgeable assistant.

RULES:
- Be concise but helpful.
- Use markdown formatting for code blocks (triple backticks).
- If the user asks for code, provide clean, working code with comments.
- If the user just wants to chat, be friendly and natural.
- Never refuse to help with legitimate coding questions.

User: ${prompt}`;

    // ===== FETCH AVAILABLE FREE MODELS FROM OPENROUTER (LIVE) =====
    let freeModels = [];
    try {
      const modelsRes = await fetch('https://openrouter.ai/api/v1/models');
      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        freeModels = (modelsData.data || [])
          .filter(m => m.id && m.id.includes(':free'))
          .map(m => m.id)
          .slice(0, 10); // Top 10 free models
        console.log(`✅ Found ${freeModels.length} free models:`, freeModels);
      }
    } catch (e) {
      console.error('Failed to fetch models:', e.message);
    }

    // Fallback kung walang makuha
    if (freeModels.length === 0) {
      freeModels = [
        'inclusionai/ling-3.0-flash-vl:free',
        'nex-agi/nex-n2.5-pro:free',
        'nex-agi/nex-n2.5-mini:free'
      ];
    }

    let lastError = null;
    let generatedText = null;

    // Subukan lahat ng free models
    for (const model of freeModels) {
      try {
        console.log(`Trying: ${model}`);
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
            max_tokens: 4096
          })
        });

        if (response.ok) {
          const data = await response.json();
          generatedText = data.choices?.[0]?.message?.content || '';
          if (generatedText) {
            console.log(`✅ Success with: ${model}`);
            break;
          }
        } else {
          const errorText = await response.text();
          console.error(`${model} failed:`, response.status);
          lastError = `${model}: ${response.status}`;
        }
      } catch (err) {
        console.error(`${model} error:`, err.message);
        lastError = `${model}: ${err.message}`;
      }
    }

    if (!generatedText) {
      return res.status(503).json({ 
        error: 'AI is busy. Please try again in a moment. (' + (lastError || 'all models failed') + ')' 
      });
    }

    return res.status(200).json({ success: true, result: generatedText, action });
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
      <meta name="twitter:card" content="summary_large_image">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: #0a0a0a; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background-image: radial-gradient(circle at 20% 20%, rgba(0, 255, 136, 0.05) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(0, 255, 136, 0.05) 0%, transparent 50%); }
        .container { background: #141414; padding: 48px 40px; border-radius: 16px; border: 1px solid #222; width: 100%; max-width: 720px; box-shadow: 0 0 80px rgba(0, 255, 136, 0.08); animation: fadeIn 0.5s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .header { text-align: center; margin-bottom: 32px; }
        .logo { color: #00ff88; font-size: 32px; font-weight: bold; margin-bottom: 6px; text-shadow: 0 0 30px rgba(0, 255, 136, 0.5); }
        .subtitle { color: #666; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
        .divider { height: 1px; background: linear-gradient(90deg, transparent, #222, transparent); margin: 24px 0; }
        .title-section { margin-bottom: 24px; }
        .title-section h1 { color: #fff; font-size: 22px; margin-bottom: 6px; display: flex; align-items: center; gap: 10px; }
        .title-section .meta { color: #666; font-size: 12px; }
        .badge { display: inline-block; background: #00ff88; color: #0a0a0a; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
        .badge-protected { background: #ff4444; color: #fff; }
        .code-section { margin-bottom: 20px; }
        .code-label { color: #666; font-size: 11px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .code-box { background: #0a0a0a; border: 1px solid #00ff88; border-radius: 10px; padding: 18px; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; color: #00ff88; word-break: break-all; line-height: 1.6; position: relative; overflow: hidden; }
        .code-box::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #00ff88, transparent); }
        .copy-btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #00ff88, #00cc6a); color: #0a0a0a; border: none; border-radius: 10px; font-size: 14px; font-weight: bold; cursor: pointer; margin-bottom: 12px; transition: all 0.3s ease; letter-spacing: 1px; }
        .copy-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0, 255, 136, 0.4); }
        .copy-btn.copied { background: linear-gradient(135deg, #0a2a0a, #0a2a0a); color: #00ff88; border: 1px solid #00ff88; }
        .note { color: #666; font-size: 12px; text-align: center; margin-top: 16px; line-height: 1.6; }
        .note strong { color: #00ff88; }
        .footer { text-align: center; color: #444; font-size: 11px; margin-top: 24px; padding-top: 20px; border-top: 1px solid #1a1a1a; }
        .footer a { color: #00ff88; text-decoration: none; }
      </style>
    </head><body>
      <div class="container">
        <div class="header"><div class="logo">Fov.it</div><div class="subtitle">Script Protection System</div></div>
        <div class="divider"></div>
        <div class="title-section">
          <h1>📋 ${escapeHtml(script.title)}</h1>
          <div class="meta"><span class="badge badge-protected">🔒 Protected</span><span style="margin-left: 10px;">ID: ${id}</span></div>
        </div>
        <div class="code-section">
          <div class="code-label">Loadstring Command</div>
          <div class="code-box" id="code">${escapeHtml(loadstringCmd)}</div>
        </div>
        <button class="copy-btn" id="copyBtn" onclick="copyCode()">📋 COPY LOADSTRING</button>
        <div class="note">Paste this into your <strong>Roblox executor</strong> (Krnl, Fluxus, Synapse, etc.).</div>
        <div class="footer">Protected by <a href="/">Fov.it</a> · ${new Date().getFullYear()}</div>
      </div>
      <script>
        function copyCode() {
          const code = document.getElementById('code').textContent;
          const btn = document.getElementById('copyBtn');
          const done = () => { btn.textContent = '✅ COPIED!'; btn.classList.add('copied'); setTimeout(() => { btn.textContent = '📋 COPY LOADSTRING'; btn.classList.remove('copied'); }, 2000); };
          if (navigator.clipboard) { navigator.clipboard.writeText(code).then(done).catch(() => { const ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done(); }); }
          else { const ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done(); }
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
