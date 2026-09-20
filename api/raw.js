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

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, token, exec } = req.query;

  if (!id) return res.status(400).send('-- missing id');

  const { data: script, error } = await supabase
    .from('scripts')
    .select('id, title, content, public_link, user_id')
    .eq('public_link', id)
    .maybeSingle();

  if (error || !script) return res.status(404).send('-- Script not found');

  const content = script.content || '-- empty script';

  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const knownExecutor = /roblox|delta|solara|xeno|wave|krnl|fluxus|hydrogen|codex|arceus|trigon|sirhurt|synapse|script[- ]?ware|exploit|android|iphone|ipad/i.test(ua);
  const noUA = !req.headers['user-agent'];
  const isExplicitExec = exec === '1' || exec === 'true';

  if (isExplicitExec || knownExecutor || noUA) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(content);
  }

  if (!token) return res.status(200).send('-- You cannot copy this script');

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(200).send('-- You cannot copy this script');
  }

  const isOwner = decoded.role === 'owner';
  const isScriptOwner = decoded.id === script.user_id;

  if (!isOwner && !isScriptOwner) {
    return res.status(200).send('-- You cannot copy this script');
  }

  return res.status(200).send(content);
}
