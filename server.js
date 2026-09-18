import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('.'));
app.use(express.static('public'));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

const JWT_SECRET = process.env.JWT_SECRET || 'fov-it-secret-change-me';

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'favicon.svg')));
app.get('/favicon.svg', (req, res) => res.sendFile(path.join(__dirname, 'favicon.svg')));
app.get('/og-image.svg', (req, res) => res.sendFile(path.join(__dirname, 'og-image.svg')));

// ===== AI CHAT (OpenRouter — dynamic free models) =====
app.post('/api/ai', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  try { jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OpenRouter API key not configured' });

  try {
    const { prompt, image } = req.body;
    if (!prompt && !image) return res.status(400).json({ error: 'Message or image is required' });

    const systemPrompt = `You are Fov.it AI — an expert Roblox Lua developer and UI designer.

ROLE:
- Generate production-quality Roblox scripts with beautiful, modern UIs.
- When the user asks for a script, always write COMPLETE, WORKING code.
- Never truncate code. Never write "..." or "rest of code here".
- If the user sends an image, analyze it and respond accordingly.

CRITICAL RULES:
1. Start the code DIRECTLY with the first line of Lua code.
2. NEVER add comment blocks like --[[ ... ]] at the beginning.
3. NEVER add headers, titles, or descriptions inside the code.
4. The very first line must be valid Lua code (like: local Players = game:GetService("Players")).
5. Only use single-line comments (--) when necessary.

DESIGN PRINCIPLES:
- Modern glassmorphism style (transparency, blur effects)
- Smooth animations with TweenService (0.2s - 0.5s durations)
- Neon/glow accents (UIStroke + UIGradient)
- Rounded corners (UICorner with radius 8-16)
- Color scheme: dark background (#0C0C12), accent colors (purple #6450FF, green #50FF8C, blue #50B4FF)
- Icons using emojis for visual appeal
- Status indicators (ON/OFF with color changes)
- Hover effects on buttons

User request: ${prompt || '(Analyze the image)'}`;

    // Build messages array
    const messages = [{ role: 'system', content: systemPrompt }];
    
    if (image && image.data) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt || '(Analyze this image)' },
          { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } }
        ]
      });
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    // Get available free models
    let freeModels = [];
    try {
      const modelsRes = await fetch('https://openrouter.ai/api/v1/models');
      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        freeModels = (modelsData.data || [])
          .filter(m => m.id && m.id.includes(':free'))
          .map(m => m.id)
          .slice(0, 5);
      }
    } catch (e) { console.error('Models fetch failed:', e.message); }

    if (freeModels.length === 0) {
      freeModels = [
        'inclusionai/ling-3.0-flash-vl:free',
        'nex-agi/nex-n2.5-pro:free',
        'nex-agi/nex-n2.5-mini:free'
      ];
    }

    let generatedText = null;
    let lastError = null;

    for (const model of freeModels) {
      try {
        console.log(`[OpenRouter] Trying: ${model}`);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://fov-it.onrender.com',
            'X-Title': 'Fov.it AI'
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.7,
            max_tokens: 8192
          })
        });

        if (response.ok) {
          const data = await response.json();
          let text = data.choices?.[0]?.message?.content || '';
          if (text) {
            text = text.replace(/^--\[\[[\s\S]*?\]\]\s*/g, '');
            text = text.trim();
            console.log(`✅ OpenRouter success: ${model}`);
            generatedText = text;
            break;
          }
        } else {
          const errText = await response.text();
          console.error(`❌ OpenRouter ${model}: ${response.status}`, errText);
          lastError = `${model}: ${response.status}`;
        }
      } catch (err) {
        console.error(`❌ OpenRouter ${model}: ${err.message}`);
        lastError = `${model}: ${err.message}`;
      }
    }

    if (!generatedText) {
      return res.status(503).json({ error: 'AI busy. Try again. (' + (lastError || 'failed') + ')' });
    }

    return res.status(200).json({ success: true, result: generatedText });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== REGISTER =====
