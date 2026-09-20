import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const JWT_SECRET = process.env.JWT_SECRET || 'fov-it-secret-change-me';

export default async function handler(req, res) {
  // ===== CORS HEADERS =====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  // ===== OPTIONS PREFLIGHT =====
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ===== GET QUERY PARAMS =====
  const { id, token, exec } = req.query;

  if (!id) {
    return res.status(400).send('-- missing id');
  }

  // ===== FETCH SCRIPT FROM SUPABASE =====
  const { data: script, error } = await supabase
    .from('scripts')
    .select('id, title, content, public_link, user_id')
    .eq('public_link', id)
    .maybeSingle();

  if (error || !script) {
    return res.status(404).send('-- Script not found');
  }

  const content = script.content || '-- empty script';

  // ===== DETECT EXECUTOR =====
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const knownExecutor = /roblox|delta|solara|xeno|wave|krnl|fluxus|hydrogen|codex|arceus|trigon|sirhurt|synapse|script[- ]?ware|exploit/i.test(ua);
  const noUA = !req.headers['user-agent'];
  const isExplicitExec = exec === '1' || exec === 'true';

  const looksLikeRealBrowser =
    /mozilla|chrome|safari|firefox|edge|opera|trident/i.test(ua) &&
    !knownExecutor;

  // ===== EXECUTOR PATH (Roblox loadstring) =====
  if (isExplicitExec || knownExecutor || noUA || !looksLikeRealBrowser) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(content);
  }

  // ===== BROWSER PATH =====
  if (!token) {
    return res.status(200).send('-- You cannot copy this script');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(200).send('-- You cannot copy this script');
  }

  // ===== OWNER CHECK =====
  const isOwner = decoded.role === 'owner';
  const isScriptOwner = decoded.id === script.user_id;

  if (!isOwner && !isScriptOwner) {
    return res.status(200).send('-- You cannot copy this script');
  }

  // ===== RETURN SCRIPT TO OWNER =====
  return res.status(200).send(content);
}
