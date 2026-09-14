import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

function generateLink() {
  return Math.random().toString(36).substring(2, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { title, content, owner } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title at content ay kailangan' });
    }

    const link = generateLink();

    // I-save sa Supabase kasama ang owner name
    const { data, error } = await supabase
      .from('scripts')
      .insert({
        user_id: null,
        title,
        content,
        public_link: link
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to upload: ' + error.message });
    }

    const origin = req.headers.origin || 'https://fov-it.vercel.app';
    const rawLink = `${origin}/api/raw?id=${link}`;

    return res.status(201).json({
      success: true,
      script: data,
      raw_link: rawLink,
      link: link,
      owner: owner || 'unknown'
    });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
