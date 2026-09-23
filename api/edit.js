import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const JWT_SECRET = process.env.JWT_SECRET || 'fov-it-secret-change-me';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Check auth
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  let user;
  try {
    user = jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const { id, title, content, access_type, whitelist } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Script ID required' });
    }

    // Check ownership
    const { data: existing, error: fetchError } = await supabase
      .from('scripts')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Script not found' });
    }

    const isOwner = user.role === 'owner';
    const isScriptOwner = user.id === existing.user_id;

    if (!isOwner && !isScriptOwner) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (title) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (access_type) updates.access_type = access_type;
    if (whitelist !== undefined) updates.whitelist = whitelist;

    const { data, error } = await supabase
      .from('scripts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to update: ' + error.message });
    }

    return res.status(200).json({ success: true, script: data });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
