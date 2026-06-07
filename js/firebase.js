// firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, remove }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2doy8F3yB0vqFVssAzjmZKR2mMo3EebU",
  authDomain: "moonlightmc-db.firebaseapp.com",
  databaseURL: "https://moonlightmc-db-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "moonlightmc-db",
  storageBucket: "moonlightmc-db.firebasestorage.app",
  messagingSenderId: "888076397114",
  appId: "1:888076397114:web:a5a3f9c5b74d4349b06303",
};

function sanitizeKey(name) {
  return (name||'untitled').replace(/[.#$[\]/\s]/g,'_').slice(0,64);
}

// Firebase แปลง array → object เสมอ ต้อง normalize กลับ
function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  // object with numeric keys → array
  return Object.values(val);
}

// normalize tree จาก Firebase ให้ทุก field กลับเป็น array
function normalizeTree(t) {
  if (!t) return null;
  t.nodes = toArray(t.nodes).map(n => {
    if (!n) return n;
    n.parents = toArray(n.parents);
    n.stats   = toArray(n.stats);
    return n;
  }).filter(Boolean);
  t.edges = toArray(t.edges);
  return t;
}

// แปลง tree ให้ปลอดภัยก่อน save (array → object ที่มี key ชัดเจน)
function prepareForFirebase(tree) {
  const t = JSON.parse(JSON.stringify(tree));
  // เก็บ nodes เป็น object keyed by id แทน array เพื่อไม่ให้ Firebase reindex
  const nodesObj = {};
  t.nodes.forEach(n => {
    nodesObj[n.id] = {
      ...n,
      parents: n.parents.length > 0 ? Object.fromEntries(n.parents.map((p,i)=>[i,p])) : {},
      stats: n.stats.length > 0 ? Object.fromEntries(n.stats.map((s,i)=>[i,s])) : {},
    };
  });
  t.nodes = nodesObj;
  t.edges = {};
  return t;
}

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

const FirebaseDB = {
  async listTrees() {
    const snap = await get(ref(db, 'trees'));
    if (!snap.exists()) return [];
    return Object.entries(snap.val()).map(([key, val]) => ({
      key,
      name: val.meta?.name || key,
      nodeCount: Object.keys(val.nodes||{}).length,
      modified: val.meta?.modified || 0,
    }));
  },

  async loadTree(key) {
    const snap = await get(ref(db, `trees/${sanitizeKey(key)}`));
    if (!snap.exists()) return null;
    return normalizeTree(snap.val());
  },

  async saveTree(tree) {
    const key = sanitizeKey(tree.meta.name);
    tree.meta.modified = Date.now();
    const prepared = prepareForFirebase(tree);
    await set(ref(db, `trees/${key}`), prepared);
    return key;
  },

  async deleteTree(key) {
    await remove(ref(db, `trees/${sanitizeKey(key)}`));
  },

  watchTree(key, callback) {
    return onValue(ref(db, `trees/${sanitizeKey(key)}`), snap => {
      if (snap.exists()) callback(normalizeTree(snap.val()));
    });
  },

  watchTreeList(callback) {
    return onValue(ref(db, 'trees'), snap => {
      if (!snap.exists()) { callback([]); return; }
      callback(Object.entries(snap.val()).map(([key, val]) => ({
        key,
        name: val.meta?.name || key,
        nodeCount: Object.keys(val.nodes||{}).length,
        modified: val.meta?.modified || 0,
      })));
    });
  },
};

window.FirebaseDB = FirebaseDB;
if (window._firebaseResolve) window._firebaseResolve(FirebaseDB);
