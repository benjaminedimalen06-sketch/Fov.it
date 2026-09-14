import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  if (!id) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(400).send('-- Error: Walang script ID');
  }

  const { data: script, error } = await supabase
    .from('scripts')
    .select('content, title')
    .eq('public_link', id)
    .maybeSingle();

  if (error || !script) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(404).send('-- Error: Script not found');
  }

  // I-check ang User-Agent
  const userAgent = req.headers['user-agent'] || '';

  // Kung browser (Mozilla, Chrome, Firefox, Safari, Edge) → "This script is in protection"
  const isBrowser = /Mozilla|Chrome|Firefox|Safari|Edge|Opera/i.test(userAgent);

  if (isBrowser) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send('-- This script is in protection\n-- Hindi mo maaaring makita ang totoong code\n-- Gamitin ang loadstring(game:HttpGet("' + (req.headers.origin || 'https://fov-it.vercel.app') + '/api/raw?id=' + id + '"))()');
  }

  // Kung executor (Roblox, Synapse, Krnl, etc.) → totoong Lua script
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(script.content);
}
