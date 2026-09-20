import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  if (!id) {
    return res.status(400).send('-- missing id');
  }

  // ===== FETCH SCRIPT =====
  const { data: script, error } = await supabase
    .from('scripts')
    .select('content')
    .eq('public_link', id)
    .maybeSingle();

  if (error || !script) {
    return res.status(404).send('-- Script not found');
  }

  // ===== RETURN PURE LUA — NO DETECTION, NO TOKEN, NO BROWSER CHECK =====
  return res.status(200).send(script.content || '-- empty script');
}
