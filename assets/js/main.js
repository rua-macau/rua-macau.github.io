/* =========================================================
   rua-macau · 澳门街道照片档案 · 最终封板版
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

  const input = document.getElementById('proxy-input');
  const status = document.getElementById('proxy-status');
  const btn = document.getElementById('proxy-save');

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

    // 清空 → 回到直连
    if (!val) {
      localStorage.removeItem('proxy_url');
      proxyUrl = '';
      proxyVerified = true;
      status.textContent = '已清除代理（直连模式）';
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
  });
}

/* ========= 代理验证 ========= */
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

/* ========= 翻页（严格受控） ========= */
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

    if (cached) {
      currentIndex++;
      renderPhoto();
      updateNav();
      await updateCachedPhotos();
      updateNavButtons();
      return;
    }

    if (!navigator.onLine) {
      setWarning('离线状态，此照片未缓存');
      return;
    }

    if (!proxyVerified) {
      setWarning('代理未验证，无法加载新照片');
      return;
    }

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

  if (currentIndex >= photos.length - 1) {
    nextBtn.disabled = true;
    return;
  }

  isPhotoCached(photos[currentIndex + 1].name).then(cached => {
    if (cached) {
      nextBtn.disabled = false;
      return;
    }
    if (!navigator.onLine) {
      nextBtn.disabled = true;
      return;
    }
    const isDirect = proxyUrl === '';
    nextBtn.disabled = !(proxyVerified && (isDirect || proxyUrl));
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
  const btn = document.getElementById('save-mht');
  if (btn) btn.onclick = generateMHT;
}

async function generateMHT() {
  const p = photos[currentIndex];
  const title = document.getElementById('archive-title').value.trim();
  if (!title) {
    alert('请输入标题');
    return;
  }

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
  return new Promise(resolve => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result.split(',')[1]);
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
