// firebase.js — Firebase Realtime Database integration

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, push, remove }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2doy8F3yB0vqFVssAzjmZKR2mMo3EebU",
  authDomain: "moonlightmc-db.firebaseapp.com",
  databaseURL: "https://moonlightmc-db-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "moonlightmc-db",
  storageBucket: "moonlightmc-db.firebasestorage.app",
  messagingSenderId: "888076397114",
  appId: "1:888076397114:web:a5a3f9c5b74d4349b06303",
  measurementId: "G-4LE4617PP3"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ── API ──

// list all trees
export async function listTrees() {
  const snap = await get(ref(db, 'trees'));
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.entries(data).map(([key, val]) => ({
    key,
    name: val.meta?.name || key,
    nodeCount: val.nodes?.length || 0,
    modified: val.meta?.modified || 0,
  }));
}

// load one tree by key
export async function loadTree(key) {
  const snap = await get(ref(db, `trees/${key}`));
  return snap.exists() ? snap.val() : null;
}

// save tree (key = tree name sanitized)
export async function saveTree(tree) {
  const key = sanitizeKey(tree.meta.name);
  tree.meta.modified = Date.now();
  await set(ref(db, `trees/${key}`), tree);
  return key;
}

// delete tree
export async function deleteTree(key) {
  await remove(ref(db, `trees/${key}`));
}

// listen real-time to a tree
export function watchTree(key, callback) {
  const r = ref(db, `trees/${key}`);
  return onValue(r, snap => {
    if (snap.exists()) callback(snap.val());
  });
}

// listen to tree list changes
export function watchTreeList(callback) {
  const r = ref(db, 'trees');
  return onValue(r, snap => {
    if (!snap.exists()) { callback([]); return; }
    const data = snap.val();
    callback(Object.entries(data).map(([key, val]) => ({
      key,
      name: val.meta?.name || key,
      nodeCount: val.nodes?.length || 0,
      modified: val.meta?.modified || 0,
    })));
  });
}

function sanitizeKey(name) {
  return name.replace(/[.#$[\]/]/g, '_').slice(0, 64) || 'untitled';
}

window.FirebaseDB = { listTrees, loadTree, saveTree, deleteTree, watchTree, watchTreeList };
