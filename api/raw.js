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
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(400).send('You cannot copy this script');
  }

  // Check User-Agent
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();

  // Kung browser (may "mozilla", "chrome", "safari", "firefox", "edge")
  const isBrowser = /mozilla|chrome|safari|firefox|edge|opera|trident/i.test(userAgent);

  if (isBrowser) {
    // Browser → "You cannot copy this script"
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send('You cannot copy this script');
  }

  // Kung executor (Roblox, Synapse, Krnl, etc.) → totoong Lua script
  const { data: script, error } = await supabase
    .from('scripts')
    .select('content')
    .eq('public_link', id)
    .maybeSingle();

  if (error || !script) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('-- Script not found');
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(script.content);
}
