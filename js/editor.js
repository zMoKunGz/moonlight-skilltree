// editor.js

const STATS = window.STATS_DATA;

// ── Swal theme ──
const SwalDark = Swal.mixin({
  background: '#13161e',
  color: '#d4d8e8',
  confirmButtonColor: '#4f5fcc',
  cancelButtonColor: '#2a2f3f',
  customClass: {
    popup: 'swal-dark-popup',
    confirmButton: 'swal-confirm',
    cancelButton: 'swal-cancel',
  }
});


// ── Icons ──
const ICONS = [
  '⭐','✦','◆','●','▲','⬡','☽','☀','🌙','⚡',
  '🔥','❄','🌊','🌿','💀','⚔','🛡','🏹','🪄','📿',
  '👁','💎','🗡','⚙','🔮','🌀','☁','🌑','💫','🌟',
  '🦅','🐺','🐉','🦁','🕷','🦋','🌸','🍃','🪨','⛰',
];
const FAV_KEY = 'stb_fav_colors';

function loadFavColors() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; }
}
function saveFavColors(arr) {
  localStorage.setItem(FAV_KEY, JSON.stringify(arr));
}

// ── State ──
let tree = TreeModel.empty();
let selectedId = null;
let tool = 'select';
let scale = 1, panX = 0, panY = 0;
let autoSaveTimer = null;
let isDirty = false;
let ghostEl = null;
let isPanning = false, panStart = null;
let isConnecting = false, connectFromId = null, connectLineEl = null;
const STEP = 70;

// ── Stat categories for randomize ──
const STAT_CATS = {
  'โจมตี': ['attack-damage','attack-speed','critical-strike-chance','critical-strike-power',
             'skill-critical-strike-chance','skill-critical-strike-power','physical-damage',
             'weapon-damage','magic-damage','skill-damage','projectile-damage'],
  'ป้องกัน': ['defense','damage-reduction','physical-damage-reduction','magic-damage-reduction',
              'projectile-damage-reduction','fire-damage-reduction','pve-damage-reduction',
              'pvp-damage-reduction','block-rating','block-power','block-cooldown-reduction',
              'parry-rating','parry-cooldown-reduction','dodge-rating','dodge-cooldown-reduction'],
  'ฟื้นฟู': ['max-health','health-regeneration','max-mana','mana-regeneration',
             'max-stamina','stamina-regeneration'],
  'จิปาถะ': ['pve-damage','pvp-damage','undead-damage','elemental-damage','lifesteal',
             'spell-vampirism','cooldown-reduction','movement-speed'],
};

const canvasWrap = document.getElementById('canvas-wrap');
const canvas     = document.getElementById('canvas');
const svg        = document.getElementById('tree-svg');
const treeName   = document.getElementById('tree-name-input');
const saveStatus = document.getElementById('save-status');

// ── Init ──
function init() {
  const last = localStorage.getItem('skilltree_last');
  if (last) {
    const t = TreeModel.loadLocal(last);
    if (t) tree = t;
  }
  treeName.value = tree.meta.name;
  resetView();
  renderAll();
  startAutoSave();
  bindEvents();
}

// ── View ──
function resetView() {
  const rect = canvasWrap.getBoundingClientRect();
  panX = rect.width / 2; panY = rect.height / 2; scale = 1;
  applyTransform();
}
function applyTransform() {
  canvas.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  svg.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  svg.style.transformOrigin = '0 0';
  const om = document.getElementById('origin-mark');
  const ol = document.getElementById('origin-label');
  if (om) { om.style.left = panX+'px'; om.style.top = panY+'px'; }
  if (ol) { ol.style.left = panX+'px'; ol.style.top = panY+'px'; }
}
function screenToGrid(sx, sy) {
  const rect = canvasWrap.getBoundingClientRect();
  return {
    gx: Math.round((sx - rect.left - panX) / scale / STEP),
    gy: Math.round((sy - rect.top  - panY) / scale / STEP)
  };
}
function gridToCanvas(gx, gy) { return { x: gx*STEP, y: gy*STEP }; }

