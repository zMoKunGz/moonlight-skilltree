// tree.js — shared data model

const TreeModel = {
  version: 1,

  empty() {
    const originNode = {
      id: 'origin',
      label: 'Origin',
      gx: 0, gy: 0,
      type: 'normal',
      parents: [],   // origin ไม่มี parent เสมอ
      stats: [],
      isOrigin: true // flag พิเศษ
    };
    return {
      meta: { name: 'Untitled Tree', version: TreeModel.version, created: Date.now(), modified: Date.now() },
      nodes: [originNode],
      edges: []
    };
  },

  newNode(gx, gy) {
    return {
      id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6),
      label: 'New Node',
      gx, gy,
      type: 'normal',
      parents: [],
      stats: []
    };
  },

  getNode(tree, id) {
    return tree.nodes.find(n => n.id === id);
  },

  getOrigin(tree) {
    return tree.nodes.find(n => n.isOrigin || (n.gx === 0 && n.gy === 0)) || tree.nodes[0];
  },

  isOriginNode(node) {
    return !!(node && (node.isOrigin || (node.gx === 0 && node.gy === 0 && node.parents.length === 0)));
  },

  // node unlock ได้ถ้า parents ครบทุกตัว (origin ไม่มี parent = unlock ได้เสมอ)
  canUnlock(tree, nodeId, unlockedSet) {
    const node = TreeModel.getNode(tree, nodeId);
    if (!node) return false;
    if (TreeModel.isOriginNode(node)) return true;
    if (node.parents.length === 0) {
      // node ไม่มี parent และไม่ใช่ origin = ยังอัพไม่ได้จนกว่าจะกำหนด parent
      // แต่ถ้าต้องการให้กดได้เลย comment บรรทัดนี้ออก
      return false;
    }
    return node.parents.every(pid => unlockedSet.has(pid));
  },

  canLock(tree, nodeId, unlockedSet) {
    const deps = tree.nodes.filter(n => n.parents.includes(nodeId) && unlockedSet.has(n.id));
    return deps.length === 0;
  },

  calcStats(tree, unlockedSet) {
    const totals = {};
    for (const id of unlockedSet) {
      const node = TreeModel.getNode(tree, id);
      if (!node) continue;
      for (const s of node.stats) {
        totals[s.stat] = (totals[s.stat] || 0) + Number(s.value);
      }
    }
    return totals;
  },

  toJSON(tree) {
    tree.meta.modified = Date.now();
    return JSON.stringify(tree, null, 2);
  },

  fromJSON(str) {
    try {
      const t = JSON.parse(str);
      // migrate: ถ้าไม่มี origin node ให้เพิ่มเข้าไป
      if (t && t.nodes && !t.nodes.find(n => n.isOrigin || (n.gx===0 && n.gy===0 && n.parents.length===0))) {
        t.nodes.unshift({
          id: 'origin', label: 'Origin',
          gx: 0, gy: 0, type: 'normal',
          parents: [], stats: [], isOrigin: true
        });
      }
      return t;
    } catch { return null; }
  },

  storageKey(name) { return 'skilltree_' + name; },

  saveLocal(tree) {
    try {
      localStorage.setItem(TreeModel.storageKey(tree.meta.name), TreeModel.toJSON(tree));
      return true;
    } catch { return false; }
  },

  loadLocal(name) {
    try {
      const raw = localStorage.getItem(TreeModel.storageKey(name));
      return raw ? TreeModel.fromJSON(raw) : null;
    } catch { return null; }
  },

  listLocal() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('skilltree_')) keys.push(k.replace('skilltree_', ''));
    }
    return keys;
  }
};

window.TreeModel = TreeModel;

// ── Firebase-aware save/load (override localStorage) ──
TreeModel.saveRemote = async function(tree) {
  if (window.FirebaseDB) {
    return await window.FirebaseDB.saveTree(tree);
  }
  return TreeModel.saveLocal(tree);
};

TreeModel.loadRemote = async function(key) {
  if (window.FirebaseDB) {
    return await window.FirebaseDB.loadTree(key);
  }
  return TreeModel.loadLocal(key);
};

TreeModel.listRemote = async function() {
  if (window.FirebaseDB) {
    return await window.FirebaseDB.listTrees();
  }
  // fallback: localStorage
  return TreeModel.listLocal().map(name => ({
    key: name, name, nodeCount: 0, modified: 0
  }));
};
