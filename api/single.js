import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, public_link } = req.query;

  if (!id && !public_link) {
    return res.status(400).json({ error: 'Script ID or public_link required' });
  }

  let query = supabase
    .from('scripts')
    .select('id, title, content, public_link, created_at, updated_at, user_id, access_type, whitelist');

  if (id) {
    query = query.eq('id', id);
  } else {
    query = query.eq('public_link', public_link);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return res.status(404).json({ error: 'Script not found' });
  }

  return res.status(200).json({ script: data });
}
