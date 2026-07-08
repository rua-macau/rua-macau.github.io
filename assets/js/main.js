/* main.js */
import { savePhoto, getAllPhotos } from './db.js';

/* ========= 配置 ========= */
const OWNER = 'rua-macau';
const REPO  = 'Macau-road-s';
const BRANCH = 'main';
const CDN   = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}`;

/* ========= 全局狀態 ========= */
let photos = [];
let currentIndex = 0;

/* ========= 初始化 ========= */
document.addEventListener('DOMContentLoaded', async () => {
  initCaptcha();
  await updateFreeSpace();
  await loadPhotos();
  await loadOfflineList();
  initUtterances();
});

/* ========= 照片瀏覽 ========= */
async function loadPhotos() {
  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/`);
    const files = await res.json();
    photos = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name))
                  .sort((a, b) => a.name.localeCompare(b.name));

    if (!photos.length) {
      document.getElementById('photo-container').innerHTML = '<p class="status">暫無照片</p>';
      return;
    }
    currentIndex = 0;
    renderPhoto();
    updateNav();
  } catch {
    document.getElementById('photo-container').innerHTML = '<p class="status">載入失敗</p>';
  }
}

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
    setTimeout(() => { bar.style.display = 'none'; }, 300);
  };
  img.onerror = () => {
    container.innerHTML = '<p class="status">圖片載入失敗</p>';
    bar.style.display = 'none';
  };
  img.src = `${CDN}/${encodeURIComponent(p.name)}`;
  img.alt = p.name;
  info.textContent = `${currentIndex + 1} / ${photos.length} — ${p.name}`;
}

function updateNav() {
  document.getElementById('prev-btn').disabled = currentIndex <= 0;
  document.getElementById('next-btn').disabled = currentIndex >= photos.length - 1;
  document.getElementById('photo-counter').textContent = `${currentIndex + 1} / ${photos.length}`;
}

document.getElementById('prev-btn').onclick = () => {
  if (currentIndex > 0) { currentIndex--; renderPhoto(); updateNav(); }
};
document.getElementById('next-btn').onclick = () => {
  if (currentIndex < photos.length - 1) { currentIndex++; renderPhoto(); updateNav(); }
};

/* ========= 人機驗證 ========= */
function initCaptcha() {
  const box = document.getElementById('captcha-box');
  const question = document.getElementById('captcha-question');
  const result = document.getElementById('captcha-result');
  const control = document.getElementById('download-control');

  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  box.dataset.answer = a + b;
  question.textContent = `${a} + ${b} = ?`;

  document.getElementById('captcha-submit').onclick = () => {
    const answer = parseInt(document.getElementById('captcha-answer').value);
    if (answer === parseInt(box.dataset.answer)) {
      result.textContent = '✅ 驗證通過';
      result.style.color = '#4CAF50';
      box.style.display = 'none';
      control.style.display = 'block';
    } else {
      result.textContent = '❌ 答案錯誤';
      result.style.color = '#f44336';
      document.getElementById('captcha-answer').value = '';
      const na = Math.floor(Math.random() * 9) + 1;
      const nb = Math.floor(Math.random() * 9) + 1;
      box.dataset.answer = na + nb;
      question.textContent = `${na} + ${nb} = ?`;
    }
  };
}

/* ========= 容量檢測 ========= */
async function updateFreeSpace() {
  const el = document.getElementById('free-space');
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const { quota, usage } = await navigator.storage.estimate();
    const freeMB = ((quota - usage) / 1024 / 1024).toFixed(0);
    el.textContent = `${freeMB} MB`;
    const maxCount = Math.min(photos.length, Math.floor((quota - usage) / (2 * 1024 * 1024) * 10));
    document.getElementById('download-count').max = maxCount;
  } else {
    el.textContent = '不支援檢測';
  }
}

/* ========= 離線下載 ========= */
document.getElementById('download-start').onclick = async () => {
  const count = parseInt(document.getElementById('download-count').value);
  const bar = document.getElementById('download-progress-bar');
  const fill = document.getElementById('download-progress-fill');
  const status = document.getElementById('download-status');

  bar.style.display = 'block';
  fill.style.width = '0%';
  status.textContent = '正在下載...';

  let downloaded = 0;
  for (let i = 0; i < Math.min(count, photos.length); i++) {
    const p = photos[i];
    try {
      const blob = await downloadWithProgress(
        `${CDN}/${encodeURIComponent(p.name)}`,
        pct => {
          const totalPct = ((downloaded + pct) / count) * 100;
          fill.style.width = `${Math.min(totalPct, 100)}%`;
        }
      );
      await savePhoto(p.name, blob, { size: blob.size, name: p.name });
      downloaded++;
      status.textContent = `已下載 ${downloaded} / ${count}`;
    } catch {
      status.textContent = `第 ${i + 1} 張下載失敗，跳過`;
    }
  }
  fill.style.width = '100%';
  status.textContent = `✅ 完成！共 ${downloaded} 張已存入離線包`;
  loadOfflineList();
};

function downloadWithProgress(url, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onprogress = e => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = reject;
    xhr.send();
  });
}

/* ========= 離線列表 ========= */
async function loadOfflineList() {
  const el = document.getElementById('offline-list');
  const list = await getAllPhotos();
  if (!list.length) {
    el.innerHTML = '<p class="status">暫無離線照片</p>';
    return;
  }
  el.innerHTML = '<p>已離線緩存：</p>' +
    list.map(p => `<div>📷 ${p.name}（${Math.round(p.meta.size / 1024)} KB）</div>`).join('');
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
