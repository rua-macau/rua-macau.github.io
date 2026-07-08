/* =========================================================
   rua-macau · 澳门街道照片档案 · 强制代理验证版
   ========================================================= */

const OWNER = 'rua-macau';
const REPO  = 'Macau-road-s';
const BRANCH = 'main';
const CDN   = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}`;

let photos = [];
let currentIndex = 0;
let cachedPhotos = new Set();
let proxyUrl = '';              // ✅ 默认空
let proxyVerified = true;      // ✅ 是否已验证

document.addEventListener('DOMContentLoaded', async () => {
  loadProxyFromStorage();
  await loadPhotosSafe();
  initNav();
  initArchive();
  initNetworkStatus();
  initUtterances();
  await updateCachedPhotos();
  updateNavButtons();
});

/* ========= Proxy ========= */
function loadProxyFromStorage() {
  const saved = localStorage.getItem('proxy_url');
  if (saved) {
    proxyUrl = saved;
    proxyVerified = false; // ✅ 重启后视为未验证
  }
}

async function verifyProxy(url) {
  const testUrl = `${url.replace(/\/$/, '')}/https://api.github.com/zen`;
  try {
    const res = await fetch(testUrl, {
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

function initProxy() {
  const input = document.getElementById('proxy-input');
  const status = document.getElementById('proxy-status');
  const btn = document.getElementById('proxy-save');

  input.value = proxyUrl;

  if (proxyUrl && proxyVerified) {
    status.textContent = '代理已验证';
    status.style.color = '#4CAF50';
  }

  btn.onclick = async () => {
    const val = input.value.trim();

    // ✅ 清空代理
    if (!val) {
      localStorage.removeItem('proxy_url');
      proxyUrl = '';
      proxyVerified = false;
      status.textContent = '已清除代理';
      status.style.color = '#999';
      updateNavButtons();
      return;
    }

    status.textContent = '验证代理中...';
    status.style.color = '#666';

    const ok = await verifyProxy(val);
    if (!ok) {
      status.textContent = '❌ 代理无效，无法保存';
      status.style.color = '#f44336';
      proxyVerified = false;
      updateNavButtons();
      return;
    }

    localStorage.setItem('proxy_url', val);
    proxyUrl = val;
    proxyVerified = true;
    status.textContent = '✅ 代理已验证并保存';
    status.style.color = '#4CAF50';
    updateNavButtons();
  };
}

/* ========= 照片列表 ========= */
async function loadPhotosSafe() {
  const container = document.getElementById('photo-container');
  container.innerHTML = '<p class="status">载入中...</p>';

  try {
    let url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
    if (proxyVerified && proxyUrl) {
      url = proxyUrl.replace(/\/$/, '') + '/' + url;
    }

    const res = await fetch(url);
    const files = await res.json();

    photos = files
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    currentIndex = 0;
    renderPhoto();
    updateNav();
  } catch {
    container.innerHTML = '<p class="status">载入失败</p>';
  }
}

/* ========= 渲染 ========= */
function renderPhoto() {
  const p = photos[currentIndex];
  const container = document.getElementById('photo-container');
  const info = document.getElementById('photo-info');

  container.innerHTML = '';
  const img = new Image();
  img.src = `${CDN}/${encodeURIComponent(p.name)}`;
  img.alt = p.name;
  img.onload = () => cachePhoto(p.name, img.src);
  container.appendChild(img);
  info.textContent = `${currentIndex + 1} / ${photos.length} — ${p.name}`;
}

/* ========= 翻页（核心限制） ========= */
function initNav() {
  document.getElementById('prev-btn').onclick = async () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderPhoto();
      updateNav();
      await updateCachedPhotos();
      updateNavButtons();
    }
  };

  document.getElementById('next-btn').onclick = async () => {
    if (currentIndex >= photos.length - 1) return;

    const next = photos[currentIndex + 1];
    const cached = await isPhotoCached(next.name);

    // ✅ 已缓存，随便翻
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
      setWarning('离线状态，此照片未缓存');
      return;
    }

    // ❌ 未缓存 + 在线 + 代理无效 → 禁止
    if (!proxyVerified) {
      setWarning('代理未验证，无法加载新照片');
      return;
    }

    // ✅ 未缓存 + 在线 + 代理有效 → 允许
    currentIndex++;
    renderPhoto();
    updateNav();
    await updateCachedPhotos();
    updateNavButtons();
  };
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

  // ✅ 下一张按钮的生死逻辑
  if (currentIndex >= photos.length - 1) {
    nextBtn.disabled = true;
    return;
  }

  isPhotoCached(photos[currentIndex + 1].name).then(cached => {
    if (cached) {
      nextBtn.disabled = false;
    } else {
      // 未缓存时，必须在线 + 代理有效
      nextBtn.disabled = !navigator.onLine || !proxyVerified;
    }
  });
}

/* ========= Cache ========= */
async function updateCachedPhotos() {
  const cache = await caches.open('rua-macau-95');
  const keys = await cache.keys();
  cachedPhotos.clear();
  keys.forEach(k => cachedPhotos.add(k.url.split('/').pop()));
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

/* ========= 网络状态 ========= */
function initNetworkStatus() {
  const status = document.getElementById('archive-status');
  window.addEventListener('online', () => {
    status.textContent = '网络已恢复';
    status.style.color = '#4CAF50';
    updateNavButtons();
  });
  window.addEventListener('offline', () => {
    status.textContent = '离线模式，仅可浏览已缓存照片';
    status.style.color = '#FF9800';
    updateNavButtons();
  });
}

function setWarning(msg) {
  const status = document.getElementById('archive-status');
  status.textContent = msg;
  status.style.color = '#FF9800';
}

/* ========= MHT ========= */
function initArchive() {
  document.getElementById('save-mht').onclick = generateMHT;
}

async function generateMHT() {
  const p = photos[currentIndex];
  const title = document.getElementById('archive-title').value.trim();
  if (!title) return alert('请输入标题');

  const blob = await (await fetch(`${CDN}/${encodeURIComponent(p.name)}`)).blob();
  const base64 = await blobToBase64(blob);
  const boundary = '----=_MHT_' + Date.now();

  const mht = [
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${boundary}"`, '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable', '',
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head>`,
    `<body><h1>${title}</h1><img src="cid:photo"></body></html>`, '',
    `--${boundary}`,
    'Content-Type: image/jpeg',
    'Content-ID: <photo>',
    'Content-Transfer-Encoding: base64', '',
    base64.match(/.{1,76}/g).join('\r\n'), '',
    `--${boundary}--`
  ].join('\r\n');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([mht], { type: 'message/rfc822' }));
  a.download = `${title}.mht`;
  a.click();
}

function blobToBase64(blob) {
  return new Promise(r => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result.split(',')[1]);
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
