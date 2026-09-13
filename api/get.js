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

  const { link } = req.query;

  if (!link) return res.status(400).json({ error: 'Walang link' });

  const { data: script, error } = await supabase
    .from('scripts')
    .select('id, title, content, user_id, updated_at')
    .eq('public_link', link)
    .maybeSingle();

  if (error || !script) {
    return res.status(404).json({ error: 'Script not found' });
  }

  const auth = req.headers.authorization;
  let authorized = false;

  if (auth && auth.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
      if (decoded.role === 'owner' || decoded.id === script.user_id) {
        authorized = true;
      }
    } catch {}
  }

  if (!authorized) {
    return res.status(200).json({
      protected: true,
      title: script.title,
      message: 'This script is in protection',
      content: null
    });
  }

  return res.status(200).json({
    protected: false,
    title: script.title,
    content: script.content,
    updated_at: script.updated_at
  });
}