// ── Render ──
function renderAll() { renderEdges(); renderNodes(); renderPanel(); }

function renderEdges() {
  svg.innerHTML = '';
  for (const node of tree.nodes) {
    const {x:x2,y:y2} = gridToCanvas(node.gx, node.gy);
    for (const pid of node.parents) {
      const p = TreeModel.getNode(tree, pid); if (!p) continue;
      const {x:x1,y:y1} = gridToCanvas(p.gx, p.gy);
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',x1); line.setAttribute('y1',y1);
      line.setAttribute('x2',x2); line.setAttribute('y2',y2);
      line.classList.add('edge');
      svg.appendChild(line);
    }
  }
}

function renderNodes() {
  canvas.querySelectorAll('.node').forEach(el => el.remove());
  for (const node of tree.nodes) {
    const {x,y} = gridToCanvas(node.gx, node.gy);
    const el = document.createElement('div');
    el.className = 'node'
      + (node.type==='keystone' ? ' keystone' : '')
      + (node.parents.length===0 ? ' root-node' : '')
      + (node.id===selectedId ? ' selected' : '');
    el.dataset.id = node.id;
    el.style.left = x+'px'; el.style.top = y+'px';
    const nodeColor = node.color || '#222736';
    const nodeBorder = node.id===selectedId ? 'var(--accent)' : (node.color ? adjustColor(node.color) : 'var(--border2)');
    el.innerHTML = `
      <div class="node-inner" style="background:${nodeColor};border-color:${nodeBorder}">
        <span class="node-icon-label">${node.icon || (node.type==='keystone'?'◆':'●')}</span>
      </div>
      <div class="node-label">${node.label}</div>
      <div class="node-coord">${node.gx},${node.gy}</div>
    `;
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (tool === 'select') { selectNode(node.id); return; }
      if (tool === 'connect') {
        if (!isConnecting) {
          // เริ่ม connect จาก node นี้
          isConnecting = true; connectFromId = node.id;
          el.classList.add('connect-source');
        } else {
          // ปลายทาง
          if (connectFromId !== node.id) {
            const toNode = node;
            const fromNode = TreeModel.getNode(tree, connectFromId);
            // เพิ่ม parent: toNode.parents = [fromId] (to requires from)
            if (!toNode.parents.includes(connectFromId)) {
              toNode.parents.push(connectFromId);
              renderAll(); markDirty();
              SwalDark.fire({icon:'success',title:'เชื่อมแล้ว!',
                text: fromNode.label + ' → ' + toNode.label,
                toast:true,position:'top-end',showConfirmButton:false,timer:1500});
            } else {
              SwalDark.fire({icon:'info',title:'เชื่อมอยู่แล้ว',
                toast:true,position:'top-end',showConfirmButton:false,timer:1200});
            }
          }
          cancelConnect();
        }
        return;
      }
    });
    canvas.appendChild(el);
  }
}

function adjustColor(hex) {
  // lighten hex slightly for border
  try {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    const lr = Math.min(255,r+60), lg = Math.min(255,g+60), lb = Math.min(255,b+60);
    return '#'+[lr,lg,lb].map(v=>v.toString(16).padStart(2,'0')).join('');
  } catch { return 'var(--border2)'; }
}

function selectNode(id) { selectedId = id; renderNodes(); renderPanel(); }

function renderPanel() {
  const node = selectedId ? TreeModel.getNode(tree, selectedId) : null;
  document.getElementById('panel-empty').style.display = node ? 'none' : 'flex';
  document.getElementById('panel-node').style.display  = node ? 'block' : 'none';
  if (!node) return;
  document.getElementById('node-label-input').value = node.label;
  document.getElementById('node-id-display').textContent = node.id;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type===node.type));
  renderStatList(node);
  renderParentList(node);
  renderIconGrid(node);
  renderColorPicker(node);
}


