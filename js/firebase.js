// firebase.js — โหลดแบบ module แล้ว expose ผ่าน window.FirebaseReady promise

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
  return (name || 'untitled').replace(/[.#$[\]/\s]/g, '_').slice(0, 64);
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
      nodeCount: Array.isArray(val.nodes) ? val.nodes.length : Object.keys(val.nodes||{}).length,
      modified: val.meta?.modified || 0,
    }));
  },

  async loadTree(key) {
    const snap = await get(ref(db, `trees/${sanitizeKey(key)}`));
    return snap.exists() ? snap.val() : null;
  },

  async saveTree(tree) {
    const key = sanitizeKey(tree.meta.name);
    tree.meta.modified = Date.now();
    await set(ref(db, `trees/${key}`), JSON.parse(JSON.stringify(tree)));
    return key;
  },

  async deleteTree(key) {
    await remove(ref(db, `trees/${sanitizeKey(key)}`));
  },

  watchTree(key, callback) {
    return onValue(ref(db, `trees/${sanitizeKey(key)}`), snap => {
      if (snap.exists()) callback(snap.val());
    });
  },

  watchTreeList(callback) {
    return onValue(ref(db, 'trees'), snap => {
      if (!snap.exists()) { callback([]); return; }
      callback(Object.entries(snap.val()).map(([key, val]) => ({
        key,
        name: val.meta?.name || key,
        nodeCount: Array.isArray(val.nodes) ? val.nodes.length : Object.keys(val.nodes||{}).length,
        modified: val.meta?.modified || 0,
      })));
    });
  },
};

// expose ผ่าน window และ resolve promise
window.FirebaseDB = FirebaseDB;
if (window._firebaseResolve) window._firebaseResolve(FirebaseDB);
