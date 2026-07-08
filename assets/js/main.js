/* =========================================================
   rua-macau · 澳门街道照片档案 · 真实性检测版
   ========================================================= */

const OWNER = 'rua-macau';
const REPO  = 'Macau-road-s';
const BRANCH = 'main';
const CDN   = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}`;

let photos = [];
let currentIndex = 0;
let cachedPhotos = new Set();
let proxyUrl = '';
let proxyVerified = false;
let proxyInitialized = false;

/* ========= 启动 ========= */
document.addEventListener('DOMContentLoaded', async () => {
  initProxy();
  await loadPhotosSafe();
  initNav();
  initArchive();
  initNetworkStatus();
  initUtterances();
  await updateCachedPhotos();
  updateNavButtons();
});

/* ========= Proxy（强制验证 + 防死锁） ========= */
function initProxy() {
  if (proxyInitialized) return;
  proxyInitialized = true;

  const input  = document.getElementById('proxy-input');
  const status  = document.getElementById('proxy-status');
  const btn    = document.getElementById('proxy-save');

  if (!input || !status || !btn) return;

  // ✅ 初始化状态
  const saved = localStorage.getItem('proxy_url');
  if (saved === null) {
    proxyUrl = '';
    proxyVerified = true;
    input.value = '';
    status.textContent = '直连模式';
    status.style.color = '#999';
  } else {
    proxyUrl = saved;
    proxyVerified = false;
    input.value = saved;
    status.textContent = '代理待验证';
    status.style.color = '#FF9800';
  }

  btn.addEventListener('click', async () => {
    const val = input.value.trim();

    // ✅ 清空 → 回到直连
    if (!val) {
      localStorage.removeItem('proxy_url');
      proxyUrl = '';
      proxyVerified = true;
      status.textContent = '已清除代理（直連模式）';
      status.style.color = '#999';
      updateNavButtons();
      return;
    }

    // ✅ 第一层：协议强制校验
    if (!isValidProxyUrl(val)) {
      status.textContent = '❌ 代理必須以 http:// 或 https:// 開頭';
      status.style.color = '#f44336';
      proxyVerified = false;
      updateNavButtons();
      return;
    }

    // ✅ 第二层：网络可达性
    status.textContent = '驗證代理中...';
    status.style.color = '#666';

    const ok = await verifyProxy(val);
    if (!ok) {
      status.textContent = '❌ 代理無法連接 GitHub（地址錯誤或網絡受限）';
      status.style.color = '#f44336';
      proxyVerified = false;
      updateNavButtons();
      return;
    }

    // ✅ 验证通过
    localStorage.setItem('proxy_url', val);
    proxyUrl = val;
    proxyVerified = true;
    status.textContent = '✅ 代理已驗證並保存';
    status.style.color = '#4CAF50';
    updateNavButtons();
  });
}

/* ========= 协议校验（不可绕过） ========= */
function isValidProxyUrl(value) {
  if (!value) return true; // 空 = 直连，合法
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/* ========= 网络校验 ========= */
async function verifyProxy(url) {
  try {
    const testUrl = `${url.replace(/\/$/, '')}/https://api.github.com/zen`;
    await fetch(testUrl, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    });
    return true;
  } catch {
    return false;
  }
}

/* ========= 照片列表 ========= */
async function loadPhotosSafe() {
  const container = document.getElementById('photo-container');
  container.innerHTML = '<p class="status">載入中...</p>';

  try {
    let url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
    if (proxyVerified && proxyUrl) {
      url = proxyUrl.replace(/\/$/, '') + '/' + url;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`API ${res.status}`);

    const files = await res.json();
    if (!Array.isArray(files)) throw new Error('返回格式錯誤');

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
  } catch (err) {
    container.innerHTML = `<p class="status">載入失敗：${err.message}</p>`;
  }
}

/* ========= 渲染照片 ========= */
function renderPhoto() {
  const p = photos[currentIndex];
  const container = document.getElementById('photo-container');
  const info = document.getElementById('photo-info');

  container.innerHTML = '';
  const img = new Image();
  img.src = `${CDN}/${encodeURIComponent(p.name)}`;
  img.alt = `澳門街道照片 — ${p.name}`;
  img.loading = 'eager';
  img.onload = () => cachePhoto(p.name, img.src);
  container.appendChild(img);
  info.textContent = `${currentIndex + 1} / ${photos.length} — ${p.name}`;
}

