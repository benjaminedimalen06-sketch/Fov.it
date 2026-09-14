import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const JWT_SECRET = process.env.JWT_SECRET || 'fov-it-secret-change-me';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Check auth
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Hindi naka-login' });
  }

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

    if (!isOwner) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Failed to fetch: ' + error.message });

    return res.status(200).json({ scripts: data || [] });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
