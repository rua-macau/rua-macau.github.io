/* =========================================================
   ai.js · 极简稳定版（手动输入 + 上传 + 进度条）
   ========================================================= */

const ENCRYPT_KEY = 'rua-macau-ai-key-v1';

/* ========= 工具 ========= */
const encodeKey = k => btoa(ENCRYPT_KEY + '|' + k);
const decodeKey = e => { try { return atob(e).replace(ENCRYPT_KEY + '|', ''); } catch { return ''; } };

const saveAIConfig = cfg => localStorage.setItem('ai_config', btoa(JSON.stringify(cfg)));

const loadAIConfig = () => {
  const s = localStorage.getItem('ai_config');
  if (!s) return null;
  try {
    const cfg = JSON.parse(atob(s));
    return { url: cfg.url, model: cfg.model, key: decodeKey(cfg.key) };
  } catch { return null; }
};

/* ========= 进度条工具 ========= */
function showProgress(barId, fillId, pct) {
  const bar = document.getElementById(barId);
  const fill = document.getElementById(fillId);
  bar.style.display = 'block';
  fill.style.width = pct + '%';
  if (pct >= 100) setTimeout(() => { bar.style.display = 'none'; fill.style.width = '0%'; }, 500);
}

/* ========= DOM Ready ========= */
document.addEventListener('DOMContentLoaded', () => {
  const cfg = loadAIConfig();
  if (cfg) {
    document.getElementById('ai-url').value = cfg.url;
    document.getElementById('ai-model').value = cfg.model;
    document.getElementById('ai-key').value = '••••••••••••••••';
  }

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

  /* ---- 测试连通（带进度条） ---- */
  document.getElementById('ai-test').onclick = async () => {
    const c = loadAIConfig();
    if (!c) return;
    const status = document.getElementById('ai-status');
    status.textContent = '正在測試...';
    showProgress('test-progress', 'test-progress-fill', 30);

    try {
      showProgress('test-progress', 'test-progress-fill', 60);
      const r = await fetch(c.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.key}` },
        body: JSON.stringify({ model: c.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 })
      });
      showProgress('test-progress', 'test-progress-fill', 100);

      if (r.ok) {
        status.textContent = '✅ API 連通成功';
      } else {
        const err = await r.json().catch(() => ({}));
        status.textContent = `❌ 連通失敗：${err.error?.message || r.status}`;
      }
    } catch (e) {
      showProgress('test-progress', 'test-progress-fill', 100);
      status.textContent = `❌ 連通失敗：${e.message}`;
    }
  };

  /* ---- 获取图片（URL 或上传） ---- */
  const getImageBlob = async () => {
    const fileInput = document.getElementById('ai-file-upload');
    const urlInput = document.getElementById('ai-image-url').value.trim();

    // 优先：文件上传
    if (fileInput.files && fileInput.files[0]) {
      return { blob: fileInput.files[0], source: 'upload' };
    }

    // 其次：URL
    if (urlInput) {
      const res = await fetch(urlInput);
      if (!res.ok) throw new Error('圖片下載失敗');
      return { blob: await res.blob(), source: 'url' };
    }

    throw new Error('請輸入圖片 URL 或上傳圖片');
  };

  /* ---- 識別圖片（带进度条） ---- */
  document.getElementById('ai-recognize').onclick = async () => {
    const c = loadAIConfig();
    if (!c) return;
    const status = document.getElementById('ai-status');
    const result = document.getElementById('ai-result');

    try {
      status.textContent = '⏳ 獲取圖片中...';
      showProgress('recog-progress', 'recog-progress-fill', 20);

      const { blob } = await getImageBlob();

      showProgress('recog-progress', 'recog-progress-fill', 50);
      status.textContent = '⏳ 轉換圖片...';

      const base64 = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result.split(',')[1]);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });

      showProgress('recog-progress', 'recog-progress-fill', 70);
      status.textContent = '⏳ AI 識別中...';

      const r = await fetch(c.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.key}` },
        body: JSON.stringify({
          model: c.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: '請用繁體中文描述這張照片的內容。' },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
            ]
          }],
          max_tokens: 300
        })
      });

      showProgress('recog-progress', 'recog-progress-fill', 100);

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error?.message || `API 錯誤 ${r.status}`);
      }

      const data = await r.json();
      result.textContent = data.choices?.[0]?.message?.content || '（無回應）';
      status.textContent = '✅ 識別完成';
    } catch (e) {
      showProgress('recog-progress', 'recog-progress-fill', 100);
      status.textContent = `❌ ${e.message}`;
    }
  };

  /* ---- 聊天（带进度条） ---- */
  document.getElementById('chat-send').onclick = async () => {
    const c = loadAIConfig();
    const msg = document.getElementById('chat-input').value.trim();
    if (!c || !msg) return;

    const out = document.getElementById('chat-output');
    out.textContent += `\n👤 ${msg}`;
    document.getElementById('chat-input').value = '';
    showProgress('chat-progress', 'chat-progress-fill', 30);

    try {
      const r = await fetch(c.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.key}` },
        body: JSON.stringify({ model: c.model, messages: [{ role: 'user', content: msg }], max_tokens: 300 })
      });
      showProgress('chat-progress', 'chat-progress-fill', 100);

      if (!r.ok) {
        out.textContent += `\n❌ AI 錯誤 ${r.status}\n`;
        return;
      }

      const data = await r.json();
      out.textContent += `\n🤖 ${data.choices?.[0]?.message?.content || '（無回應）'}\n`;
    } catch {
      showProgress('chat-progress', 'chat-progress-fill', 100);
      out.textContent += `\n❌ 網絡錯誤\n`;
    }
  };

  /* ---- 清除話題 ---- */
  document.getElementById('chat-clear').onclick = () => {
    document.getElementById('chat-output').textContent = '';
    document.getElementById('chat-input').value = '';
  };
});
