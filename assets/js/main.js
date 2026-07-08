/* =========================================================
   rua-macau · 澳门街道照片档案 · 单文件终极版
   ========================================================= */

/* ========= 配置 ========= */
const OWNER = 'rua-macau';
const REPO  = 'Macau-road-s';
const BRANCH = 'main';
const CDN   = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}`;

/* ========= 全局状态（全部集中） ========= */
let photos = [];
let currentIndex = 0;
let proxyUrl = localStorage.getItem('proxy_url') || '';

/* ========= AI 配置 ========= */
const AI_ENCRYPT_KEY = 'rua-macau-ai-key-v1';

/* ========= DOM Ready ========= */
document.addEventListener('DOMContentLoaded', async () => {
  initProxy();
  await loadPhotos();
  initPDF();
  initAI();
  initNav();
  initNetworkStatus();
  initUtterances();
});

/* ========= Proxy ========= */
function initProxy() {
  const input = document.getElementById('proxy-input');
  const status = document.getElementById('proxy-status');
  const btn = document.getElementById('proxy-save');

  if (proxyUrl) {
    input.value = proxyUrl;
    status.textContent = '已配置代理';
    status.style.color = '#4CAF50';
  }

  btn.addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) {
      localStorage.removeItem('proxy_url');
      proxyUrl = '';
      status.textContent = '已清除代理';
      status.style.color = '#999';
      return;
    }
    try { new URL(val); } catch {
      status.textContent = '格式錯誤';
      status.style.color = '#f44336';
      return;
    }
    localStorage.setItem('proxy_url', val);
    proxyUrl = val;
    status.textContent = '保存成功';
    status.style.color = '#4CAF50';
    loadPhotos();
  });
}

/* ========= 照片加载 ========= */
async function loadPhotos() {
  const container = document.getElementById('photo-container');
  const bar = document.getElementById('progress-bar');
  const fill = document.getElementById('progress-fill');

  container.innerHTML = '<p class="status">載入照片列表中...</p>';
  bar.style.display = 'block';
  fill.style.width = '10%';

  try {
    let url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
    if (proxyUrl) url = proxyUrl.replace(/\/$/, '') + '/' + url;

    fill.style.width = '30%';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API 錯誤：${res.status}`);
    fill.style.width = '60%';

    const files = await res.json();
    photos = files
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    fill.style.width = '100%';

    if (!photos.length) {
      container.innerHTML = '<p class="status">暫無照片</p>';
      return;
    }

    currentIndex = 0;
    renderPhoto();
    updateNav();
    bar.style.display = 'none';

  } catch (err) {
    container.innerHTML = `<p class="status">載入失敗：${err.message}</p>`;
    console.error(err);
  }
}

/* ========= 渲染照片 ========= */
function renderPhoto() {
  const p = photos[currentIndex];
  const container = document.getElementById('photo-container');
  const info = document.getElementById('photo-info');
  const bar = document.getElementById('progress-bar');
  const fill = document.getElementById('progress-fill');

  container.innerHTML = '';
  bar.style.display = 'block';
  fill.style.width = '0%';

  const img = new Image();
  img.onload = () => {
    fill.style.width = '100%';
    container.appendChild(img);
    setTimeout(() => bar.style.display = 'none', 300);
  };
  img.onerror = () => {
    container.innerHTML = '<p class="status">圖片載入失敗</p>';
    bar.style.display = 'none';
  };
  img.addEventListener('progress', e => {
    if (e.lengthComputable) fill.style.width = `${(e.loaded / e.total) * 100}%`;
  });

  img.src = `${CDN}/${encodeURIComponent(p.name)}`;
  img.alt = `澳門街道照片 — ${p.name}`;
  img.loading = 'eager';
  info.textContent = `${currentIndex + 1} / ${photos.length} — ${p.name}`;
}

/* ========= 翻页 ========= */
function initNav() {
  document.getElementById('prev-btn').addEventListener('click', () => {
    if (currentIndex > 0) { currentIndex--; renderPhoto(); updateNav(); }
  });
  document.getElementById('next-btn').addEventListener('click', () => {
    if (currentIndex < photos.length - 1) { currentIndex++; renderPhoto(); updateNav(); }
  });
}

