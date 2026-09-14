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

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, token } = req.query;

  if (!id) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(400).send('You cannot copy this script');
  }

  // Kunin ang script mula sa Supabase
  const { data: script, error } = await supabase
    .from('scripts')
    .select('id, title, content, public_link, user_id')
    .eq('public_link', id)
    .maybeSingle();

  if (error || !script) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('-- Script not found');
  }

  // Check User-Agent
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const isBrowser = /mozilla|chrome|safari|firefox|edge|opera|trident/i.test(userAgent);

  // ===== EXECUTOR (Roblox loadstring) =====
  if (!isBrowser) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(script.content);
  }

  // ===== BROWSER =====
  // Kailangan ng valid token para makita ang script
  if (!token) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send('You cannot copy this script');
  }

  // I-verify ang token
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send('You cannot copy this script');
  }

  // Check kung owner o may-ari ng script
  const isOwner = decoded.role === 'owner';
  const isScriptOwner = decoded.id === script.user_id;

  if (!isOwner && !isScriptOwner) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send('You cannot copy this script');
  }

  // Valid → totoong script
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send(script.content);
}
