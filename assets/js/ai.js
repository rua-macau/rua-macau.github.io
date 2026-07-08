/* ai.js · AI 圖片識別 */

const ENCRYPT_KEY = 'rua-macau-ai-key-v1';

// Base64 混淆（防一眼看到）
function encodeKey(raw) {
  return btoa(ENCRYPT_KEY + '|' + raw);
}
function decodeKey(encoded) {
  try {
    return atob(encoded).replace(ENCRYPT_KEY + '|', '');
  } catch { return ''; }
}

// 加载配置
function loadAIConfig() {
  const saved = localStorage.getItem('ai_config');
  if (saved) {
    try {
      const cfg = JSON.parse(atob(saved));
      document.getElementById('ai-url').value = cfg.url || '';
      document.getElementById('ai-model').value = cfg.model || '';
      document.getElementById('ai-key').value = '••••••••••••••••';
      document.getElementById('ai-recognize').disabled = false;
      return cfg;
    } catch {}
  }
  return null;
}

// 获取当前配置（解密 Key）
function getAIConfig() {
  const saved = localStorage.getItem('ai_config');
  if (!saved) return null;
  try {
    const cfg = JSON.parse(atob(saved));
    return { ...cfg, key: decodeKey(cfg.key) };
  } catch { return null; }
}

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  loadAIConfig();

  // 保存
  document.getElementById('ai-save').addEventListener('click', () => {
    const url = document.getElementById('ai-url').value.trim();
    const model = document.getElementById('ai-model').value.trim();
    const key = document.getElementById('ai-key').value.trim();
    const status = document.getElementById('ai-status');

    if (!url || !model || !key || key === '••••••••••••••••') {
      status.textContent = '❌ 請填寫完整配置';
      status.style.color = '#f44336';
      return;
    }
    try { new URL(url); } catch {
      status.textContent = '❌ API 地址格式錯誤';
      status.style.color = '#f44336';
      return;
    }

    localStorage.setItem('ai_config', btoa(JSON.stringify({
      url, model, key: encodeKey(key)
    })));
    status.textContent = '✅ 已安全保存（Key 已隱藏）';
    status.style.color = '#4CAF50';
    document.getElementById('ai-key').value = '••••••••••••••••';
    document.getElementById('ai-recognize').disabled = false;
  });

  // 清除
  document.getElementById('ai-clear').addEventListener('click', () => {
    localStorage.removeItem('ai_config');
    document.getElementById('ai-url').value = '';
    document.getElementById('ai-model').value = '';
    document.getElementById('ai-key').value = '';
    document.getElementById('ai-recognize').disabled = true;
    document.getElementById('ai-status').textContent = '已清除';
    document.getElementById('ai-status').style.color = '#999';
  });

  // 测试连通
  document.getElementById('ai-test').addEventListener('click', async () => {
    const url = document.getElementById('ai-url').value.trim();
    const model = document.getElementById('ai-model').value.trim();
    const keyInput = document.getElementById('ai-key').value.trim();
    const key = keyInput === '••••••••••••••••' ? getAIConfig()?.key : keyInput;
    const status = document.getElementById('ai-status');

    if (!url || !model || !key) {
      status.textContent = '❌ 請先填寫或保存配置';
      status.style.color = '#f44336';
      return;
    }

    status.textContent = '正在測試...';
    status.style.color = '#666';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });

      if (res.ok) {
        status.textContent = '✅ API 連通成功';
        status.style.color = '#4CAF50';
      } else {
        const err = await res.json().catch(() => ({}));
        status.textContent = `❌ 連通失敗：${err.error?.message || res.status}`;
        status.style.color = '#f44336';
      }
    } catch (e) {
      status.textContent = `❌ 連通失敗：${e.message}`;
      status.style.color = '#f44336';
    }
  });

  // 识别当前照片
  document.getElementById('ai-recognize').addEventListener('click', async () => {
    const cfg = getAIConfig();
    if (!cfg) {
      document.getElementById('ai-status').textContent = '❌ 請先保存 AI 配置';
      document.getElementById('ai-status').style.color = '#f44336';
      return;
    }

    // 依赖全局变量（来自 main.js）
    if (typeof currentIndex === 'undefined' || !photos.length) {
      alert('照片尚未加載完成');
      return;
    }

    const p = photos[currentIndex];
    const status = document.getElementById('ai-status');
    const result = document.getElementById('ai-result');

    status.textContent = '正在識別照片...';
    status.style.color = '#666';
    result.textContent = '';

    try {
      // 1. 获取照片 Blob（优先缓存）
      let blob;
      const cached = await getCachedPhoto(p.name);
      if (cached) {
        blob = cached.blob;
        status.textContent = '使用離線緩存識別...';
      } else {
        status.textContent = '下載照片...';
        blob = await downloadPhotoBlob(p.name);
      }

      // 2. Base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // 3. 调用 AI
      status.textContent = '調用 AI 模型...';
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.key}`
        },
        body: JSON.stringify({
          model: cfg.model,
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

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `API 錯誤 ${res.status}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '（無回應）';

      result.textContent = `📷 ${p.name}\n\n${text}`;
      status.textContent = '✅ 識別完成';
      status.style.color = '#4CAF50';

    } catch (e) {
      status.textContent = `❌ 識別失敗：${e.message}`;
      status.style.color = '#f44336';
      console.error(e);
    }
  });
});
