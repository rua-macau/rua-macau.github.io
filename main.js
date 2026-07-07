// ===== 配置 =====
const OWNER = 'rua-macau';
const REPO  = 'Macau-road-s';
const BRANCH = 'main';
const CDN    = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}`;

// GitHub App Client ID（去 GitHub App 設定頁取得）
const CLIENT_ID = 'YOUR_GITHUB_APP_CLIENT_ID';

// ===== 全域狀態 =====
let photos = [];
let currentIndex = 0;
let accessToken = localStorage.getItem('gh_token') || '';
let currentUser = null;

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadPhotos();
  loadComments();
  bindEvents();
});

// ===== 身份驗證 =====
function checkAuth() {
  if (!accessToken) {
    showLoggedOut();
    return;
  }
  // 驗證 token
  fetch('https://api.github.com/user', {
    headers: { Authorization: `token ${accessToken}` }
  }).then(r => {
    if (r.ok) return r.json();
    throw new Error('Token invalid');
  }).then(user => {
    currentUser = user;
    showLoggedIn(user);
  }).catch(() => {
    localStorage.removeItem('gh_token');
    accessToken = '';
    showLoggedOut();
  });
}

function showLoggedIn(user) {
  document.getElementById('login-btn').style.display = 'none';
  document.getElementById('user-info').style.display = 'flex';
  document.getElementById('user-avatar').src = user.avatar_url;
  document.getElementById('user-name').textContent = user.login;
  document.getElementById('upload-form').style.display = 'block';
  document.getElementById('upload-login-hint').style.display = 'none';
  document.getElementById('comment-form').style.display = 'block';
  document.getElementById('comment-login-hint').style.display = 'none';
}

function showLoggedOut() {
  document.getElementById('login-btn').style.display = 'inline-block';
  document.getElementById('user-info').style.display = 'none';
  document.getElementById('upload-form').style.display = 'none';
  document.getElementById('upload-login-hint').style.display = 'block';
  document.getElementById('comment-form').style.display = 'none';
  document.getElementById('comment-login-hint').style.display = 'block';
}

// GitHub App OAuth 登入
document.getElementById('login-btn').addEventListener('click', () => {
  const redirectUri = encodeURIComponent(window.location.href.split('#')[0]);
  window.location.href =
    `https://github.com/login/oauth/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&redirect_uri=${redirectUri}` +
    `&scope=public_repo`;
});

// 處理 OAuth 回調
const hash = window.location.hash;
if (hash.startsWith('#access_token=')) {
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get('access_token');
  if (token) {
    localStorage.setItem('gh_token', token);
    window.location.hash = '';
    location.reload();
  }
}

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('gh_token');
  location.reload();
});

