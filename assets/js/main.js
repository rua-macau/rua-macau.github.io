/* main.js */

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
  // Proxy
  if (proxyUrl) {
    document.getElementById('proxy-input').value = proxyUrl;
    document.getElementById('proxy-status').textContent = '已配置代理';
    document.getElementById('proxy-status').style.color = '#4CAF50';
  }

  loadPhotos();

  // PDF
  document.getElementById('pdf-preview').addEventListener('click', () => generatePDF('preview'));
  document.getElementById('pdf-print').addEventListener('click', () => generatePDF('print'));
  document.getElementById('pdf-save').addEventListener('click', () => generatePDF('save'));

  // Proxy 保存
  document.getElementById('proxy-save').addEventListener('click', saveProxy);

  // 翻頁
  document.getElementById('prev-btn').addEventListener('click', () => {
    if (currentIndex > 0) { currentIndex--; renderPhoto(); updateNav(); }
  });
  document.getElementById('next-btn').addEventListener('click', () => {
    if (currentIndex < photos.length - 1) { currentIndex++; renderPhoto(); updateNav(); }
  });
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

/* ========= PDF 列印 ========= */
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
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `${CDN}/${encodeURIComponent(p.name)}`;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();

    pdf.setFillColor(250, 250, 250);
    pdf.rect(0, 0, w, h, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.setTextColor(51, 51, 51);
    pdf.text(title, w / 2, 20, { align: 'center' });

    const imgW = w - 40;
    const imgH = imgW * (img.height / img.width);
    const x = 20;
    const y = 30;
    pdf.addImage(img, 'JPEG', x, y, imgW, Math.min(imgH, h - 80));

    if (desc) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12);
      pdf.setTextColor(100, 100, 100);
      const lines = pdf.splitTextToSize(desc, w - 40);
      pdf.text(lines, w / 2, h - 30, { align: 'center' });
    }

    pdf.setFontSize(9);
    pdf.setTextColor(180, 180, 180);
    pdf.text(
      `© rua-macau · ${p.name} · ${new Date().toLocaleDateString('zh-MO')}`,
      w / 2, h - 10, { align: 'center' }
    );

    switch (mode) {
      case 'preview': pdf.output('dataurlnewwindow'); break;
      case 'print': pdf.autoPrint(); pdf.output('dataurlnewwindow'); break;
      case 'save': pdf.save(`${title.replace(/[^\w\s-]/g, '_')}.pdf`); break;
    }

    status.textContent = '✅ PDF 已生成';
    status.style.color = '#4CAF50';
  } catch (err) {
    status.textContent = '❌ 生成失敗';
    status.style.color = '#f44336';
    console.error(err);
  }
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

// 初始化評論
initUtterances();