function updateNav() {
  document.getElementById('prev-btn').disabled = currentIndex <= 0;
  document.getElementById('next-btn').disabled = currentIndex >= photos.length - 1;
  document.getElementById('photo-counter').textContent = `${currentIndex + 1} / ${photos.length}`;
}

/* ========= PDF ========= */
function initPDF() {
  const { jsPDF } = window.jspdf;

  document.getElementById('pdf-preview').addEventListener('click', () => generatePDF('preview'));
  document.getElementById('pdf-print').addEventListener('click', () => generatePDF('print'));
  document.getElementById('pdf-save').addEventListener('click', () => generatePDF('save'));

  async function generatePDF(mode) {
    const p = photos[currentIndex];
    const title = document.getElementById('pdf-title').value.trim();
    const desc = document.getElementById('pdf-desc').value.trim();
    const status = document.getElementById('pdf-status');

    if (!title) {
      status.textContent = '請輸入標題';
      status.style.color = '#f44336';
      return;
    }

    status.textContent = '生成中...';
    status.style.color = '#666';

    try {
      const blob = await getPhotoBlob(p.name);
      const img = await blobToImg(blob);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const w = pdf.internal.pageSize.getWidth();
      const h = pdf.internal.pageSize.getHeight();

      pdf.setFillColor(250, 250, 250);
      pdf.rect(0, 0, w, h, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(20);
      pdf.setTextColor(51, 51, 51);
      pdf.text(title, w / 2, 20, { align: 'center' });

      const size = w - 40;
      const x = 20;
      const y = (h - size) / 2;
      pdf.addImage(img, 'JPEG', x, y, size, size);

      if (desc) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(12);
        pdf.setTextColor(100, 100, 100);
        pdf.text(pdf.splitTextToSize(desc, w - 40), w / 2, h - 30, { align: 'center' });
      }

      pdf.setFontSize(9);
      pdf.setTextColor(180, 180, 180);
      pdf.text(`© rua-macau · ${p.name} · ${new Date().toLocaleDateString('zh-MO')}`, w / 2, h - 10, { align: 'center' });

      if (mode === 'preview') pdf.output('dataurlnewwindow');
      if (mode === 'print') { pdf.autoPrint(); pdf.output('dataurlnewwindow'); }
      if (mode === 'save') pdf.save(`${title.replace(/[^\w\s-]/g, '_')}.pdf`);

      status.textContent = '✅ 完成';
      status.style.color = '#4CAF50';
    } catch (e) {
      status.textContent = `❌ ${e.message}`;
      status.style.color = '#f44336';
    }
  }
}

/* ========= IndexedDB ========= */
const DB_NAME = 'rua-macau-offline';
const STORE_NAME = 'photos';

function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME, { keyPath: 'name' });
    r.onsuccess = e => resolve(e.target.result);
    r.onerror = () => reject(r.error);
  });
}

async function getCachedPhoto(name) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function savePhoto(name, blob, meta) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ name, blob, meta, t: Date.now() });
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

async function getPhotoBlob(name) {
  const cached = await getCachedPhoto(name);
  if (cached) return cached.blob;
  if (!navigator.onLine) throw new Error('無網絡，且無離線緩存');
  const blob = await downloadPhotoBlob(name);
  await savePhoto(name, blob, { size: blob.size });
  return blob;
}

async function downloadPhotoBlob(name) {
  let url = `${CDN}/${encodeURIComponent(name)}`;
  if (proxyUrl) url = proxyUrl.replace(/\/$/, '') + '/' + url;
  const res = await fetch(url);
  if (!res.ok) throw new Error('下載失敗');
  return await res.blob();
}

