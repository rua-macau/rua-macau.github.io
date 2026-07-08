/* ai.js · AI 圖片識別 · photosReady 同步版 */
import { getCachedPhoto, downloadPhotoBlob } from './main.js';

const ENCRYPT_KEY = 'rua-macau-ai-key-v1';

/* ========= Base64 混淆 ========= */
function encodeKey(raw) {
  return btoa(ENCRYPT_KEY + '|' + raw);
}
function decodeKey(encoded) {
  try {
    return atob(encoded).replace(ENCRYPT_KEY + '|', '');
  } catch { return ''; }
}

/* ========= 全局状态 ========= */
let photosReady = false;
let photosCount = 0;

/* ========= 加载配置 ========= */
function loadAIConfig() {
  const saved = localStorage.getItem('ai_config');
  if (saved) {
    try {
      const cfg = JSON.parse(atob(saved));
      document.getElementById('ai-url').value   = cfg.url || '';
      document.getElementById('ai-model').value = cfg.model || '';
      document.getElementById('ai-key').value   = '••••••••••••••••';
      return cfg;
    } catch {}
  }
  return null;
}

/* ========= 获取解密后的配置 ========= */
function getAIConfig() {
  const saved = localStorage.getItem('ai_config');
  if (!saved) return null;
  try {
    const cfg = JSON.parse(atob(saved));
    return { ...cfg, key: decodeKey(cfg.key) };
  } catch { return null; }
}

/* ========= 检查照片是否就绪 ========= */
function checkPhotosReady() {
  // 如果 main.js 已经跑完，全局变量已存在
  if (typeof photos !== 'undefined' && photos.length > 0) {
    photosReady = true;
    photosCount = photos.length;
    document.getElementById('ai-recognize').disabled = false;
    console.log('[AI] 检测到照片已就绪，共', photosCount, '张');
    return true;
  }
  return false;
}

/* ========= DOM Ready ========= */
document.addEventListener('DOMContentLoaded', () => {

  // 1. 加载已保存的配置
  loadAIConfig();

  // 2. 兜底检查：如果 main.js 已经先跑完
  setTimeout(() => {
    if (!photosReady) {
      checkPhotosReady();
    }
  }, 100); // 给 main.js 100ms 优先时间

  // 3. 监听 main.js 的广播 ✅ 核心修复
  window.addEventListener('photosReady', (e) => {
    photosReady = true;
    photosCount = e.detail.count;
    document.getElementById('ai-recognize').disabled = false;
    const status = document.getElementById('ai-status');
    status.textContent = `✅ 照片已就緒（${photosCount} 張），可開始識別`;
    status.style.color = '#4CAF50';
    console.log('[AI] 收到 photosReady 事件，共', photosCount, '張');
  });

  // 4. 保存配置
  document.getElementById('ai-save').addEventListener('click', () => {
    const url   = document.getElementById('ai-url').value.trim();
    const model = document.getElementById('ai-model').value.trim();
    const key   = document.getElementById('ai-key').value.trim();
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
    document.getElementById('ai-recognize').disabled = !photosReady;
  });

  // 5. 清除配置
  document.getElementById('ai-clear').addEventListener('click', () => {
    localStorage.removeItem('ai_config');
    document.getElementById('ai-url').value   = '';
    document.getElementById('ai-model').value = '';
    document.getElementById('ai-key').value   = '';
    document.getElementById('ai-recognize').disabled = true;
    document.getElementById('ai-status').textContent = '已清除';
    document.getElementById('ai-status').style.color = '#999';
  });

  // 6. 测试连通
  document.getElementById('ai-test').addEventListener('click', async () => {
    const url   = document.getElementById('ai-url').value.trim();
    const model = document.getElementById('ai-model').value.trim();
    const keyInput = document.getElementById('ai-key').value.trim();
    const key   = keyInput === '••••••••••••••••' ? getAIConfig()?.key : keyInput;
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

  // 7. 识别当前照片 ✅ 时序安全
  document.getElementById('ai-recognize').addEventListener('click', async () => {
    const cfg = getAIConfig();
    if (!cfg) {
      document.getElementById('ai-status').textContent = '❌ 請先保存 AI 配置';
      document.getElementById('ai-status').style.color = '#f44336';
      return;
    }

    // ✅ 时序检查：照片准备好了吗？
    if (!photosReady) {
      // 再做一次兜底检查
      if (!checkPhotosReady()) {
        document.getElementById('ai-status').textContent = '⏳ 照片尚未加載完成，請稍候...';
        document.getElementById('ai-status').style.color = '#FF9800';
        return;
      }
    }

    // ✅ 依赖全局变量（来自 main.js）
    if (typeof currentIndex === 'undefined' || typeof photos === 'undefined' || !photos.length) {
      document.getElementById('ai-status').textContent = '❌ 照片列表不可用';
      document.getElementById('ai-status').style.color = '#f44336';
      return;
    }

    const p     = photos[currentIndex];
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
        if (!navigator.onLine) {
          throw new Error('無網絡，且無離線緩存');
        }
        status.textContent = '下載照片...';
        blob = await downloadPhotoBlob(p.name);
      }

      // 2. 转为 Base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // 3. 调用 AI API
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
              {
                type: 'text',
                text: '請用繁體中文描述這張照片的內容，包括：場景、建築風格、可能的地點特徵。'
              },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64}` }
              }
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
      if (e.message.includes('無網絡')) {
        status.textContent = '❌ 無網絡，且無離線緩存';
      } else {
        status.textContent = `❌ 識別失敗：${e.message}`;
      }
      status.style.color = '#f44336';
      console.error(e);
    }
  });
});
