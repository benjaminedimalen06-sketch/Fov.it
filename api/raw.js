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
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, token } = req.query;
  if (!id) return res.status(400).send('-- missing id');

  const { data: script, error } = await supabase
    .from('scripts')
    .select('content, user_id')
    .eq('public_link', id)
    .maybeSingle();

  if (error || !script) return res.status(404).send('-- Script not found');

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const isOwner = decoded.role === 'owner';
      const isScriptOwner = decoded.id === script.user_id;
      if (isOwner || isScriptOwner) {
        return res.status(200).send(script.content);
      }
    } catch {}
  }

  return res.status(200).send('-- You cannot copy this script');
}