function renderIconGrid(node) {
  const grid = document.getElementById('icon-grid');
  if (!grid) return;
  grid.innerHTML = '';
  ICONS.forEach(icon => {
    const btn = document.createElement('button');
    btn.className = 'icon-btn' + (node.icon===icon ? ' active' : '');
    btn.textContent = icon;
    btn.title = icon;
    btn.addEventListener('click', () => {
      node.icon = icon;
      renderNodes(); renderIconGrid(node); markDirty();
    });
    grid.appendChild(btn);
  });
}

function renderColorPicker(node) {
  const colorInput = document.getElementById('node-color-input');
  const hexInput   = document.getElementById('node-color-hex');
  const favBox     = document.getElementById('fav-colors');
  if (!colorInput || !hexInput || !favBox) return;

  const currentColor = node.color || '#222736';
  colorInput.value = currentColor;
  hexInput.value   = currentColor;

  // sync color picker ↔ hex input
  colorInput.oninput = () => {
    const v = colorInput.value;
    hexInput.value = v;
    node.color = v;
    renderNodes(); markDirty();
    renderFavDots(node, favBox);
  };
  hexInput.oninput = () => {
    const v = hexInput.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      colorInput.value = v;
      node.color = v;
      renderNodes(); markDirty();
      renderFavDots(node, favBox);
    }
  };

  // save fav
  document.getElementById('btn-save-color').onclick = () => {
    const favs = loadFavColors();
    const c = node.color || '#222736';
    if (!favs.includes(c)) {
      favs.unshift(c);
      if (favs.length > 16) favs.pop();
      saveFavColors(favs);
    }
    renderFavDots(node, favBox);
  };

  renderFavDots(node, favBox);
}

function renderFavDots(node, favBox) {
  favBox.innerHTML = '';
  const favs = loadFavColors();
  if (favs.length === 0) {
    favBox.innerHTML = '<span style="font-size:10px;color:var(--text3)">กด ★ เพื่อบันทึกสีที่ใช้บ่อย</span>';
    return;
  }
  favs.forEach((c, i) => {
    const dot = document.createElement('div');
    dot.className = 'fav-color' + (node.color===c ? ' active' : '');
    dot.style.background = c;
    dot.title = c;

    const del = document.createElement('button');
    del.className = 'del-fav'; del.textContent = '✕';
    del.addEventListener('click', e => {
      e.stopPropagation();
      const arr = loadFavColors(); arr.splice(i,1); saveFavColors(arr);
      renderFavDots(node, favBox);
    });
    dot.appendChild(del);

    dot.addEventListener('click', () => {
      node.color = c;
      document.getElementById('node-color-input').value = c;
      document.getElementById('node-color-hex').value = c;
      renderNodes(); markDirty();
      renderFavDots(node, favBox);
    });
    favBox.appendChild(dot);
  });
}

