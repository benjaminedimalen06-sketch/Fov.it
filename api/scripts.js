import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const JWT_SECRET = process.env.JWT_SECRET || 'fov-it-secret-change-me';

function getUser(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return null;
  }
}

function generateLink() {
  return Math.random().toString(36).substring(2, 10) +
         Math.random().toString(36).substring(2, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Hindi naka-login' });

  const isOwner = user.role === 'owner';

  // ===== GET: Listahan ng scripts =====
  if (req.method === 'GET') {
    let query = supabase
      .from('scripts')
      .select('id, title, public_link, user_id, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (!isOwner) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Failed to fetch scripts' });

    // Kung owner, kunin din ang usernames
    let scripts = data;
    if (isOwner && data.length > 0) {
      const userIds = [...new Set(data.map(s => s.user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);
      
      const userMap = {};
      (users || []).forEach(u => { userMap[u.id] = u.username; });
      scripts = data.map(s => ({ ...s, owner_username: userMap[s.user_id] || 'unknown' }));
    }

    return res.status(200).json({ scripts });
  }

  // ===== POST: Gumawa ng bagong script =====
  if (req.method === 'POST') {
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title at content ay kailangan' });
    }

    const { data, error } = await supabase
      .from('scripts')
      .insert({
        user_id: user.id,
        title,
        content,
        public_link: generateLink()
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to create script' });

    return res.status(201).json({ success: true, script: data });
  }

  // ===== PUT: I-edit ang script =====
  if (req.method === 'PUT') {
    const { id, title, content } = req.body;

    if (!id) return res.status(400).json({ error: 'Script ID kailangan' });

    const { data: existing } = await supabase
      .from('scripts')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Script not found' });

    if (!isOwner && existing.user_id !== user.id) {
      return res.status(403).json({ error: 'Hindi mo ito pwedeng i-edit' });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (title) updates.title = title;
    if (content) updates.content = content;

    const { data, error } = await supabase
      .from('scripts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to update' });

    return res.status(200).json({ success: true, script: data });
  }

  // ===== DELETE: Burahin ang script =====
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Script ID kailangan' });

    const { data: existing } = await supabase
      .from('scripts')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Script not found' });

    if (!isOwner && existing.user_id !== user.id) {
      return res.status(403).json({ error: 'Hindi mo ito pwedeng burahin' });
    }

    const { error } = await supabase.from('scripts').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to delete' });

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
