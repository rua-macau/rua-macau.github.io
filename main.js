/* ========= 配置 ========= */
const OWNER = 'rua-macau';
const REPO  = 'Macau-road-s';
const BRANCH = 'main';
const CDN   = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}`;

/* ========= 全局狀態 ========= */
let photos = [];
let currentIndex = 0;
let proxyUrl = localStorage.getItem('proxy_url') || '';

/* ========= 初始化 ========= */
document.addEventListener('DOMContentLoaded', () => {
  // 恢复代理
  if (proxyUrl) {
    document.getElementById('proxy-input').value = proxyUrl;
    document.getElementById('proxy-status').textContent = '已配置代理';
    document.getElementById('proxy-status').style.color = '#4CAF50';
  }

  loadPhotos();

  // 初始化 Utterances
  initUtterances();

  // 绑定事件
  document.getElementById('prev-btn').addEventListener('click', () => {
    if (currentIndex > 0) { currentIndex--; renderPhoto(); updateNav(); }
  });
  document.getElementById('next-btn').addEventListener('click', () => {
    if (currentIndex < photos.length - 1) { currentIndex++; renderPhoto(); updateNav(); }
  });
  document.getElementById('proxy-save').addEventListener('click', saveProxy);
});

/* ========= 代理配置 ========= */
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

  // 验证 URL 格式
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

  // 重新加载
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
    // 构建 API URL（支持代理）
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
  } catch (err) {
    container.innerHTML = `<p class="status">載入失敗：${err.message}</p>`;
    console.error(err);
  } finally {
    setTimeout(() => { bar.style.display = 'none'; }, 500);
  }
}

/* ========= 渲染照片（含真實進度條） ========= */
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
    fill.style.width = '0%';
    container.innerHTML = '<p class="status">圖片載入失敗</p>';
    bar.style.display = 'none';
  };

  // 真实进度（部分浏览器支持）
  img.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      fill.style.width = `${pct}%`;
    }
  });

  img.src = `${CDN}/${encodeURIComponent(p.name)}`;
  img.alt = `澳門街道照片 — ${p.name}`;
  img.loading = 'eager';

  info.textContent = `${currentIndex + 1} / ${photos.length} — ${p.name}`;
}

/* ========= 導航狀態 ========= */
function updateNav() {
  document.getElementById('prev-btn').disabled = currentIndex <= 0;
  document.getElementById('next-btn').disabled = currentIndex >= photos.length - 1;
  document.getElementById('photo-counter').textContent =
    `${currentIndex + 1} / ${photos.length}`;
}

/* ========= Utterances 評論區 ========= */
function initUtterances() {
  const container = document.getElementById('utterances-container');

  const script = document.createElement('script');
  script.src = 'https://utteranc.es/client.js';
  script.setAttribute('repo', `${OWNER}/${REPO}`);
  script.setAttribute('issue-term', 'pathname');
  script.setAttribute('theme', 'github-light');
  script.setAttribute('crossorigin', 'anonymous');
  script.async = true;

  container.appendChild(script);
}
