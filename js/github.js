// github.js — GitHub API storage

const REPO_OWNER = 'zMoKunGz';
const REPO_NAME  = 'moonlight-skilltree';
const TREES_PATH = 'trees';
const GH_TOKEN_KEY = 'stb_github_token';

const GitHubDB = {
  hasToken() { return !!localStorage.getItem(GH_TOKEN_KEY); },
  getToken()  { return localStorage.getItem(GH_TOKEN_KEY) || ''; },
  setToken(t) { localStorage.setItem(GH_TOKEN_KEY, t.trim()); },
  clearToken(){ localStorage.removeItem(GH_TOKEN_KEY); },

  _headers() {
    return {
      'Authorization': `token ${this.getToken()}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  },

  _key(name) {
    return (name||'untitled').replace(/[^a-zA-Z0-9ก-๙_-]/g,'_').slice(0,64);
  },

  async listTrees() {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${TREES_PATH}`;
    const res = await fetch(url, { headers: this._headers() });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const files = await res.json();
    // โหลด meta แต่ละ tree
    const results = await Promise.all(
      files.filter(f => f.name.endsWith('.json')).map(async f => {
        try {
          const t = await this.loadTree(f.name.replace('.json',''));
          return {
            key: f.name.replace('.json',''),
            name: t?.meta?.name || f.name.replace('.json',''),
            nodeCount: t?.nodes?.length || 0,
            modified: t?.meta?.modified || 0,
          };
        } catch {
          return { key: f.name.replace('.json',''), name: f.name.replace('.json',''), nodeCount:0, modified:0 };
        }
      })
    );
    return results;
  },

  async loadTree(key) {
    const filename = this._key(key) + '.json';
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${TREES_PATH}/${filename}`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) return null;
    const file = await res.json();
    try {
      return JSON.parse(atob(file.content.replace(/\n/g,'')));
    } catch { return null; }
  },

  async saveTree(tree) {
    const key = this._key(tree.meta.name);
    const filename = key + '.json';
    tree.meta.modified = Date.now();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(tree, null, 2))));
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${TREES_PATH}/${filename}`;

    // ดึง sha เดิม (ถ้ามี)
    let sha = null;
    try {
      const check = await fetch(url, { headers: this._headers() });
      if (check.ok) sha = (await check.json()).sha;
    } catch {}

    const res = await fetch(url, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify({
        message: `save: ${tree.meta.name}`,
        content,
        ...(sha ? { sha } : {})
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(()=>({}));
      throw new Error(e.message || `GitHub save failed ${res.status}`);
    }
    return key;
  },

  async deleteTree(key) {
    const filename = this._key(key) + '.json';
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${TREES_PATH}/${filename}`;
    const check = await fetch(url, { headers: this._headers() });
    if (!check.ok) return;
    const file = await check.json();
    await fetch(url, {
      method: 'DELETE',
      headers: this._headers(),
      body: JSON.stringify({ message: `delete: ${key}`, sha: file.sha }),
    });
  },
};

window.GitHubDB = GitHubDB;

// ── Patch TreeModel หลัง DOMContentLoaded ──
window.addEventListener('DOMContentLoaded', () => {
  if (!window.TreeModel) return;

  TreeModel.saveRemote = async function(tree) {
    if (GitHubDB.hasToken()) return GitHubDB.saveTree(tree);
    TreeModel.saveLocal(tree);
  };

  TreeModel.loadRemote = async function(key) {
    if (GitHubDB.hasToken()) return GitHubDB.loadTree(key);
    return TreeModel.loadLocal(key);
  };

  TreeModel.listRemote = async function() {
    if (GitHubDB.hasToken()) return GitHubDB.listTrees();
    return TreeModel.listLocal().map(name => {
      const t = TreeModel.loadLocal(name);
      return { key:name, name, nodeCount:t?.nodes?.length||0, modified:t?.meta?.modified||0 };
    });
  };
});
