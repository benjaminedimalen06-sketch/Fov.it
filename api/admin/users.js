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

  // Owner only
  if (user.role !== 'owner') {
    return res.status(403).json({ error: 'Owner only' });
  }

  try {
    // Kunin lahat ng users
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, gmail, age, role, created_at')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Failed to fetch users: ' + error.message });

    // Bilangin ang scripts ng bawat user
    const { data: scripts } = await supabase
      .from('scripts')
      .select('user_id');

    const scriptCount = {};
    (scripts || []).forEach(s => {
      scriptCount[s.user_id] = (scriptCount[s.user_id] || 0) + 1;
    });

    const usersWithCounts = users.map(u => ({
      ...u,
      script_count: scriptCount[u.id] || 0
    }));

    return res.status(200).json({ users: usersWithCounts });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
