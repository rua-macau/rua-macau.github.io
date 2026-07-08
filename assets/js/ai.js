/* =========================================================
   ai.js · 獨立 AI 模塊（圖片選擇 + 聊天 + 清除話題）
   ========================================================= */

const ENCRYPT_KEY = 'rua-macau-ai-key-v1';
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/rua-macau/Macau-road-s@main';

/* ========= 工具 ========= */
function encodeKey(k) { return btoa(ENCRYPT_KEY + '|' + k); }
function decodeKey(e) { try { return atob(e).replace(ENCRYPT_KEY + '|', ''); } catch { return ''; } }

function saveAIConfig(cfg) {
  localStorage.setItem('ai_config', btoa(JSON.stringify(cfg)));
}
function loadAIConfig() {
  const s = localStorage.getItem('ai_config');
  if (!s) return null;
  try {
    const cfg = JSON.parse(atob(s));
    return { url: cfg.url, model: cfg.model, key: decodeKey(cfg.key) };
  } catch { return null; }
}

/* ========= 圖片列表 ========= */
let photoList = [];
let photoIndex = 0;

async function loadPhotoList() {
  try {
    const res = await fetch(`${CDN_BASE}/`);
    const html = await res.text();
    const matches = [...html.matchAll(/href="([^"]+\.(jpg|jpeg|png|webp))"/gi)];
    photoList = matches.map(m => m[1]).sort();
    updateImageUI();
  } catch {
    photoList = [];
    updateImageUI();
  }
}

function updateImageUI() {
  const urlInput = document.getElementById('ai-image-url');
  const indexSpan = document.getElementById('img-index');

  if (photoList.length === 0) {
    urlInput.value = '';
    indexSpan.textContent = '0 / 0';
    return;
  }

  urlInput.value = `${CDN_BASE}/${photoList[photoIndex]}`;
  indexSpan.textContent = `${photoIndex + 1} / ${photoList.length}`;
}

/* ========= DOM Ready ========= */
document.addEventListener('DOMContentLoaded', () => {
  const cfg = loadAIConfig();
  if (cfg) {
    document.getElementById('ai-url').value = cfg.url;
    document.getElementById('ai-model').value = cfg.model;
    document.getElementById('ai-key').value = '••••••••••••••••';
  }

  loadPhotoList();

  /* ---- AI 配置 ---- */
  document.getElementById('ai-save').onclick = () => {
    const url = document.getElementById('ai-url').value.trim();
    const model = document.getElementById('ai-model').value.trim();
    const key = document.getElementById('ai-key').value.trim();
    if (!url || !model || key === '••••••••••••••••') return;
    saveAIConfig({ url, model, key: encodeKey(key) });
    document.getElementById('ai-key').value = '••••••••••••••••';
    document.getElementById('ai-status').textContent = '✅ 已安全保存';
  };

  document.getElementById('ai-clear').onclick = () => {
    localStorage.removeItem('ai_config');
    document.getElementById('ai-url').value = '';
    document.getElementById('ai-model').value = '';
    document.getElementById('ai-key').value = '';
    document.getElementById('ai-status').textContent = '已清除';
  };

  document.getElementById('ai-test').onclick = async () => {
    const c = loadAIConfig();
    if (!c) return;
    const r = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.key}` },
      body: JSON.stringify({ model: c.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 })
    });
    document.getElementById('ai-status').textContent = r.ok ? '✅ 連通成功' : `❌ 失敗 ${r.status}`;
  };

  /* ---- 圖片選擇 ---- */
  document.getElementById('img-prev').onclick = () => {
    if (photoIndex > 0) { photoIndex--; updateImageUI(); }
  };
  document.getElementById('img-next').onclick = () => {
    if (photoIndex < photoList.length - 1) { photoIndex++; updateImageUI(); }
  };

  /* ---- 圖片識別 ---- */
  document.getElementById('ai-recognize').onclick = async () => {
    const c = loadAIConfig();
    const imgUrl = document.getElementById('ai-image-url').value.trim();
    if (!c || !imgUrl) return;

    const res = await fetch(imgUrl);
    const blob = await res.blob();
    const base64 = await new Promise(r => {
      const fr = new FileReader();
      fr.onload = () => r(fr.result.split(',')[1]);
      fr.readAsDataURL(blob);
    });

    const r = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.key}` },
      body: JSON.stringify({
        model: c.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '請用繁體中文描述這張照片的內容，包括：場景、建築風格、可能的地點特徵。' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
          ]
        }],
        max_tokens: 300
      })
    });
    const data = await r.json();
    document.getElementById('ai-result').textContent =
      `📷 ${photoList[photoIndex]}\n\n${data.choices?.[0]?.message?.content || '（無回應）'}`;
  };

  /* ---- 聊天 ---- */
  document.getElementById('chat-send').onclick = async () => {
    const c = loadAIConfig();
    const msg = document.getElementById('chat-input').value.trim();
    if (!c || !msg) return;

    const r = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.key}` },
      body: JSON.stringify({ model: c.model, messages: [{ role: 'user', content: msg }], max_tokens: 300 })
    });
    const data = await r.json();
    document.getElementById('chat-output').textContent +=
      `\n👤 ${msg}\n🤖 ${data.choices?.[0]?.message?.content || '（無回應）'}\n`;
    document.getElementById('chat-input').value = '';
  };

  /* ---- 清除話題 ---- */
  document.getElementById('chat-clear').onclick = () => {
    document.getElementById('chat-output').textContent = '';
    document.getElementById('chat-input').value = '';
  };
});
