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
    const { name, gmail, password, age } = req.body;

    if (!name || !gmail || !password || !age) {
      return res.status(400).json({ error: 'Lahat ng fields ay kailangan' });
    }
    if (name.length < 3) {
      return res.status(400).json({ error: 'Name min 3 characters' });
    }
    if (!gmail.includes('@')) {
      return res.status(400).json({ error: 'Invalid Gmail' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password min 6 characters' });
    }
    if (age < 10 || age > 100) {
      return res.status(400).json({ error: 'Age must be 10-100' });
    }

    // Check kung existing na ang name o gmail
    const { data: existing } = await supabase
      .from('users')
      .select('id, name, gmail')
      .or(`name.eq.${name},gmail.eq.${gmail}`)
      .maybeSingle();

    if (existing) {
      if (existing.name === name) {
        return res.status(400).json({ error: 'Name already taken' });
      }
      if (existing.gmail === gmail) {
        return res.status(400).json({ error: 'Gmail already registered' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = name === 'Zyrox' ? 'owner' : 'user';

    const { data, error } = await supabase
      .from('users')
      .insert({ name, gmail, password: hashedPassword, age: parseInt(age), role })
      .select('id, name, gmail, role')
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
