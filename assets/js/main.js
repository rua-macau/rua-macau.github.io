/* =========================================================
   rua-macau · 澳門街道照片檔案 · PDF + MHT 雙模式
   ========================================================= */

const OWNER = 'rua-macau';
const REPO  = 'Macau-road-s';
const BRANCH = 'main';
const CDN   = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}`;

let photos = [];
let currentIndex = 0;
let proxyUrl = localStorage.getItem('proxy_url') || '';

document.addEventListener('DOMContentLoaded', async () => {
  initProxy();
  await loadPhotosSafe();
  initNav();
  initPDF();
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
    const v = input.value.trim();
    if (!v) {
      localStorage.removeItem('proxy_url');
      proxyUrl = '';
      status.textContent = '已清除代理';
      status.style.color = '#999';
      loadPhotosSafe();
      return;
    }
    try { new URL(v); } catch {
      status.textContent = '格式錯誤';
      status.style.color = '#f44336';
      return;
    }
    localStorage.setItem('proxy_url', v);
    proxyUrl = v;
    status.textContent = '保存成功';
    status.style.color = '#4CAF50';
    loadPhotosSafe();
  });
}

/* ========= 照片加載（JSON 防爆） ========= */
async function loadPhotosSafe() {
  const container = document.getElementById('photo-container');
  const bar = document.getElementById('progress-bar');
  const fill = document.getElementById('progress-fill');

  container.innerHTML = '<p class="status">載入照片列表中...</p>';
  bar.style.display = 'block';
  fill.style.width = '10%';

  try {
    let url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
    if (proxyUrl) url = proxyUrl.replace(/\/$/, '') + '/' + url;

    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) throw new Error(`API ${res.status}`);
    if (!res.headers.get('content-type')?.includes('application/json')) {
      throw new Error('非 JSON 響應（代理失效？）');
    }

    const files = JSON.parse(text);
    photos = files
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name));

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
    bar.style.display = 'none';
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
    if (e.lengthComputable) fill.style.width = (e.loaded / e.total) * 100 + '%';
  });

  img.src = `${CDN}/${encodeURIComponent(p.name)}`;
  img.alt = `澳門街道照片 — ${p.name}`;
  img.loading = 'eager';
  info.textContent = `${currentIndex + 1} / ${photos.length} — ${p.name}`;
}

/* ========= 翻頁 ========= */
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

/* ========= PDF + MHT ========= */
function initPDF() {
  const { jsPDF } = window.jspdf;

  document.getElementById('pdf-save-pdf').addEventListener('click', () => generatePDF('pdf'));
  document.getElementById('pdf-save-mht').addEventListener('click', () => generateMHT());
  document.getElementById('pdf-print-page').addEventListener('click', () => window.print());
}

/* ---- 生成 PDF ---- */
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
    pdf.text(
      `© rua-macau · ${p.name} · ${new Date().toLocaleDateString('zh-MO')}`,
      w / 2, h - 10, { align: 'center' }
    );

    pdf.save(`${title.replace(/[^\w\s-]/g, '_')}.pdf`);

    status.textContent = '✅ PDF 已保存，請打開後按 Ctrl+P 列印';
    status.style.color = '#4CAF50';
  } catch (e) {
    status.textContent = `❌ ${e.message}`;
    status.style.color = '#f44336';
  }
}

/* ---- 生成 MHT（MHTML 網頁存檔）---- */
async function generateMHT() {
  const p = photos[currentIndex];
  const title = document.getElementById('pdf-title').value.trim();
  const desc = document.getElementById('pdf-desc').value.trim();
  const status = document.getElementById('pdf-status');

  if (!title) {
    status.textContent = '請輸入標題';
    status.style.color = '#f44336';
    return;
  }

  status.textContent = '生成 MHT 中...';
  status.style.color = '#666';

  try {
    const blob = await getPhotoBlob(p.name);
    const base64 = await new Promise(resolve => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result.split(',')[1]);
      fr.readAsDataURL(blob);
    });

    const now = new Date().toISOString();
    const boundary = '----=_MHT_' + Date.now();
    const filename = p.name.replace(/[^\w\s.-]/g, '_');

    // MHTML 格式
    const mht = [
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      `<!DOCTYPE html>`,
      `<html lang="zh-MO">`,
      `<head><meta charset="UTF-8"><title>${title}</title></head>`,
      `<body style="font-family:system-ui;max-width:900px;margin:0 auto;padding:20px;">`,
      `<h1>${title}</h1>`,
      desc ? `<p style="color:#555;margin-bottom:20px;">${desc}</p>` : '',
      `<img src="cid:photo" style="max-width:100%;border-radius:8px;" />`,
      `<hr><p style="color:#999;font-size:12px;">© rua-macau · ${filename} · ${new Date().toLocaleDateString('zh-MO')}</p>`,
      `</body></html>`,
      '',
      `--${boundary}`,
      'Content-Type: image/jpeg',
      `Content-ID: <photo>`,
      'Content-Transfer-Encoding: base64',
      '',
      base64.match(/.{1,76}/g).join('\r\n'),  // 76 字元換行
      '',
      `--${boundary}--`
    ].join('\r\n');

    const mhtBlob = new Blob([mht], { type: 'message/rfc822' });
    const url = URL.createObjectURL(mhtBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\w\s-]/g, '_')}.mht`;
    a.click();
    URL.revokeObjectURL(url);

    status.textContent = '✅ MHT 已保存，可用瀏覽器直接打開';
    status.style.color = '#4CAF50';
  } catch (e) {
    status.textContent = `❌ ${e.message}`;
    status.style.color = '#f44336';
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

/* ========= 網絡狀態 ========= */
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
