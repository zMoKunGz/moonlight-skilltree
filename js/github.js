// github.js — GitHub API storage (replaces Firebase)

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'zMoKunGz';
const REPO_NAME  = 'moonlight-skilltree';
const TREES_PATH = 'trees'; // folder ใน repo

const GH_TOKEN_KEY = 'stb_github_token';

function getToken() {
  return localStorage.getItem(GH_TOKEN_KEY) || '';
}

function headers() {
  return {
    'Authorization': `token ${getToken()}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

function sanitizeKey(name) {
  return (name||'untitled').replace(/[^a-zA-Z0-9ก-๙_-]/g,'_').slice(0,64);
}

const GitHubDB = {
  // ── Token management ──
  hasToken() { return !!getToken(); },
  setToken(t) { localStorage.setItem(GH_TOKEN_KEY, t); },
  clearToken() { localStorage.removeItem(GH_TOKEN_KEY); },

  // ── List trees ──
  async listTrees() {
    const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${TREES_PATH}`;
    const res = await fetch(url, { headers: headers() });
    if (res.status === 404) return []; // folder ยังไม่มี
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const files = await res.json();
    return files
      .filter(f => f.name.endsWith('.json'))
      .map(f => ({
        key: f.name.replace('.json',''),
        name: f.name.replace('.json',''),
        sha: f.sha,
        nodeCount: 0,
        modified: 0,
      }));
  },

  // ── Load tree ──
  async loadTree(key) {
    const filename = sanitizeKey(key) + '.json';
    const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${TREES_PATH}/${filename}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return null;
    const file = await res.json();
    // GitHub ส่ง content เป็น base64
    const json = atob(file.content.replace(/\n/g,''));
    try { return JSON.parse(json); } catch { return null; }
  },

  // ── Save tree ──
  async saveTree(tree) {
    const key = sanitizeKey(tree.meta.name);
    const filename = key + '.json';
    tree.meta.modified = Date.now();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(tree, null, 2))));
    const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${TREES_PATH}/${filename}`;

    // ต้องเอา sha ของไฟล์เดิมมาก่อน (ถ้ามี) เพื่อ update
    let sha = null;
    try {
      const check = await fetch(url, { headers: headers() });
      if (check.ok) {
        const existing = await check.json();
        sha = existing.sha;
      }
    } catch {}

    const body = {
      message: `save tree: ${tree.meta.name}`,
      content,
      ...(sha ? { sha } : {})
    };

    const res = await fetch(url, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Save failed');
    }
    return key;
  },

  // ── Delete tree ──
  async deleteTree(key) {
    const filename = sanitizeKey(key) + '.json';
    const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${TREES_PATH}/${filename}`;
    const check = await fetch(url, { headers: headers() });
    if (!check.ok) return;
    const file = await check.json();
    await fetch(url, {
      method: 'DELETE',
      headers: headers(),
      body: JSON.stringify({ message: `delete tree: ${key}`, sha: file.sha }),
    });
  },
};

window.GitHubDB = GitHubDB;

// ── Override TreeModel ──
// รอให้ tree.js โหลดก่อนแล้วค่อย override
document.addEventListener('DOMContentLoaded', () => {
  if (!window.TreeModel) return;

  TreeModel.saveRemote = async function(tree) {
    if (GitHubDB.hasToken()) return await GitHubDB.saveTree(tree);
    return TreeModel.saveLocal(tree);
  };

  TreeModel.loadRemote = async function(key) {
    if (GitHubDB.hasToken()) return await GitHubDB.loadTree(key);
    return TreeModel.loadLocal(key);
  };

  TreeModel.listRemote = async function() {
    if (GitHubDB.hasToken()) {
      const list = await GitHubDB.listTrees();
      // โหลด meta ของแต่ละ tree เพื่อให้ได้ nodeCount และ modified
      const results = await Promise.all(list.map(async item => {
        try {
          const t = await GitHubDB.loadTree(item.key);
          return {
            key: item.key,
            name: t?.meta?.name || item.name,
            nodeCount: t?.nodes?.length || 0,
            modified: t?.meta?.modified || 0,
          };
        } catch { return item; }
      }));
      return results;
    }
    return TreeModel.listLocal().map(name => ({
      key: name, name, nodeCount: 0, modified: 0
    }));
  };

  TreeModel.deleteRemote = async function(key) {
    if (GitHubDB.hasToken()) return await GitHubDB.deleteTree(key);
  };
});