function blobToImg(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

/* ========= AI 圖片識別 ========= */
function initAI() {
  const status = document.getElementById('ai-status');
  const result = document.getElementById('ai-result');
  const btn = document.getElementById('ai-recognize');

  // 加载配置
  const cfg = loadAIConfig();
  if (cfg) {
    document.getElementById('ai-url').value = cfg.url;
    document.getElementById('ai-model').value = cfg.model;
    document.getElementById('ai-key').value = '••••••••••••••••';
    btn.disabled = false;
  }

  // 保存
  document.getElementById('ai-save').addEventListener('click', () => {
    const url = document.getElementById('ai-url').value.trim();
    const model = document.getElementById('ai-model').value.trim();
    const key = document.getElementById('ai-key').value.trim();
    if (!url || !model || key === '••••••••••••••••') {
      status.textContent = '❌ 配置不完整';
      status.style.color = '#f44336';
      return;
    }
    saveAIConfig({ url, model, key: encodeKey(key) });
    status.textContent = '✅ 已安全保存';
    status.style.color = '#4CAF50';
    document.getElementById('ai-key').value = '••••••••••••••••';
    btn.disabled = false;
  });

  // 清除
  document.getElementById('ai-clear').addEventListener('click', () => {
    localStorage.removeItem('ai_config');
    document.getElementById('ai-url').value = '';
    document.getElementById('ai-model').value = '';
    document.getElementById('ai-key').value = '';
    btn.disabled = true;
    status.textContent = '已清除';
    status.style.color = '#999';
  });

  // 测试
  document.getElementById('ai-test').addEventListener('click', async () => {
    const cfg = getAIConfig();
    if (!cfg) return;
    status.textContent = '測試中...';
    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 })
      });
      status.textContent = res.ok ? '✅ 連通成功' : `❌ 失敗：${res.status}`;
      status.style.color = res.ok ? '#4CAF50' : '#f44336';
    } catch {
      status.textContent = '❌ 連通失敗';
      status.style.color = '#f44336';
    }
  });

  // 识别
  btn.addEventListener('click', async () => {
    if (!photos.length) {
      status.textContent = '❌ 照片列表不可用';
      status.style.color = '#f44336';
      return;
    }
    const cfg = getAIConfig();
    if (!cfg) return;

    const p = photos[currentIndex];
    status.textContent = '識別中...';
    result.textContent = '';

    try {
      const blob = await getPhotoBlob(p.name);
      const base64 = await blobToBase64(blob);
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
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
      const data = await res.json();
      result.textContent = `📷 ${p.name}\n\n${data.choices?.[0]?.message?.content || '（無回應）'}`;
      status.textContent = '✅ 識別完成';
      status.style.color = '#4CAF50';
    } catch (e) {
      status.textContent = `❌ ${e.message}`;
      status.style.color = '#f44336';
    }
  });
}

/* ========= AI 工具 ========= */
function encodeKey(k) {
  return btoa(AI_ENCRYPT_KEY + '|' + k);
}
function decodeKey(e) {
  try { return atob(e).replace(AI_ENCRYPT_KEY + '|', ''); } catch { return ''; }
}
function saveAIConfig(cfg) {
  localStorage.setItem('ai_config', btoa(JSON.stringify(cfg)));
}
function loadAIConfig() {
  const s = localStorage.getItem('ai_config');
  if (!s) return null;
  try {
    const cfg = JSON.parse(atob(s));
    return { ...cfg, key: decodeKey(cfg.key) };
  } catch { return null; }
}
function getAIConfig() {
  const s = localStorage.getItem('ai_config');
  if (!s) return null;
  try {
    const cfg = JSON.parse(atob(s));
    return { ...cfg, key: decodeKey(cfg.key) };
  } catch { return null; }
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/* ========= 网络状态 ========= */
function initNetworkStatus() {
  const status = document.getElementById('pdf-status');
  window.addEventListener('online', () => {
    status.textContent = '網絡已恢復';
    status.style.color = '#4CAF50';
  });
  window.addEventListener('offline', () => {
    status.textContent = '⚠️ 無網絡，使用離線緩存';
    status.style.color = '#FF9800';
  });
}

/* ========= Utterances ========= */
function initUtterances() {
  const s = document.createElement('script');
  s.src = 'https://utteranc.es/client.js';
  s.setAttribute('repo', `${OWNER}/${REPO}`);
  s.setAttribute('issue-term', 'pathname');
  s.setAttribute('theme', 'github-light');
  s.setAttribute('crossorigin', 'anonymous');
  s.async = true;
  document.getElementById('utterances-container').appendChild(s);
}
