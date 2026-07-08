/* main.js · 核心逻辑 · 最终无坑版 */

/* ========= 配置 ========= */
const OWNER = 'rua-macau';
const REPO  = 'Macau-road-s';
const BRANCH = 'main';
const CDN   = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}`;

/* ========= 全局狀態（AI 模块会读取这些变量） ========= */
let photos = [];
let currentIndex = 0;
let proxyUrl = localStorage.getItem('proxy_url') || '';

/* ========= 初始化 ========= */
document.addEventListener('DOMContentLoaded', async () => {
  // Proxy
  if (proxyUrl) {
    document.getElementById('proxy-input').value = proxyUrl;
    document.getElementById('proxy-status').textContent = '已配置代理';
    document.getElementById('proxy-status').style.color = '#4CAF50';
  }

  await loadPhotos();

  // Proxy 保存
  document.getElementById('proxy-save').addEventListener('click', saveProxy);

  // 翻頁
  document.getElementById('prev-btn').addEventListener('click', () => {
    if (currentIndex > 0) { currentIndex--; renderPhoto(); updateNav(); }
  });
  document.getElementById('next-btn').addEventListener('click', () => {
    if (currentIndex < photos.length - 1) { currentIndex++; renderPhoto(); updateNav(); }
  });

  // 网络状态
  window.addEventListener('online', () => {
    document.getElementById('pdf-status').textContent = '網絡已恢復';
    document.getElementById('pdf-status').style.color = '#4CAF50';
  });
  window.addEventListener('offline', () => {
    document.getElementById('pdf-status').textContent = '⚠️ 無網絡，使用離線緩存';
    document.getElementById('pdf-status').style.color = '#FF9800';
  });

  // PDF 打印
  document.getElementById('pdf-preview').addEventListener('click', () => generatePDF('preview'));
  document.getElementById('pdf-print').addEventListener('click', () => generatePDF('print'));
  document.getElementById('pdf-save').addEventListener('click', () => generatePDF('save'));

  // 初始化評論
  initUtterances();
});

/* ========= Proxy ========= */
function saveProxy() {
  const input = document.getElementById('proxy-input').value.trim();
  const status = document.getElementById('proxy-status');

  if (!input) {
    localStorage.removeItem('proxy_url');
    proxyUrl = '';
    status.textContent = '已清除代理';
    status.style.color = '#999';
    return;
  }

  try { new URL(input); }
  catch {
    status.textContent = '格式錯誤，請輸入有效 URL';
    status.style.color = '#f44336';
    return;
  }

  localStorage.setItem('proxy_url', input);
  proxyUrl = input;
  status.textContent = '保存成功';
  status.style.color = '#4CAF50';

  loadPhotos();
}

/* ========= 照片加載 ========= */
async function loadPhotos() {
  const bar  = document.getElementById('progress-bar');
  const fill = document.getElementById('progress-fill');
  const container = document.getElementById('photo-container');

  container.innerHTML = '<p class="status">載入照片列表中...</p>';
  bar.style.display = 'block';
  fill.style.width = '10%';

  try {
    let apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
    if (proxyUrl) {
      apiUrl = proxyUrl.replace(/\/$/, '') + '/' + apiUrl;
    }

    fill.style.width = '30%';
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error(`API 錯誤：${res.status}`);
    fill.style.width = '60%';

    const files = await res.json();
    fill.style.width = '80%';

    photos = files
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    fill.style.width = '100%';

    if (photos.length === 0) {
      container.innerHTML = '<p class="status">暫無照片</p>';
      return;
    }

    currentIndex = 0;
    renderPhoto();
    updateNav();

    // ✅✅✅ 关键修复：通知 AI 模块照片已就绪 ✅✅✅
    window.dispatchEvent(new CustomEvent('photosReady', {
      detail: { count: photos.length }
    }));

  } catch (err) {
    container.innerHTML = `<p class="status">載入失敗：${err.message}</p>`;
    console.error(err);
  } finally {
    setTimeout(() => { bar.style.display = 'none'; }, 500);
  }
}

/* ========= 渲染照片 ========= */
function renderPhoto() {
  const p = photos[currentIndex];
  const container = document.getElementById('photo-container');
  const info = document.getElementById('photo-info');
  const bar  = document.getElementById('progress-bar');
  const fill = document.getElementById('progress-fill');

  container.innerHTML = '';
  bar.style.display = 'block';
  fill.style.width = '0%';

  const img = new Image();
  img.onload = () => {
    fill.style.width = '100%';
    container.appendChild(img);
    setTimeout(() => { bar.style.display = 'none'; }, 300);
  };
  img.onerror = () => {
    container.innerHTML = '<p class="status">圖片載入失敗</p>';
    bar.style.display = 'none';
  };
  img.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      fill.style.width = `${(e.loaded / e.total) * 100}%`;
    }
  });

  img.src = `${CDN}/${encodeURIComponent(p.name)}`;
  img.alt = `澳門街道照片 — ${p.name}`;
  img.loading = 'eager';
  info.textContent = `${currentIndex + 1} / ${photos.length} — ${p.name}`;
}

/* ========= 導航 ========= */
function updateNav() {
  document.getElementById('prev-btn').disabled = currentIndex <= 0;
  document.getElementById('next-btn').disabled = currentIndex >= photos.length - 1;
  document.getElementById('photo-counter').textContent =
    `${currentIndex + 1} / ${photos.length}`;
}

/* ========= PDF 列印（離線優先） ========= */
const { jsPDF } = window.jspdf;

async function generatePDF(mode) {
  const p = photos[currentIndex];
  const title = document.getElementById('pdf-title').value.trim();
  const desc  = document.getElementById('pdf-desc').value.trim();
  const status = document.getElementById('pdf-status');

  if (!title) {
    status.textContent = '請輸入標題';
    status.style.color = '#f44336';
    return;
  }

  status.textContent = '正在生成 PDF...';
  status.style.color = '#666';

  try {
    let img;
    let blobToCache = null;

    // 1. 嘗試從 IndexedDB 讀取緩存
    const cached = await getCachedPhoto(p.name);
    if (cached) {
      status.textContent = '使用離線緩存生成 PDF...';
      img = new Image();
      img.src = URL.createObjectURL(cached.blob);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
    } else {
      // 2. 無緩存，嘗試聯網下載
      if (!navigator.onLine) {
        throw new Error('無網絡，且無離線緩存');
      }
      status.textContent = '聯網下載照片...';
      blobToCache = await downloadPhotoBlob(p.name);
      img = new Image();
      img.src = URL.createObjectURL(blobToCache);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
    }

    // 3. 生成 PDF（正方形）
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();

    // 背景
    pdf.setFillColor(250, 250, 250);
    pdf.rect(0, 0, w, h, 'F');

    // 標題
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.setTextColor(51, 51, 51);
    pdf.text(title, w / 2, 20, { align: 'center' });

    // 正方形照片
    const size = w - 40;
    const x = 20;
    const y = (h - size) / 2;
    pdf.addImage(img, 'JPEG', x, y, size, size);

    // 描述
    if (desc) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12);
      pdf.setTextColor(100, 100, 100);
      const lines = pdf.splitTextToSize(desc, w - 40);
      pdf.text(lines, w / 2, h - 30, { align: 'center' });
    }

    // 頁尾
    pdf.setFontSize(9);
    pdf.setTextColor(180, 180, 180);
    pdf.text(
      `© rua-macau · ${p.name} · ${new Date().toLocaleDateString('zh-MO')}`,
      w / 2, h - 10, { align: 'center' }
    );

    // 4. 緩存照片
    if (blobToCache) {
      await savePhoto(p.name, blobToCache, { size: blobToCache.size, name: p.name });
      status.textContent = '✅ 已緩存並生成 PDF';
    } else {
      status.textContent = '✅ PDF 已生成（離線）';
    }
    status.style.color = '#4CAF50';

    // 5. 執行模式
    switch (mode) {
      case 'preview': pdf.output('dataurlnewwindow'); break;
      case 'print': pdf.autoPrint(); pdf.output('dataurlnewwindow'); break;
      case 'save': pdf.save(`${title.replace(/[^\w\s-]/g, '_')}.pdf`); break;
    }

    URL.revokeObjectURL(img.src);

  } catch (err) {
    if (err.message.includes('無網絡')) {
      status.textContent = '❌ 無網絡，且無離線緩存';
    } else {
      status.textContent = '❌ 生成失敗';
    }
    status.style.color = '#f44336';
    console.error(err);
  }
}

/* ========= 下載照片 Blob ========= */
async function downloadPhotoBlob(name) {
  let url = `${CDN}/${encodeURIComponent(name)}`;
  if (proxyUrl) {
    url = proxyUrl.replace(/\/$/, '') + '/' + url;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('下載失敗');
  return await res.blob();
}

/* ========= IndexedDB 封裝 ========= */
const DB_NAME = 'rua-macau-offline';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

let db = null;

export async function openDB() {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_NAME)) {
        d.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

export async function savePhoto(name, blob, meta) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ name, blob, meta, downloadedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedPhoto(name) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE_NAME).objectStore(STORE_NAME).get(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