app.post('/api/register', async (req, res) => {
  try {
    const { name, gmail, password, age } = req.body;
    if (!name || !gmail || !password || !age) return res.status(400).json({ error: 'All fields are required' });
    if (name.length < 3) return res.status(400).json({ error: 'Name must be at least 3 characters' });
    if (!gmail.includes('@')) return res.status(400).json({ error: 'Invalid Gmail' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (age < 10 || age > 100) return res.status(400).json({ error: 'Age must be 10-100' });

    const { data: existing } = await supabase.from('users').select('id, name, gmail')
      .or(`name.eq.${name},gmail.eq.${gmail}`).maybeSingle();

    if (existing) {
      if (existing.name === name) return res.status(400).json({ error: 'Name already taken' });
      if (existing.gmail === gmail) return res.status(400).json({ error: 'Gmail already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = name === 'Zyrox' ? 'owner' : 'user';

    const { data, error } = await supabase.from('users')
      .insert({ name, gmail, password: hashedPassword, age: parseInt(age), role })
      .select('id, name, gmail, role').single();

    if (error) return res.status(500).json({ error: 'Failed to create account: ' + error.message });
    return res.status(201).json({ success: true, user: data });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== LOGIN =====
app.post('/api/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'Name and password are required' });

    const { data: user, error } = await supabase.from('users').select('*').eq('name', name).maybeSingle();
    if (error || !user) return res.status(401).json({ error: 'Incorrect name or password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Incorrect name or password' });

    const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      success: true, token,
      user: { id: user.id, name: user.name, gmail: user.gmail, role: user.role, age: user.age }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== UPLOAD (with whitelist) =====
app.post('/api/upload', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  let user;
  try { user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  try {
    const { title, content, access_type, whitelist } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });
    const link = Math.random().toString(36).substring(2, 12);
    const { data, error } = await supabase.from('scripts')
      .insert({ 
        user_id: user.id, 
        title, 
        content, 
        public_link: link,
        access_type: access_type || 'public',
        whitelist: whitelist || ''
      }).select().single();
    if (error) return res.status(500).json({ error: 'Failed to upload: ' + error.message });
    return res.status(201).json({ success: true, script: data, link });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== LIST =====
app.get('/api/list', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  let user;
  try { user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  try {
    const isOwner = user.role === 'owner';
    let query = supabase.from('scripts')
      .select('id, title, public_link, user_id, access_type, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (!isOwner) query = query.eq('user_id', user.id);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Failed to fetch: ' + error.message });
    return res.status(200).json({ scripts: data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== RAW (Loading Screen + Kick System) =====
app.get('/api/raw', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.send(`-- Invalid Link`);

  const { data: script, error } = await supabase.from('scripts')
    .select('id, title, content, public_link, user_id, access_type, whitelist').eq('public_link', id).maybeSingle();

  if (error || !script) return res.send(`-- Script Not Found`);

  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const isBrowser = /mozilla|chrome|safari|firefox|edge|opera|trident/i.test(userAgent);

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host');
  const scriptUrl = `${protocol}://${host}/api/get-script?id=${id}&userid=`;

  // ===== EXECUTOR (Roblox) =====
  if (!isBrowser) {
    const loadingScreen = `-- ZYROX HUB LOADING
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local SoundService = game:GetService("SoundService")
local StarterGui = game:GetService("StarterGui")
local LP = Players.LocalPlayer

local PlayerGui = LP:WaitForChild("PlayerGui", 10)
for _, gui in ipairs(PlayerGui:GetChildren()) do
    if gui.Name == "ZyroxHub_Loading" then pcall(function() gui:Destroy() end) end
end

local HypeSound = Instance.new("Sound")
HypeSound.Name = "ZyroxHub_Hype"
HypeSound.SoundId = "rbxassetid://136867843947932"
HypeSound.Volume = 1.0
HypeSound.Parent = SoundService

local LoadingGui = Instance.new("ScreenGui")
LoadingGui.Name = "ZyroxHub_Loading"
LoadingGui.ResetOnSpawn = false
LoadingGui.IgnoreGuiInset = true
LoadingGui.DisplayOrder = 999999
LoadingGui.Parent = PlayerGui

local Background = Instance.new("Frame")
Background.Size = UDim2.new(1, 0, 1, 0)
Background.BackgroundColor3 = Color3.fromRGB(8, 8, 15)
Background.BackgroundTransparency = 0.5
Background.BorderSizePixel = 0
Background.Parent = LoadingGui

local Title = Instance.new("TextLabel")
Title.Size = UDim2.new(0, 400, 0, 120)
Title.Position = UDim2.new(0.5, -200, 0.5, -60)
Title.BackgroundTransparency = 1
Title.Text = "ZYROX"
Title.TextColor3 = Color3.fromRGB(255, 255, 255)
Title.Font = Enum.Font.GothamBlack
Title.TextSize = 1
Title.TextTransparency = 1
Title.ZIndex = 10
Title.Parent = Background

local TitleGradient = Instance.new("UIGradient")
TitleGradient.Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 100, 150)),
    ColorSequenceKeypoint.new(0.5, Color3.fromRGB(255, 255, 255)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(200, 100, 255)),
})
TitleGradient.Rotation = 90
TitleGradient.Parent = Title

local Subtitle = Instance.new("TextLabel")
Subtitle.Size = UDim2.new(1, 0, 0, 25)
Subtitle.Position = UDim2.new(0, 0, 0.5, 30)
Subtitle.BackgroundTransparency = 1
Subtitle.Text = "P R E M I U M"
Subtitle.TextColor3 = Color3.fromRGB(200, 150, 180)
Subtitle.Font = Enum.Font.GothamBold
Subtitle.TextSize = 14
Subtitle.TextTransparency = 1
Subtitle.Parent = Background

local ProgressContainer = Instance.new("Frame")
ProgressContainer.Size = UDim2.new(0, 300, 0, 6)
ProgressContainer.Position = UDim2.new(0.5, -150, 0.5, 80)
ProgressContainer.BackgroundColor3 = Color3.fromRGB(30, 20, 40)
ProgressContainer.BackgroundTransparency = 1
ProgressContainer.BorderSizePixel = 0
ProgressContainer.Parent = Background

local ProgressCorner = Instance.new("UICorner")
ProgressCorner.CornerRadius = UDim.new(1, 0)
ProgressCorner.Parent = ProgressContainer

local ProgressFill = Instance.new("Frame")
ProgressFill.Size = UDim2.new(0, 0, 1, 0)
ProgressFill.BackgroundColor3 = Color3.fromRGB(255, 100, 150)
ProgressFill.BorderSizePixel = 0
ProgressFill.Parent = ProgressContainer

local ProgressFillCorner = Instance.new("UICorner")
ProgressFillCorner.CornerRadius = UDim.new(1, 0)
ProgressFillCorner.Parent = ProgressFill

local LoadingText = Instance.new("TextLabel")
LoadingText.Size = UDim2.new(1, 0, 0, 20)
LoadingText.Position = UDim2.new(0, 0, 0.5, 100)
LoadingText.BackgroundTransparency = 1
LoadingText.Text = "Loading..."
LoadingText.TextColor3 = Color3.fromRGB(180, 150, 200)
LoadingText.Font = Enum.Font.Gotham
LoadingText.TextSize = 12
LoadingText.TextTransparency = 1
LoadingText.Parent = Background

TweenService:Create(Subtitle, TweenInfo.new(0.8), {TextTransparency = 0}):Play()
TweenService:Create(ProgressContainer, TweenInfo.new(0.8), {BackgroundTransparency = 0}):Play()
TweenService:Create(LoadingText, TweenInfo.new(0.8), {TextTransparency = 0}):Play()

TweenService:Create(Title, TweenInfo.new(1.5, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
    TextSize = 80,
    TextTransparency = 0,
}):Play()

for i = 1, 50 do
    ProgressFill.Size = UDim2.new(i / 50, 0, 1, 0)
    task.wait(0.04)
end

task.wait(1)

LoadingText.Text = "LET'S GOOO!"
LoadingText.TextColor3 = Color3.fromRGB(255, 200, 50)
LoadingText.TextSize = 22
LoadingText.Font = Enum.Font.GothamBlack

pcall(function() HypeSound:Play() end)

task.wait(1.5)

pcall(function()
    StarterGui:SetCore("SendNotification", {
        Title = "ZYROX HUB",
        Text = "SCRIPT LOADED SUCCESSFULLY!",
        Duration = 5,
    })
end)

LoadingGui:Destroy()
task.wait(0.5)
pcall(function() HypeSound:Destroy() end)

-- FETCH TOTOONG SCRIPT (kasama ang User ID)
local success, scriptContent = pcall(function()
    return game:HttpGet("${scriptUrl}" .. tostring(LP.UserId))
end)

if success and scriptContent then
    if scriptContent:find("Script in protection") then
        -- Error UI
        local ErrorGui = Instance.new("ScreenGui")
        ErrorGui.Name = "ZyroxHub_Error"
        ErrorGui.ResetOnSpawn = false
        ErrorGui.IgnoreGuiInset = true
        ErrorGui.DisplayOrder = 999999
        ErrorGui.Parent = PlayerGui

        local ErrorFrame = Instance.new("Frame")
        ErrorFrame.Size = UDim2.new(0, 400, 0, 200)
        ErrorFrame.Position = UDim2.new(0.5, -200, 0.5, -100)
        ErrorFrame.BackgroundColor3 = Color3.fromRGB(15, 10, 20)
        ErrorFrame.BorderSizePixel = 0
        ErrorFrame.Parent = ErrorGui

        local ErrorCorner = Instance.new("UICorner")
        ErrorCorner.CornerRadius = UDim.new(0, 16)
        ErrorCorner.Parent = ErrorFrame

        local ErrorStroke = Instance.new("UIStroke")
        ErrorStroke.Color = Color3.fromRGB(255, 50, 50)
        ErrorStroke.Thickness = 2
        ErrorStroke.Parent = ErrorFrame

        local ErrorIcon = Instance.new("TextLabel")
        ErrorIcon.Size = UDim2.new(1, 0, 0, 60)
        ErrorIcon.Position = UDim2.new(0, 0, 0, 20)
        ErrorIcon.BackgroundTransparency = 1
        ErrorIcon.Text = "🔒"
        ErrorIcon.TextSize = 48
        ErrorIcon.Font = Enum.Font.GothamBlack
        ErrorIcon.Parent = ErrorFrame

        local ErrorTitle = Instance.new("TextLabel")
        ErrorTitle.Size = UDim2.new(1, -20, 0, 30)
        ErrorTitle.Position = UDim2.new(0, 10, 0, 90)
        ErrorTitle.BackgroundTransparency = 1
        ErrorTitle.Text = "SCRIPT IN PROTECTION"
        ErrorTitle.TextColor3 = Color3.fromRGB(255, 80, 80)
        ErrorTitle.TextSize = 18
        ErrorTitle.Font = Enum.Font.GothamBlack
        ErrorTitle.Parent = ErrorFrame

        local ErrorDesc = Instance.new("TextLabel")
        ErrorDesc.Size = UDim2.new(1, -20, 0, 40)
        ErrorDesc.Position = UDim2.new(0, 10, 0, 125)
        ErrorDesc.BackgroundTransparency = 1
        ErrorDesc.Text = "You are not authorized to use this script.\\nYour User ID is not in the whitelist."
        ErrorDesc.TextColor3 = Color3.fromRGB(180, 150, 180)
        ErrorDesc.TextSize = 12
        ErrorDesc.Font = Enum.Font.Gotham
        ErrorDesc.TextWrapped = true
        ErrorDesc.Parent = ErrorFrame

        pcall(function()
            StarterGui:SetCore("SendNotification", {
                Title = "🔒 ZYROX HUB",
                Text = "Script in protection — You are not authorized",
                Duration = 8,
            })
        end)

        task.wait(3)
        LP:Kick("🔒 Script in Protection\\n\\nYou are not authorized to use this script.\\nYour User ID is not in the whitelist.")
    else
        loadstring(scriptContent)()
    end
end
`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(loadingScreen);
  }

  // ===== BROWSER =====
  return res.send(`
    <!DOCTYPE html><html><head>
      <title>Fov.it — ${escapeHtml(script.title)}</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <meta property="og:title" content="Fov.it — ${escapeHtml(script.title)}">
      <meta property="og:description" content="Protected Lua script.">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: #0a0a0a; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .container { background: #141414; padding: 48px 40px; border-radius: 16px; border: 1px solid #222; width: 100%; max-width: 720px; }
        .logo { color: #00ff88; font-size: 32px; font-weight: bold; text-align: center; margin-bottom: 6px; }
        .subtitle { color: #666; font-size: 12px; text-align: center; letter-spacing: 2px; margin-bottom: 24px; }
        .title-section { margin-bottom: 24px; }
        .title-section h1 { color: #fff; font-size: 22px; margin-bottom: 6px; }
        .badge { display: inline-block; background: #ff4444; color: #fff; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: bold; }
        .code-box { background: #0a0a0a; border: 1px solid #ff4444; border-radius: 10px; padding: 18px; font-family: 'Consolas', monospace; font-size: 12px; color: #ff6666; text-align: center; line-height: 1.6; }
        .copy-btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #00ff88, #00cc6a); color: #0a0a0a; border: none; border-radius: 10px; font-size: 14px; font-weight: bold; cursor: pointer; margin-top: 16px; }
        .footer { text-align: center; color: #444; font-size: 11px; margin-top: 24px; padding-top: 20px; border-top: 1px solid #1a1a1a; }
        .footer a { color: #00ff88; text-decoration: none; }
      </style>
    </head><body>
      <div class="container">
        <div class="logo">Fov.it</div>
        <div class="subtitle">Script Protection System</div>
        <div class="title-section">
          <h1>📋 ${escapeHtml(script.title)}</h1>
          <span class="badge">🔒 Protected</span>
        </div>
        <div class="code-box">
          -- 🔒 Protected Script --<br>
          -- Hindi makikita ang totoong code dito.<br>
          -- Gamitin ang executor para ma-load ang script.
        </div>
        <button class="copy-btn" onclick="copyCode()">📋 COPY LOADSTRING</button>
        <div class="footer">Protected by <a href="/">Fov.it</a></div>
      </div>
      <script>
        function copyCode() {
          const code = 'loadstring(game:HttpGet("${protocol}://${host}/api/raw?id=${id}"))()';
          navigator.clipboard.writeText(code).then(() => {
            event.target.textContent = '✅ COPIED!';
            setTimeout(() => event.target.textContent = '📋 COPY LOADSTRING', 2000);
          });
        }
      </script>
    </body></html>
  `);
});

// ===== GET-SCRIPT (whitelist check) =====
app.get('/api/get-script', async (req, res) => {
  const { id, userid } = req.query;
  if (!id) return res.status(400).send('-- Invalid');

  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const isBrowser = /mozilla|chrome|safari|firefox|edge|opera|trident/i.test(userAgent);

  if (isBrowser) {
    return res.status(403).send('-- You cannot copy this script');
  }

  const { data: script, error } = await supabase.from('scripts')
    .select('content, access_type, whitelist').eq('public_link', id).maybeSingle();

  if (error || !script) return res.status(404).send('-- Script not found');

  // Check whitelist
  if (script.access_type === 'whitelist') {
    const whitelistIds = (script.whitelist || '').split(',').map(s => s.trim()).filter(Boolean);
    
    if (!userid) {
      return res.status(403).send('-- Script in protection');
    }
    
    if (!whitelistIds.includes(userid.toString())) {
      return res.status(403).send('-- Script in protection');
    }
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send(script.content);
});

// ===== DELETE =====
app.post('/api/delete', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  let user;
  try { user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID required' });
    const { data: script } = await supabase.from('scripts').select('user_id').eq('id', id).single();
    if (!script) return res.status(404).json({ error: 'Script not found' });
    if (user.role !== 'owner' && script.user_id !== user.id) return res.status(403).json({ error: 'You cannot delete this' });

    const { error } = await supabase.from('scripts').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to delete: ' + error.message });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== EDIT (with whitelist) =====
app.post('/api/edit', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  let user;
  try { user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  try {
    const { id, title, content, access_type, whitelist } = req.body;
    if (!id) return res.status(400).json({ error: 'ID required' });
    const { data: script } = await supabase.from('scripts').select('user_id').eq('id', id).single();
    if (!script) return res.status(404).json({ error: 'Script not found' });
    if (user.role !== 'owner' && script.user_id !== user.id) return res.status(403).json({ error: 'You cannot edit this' });

    const updates = { updated_at: new Date().toISOString() };
    if (title) updates.title = title;
    if (content) updates.content = content;
    if (access_type) updates.access_type = access_type;
    if (whitelist !== undefined) updates.whitelist = whitelist;

    const { data, error } = await supabase.from('scripts').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: 'Failed to update: ' + error.message });
    return res.status(200).json({ success: true, script: data });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== SINGLE =====
app.get('/api/single', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID required' });
  const { data, error } = await supabase.from('scripts')
    .select('id, title, content, public_link, access_type, whitelist, created_at, updated_at').eq('id', id).maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Script not found' });
  return res.status(200).json({ script: data });
});

// ===== ADMIN: USERS =====
app.get('/api/admin/users', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  let user;
  try { user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }
  if (user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

  try {
    const { data: users, error } = await supabase.from('users')
      .select('id, name, gmail, age, role, created_at').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Failed: ' + error.message });

    const { data: scripts } = await supabase.from('scripts').select('user_id');
    const scriptCount = {};
    (scripts || []).forEach(s => { scriptCount[s.user_id] = (scriptCount[s.user_id] || 0) + 1; });
    const usersWithCounts = users.map(u => ({ ...u, script_count: scriptCount[u.id] || 0 }));
    return res.status(200).json({ users: usersWithCounts });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== ADMIN: ALL SCRIPTS =====
app.get('/api/admin/scripts', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' });
  let user;
  try { user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }
  if (user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

  try {
    const { data: scripts, error } = await supabase.from('scripts')
      .select('id, title, public_link, user_id, access_type, created_at, updated_at').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Failed: ' + error.message });

    const userIds = [...new Set((scripts || []).map(s => s.user_id).filter(Boolean))];
    let userMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, name, gmail').in('id', userIds);
      (users || []).forEach(u => { userMap[u.id] = u; });
    }
    const scriptsWithOwner = (scripts || []).map(s => ({
      ...s,
      owner_name: userMap[s.user_id]?.name || 'unknown',
      owner_gmail: userMap[s.user_id]?.gmail || 'unknown'
    }));
    return res.status(200).json({ scripts: scriptsWithOwner });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== SERVE HTML =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/editor.html', (req, res) => res.sendFile(path.join(__dirname, 'editor.html')));
app.get('/view.html', (req, res) => res.sendFile(path.join(__dirname, 'view.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/ai.html', (req, res) => res.sendFile(path.join(__dirname, 'ai.html')));
app.get('/s/:link', (req, res) => res.sendFile(path.join(__dirname, 'view.html')));

app.listen(PORT, () => {
  console.log(`Fov.it server running on port ${PORT}`);
});
