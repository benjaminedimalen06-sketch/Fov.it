import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fov-it-secret-change-me';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }

  try {
    const { prompt, language = 'javascript', action = 'generate' } = req.body;

    if (!prompt || prompt.trim().length < 3) {
      return res.status(400).json({ error: 'Prompt is required (min 3 characters)' });
    }

    let systemPrompt = '';
    if (action === 'generate') {
      systemPrompt = `You are an expert ${language} developer. Generate clean, working, and well-commented ${language} code based on the user's request. Only respond with the code, no explanations. Use modern best practices.`;
    } else if (action === 'explain') {
      systemPrompt = `You are an expert ${language} developer. Explain the following ${language} code in simple terms. Break down what each part does.`;
    } else if (action === 'fix') {
      systemPrompt = `You are an expert ${language} developer. Fix any bugs or errors in the following ${language} code. Return only the corrected code, no explanations.`;
    } else if (action === 'optimize') {
      systemPrompt = `You are an expert ${language} developer. Optimize the following ${language} code for performance and readability. Return only the optimized code, no explanations.`;
    }

    const fullPrompt = action === 'generate' 
      ? `${systemPrompt}\n\nUser request: ${prompt}`
      : `${systemPrompt}\n\nCode:\n${prompt}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      return res.status(500).json({ error: 'AI request failed: ' + response.status });
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!generatedText) {
      return res.status(500).json({ error: 'AI returned empty response' });
    }

    let cleaned = generatedText
      .replace(/^```[\w]*\n?/gm, '')
      .replace(/```$/gm, '')
      .trim();

    return res.status(200).json({ success: true, result: cleaned, action });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
