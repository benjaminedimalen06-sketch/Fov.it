import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const cache = new Map();
const CACHE_TTL = 60000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).send('-- missing id');

  const cached = cache.get(id);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    res.setHeader('Content-Length', Buffer.byteLength(cached.content, 'utf8'));
    return res.status(200).send(cached.content);
  }

  try {
    const { data: script, error } = await supabase
      .from('scripts')
      .select('content')
      .eq('public_link', id)
      .maybeSingle();

    if (error || !script) {
      return res.status(404).send('-- Script not found');
    }

    const content = script.content || '-- empty script';
    cache.set(id, { content, time: Date.now() });

    res.setHeader('Content-Length', Buffer.byteLength(content, 'utf8'));
    return res.status(200).send(content);

  } catch (err) {
    return res.status(500).send('-- Server error');
  }
}
