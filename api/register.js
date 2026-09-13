import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { username, password, age } = req.body;

    if (!username || !password || !age) {
      return res.status(400).json({ error: 'Lahat ng fields ay kailangan' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username min 3 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password min 6 characters' });
    }
    if (age < 10 || age > 100) {
      return res.status(400).json({ error: 'Age must be 10-100' });
    }

    const { data: existing } = await supabase
      .from('users').select('id').eq('username', username).maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = username === 'Zyrox' ? 'owner' : 'user';

    const { data, error } = await supabase
      .from('users')
      .insert({ username, password: hashedPassword, age: parseInt(age), role })
      .select('id, username, role')
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to create account' });
    }

    return res.status(201).json({ success: true, user: data });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
