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

  const { id, public_link } = req.query;

  if (!id && !public_link) {
    return res.status(400).json({ error: 'Script ID or public_link required' });
  }

  // Kunin ang script — WALANG content muna
  let query = supabase
    .from('scripts')
    .select('id, title, public_link, created_at, updated_at, user_id');

  if (id) {
    query = query.eq('id', id);
  } else {
    query = query.eq('public_link', public_link);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return res.status(404).json({ error: 'Script not found' });
  }

  // 🔒 CHECK AUTH — owner lang makakakita ng content
  const auth = req.headers.authorization;
  let user = null;

  if (auth && auth.startsWith('Bearer ')) {
    try {
      user = jwt.verify(auth.slice(7), JWT_SECRET);
    } catch {}
  }

  const isOwner = user && user.role === 'owner';
  const isScriptOwner = user && user.id === data.user_id;

  // ✅ Kung owner — isama ang content
  if (isOwner || isScriptOwner) {
    return res.status(200).json({
      script: {
        ...data,
        content: (await supabase
          .from('scripts')
          .select('content')
          .eq('id', data.id)
          .single()).data?.content || ''
      },
      canView: true
    });
  }

  // ❌ Kung hindi owner — WALANG content
  return res.status(200).json({
    script: data,
    canView: false
  });
}
