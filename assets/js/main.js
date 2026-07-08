/* =========================================================
   rua-macau · 澳门街道照片档案 · 离线安全版
   ========================================================= */

const OWNER = 'rua-macau';
const REPO  = 'Macau-road-s';
const BRANCH = 'main';
const CDN   = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}`;

let photos = [];
let currentIndex = 0;
let cachedPhotos = new Set(); // ✅ 已缓存的照片名
let proxyUrl = localStorage.getItem('proxy_url') || '';

document.addEventListener('DOMContentLoaded', async () => {
  initProxy();
  await loadPhotosSafe();
  initNav();
  initArchive();
  initNetworkStatus();
  initUtterances();
  await updateCachedPhotos(); // ✅ 初始化缓存索引
  updateNavButtons();         // ✅ 初始化按钮状态
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

/* ========= 照片列表 ========= */
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
    savePhotoToCache(p.name, img.src);
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

/* ========= 翻页（受缓存限制） ========= */
function initNav() {
  document.getElementById('prev-btn').addEventListener('click', async () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderPhoto();
      updateNav();
      await updateCachedPhotos();
      updateNavButtons();
    }
  });

  document.getElementById('next-btn').addEventListener('click', async () => {
    if (currentIndex < photos.length - 1) {
      // ✅ 离线时：只能翻到已缓存的
      const nextPhoto = photos[currentIndex + 1];
      const isCached = await isPhotoCached(nextPhoto.name);
      if (!navigator.onLine && !isCached) {
        setOfflineWarning('此照片未緩存，請聯網後再瀏覽');
        return;
      }
      currentIndex++;
      renderPhoto();
      updateNav();
      await updateCachedPhotos();
      updateNavButtons();
    }
  });
}

function updateNav() {
  document.getElementById('prev-btn').disabled = currentIndex <= 0;
  document.getElementById('photo-counter').textContent =
    `${currentIndex + 1} / ${photos.length}`;
}

/* ✅ 根据缓存状态更新按钮 */
function updateNavButtons() {
  const nextBtn = document.getElementById('next-btn');
  const prevBtn = document.getElementById('prev-btn');

  // 上一张：只要不是第一张，就允许（因为当前一定已缓存）
  prevBtn.disabled = currentIndex <= 0;

  // 下一张：必须已缓存
  const nextPhoto = photos[currentIndex + 1];
  if (!nextPhoto) {
    nextBtn.disabled = true;
    return;
  }

  isPhotoCached(nextPhoto.name).then(cached => {
    nextBtn.disabled = !cached && !navigator.onLine;
  });
}

/* ========= Cache Storage 查询 ========= */
async function updateCachedPhotos() {
  const cache = await caches.open('rua-macau-95');
  const keys = await cache.keys();
  cachedPhotos.clear();
  keys.forEach(req => {
    const name = req.url.split('/').pop();
    cachedPhotos.add(name);
  });
}

async function isPhotoCached(name) {
  return cachedPhotos.has(name);
}

/* ========= IndexedDB 缓存（备用） ========= */
const DB_NAME = 'rua-macau-offline';
const STORE_NAME = 'photos';

async function savePhotoToCache(name, url) {
  try {
    const cache = await caches.open('rua-macau-95');
    await cache.add(url);
    cachedPhotos.add(name);
    updateNavButtons();
  } catch {}
}

/* ========= MHT 归档 ========= */
function initArchive() {
  document.getElementById('save-mht').addEventListener('click', generateMHT);
}

async function generateMHT() {
  const p = photos[currentIndex];
  const title = document.getElementById('archive-title').value.trim();
  const desc = document.getElementById('archive-desc').value.trim();
  const status = document.getElementById('archive-status');

  if (!title) {
    status.textContent = '請輸入標題';
    status.style.color = '#f44336';
    return;
  }

  status.textContent = '生成 MHT 離線檔案中...';
  status.style.color = '#666';

  try {
    const blob = await getPhotoBlob(p.name);
    const base64 = await blobToBase64(blob);
    const boundary = '----=_MHT_' + Date.now();
    const filename = p.name.replace(/[^\w\s.-]/g, '_');

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
      base64.match(/.{1,76}/g).join('\r\n'),
      '',
      `--${boundary}--`
    ].join('\r\n');

    const mhtBlob = new Blob([mht], { type: 'message/rfc822' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(mhtBlob);
    a.download = `${title.replace(/[^\w\s-]/g, '_')}.mht`;
    a.click();
    URL.revokeObjectURL(a.href);

    status.textContent = '✅ MHT 離線檔案已保存';
    status.style.color = '#4CAF50';
  } catch (e) {
    status.textContent = `❌ ${e.message}`;
    status.style.color = '#f44336';
  }
}

/* ========= 网络状态 ========= */
function initNetworkStatus() {
  const status = document.getElementById('archive-status');
  window.addEventListener('online', () => {
    status.textContent = '網絡已恢復';
    status.style.color = '#4CAF50';
    updateNavButtons();
  });
  window.addEventListener('offline', () => {
    status.textContent = '⚠️ 無網絡，僅可瀏覽已緩存照片';
    status.style.color = '#FF9800';
    updateNavButtons();
  });
}

function setOfflineWarning(msg) {
  const status = document.getElementById('archive-status');
  status.textContent = msg;
  status.style.color = '#FF9800';
}

/* ========= 工具 ========= */
async function getPhotoBlob(name) {
  const cache = await caches.open('rua-macau-95');
  const match = await cache.match(`${CDN}/${encodeURIComponent(name)}`);
  if (match) return await match.blob();

  if (!navigator.onLine) throw new Error('無網絡，且照片未緩存');

  const res = await fetch(`${CDN}/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error('下載失敗');
  return await res.blob();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result.split(',')[1]);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
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
