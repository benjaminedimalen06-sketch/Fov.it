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
app.use(express.static('public'));
app.use(express.static('.'));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const JWT_SECRET = process.env.JWT_SECRET || 'fov-it-secret-change-me';

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

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to create account: ' + error.message });
    }

    return res.status(201).json({ success: true, user: data });
  } catch (err) {
    console.error('Server error:', err);
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
    console.error('Login error:', err);
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
    console.error('Server error:', err);
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
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== RAW =====
app.get('/api/raw', async (req, res) => {
  const { id, token } = req.query;

  if (!id) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(400).send('You cannot copy this script');
  }

  const { data: script, error } = await supabase
    .from('scripts')
    .select('id, title, content, public_link, user_id')
    .eq('public_link', id)
    .maybeSingle();

  if (error || !script) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('-- Script not found');
  }

  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const isBrowser = /mozilla|chrome|safari|firefox|edge|opera|trident/i.test(userAgent);

  // Executor (Roblox loadstring)
  if (!isBrowser) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(script.content);
  }

  // Browser
  if (!token) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send('You cannot copy this script');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send('You cannot copy this script');
  }

  const isOwner = decoded.role === 'owner';
  const isScriptOwner = decoded.id === script.user_id;

  if (!isOwner && !isScriptOwner) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send('You cannot copy this script');
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send(script.content);
});

// ===== DELETE =====
app.post('/api/delete', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Hindi naka-login' });

  let user;
  try {
    user = jwt.verify(auth.slice(7), JWT_SECRET);
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
    console.error('Server error:', err);
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
    console.error('Server error:', err);
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

// ===== SERVE HTML =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/editor.html', (req, res) => res.sendFile(path.join(__dirname, 'editor.html')));
app.get('/view.html', (req, res) => res.sendFile(path.join(__dirname, 'view.html')));
app.get('/s/:link', (req, res) => res.sendFile(path.join(__dirname, 'view.html')));

app.listen(PORT, () => {
  console.log(`Fov.it server running on port ${PORT}`);
});