/* ========= 翻页（严格受控） ========= */
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
    if (currentIndex >= photos.length - 1) return;

    const next = photos[currentIndex + 1];
    const cached = await isPhotoCached(next.name);

    // ✅ 已缓存 → 随便翻
    if (cached) {
      currentIndex++;
      renderPhoto();
      updateNav();
      await updateCachedPhotos();
      updateNavButtons();
      return;
    }

    // ❌ 未缓存 + 离线 → 禁止
    if (!navigator.onLine) {
      setWarning('離線狀態，此照片未緩存');
      return;
    }

    // ❌ 未缓存 + 在线 + 代理未验证 → 禁止
    if (!proxyVerified) {
      setWarning('代理未驗證，無法加載新照片');
      return;
    }

    // ✅ 未缓存 + 在线 + 代理有效 → 允许
    currentIndex++;
    renderPhoto();
    updateNav();
    await updateCachedPhotos();
    updateNavButtons();
  });
}

function updateNav() {
  document.getElementById('prev-btn').disabled = currentIndex <= 0;
  document.getElementById('photo-counter').textContent =
    `${currentIndex + 1} / ${photos.length}`;
}

function updateNavButtons() {
  const nextBtn = document.getElementById('next-btn');
  const prevBtn = document.getElementById('prev-btn');

  prevBtn.disabled = currentIndex <= 0;

  if (currentIndex >= photos.length - 1) {
    nextBtn.disabled = true;
    return;
  }

  isPhotoCached(photos[currentIndex + 1].name).then(cached => {
    if (cached) {
      nextBtn.disabled = false;
      return;
    }
    // 未缓存：在线 + 已验证才能翻
    nextBtn.disabled = !navigator.onLine || !proxyVerified;
  });
}

/* ========= Cache Storage ========= */
async function updateCachedPhotos() {
  try {
    const cache = await caches.open('rua-macau-95');
    const keys = await cache.keys();
    cachedPhotos.clear();
    keys.forEach(k => cachedPhotos.add(k.url.split('/').pop()));
  } catch {}
}

async function isPhotoCached(name) {
  return cachedPhotos.has(name);
}

async function cachePhoto(name, url) {
  try {
    const cache = await caches.open('rua-macau-95');
    await cache.add(url);
    cachedPhotos.add(name);
    updateNavButtons();
  } catch {}
}

/* ========= MHT 归档 ========= */
function initArchive() {
  const btn = document.getElementById('save-mht');
  if (btn) btn.addEventListener('click', generateMHT);
}

async function generateMHT() {
  const p = photos[currentIndex];
  const title = document.getElementById('archive-title').value.trim();
  const desc  = document.getElementById('archive-desc').value.trim();
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
      `Content-Type: multipart/related; boundary="${boundary}"`, '',
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      'Content-Transfer-Encoding: quoted-printable', '',
      '<!DOCTYPE html>',
      `<html lang="zh-MO">`,
      `<head><meta charset="UTF-8"><title>${title}</title>`,
      `<style>body{font-family:system-ui;max-width:900px;margin:0 auto;padding:20px;}`,
      `h1{font-size:1.8em;margin-bottom:8px;border-bottom:2px solid #333;padding-bottom:8px;}`,
      `p{color:#555;margin-bottom:24px;}`,
      `img{display:block;max-width:100%;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.12);}`,
      `hr{border:none;border-top:1px solid #ddd;margin:40px 0 16px;}`,
      `.footer{color:#999;font-size:12px;text-align:center;}</style>`,
      `</head><body>`,
      `<h1>${title}</h1>`,
      desc ? `<p>${desc}</p>` : '',
      `<img src="cid:photo">`,
      `<hr><p class="footer">© rua-macau · ${filename} · ${new Date().toLocaleDateString('zh-MO')}</p>`,
      '</body></html>', '',
      `--${boundary}`,
      'Content-Type: image/jpeg',
      'Content-ID: <photo>',
      'Content-Transfer-Encoding: base64', '',
      base64.match(/.{1,76}/g).join('\r\n'), '',
      `--${boundary}--`
    ].join('\r\n');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([mht], { type: 'message/rfc822' }));
    a.download = `${title.replace(/[^\w\s-]/g, '_')}.mht`;
    a.click();
    URL.revokeObjectURL(a.href);

    status.textContent = '✅ MHT 離線檔案已保存（圖片已內嵌）';
    status.style.color = '#4CAF50';
  } catch (e) {
    status.textContent = `❌ ${e.message}`;
    status.style.color = '#f44336';
  }
}

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

/* ========= 网络状态 ========= */
function initNetworkStatus() {
  const status = document.getElementById('archive-status');
  window.addEventListener('online', () => {
    status.textContent = '網絡已恢復';
    status.style.color = '#4CAF50';
    updateNavButtons();
  });
  window.addEventListener('offline', () => {
    status.textContent = '⚠️ 離線模式，僅可瀏覽已緩存照片';
    status.style.color = '#FF9800';
    updateNavButtons();
  });
}

function setWarning(msg) {
  const status = document.getElementById('archive-status');
  status.textContent = msg;
  status.style.color = '#FF9800';
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