function renderStatList(node) {
  const container = document.getElementById('stat-list');
  container.innerHTML = '';
  node.stats.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <select class="stat-sel" data-i="${i}">
        ${STATS.map(st=>`<option value="${st.id}"${st.id===s.stat?' selected':''}>${st.label}</option>`).join('')}
      </select>
      <input type="number" class="stat-val" data-i="${i}" value="${s.value}" step="1" min="0" style="width:72px">
      <button class="stat-remove" data-i="${i}" title="ลบ">✕</button>
    `;
    container.appendChild(row);
  });
  container.querySelectorAll('.stat-sel').forEach(el =>
    el.addEventListener('change', () => { node.stats[+el.dataset.i].stat = el.value; markDirty(); }));
  container.querySelectorAll('.stat-val').forEach(el =>
    el.addEventListener('input', () => { node.stats[+el.dataset.i].value = +el.value; markDirty(); }));
  container.querySelectorAll('.stat-remove').forEach(el =>
    el.addEventListener('click', () => { node.stats.splice(+el.dataset.i,1); renderStatList(node); markDirty(); }));
}

function renderParentList(node) {
  // origin node ไม่มี parent ไม่ต้องแสดง section นี้
  const parentSection = document.getElementById("parent-section");
  if (TreeModel.isOriginNode(node)) {
    if (parentSection) parentSection.style.display = "none";
    return;
  }
  if (parentSection) parentSection.style.display = "block";
  const container = document.getElementById('parent-list');
  container.innerHTML = '';
  const candidates = tree.nodes.filter(n => n.id!==node.id && !node.parents.includes(n.id));
  node.parents.forEach(pid => {
    const p = TreeModel.getNode(tree, pid); if (!p) return;
    const item = document.createElement('div');
    item.className = 'parent-item';
    item.innerHTML = `
      <span class="p-name">${p.label}</span>
      <span class="p-coord">(${p.gx},${p.gy})</span>
      <button class="p-remove" data-pid="${pid}" title="ลบ">✕</button>
    `;
    container.appendChild(item);
  });
  container.querySelectorAll('.p-remove').forEach(btn =>
    btn.addEventListener('click', () => {
      node.parents = node.parents.filter(p => p!==btn.dataset.pid);
      renderParentList(node); renderEdges(); markDirty();
    }));
  if (candidates.length > 0) {
    const addRow = document.createElement('div');
    addRow.style.cssText = 'display:flex;gap:6px;margin-top:6px';
    addRow.innerHTML = `
      <select id="parent-add-sel" style="flex:1">
        <option value="">— เลือก node —</option>
        ${candidates.map(n=>`<option value="${n.id}">${n.label} (${n.gx},${n.gy})</option>`).join('')}
      </select>
      <button class="btn sm" id="parent-add-btn">+ เพิ่ม</button>
    `;
    container.appendChild(addRow);
    document.getElementById('parent-add-btn').addEventListener('click', () => {
      const sel = document.getElementById('parent-add-sel');
      if (!sel.value) return;
      if (!node.parents.includes(sel.value)) {
        node.parents.push(sel.value);
        renderParentList(node); renderEdges(); markDirty();
      }
    });
  }
}

// ── Place / Delete ──
function placeNode(gx, gy) {
  if (tree.nodes.some(n => n.gx===gx && n.gy===gy)) {
    SwalDark.fire({ icon:'warning', title:'ช่องนี้มี node อยู่แล้ว', toast:true, position:'top-end', showConfirmButton:false, timer:1500 });
    return;
  }
  const node = TreeModel.newNode(gx, gy);
  tree.nodes.push(node);
  selectNode(node.id);
  renderAll();
  markDirty();
}

function deleteSelected() {
  if (selectedId) {
    const _n = TreeModel.getNode(tree, selectedId);
    if (_n && TreeModel.isOriginNode(_n)) {
      SwalDark.fire({icon:"warning",title:"ลบ Origin ไม่ได้",text:"node x0,y0 คือจุดเริ่มต้น ไม่สามารถลบได้",toast:true,position:"top-end",showConfirmButton:false,timer:2000});
      return;
    }
  }
  if (!selectedId) return;
  const node = TreeModel.getNode(tree, selectedId);
  SwalDark.fire({
    title: `ลบ "${node.label}"?`,
    text: 'node ที่ใช้ node นี้เป็น parent จะถูกตัดการเชื่อมต่อด้วย',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ลบเลย',
    cancelButtonText: 'ยกเลิก',
  }).then(r => {
    if (!r.isConfirmed) return;
    tree.nodes.forEach(n => { n.parents = n.parents.filter(p => p!==selectedId); });
    tree.nodes = tree.nodes.filter(n => n.id!==selectedId);
    selectedId = null;
    renderAll();
    markDirty();
    SwalDark.fire({ icon:'success', title:'ลบแล้ว', toast:true, position:'top-end', showConfirmButton:false, timer:1500 });
  });
}

// ── Dirty / Autosave ──
function markDirty() {
  isDirty = true;
  setSaveStatus('unsaved');
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(doAutoSave, 30000); // 30s
}

function startAutoSave() {
  // backup interval every 60s
  setInterval(() => { if (isDirty) doAutoSave(); }, 60000);
}

async function doAutoSave() {
  // show saving toast
  SwalDark.fire({
    title: 'กำลัง Auto-save...',
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 800,
    timerProgressBar: true,
    didOpen: () => Swal.showLoading(),
  });
  await new Promise(r => setTimeout(r, 600));
  _save();
  SwalDark.fire({
    icon: 'success',
    title: 'Auto-saved!',
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 1500,
  });
}

async function _save() {
  tree.meta.name = treeName.value || 'Untitled Tree';
  try {
    await TreeModel.saveRemote(tree);
  } catch(e) {
    console.warn('Remote save failed, fallback localStorage', e);
    TreeModel.saveLocal(tree);
  }
  localStorage.setItem('skilltree_last', tree.meta.name);
  isDirty = false;
  setSaveStatus('saved');
  clearTimeout(autoSaveTimer);
}

async function doSave() {
  SwalDark.fire({
    title: 'กำลัง Save...',
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 600,
    timerProgressBar: true,
    didOpen: () => Swal.showLoading(),
  });
  await new Promise(r => setTimeout(r, 400));
  _save();
  SwalDark.fire({
    icon: 'success',
    title: 'Saved!',
    text: `"${tree.meta.name}" บันทึกแล้ว`,
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2000,
  });
}

function setSaveStatus(state) {
  saveStatus.className = 'save-status ' + state;
  saveStatus.textContent = state==='saved' ? '✓ บันทึกแล้ว' : state==='unsaved' ? '● ยังไม่บันทึก' : '';
}

async function exportJSON() {
  _save();
  const blob = new Blob([TreeModel.toJSON(tree)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (tree.meta.name||'tree')+'.json';
  a.click();
  SwalDark.fire({
    icon: 'success',
    title: 'Export สำเร็จ!',
    text: `ดาวน์โหลด ${tree.meta.name}.json แล้ว`,
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2500,
  });
}

function importJSON() {
  const input = document.createElement('input');
  input.type='file'; input.accept='.json';
  input.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const t = TreeModel.fromJSON(ev.target.result);
      if (!t) {
        SwalDark.fire({ icon:'error', title:'ไฟล์ไม่ถูกต้อง', text:'JSON ไม่ใช่ format ของ STB', confirmButtonText:'ตกลง' });
        return;
      }
      tree = t; treeName.value = tree.meta.name;
      selectedId = null; renderAll(); markDirty();
      SwalDark.fire({ icon:'success', title:'Import สำเร็จ!', text:`โหลด "${t.meta.name}" แล้ว`, toast:true, position:'top-end', showConfirmButton:false, timer:2000 });
    };
    reader.readAsText(file);
  };
  input.click();
}

async function newTree() {
  if (isDirty) {
    const r = await SwalDark.fire({
      title: 'ยังไม่ได้บันทึก',
      text: 'ต้องการสร้าง tree ใหม่? ข้อมูลที่ยังไม่ได้ save จะหายไป',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'สร้างใหม่',
      cancelButtonText: 'ยกเลิก',
    });
    if (!r.isConfirmed) return;
  }
  tree = TreeModel.empty(); selectedId = null;
  treeName.value = tree.meta.name;
  renderAll(); setSaveStatus('');
}

// ── Ghost ──
function showGhost(x, y) {
  if (!ghostEl) { ghostEl = document.createElement('div'); ghostEl.className='node-ghost'; canvas.appendChild(ghostEl); }
  ghostEl.style.left = x+'px'; ghostEl.style.top = y+'px';
}
function removeGhost() { if (ghostEl) { ghostEl.remove(); ghostEl=null; } }

// ── Tool ──
function setTool(t) {
  tool = t;
  canvasWrap.classList.toggle('placing', t==='place');
  canvasWrap.classList.toggle('connecting', t==='connect');
  document.getElementById('tool-select').classList.toggle('active', t==='select');
  document.getElementById('tool-place').classList.toggle('active',  t==='place');
  document.getElementById('tool-connect').classList.toggle('active', t==='connect');
  if (t !== 'connect') cancelConnect();
  removeGhost();
}

function cancelConnect() {
  isConnecting = false; connectFromId = null;
  if (connectLineEl) { connectLineEl.remove(); connectLineEl = null; }
  canvas.querySelectorAll('.node.connect-source').forEach(el => el.classList.remove('connect-source'));
}


// ── Randomize Stat ──
function randomizeStat(node, catKey) {
  const pool = STAT_CATS[catKey];
  if (!pool) return;
  const stat = pool[Math.floor(Math.random() * pool.length)];
  const value = Math.floor(Math.random() * 100) + 1;
  node.stats.push({ stat, value });
  renderStatList(node);
  markDirty();
}

function showRandomizeMenu(node) {
  const cats = Object.keys(STAT_CATS);
  SwalDark.fire({
    title: '🎲 Randomize Stat',
    html: `
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
        ${cats.map(c => `
          <button class="swal2-confirm" onclick="Swal.close();window._doRand('${c}')"
            style="width:100%;padding:8px;border-radius:6px;cursor:pointer;font-size:13px">
            ${c}
          </button>`).join('')}
      </div>`,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'ยกเลิก',
    didOpen: () => {
      window._doRand = (cat) => { randomizeStat(node, cat); };
    }
  });
}


function showTokenDialog() {
  const hasTok = window.GitHubDB?.hasToken();
  SwalDark.fire({
    title: '🔑 GitHub Token',
    html: `
      <div style="text-align:left;font-size:12px;color:var(--text2);margin-bottom:10px">
        ใช้สำหรับ save/load tree บน GitHub Repo<br>
        <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank"
          style="color:var(--accent)">คลิกสร้าง Token ใหม่</a>
        (ติ๊ก <b>repo</b>)
      </div>
      <input id="swal-token" type="password" class="swal2-input"
        placeholder="ghp_xxxxxxxxxxxx"
        style="font-family:monospace;font-size:13px">
      <div style="margin-top:8px;font-size:12px;color:${hasTok?'var(--green)':'var(--red)'}">
        ${hasTok ? '✓ Token ตั้งค่าแล้ว — ใส่ใหม่เพื่อเปลี่ยน' : '⚠ ยังไม่มี Token'}
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'บันทึก',
    cancelButtonText: hasTok ? '🗑 ลบ Token' : 'ยกเลิก',
    preConfirm: () => {
      const v = document.getElementById('swal-token').value.trim();
      if (!v) { Swal.showValidationMessage('กรุณาใส่ Token'); return false; }
      return v;
    }
  }).then(r => {
    if (r.isConfirmed && r.value) {
      window.GitHubDB?.setToken(r.value);
      SwalDark.fire({icon:'success',title:'บันทึก Token แล้ว!',toast:true,position:'top-end',showConfirmButton:false,timer:2000});
    } else if (r.dismiss === Swal.DismissReason.cancel && hasTok) {
      window.GitHubDB?.clearToken();
      SwalDark.fire({icon:'info',title:'ลบ Token แล้ว',toast:true,position:'top-end',showConfirmButton:false,timer:2000});
    }
  });
}

