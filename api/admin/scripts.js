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
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

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

  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Owner only' });
  }

  try {
    // Kunin lahat ng scripts kasama ang owner name
    const { data: scripts, error } = await supabase
      .from('scripts')
      .select('id, title, public_link, user_id, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Failed to fetch: ' + error.message });

    // Kunin ang usernames
    const userIds = [...new Set((scripts || []).map(s => s.user_id).filter(Boolean))];
    let userMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name, gmail')
        .in('id', userIds);
      (users || []).forEach(u => { userMap[u.id] = u; });
    }

    const scriptsWithOwner = (scripts || []).map(s => ({
      ...s,
      owner_name: userMap[s.user_id]?.name || 'unknown',
      owner_gmail: userMap[s.user_id]?.gmail || 'unknown'
    }));

    return res.status(200).json({ scripts: scriptsWithOwner });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