// ===== 照片瀏覽 =====
function loadPhotos() {
  fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/`)
    .then(r => r.json())
    .then(files => {
      photos = files
        .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (photos.length === 0) {
        document.getElementById('photo-container').innerHTML =
          '<p class="status">暫無照片</p>';
        return;
      }
      currentIndex = 0;
      renderPhoto();
      updateNav();
    })
    .catch(() => {
      document.getElementById('photo-container').innerHTML =
        '<p class="status">載入失敗，請稍後再試</p>';
    });
}

function renderPhoto() {
  const p = photos[currentIndex];
  document.getElementById('photo-container').innerHTML = `
    <img src="${CDN}/${encodeURIComponent(p.name)}"
         alt="澳門街道照片 ${p.name}"
         loading="lazy" />
  `;
  document.getElementById('photo-info').textContent =
    `${currentIndex + 1} / ${photos.length}  —  ${p.name}`;
}

function updateNav() {
  document.getElementById('prev-btn').disabled = currentIndex <= 0;
  document.getElementById('next-btn').disabled = currentIndex >= photos.length - 1;
}

document.getElementById('prev-btn').addEventListener('click', () => {
  if (currentIndex > 0) { currentIndex--; renderPhoto(); updateNav(); }
});
document.getElementById('next-btn').addEventListener('click', () => {
  if (currentIndex < photos.length - 1) { currentIndex++; renderPhoto(); updateNav(); }
});

// ===== 上傳（透過 GitHub App PR） =====
document.getElementById('upload-btn').addEventListener('click', async () => {
  const fileInput = document.getElementById('file-input');
  const location  = document.getElementById('photo-location').value.trim();
  const date      = document.getElementById('photo-date').value;
  const desc      = document.getElementById('photo-desc').value.trim();

  if (!fileInput.files.length) { alert('請先選擇照片'); return; }
  if (!location) { alert('請填寫拍攝地點'); return; }

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result.split(',')[1];
    const ts = Date.now();
    const filename = `street_${ts}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const branch = `upload-${ts}`;

    try {
      // 1. 取得 main 的 SHA
      const mainRef = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/git/refs/heads/main`,
        { headers: { Authorization: `token ${accessToken}` } }
      ).then(r => r.json());

      // 2. 建立新分支
      await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs`, {
        method: 'POST',
        headers: {
          Authorization: `token ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: mainRef.object.sha
        })
      });

      // 3. 寫入照片
      await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filename}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `token ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `上傳照片：${location}`,
            content: base64,
            branch,
            committer: {
              name: currentUser.login,
              email: currentUser.email || `${currentUser.login}@users.noreply.github.com`
            }
          })
        }
      );

      // 4. 寫入 meta.json
      const meta = JSON.stringify({
        location, date: date || new Date().toISOString().slice(0, 10),
        photographer: currentUser.login,
        description: desc
      }, null, 2);

      await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filename}.json`,
        {
          method: 'PUT',
          headers: {
            Authorization: `token ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `新增照片描述：${location}`,
            content: btoa(unescape(encodeURIComponent(meta))),
            branch
          })
        }
      );

      // 5. 建立 PR
      await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/pulls`, {
        method: 'POST',
        headers: {
          Authorization: `token ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: `📷 新照片：${location}`,
          head: branch,
          base: 'main',
          body: `**拍攝地點：** ${location}\n**拍攝日期：** ${date || '未指定'}\n\n${desc || '無'}`
        })
      });

      alert('✅ 照片已提交，審核通過後將發布');
      fileInput.value = '';
      document.getElementById('photo-location').value = '';
      document.getElementById('photo-date').value = '';
      document.getElementById('photo-desc').value = '';
      loadPhotos();

    } catch (err) {
      console.error(err);
      alert('❌ 提交失敗：' + err.message);
    }
  };
  reader.readAsDataURL(file);
});

// ===== 評論區（GitHub Issues Comments） =====
const ISSUE_TITLE = '街道照片評論區';

async function getOrCreateIssue() {
  const headers = accessToken
    ? { Authorization: `token ${accessToken}` }
    : {};

  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/issues?labels=comments&state=open`,
    { headers }
  );
  const issues = await res.json();
  if (issues.length > 0) return issues[0].number;

  // 沒有就新建
  const create = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/issues`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: ISSUE_TITLE,
        body: '歡迎在此留下對澳門街道照片的評論與建議 💬',
        labels: ['comments']
      })
    }
  );
  const newIssue = await create.json();
  return newIssue.number;
}

async function loadComments() {
  try {
    const issueNum = await getOrCreateIssue();
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/issues/${issueNum}/comments`
    );
    const comments = await res.json();
    const list = document.getElementById('comments-list');

    if (comments.length === 0) {
      list.innerHTML = '<p class="status">暫無評論，來留第一條吧 🎉</p>';
      return;
    }

    list.innerHTML = comments.map(c => `
      <div class="comment">
        <span class="author">${c.user.login}</span>
        <span class="date">${new Date(c.created_at).toLocaleString('zh-MO')}</span>
        <div class="body">${escapeHtml(c.body)}</div>
      </div>
    `).join('');
  } catch {
    document.getElementById('comments-list').innerHTML =
      '<p class="status">載入評論失敗</p>';
  }
}

document.getElementById('comment-btn').addEventListener('click', async () => {
  const input = document.getElementById('comment-input');
  const body = input.value.trim();
  if (!body) { alert('請輸入評論內容'); return; }

  try {
    const issueNum = await getOrCreateIssue();
    await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/issues/${issueNum}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body })
      }
    );
    input.value = '';
    loadComments();
  } catch {
    alert('❌ 發佈失敗，請稍後再試');
  }
});

// ===== 工具函數 =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function bindEvents() {
  // 目前事件都在 addEventListener 中綁定
}
