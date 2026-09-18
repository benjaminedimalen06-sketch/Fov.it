<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fov.it — Editor</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #050505; color: #fff; min-height: 100vh; position: relative; overflow-x: hidden; }
    body::before { content: ''; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: radial-gradient(circle at 20% 20%, rgba(0, 255, 136, 0.08) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(0, 255, 136, 0.05) 0%, transparent 40%); pointer-events: none; z-index: 0; }
    .navbar { background: rgba(10, 10, 10, 0.7); backdrop-filter: blur(30px); border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; }
    .logo { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 900; background: linear-gradient(135deg, #fff 0%, #00ff88 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-decoration: none; }
    .logo-icon { width: 32px; height: 32px; background: linear-gradient(135deg, #00ff88, #00cc6a); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; color: #0a0a0a; }
    .back-btn { background: rgba(255, 255, 255, 0.05); color: #fff; border: 1px solid rgba(255, 255, 255, 0.1); padding: 10px 20px; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 700; text-decoration: none; transition: all 0.3s; }
    .back-btn:hover { background: rgba(255, 255, 255, 0.1); }
    .container { max-width: 900px; margin: 0 auto; padding: 48px 32px; position: relative; z-index: 1; }
    .page-title { margin-bottom: 32px; }
    .page-title h1 { font-size: 36px; font-weight: 900; background: linear-gradient(135deg, #fff 0%, #00ff88 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 8px; }
    .page-title p { color: #666; font-size: 14px; }
    .form-card { background: linear-gradient(135deg, rgba(20, 20, 20, 0.9), rgba(15, 15, 15, 0.9)); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 24px; padding: 40px; }
    .form-group { margin-bottom: 24px; }
    label { display: block; margin-bottom: 10px; color: #aaa; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    input, select, textarea { width: 100%; padding: 16px 20px; background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; color: #fff; font-size: 14px; outline: none; font-family: inherit; transition: all 0.3s; }
    input:focus, select:focus, textarea:focus { border-color: #00ff88; box-shadow: 0 0 0 3px rgba(0, 255, 136, 0.1); }
    select option { background: #141414; }
    textarea { min-height: 400px; font-family: 'Consolas', monospace; font-size: 13px; line-height: 1.7; resize: vertical; }
    .hint { color: #555; font-size: 11px; margin-top: 6px; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
    button { padding: 14px 28px; border: none; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; transition: all 0.3s; font-family: inherit; }
    .btn-save { background: linear-gradient(135deg, #00ff88, #00cc6a); color: #0a0a0a; flex: 1; }
    .btn-save:hover { transform: translateY(-3px); box-shadow: 0 20px 60px rgba(0, 255, 136, 0.5); }
    .btn-save:disabled { background: #444; color: #888; cursor: not-allowed; transform: none; }
    .btn-cancel { background: rgba(255, 255, 255, 0.05); color: #fff; border: 1px solid rgba(255, 255, 255, 0.1); text-decoration: none; display: inline-flex; align-items: center; }
    
    /* Whitelist Styles */
    .whitelist-container { display: flex; flex-direction: column; gap: 10px; }
    .user-row { display: flex; gap: 10px; align-items: center; }
    .user-row input { flex: 1; }
    .btn-remove {
      background: rgba(255, 68, 68, 0.15);
      color: #ff6666;
      border: 1px solid rgba(255, 68, 68, 0.3);
      padding: 14px 18px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 800;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    .btn-remove:hover { background: #ff4444; color: #fff; }
    .btn-add-user {
      background: rgba(0, 255, 136, 0.1);
      color: #00ff88;
      border: 1px solid rgba(0, 255, 136, 0.3);
      padding: 12px 20px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 800;
      transition: all 0.2s;
      margin-top: 10px;
      font-family: inherit;
    }
    .btn-add-user:hover { background: #00ff88; color: #0a0a0a; }
    
    .raw-link-box { background: linear-gradient(135deg, rgba(0, 255, 136, 0.1), rgba(0, 255, 136, 0.05)); border: 1px solid rgba(0, 255, 136, 0.3); border-radius: 16px; padding: 20px; margin-bottom: 24px; display: none; }
    .raw-link-box.show { display: block; }
    .raw-link-box h3 { color: #00ff88; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .raw-link-box code { display: block; background: rgba(0, 0, 0, 0.5); padding: 12px 16px; border-radius: 10px; color: #00ff88; font-family: 'Consolas', monospace; font-size: 12px; word-break: break-all; margin-bottom: 8px; border: 1px solid rgba(0, 255, 136, 0.2); }
    .error { background: linear-gradient(135deg, rgba(255, 68, 68, 0.15), rgba(255, 68, 68, 0.05)); border: 1px solid rgba(255, 68, 68, 0.3); color: #ff8888; padding: 14px 20px; border-radius: 12px; margin-bottom: 20px; font-size: 13px; font-weight: 600; display: none; }
    .error.show { display: block; }
    .toast { position: fixed; bottom: 32px; right: 32px; background: linear-gradient(135deg, #00ff88, #00cc6a); color: #0a0a0a; padding: 16px 28px; border-radius: 14px; font-weight: 800; font-size: 14px; display: none; z-index: 999; }
  </style>
</head>
<body>
  <div class="navbar">
    <a href="/dashboard.html" class="logo">
      <div class="logo-icon">F</div>
      Fov.it
    </a>
    <a href="/dashboard.html" class="back-btn">← Back</a>
  </div>
  <div class="container">
    <div class="page-title">
      <h1 id="pageTitle">✨ New Script</h1>
      <p id="pageSubtitle">Create a new protected Lua script</p>
    </div>

    <div class="error" id="error"></div>
    <div class="raw-link-box" id="rawBox"></div>

    <div class="form-card">
      <form id="editorForm">
        <div class="form-group">
          <label>📝 Script Name (Title)</label>
          <input type="text" id="title" required placeholder="Script name">
        </div>

        <div class="form-group">
          <label>🔒 Access Type</label>
          <select id="accessType" onchange="toggleWhitelist()">
            <option value="public">🌐 Public (Everyone)</option>
            <option value="whitelist">🔐 Whitelist (Specific User IDs only)</option>
          </select>
        </div>

        <div class="form-group" id="whitelistGroup" style="display:none;">
          <label>👤 Roblox User IDs</label>
          <div class="whitelist-container" id="whitelistContainer">
            <div class="user-row">
              <input type="text" class="user-id-input" placeholder="Enter Roblox User ID (e.g., 121312354)">
              <button type="button" class="btn-remove" onclick="removeUser(this)">✕</button>
            </div>
          </div>
          <button type="button" class="btn-add-user" onclick="addUser()">+ Add User</button>
          <p class="hint">Only users in this list can execute the script. Users not on the list will see "Script in protection".</p>
        </div>

        <div class="form-group">
          <label>💻 Script Content (Lua)</label>
          <textarea id="content" required placeholder="-- Paste your Lua script here..."></textarea>
        </div>

        <div class="actions">
          <button type="submit" class="btn-save" id="saveBtn">💾 Save</button>
          <a href="/dashboard.html" class="btn-cancel">Cancel</a>
        </div>
      </form>
    </div>
  </div>

  <div class="toast" id="toast">Saved!</div>

  <script>
    const token = localStorage.getItem('fov_token');
    if (!token) window.location.href = '/';

    const params = new URLSearchParams(window.location.search);
    const editId = params.get('id');

    function toggleWhitelist() {
      const type = document.getElementById('accessType').value;
      document.getElementById('whitelistGroup').style.display = type === 'whitelist' ? 'block' : 'none';
    }

    function addUser(value = '') {
      const container = document.getElementById('whitelistContainer');
      const row = document.createElement('div');
      row.className = 'user-row';
      row.innerHTML = `
        <input type="text" class="user-id-input" placeholder="Enter Roblox User ID" value="${value}">
        <button type="button" class="btn-remove" onclick="removeUser(this)">✕</button>
      `;
      container.appendChild(row);
    }

    function removeUser(btn) {
      const container = document.getElementById('whitelistContainer');
      if (container.children.length > 1) {
        btn.parentElement.remove();
      } else {
        // Clear the last input instead of removing
        btn.parentElement.querySelector('input').value = '';
      }
    }

    function getWhitelist() {
      const inputs = document.querySelectorAll('.user-id-input');
      const ids = [];
      inputs.forEach(input => {
        const val = input.value.trim();
        if (val) ids.push(val);
      });
      return ids.join(',');
    }

    function setWhitelist(whitelistStr) {
      const container = document.getElementById('whitelistContainer');
      container.innerHTML = '';
      const ids = (whitelistStr || '').split(',').map(s => s.trim()).filter(Boolean);
      
      if (ids.length === 0) {
        addUser();
      } else {
        ids.forEach(id => addUser(id));
      }
    }

    if (editId) {
      document.getElementById('pageTitle').textContent = '✏️ Edit Script';
      document.getElementById('pageSubtitle').textContent = 'Update your script';
      loadScript(editId);
    }

    async function loadScript(id) {
      try {
        const res = await fetch('/api/single?id=' + id, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        document.getElementById('title').value = data.script.title;
        document.getElementById('content').value = data.script.content;
        document.getElementById('accessType').value = data.script.access_type || 'public';
        setWhitelist(data.script.whitelist || '');
        toggleWhitelist();

        const rawLink = window.location.origin + '/api/raw?id=' + data.script.public_link;
        const rawBox = document.getElementById('rawBox');
        rawBox.classList.add('show');
        rawBox.innerHTML = `
          <h3>🔗 Raw Link (Roblox)</h3>
          <code>loadstring(game:HttpGet("${rawLink}"))()</code>
        `;
      } catch (err) {
        const errorBox = document.getElementById('error');
        errorBox.textContent = '❌ ' + err.message;
        errorBox.classList.add('show');
      }
    }

    document.getElementById('editorForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('saveBtn');
      const errorBox = document.getElementById('error');
      btn.disabled = true;
      btn.textContent = '⏳ Saving...';
      errorBox.classList.remove('show');

      const title = document.getElementById('title').value.trim();
      const content = document.getElementById('content').value;
      const access_type = document.getElementById('accessType').value;
      const whitelist = getWhitelist();

      if (access_type === 'whitelist' && !whitelist) {
        errorBox.textContent = '❌ Please add at least one User ID for whitelist';
        errorBox.classList.add('show');
        btn.disabled = false;
        btn.textContent = '💾 Save';
        return;
      }

      try {
        let res;
        if (editId) {
          res = await fetch('/api/edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ id: editId, title, content, access_type, whitelist })
          });
        } else {
          res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ title, content, access_type, whitelist })
          });
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save');

        if (data.script && data.script.public_link) {
          const rawLink = window.location.origin + '/api/raw?id=' + data.script.public_link;
          const rawBox = document.getElementById('rawBox');
          rawBox.classList.add('show');
          rawBox.innerHTML = `
            <h3>✅ Saved! Raw Link (Roblox)</h3>
            <code>loadstring(game:HttpGet("${rawLink}"))()</code>
          `;
        }

        showToast('✅ ' + (editId ? 'Updated!' : 'Created!'));
        setTimeout(() => window.location.href = '/dashboard.html', 2000);
      } catch (err) {
        errorBox.textContent = '❌ ' + err.message;
        errorBox.classList.add('show');
        btn.disabled = false;
        btn.textContent = '💾 Save';
      }
    });

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.display = 'block';
      setTimeout(() => t.style.display = 'none', 2500);
    }
  </script>
</body>
</html>