// ── Bind Events ──
function bindEvents() {
  document.getElementById('tool-select').addEventListener('click', () => setTool('select'));
  document.getElementById('tool-place').addEventListener('click',  () => setTool('place'));
  document.getElementById('tool-connect').addEventListener('click', () => setTool('connect'));

  canvasWrap.addEventListener('click', e => {
    if (tool!=='place' || isPanning) return;
    const {gx,gy} = screenToGrid(e.clientX, e.clientY);
    placeNode(gx, gy);
  });

  canvasWrap.addEventListener('contextmenu', e => {
    e.preventDefault(); selectedId=null; renderNodes(); renderPanel();
  });

  canvasWrap.addEventListener('mousemove', e => {
    if (isPanning) {
      panX = panStart.panX + (e.clientX-panStart.x);
      panY = panStart.panY + (e.clientY-panStart.y);
      applyTransform(); return;
    }
    // draw temp line while connecting
    if (tool==='connect' && isConnecting && connectFromId) {
      const fromNode = TreeModel.getNode(tree, connectFromId);
      if (fromNode) {
        const {x:fx, y:fy} = gridToCanvas(fromNode.gx, fromNode.gy);
        const rect = canvasWrap.getBoundingClientRect();
        const mx = (e.clientX - rect.left - panX) / scale;
        const my = (e.clientY - rect.top  - panY) / scale;
        if (!connectLineEl) {
          connectLineEl = document.createElementNS('http://www.w3.org/2000/svg','line');
          connectLineEl.setAttribute('stroke','var(--gold)');
          connectLineEl.setAttribute('stroke-width','2');
          connectLineEl.setAttribute('stroke-dasharray','6 3');
          connectLineEl.setAttribute('pointer-events','none');
          svg.appendChild(connectLineEl);
        }
        connectLineEl.setAttribute('x1', fx); connectLineEl.setAttribute('y1', fy);
        connectLineEl.setAttribute('x2', mx); connectLineEl.setAttribute('y2', my);
      }
      return;
    }
    if (tool!=='place') { removeGhost(); return; }
    const {gx,gy} = screenToGrid(e.clientX, e.clientY);
    const {x,y} = gridToCanvas(gx, gy);
    showGhost(x, y);
  });
  canvasWrap.addEventListener('mouseleave', removeGhost);

  canvasWrap.addEventListener('mousedown', e => {
    if (e.button===1 || (e.button===0 && e.altKey)) {
      e.preventDefault(); isPanning=true;
      panStart={x:e.clientX,y:e.clientY,panX,panY};
      canvasWrap.style.cursor='grabbing';
    }
  });
  window.addEventListener('mouseup', () => {
    if (isPanning) { isPanning=false; canvasWrap.style.cursor=tool==='place'?'crosshair':'default'; }
  });

  canvasWrap.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvasWrap.getBoundingClientRect();
    const mx = e.clientX-rect.left, my = e.clientY-rect.top;
    const delta = e.deltaY>0?0.9:1.1;
    const ns = Math.min(2.5, Math.max(0.3, scale*delta));
    panX = mx-(mx-panX)*(ns/scale); panY = my-(my-panY)*(ns/scale);
    scale=ns; applyTransform();
  }, {passive:false});

  document.getElementById('node-label-input').addEventListener('input', e => {
    if (!selectedId) return;
    const node = TreeModel.getNode(tree, selectedId);
    if (node) { node.label=e.target.value; renderNodes(); markDirty(); }
  });

  document.querySelectorAll('.type-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      if (!selectedId) return;
      const node = TreeModel.getNode(tree, selectedId);
      if (node) { node.type=btn.dataset.type; renderNodes(); renderPanel(); markDirty(); }
    }));

  document.getElementById('add-stat-btn').addEventListener('click', () => {
    if (!selectedId) return;
    const node = TreeModel.getNode(tree, selectedId);
    if (node) { node.stats.push({stat:STATS[0].id, value:10}); renderStatList(node); markDirty(); }
  });
  document.getElementById('btn-randomize-stat').addEventListener('click', () => {
    if (!selectedId) return;
    const node = TreeModel.getNode(tree, selectedId);
    if (node) showRandomizeMenu(node);
  });

  document.getElementById('btn-new').addEventListener('click', newTree);
  document.getElementById('btn-token').addEventListener('click', showTokenDialog);
  document.getElementById('btn-save').addEventListener('click', doSave);
  document.getElementById('btn-export').addEventListener('click', exportJSON);
  document.getElementById('btn-import').addEventListener('click', importJSON);
  document.getElementById('btn-delete').addEventListener('click', deleteSelected);
  document.getElementById('btn-reset-view').addEventListener('click', resetView);

  treeName.addEventListener('input', () => markDirty());

  window.addEventListener('keydown', e => {
    const tag = document.activeElement.tagName;
    if (tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA') return;
    if (e.key==='Delete'||e.key==='Backspace') deleteSelected();
    if (e.key==='Escape') { cancelConnect(); setTool('select'); selectedId=null; renderNodes(); renderPanel(); }
    if (e.key==='p'||e.key==='P') setTool('place');
    if (e.key==='c'||e.key==='C') setTool('connect');
    if ((e.ctrlKey||e.metaKey)&&e.key==='s') { e.preventDefault(); doSave(); }
  });
}

init();
