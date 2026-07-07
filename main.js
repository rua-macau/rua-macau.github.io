/* ========= 配置 ========= */
const OWNER = 'rua-macau';
const REPO  = 'Macau-road-s';
const BRANCH = 'main';
const CDN   = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}`;
const CLIENT_ID = 'Iv23li0TZffQfNE8JQ53';

/* ========= 全局状态 ========= */
let accessToken = '';
let currentUser = null;

/* ========= 初始化 ========= */
document.addEventListener('DOMContentLoaded', () => {
  restoreTokenFromURL();
  checkAuth();
  loadPhotos();
  loadComments();
  bindEvents();
});

/* ========= 从 URL 恢复 Token（关键修复） ========= */
function restoreTokenFromURL() {
  if (location.hash.startsWith('#access_token=')) {
    const params = new URLSearchParams(location.hash.slice(1));
    const token = params.get('access_token');
    if (token) {
      localStorage.setItem('gh_token', token);
      // 清掉 hash，避免刷新重复触发
      history.replaceState(null, '', location.pathname);
      location.reload(); // 关键：重新初始化
    }
  } else {
    accessToken = localStorage.getItem('gh_token') || '';
  }
}

/* ========= 鉴权 ========= */
async function checkAuth() {
  accessToken = localStorage.getItem('gh_token') || '';
  if (!accessToken) return showLoggedOut();

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${accessToken}` }
    });
    if (!res.ok) throw new Error();
    currentUser = await res.json();
    showLoggedIn(currentUser);
  } catch {
    logout();
  }
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

function logout() {
  localStorage.removeItem('gh_token');
  location.reload();
}

/* ========= 登录 ========= */
function bindEvents() {
  document.getElementById('login-btn').onclick = () => {
    const redirect = encodeURIComponent(location.origin);
    location.href =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${CLIENT_ID}` +
      `&redirect_uri=${redirect}` +
      `&scope=public_repo`;
  };

  document.getElementById('logout-btn').onclick = logout;
}

/* ========= 照片浏览 ========= */
let photos = [];
let currentIndex = 0;

async function loadPhotos() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/`
    );
    const files = await res.json();
    photos = files
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!photos.length) {
      document.getElementById('photo-container').innerHTML =
        '<p class="status">暫無照片</p>';
      return;
    }
    currentIndex = 0;
    renderPhoto();
    updateNav();
  } catch {
    document.getElementById('photo-container').innerHTML =
      '<p class="status">載入失敗</p>';
  }
}

function renderPhoto() {
  const p = photos[currentIndex];
  document.getElementById('photo-container').innerHTML = `
    <img src="${CDN}/${encodeURIComponent(p.name)}" alt="${p.name}" loading="lazy" />`;
  document.getElementById('photo-info').textContent =
    `${currentIndex + 1} / ${photos.length} — ${p.name}`;
}

function updateNav() {
  document.getElementById('prev-btn').disabled = currentIndex <= 0;
  document.getElementById('next-btn').disabled =
    currentIndex >= photos.length - 1;
}

/* ========= 上传（OAuth Token PR） ========= */
document.getElementById('upload-btn')?.addEventListener('click', async () => {
  if (!accessToken) return alert('請先登入');

  const file = document.getElementById('file-input').files[0];
  const location = document.getElementById('photo-location').value.trim();
  const date = document.getElementById('photo-date').value;
  const desc = document.getElementById('photo-desc').value.trim();

  if (!file || !location) return alert('請填寫必要資訊');

  const reader = new FileReader();
  reader.onload = async e => {
    const base64 = e.target.result.split(',')[1];
    const branch = `upload-${Date.now()}`;

    try {
      const headers = {
        Authorization: `token ${accessToken}`,
        'Content-Type': 'application/json'
      };

      const main = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/git/refs/heads/main`,
        { headers }
      ).then(r => r.json());

      await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: main.object.sha })
      });

      await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${file.name}`,
        {
          method: 'PUT',
          headers,
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

      await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/pulls`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: `📷 新照片：${location}`,
          head: branch,
          base: 'main',
          body: `地點：${location}\n日期：${date}\n\n${desc}`
        })
      });

      alert('✅ 已提交 Pull Request，審核後發佈');
      loadPhotos();
    } catch (err) {
      alert('❌ 上傳失敗');
      console.error(err);
    }
  };
  reader.readAsDataURL(file);
});

/* ========= 评论（Issues） ========= */
const ISSUE_TITLE = '街道照片評論區';

async function getOrCreateIssue() {
  const headers = accessToken
    ? { Authorization: `token ${accessToken}` }
    : {};

  const issues = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/issues?labels=comments`,
    { headers }
  ).then(r => r.json());

  if (issues.length) return issues[0].number;

  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/issues`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: ISSUE_TITLE,
        body: '歡迎留下評論 💬',
        labels: ['comments']
      })
    }
  );
  return (await res.json()).number;
}

async function loadComments() {
  try {
    const issue = await getOrCreateIssue();
    const comments = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/issues/${issue}/comments`
    ).then(r => r.json());

    document.getElementById('comments-list').innerHTML = comments.length
      ? comments.map(c => `
          <div class="comment">
            <strong>${c.user.login}</strong>
            <span class="date">${new Date(c.created_at).toLocaleString('zh-MO')}</span>
            <div>${escapeHtml(c.body)}</div>
          </div>`).join('')
      : '<p class="status">暫無評論</p>';
  } catch {
    document.getElementById('comments-list').innerHTML =
      '<p class="status">載入失敗</p>';
  }
}

document.getElementById('comment-btn')?.addEventListener('click', async () => {
  if (!accessToken) return alert('請先登入');
  const body = document.getElementById('comment-input').value.trim();
  if (!body) return;
  const issue = await getOrCreateIssue();
  await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/issues/${issue}/comments`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ body })
    }
  );
  document.getElementById('comment-input').value = '';
  loadComments();
});

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}
