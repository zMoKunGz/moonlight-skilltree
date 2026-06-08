// simulator.js

const STATS = window.STATS_DATA;
const statMap = {};
STATS.forEach(s => statMap[s.id] = s);

const MAX_POINTS = 100; // total points player has

let tree = null;
let unlocked = new Set();   // node ids that are unlocked
let pointsUsed = 0;
let scale = 1, panX = 0, panY = 0;
let isPanning = false, panStart = null;
const STEP = 70;

const canvasWrap = document.getElementById('canvas-wrap');
const canvas     = document.getElementById('canvas');
const svg        = document.getElementById('tree-svg');
const loadScreen = document.getElementById('load-screen');
const simLayout  = document.getElementById('sim-layout');

// ── Init ──
function init() {
  showLoadScreen();
  bindTopbar();
  document.getElementById('btn-import-home').addEventListener('click', importJSON);
}

function showLoadScreen() {
  simLayout.style.display = 'none';
  loadScreen.style.display = 'flex';
  const list = document.getElementById('tree-list');
  list.innerHTML = '';
  const names = TreeModel.listLocal();
  if (names.length === 0) {
    list.innerHTML = '<p style="color:var(--text3);font-size:13px;text-align:center">ยังไม่มี tree<br>ไปสร้างใน Editor ก่อนนะ</p>';
    return;
  }
  names.forEach(name => {
    const t = TreeModel.loadLocal(name);
    if (!t) return;
    const item = document.createElement('div');
    item.className = 'tree-item';
    const d = new Date(t.meta.modified);
    item.innerHTML = `
      <div>
        <div class="ti-name">${t.meta.name}</div>
        <div class="ti-meta">${t.nodes.length} nodes · ${d.toLocaleDateString('th-TH')}</div>
      </div>
      <span style="color:var(--text3);font-size:18px">›</span>
    `;
    item.addEventListener('click', () => loadTree(t));
    list.appendChild(item);
  });
}

function loadTree(t) {
  tree = t;
  unlocked = new Set();
  pointsUsed = 0;

  // root nodes (no parents) = ฟรี ไม่นับ point
  tree.nodes.filter(n => TreeModel.isOriginNode(n)).forEach(n => unlocked.add(n.id));

  loadScreen.style.display = 'none';
  simLayout.style.display = 'flex';
  document.getElementById('sim-tree-name').textContent = tree.meta.name;
  resetView();
  renderAll();
  bindCanvas();
}

function importJSON() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const t = TreeModel.fromJSON(ev.target.result);
      if (!t) { alert('ไฟล์ JSON ไม่ถูกต้อง'); return; }
      loadTree(t);
    };
    reader.readAsText(file);
  };
  input.click();
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
}
function gridToCanvas(gx, gy) { return { x: gx*STEP, y: gy*STEP }; }

// ── Render ──
function renderAll() {
  renderEdges(); renderNodes(); renderSummary(); renderPts();
}

function renderEdges() {
  svg.innerHTML = '';
  if (!tree) return;
  for (const node of tree.nodes) {
    const {x:x2,y:y2} = gridToCanvas(node.gx, node.gy);
    for (const pid of node.parents) {
      const p = TreeModel.getNode(tree, pid); if (!p) continue;
      const {x:x1,y:y1} = gridToCanvas(p.gx, p.gy);
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',x1); line.setAttribute('y1',y1);
      line.setAttribute('x2',x2); line.setAttribute('y2',y2);
      line.classList.add('edge');
      const bothUnlocked = unlocked.has(node.id) && unlocked.has(pid);
      const available = canUnlockNode(node);
      if (bothUnlocked) line.classList.add('active');
      else if (available) line.classList.add('available');
      svg.appendChild(line);
    }
  }
}

function renderNodes() {
  canvas.querySelectorAll('.node').forEach(el => el.remove());
  if (!tree) return;
  for (const node of tree.nodes) {
    const {x,y} = gridToCanvas(node.gx, node.gy);
    const isUnlocked  = unlocked.has(node.id);
    const isRoot = TreeModel.isOriginNode(node);
    const isAvailable = !isUnlocked && canUnlockNode(node);

    let stateClass = isUnlocked ? 'unlocked' : isAvailable ? 'available' : 'locked';
    const el = document.createElement('div');
    el.className = `node ${stateClass}${node.type==='keystone'?' keystone':''}${isRoot?' root-node':''}`;
    el.dataset.id = node.id;
    el.style.left = x+'px'; el.style.top = y+'px';
    const baseIcon = node.icon || (node.type==='keystone' ? '◆' : '●');
    const nodeColor = node.color || (isUnlocked ? '#1a2040' : 'var(--bg3)');
    const borderColor = isUnlocked
      ? (node.type==='keystone' ? 'var(--gold)' : 'var(--accent)')
      : isAvailable ? 'rgba(123,143,255,.5)' : 'var(--border2)';
    el.innerHTML = `
      <div class="node-inner" style="${node.color ? 'background:'+nodeColor+';' : ''}border-color:${borderColor}">
        <span class="node-icon-label" style="font-size:16px">${baseIcon}</span>
      </div>
      <div class="node-label">${node.label}</div>
    `;
    el.addEventListener('click', e => { e.stopPropagation(); handleNodeClick(node); });
    canvas.appendChild(el);
  }
}

// ── Point logic ──
function isRootNode(node) {
  return TreeModel.isOriginNode(node);
}

function canUnlockNode(node) {
  if (unlocked.has(node.id)) return false;
  if (TreeModel.isOriginNode(node)) return true;
  if (pointsUsed >= MAX_POINTS) return false;
  return TreeModel.canUnlock(tree, node.id, unlocked);
}

function handleNodeClick(node) {
  const isUnlocked = unlocked.has(node.id);
  const isRoot = isRootNode(node);

  if (isUnlocked && !isRoot) {
    // พยายาม lock (refund point)
    if (TreeModel.canLock(tree, node.id, unlocked)) {
      unlocked.delete(node.id);
      pointsUsed = Math.max(0, pointsUsed - 1);
      renderAll();
      showNodeInfo(node);
    } else {
      showNodeInfo(node, 'locked');
    }
  } else if (!isUnlocked) {
    if (pointsUsed >= MAX_POINTS) {
      showNodeInfo(node, 'nopt');
      return;
    }
    if (!canUnlockNode(node)) {
      showNodeInfo(node, 'noreq');
      return;
    }
    unlocked.add(node.id);
    if (!isRoot) pointsUsed++;
    renderAll();
    showNodeInfo(node);
  }
}

function showNodeInfo(node, errType) {
  const box = document.getElementById('node-info');
  const isUnlocked = unlocked.has(node.id);
  let html = `<h4>${node.label}${node.type==='keystone'?' <span class="tag keystone">Keystone</span>':''}</h4>`;

  if (node.stats.length === 0) {
    html += '<div class="ni-stat" style="color:var(--text3)">ไม่มี stat</div>';
  } else {
    node.stats.forEach(s => {
      const def = statMap[s.stat];
      const label = def ? def.label : s.stat;
      const unit = def && def.unit==='percent' ? '%' : '';
      html += `<div class="ni-stat">${label}: <span>+${s.value}${unit}</span></div>`;
    });
  }

  if (node.parents.length > 0) {
    const pNames = node.parents.map(pid => {
      const p = TreeModel.getNode(tree, pid);
      const done = unlocked.has(pid);
      return `<span style="color:${done?'var(--green)':'var(--red)'}">${p?p.label:pid}${done?' ✓':' ✗'}</span>`;
    }).join(', ');
    html += `<div class="ni-parents">ต้องการ: ${pNames}</div>`;
  }

  if (errType === 'locked')  html += `<div class="ni-locked-msg">⚠ ยกเลิกไม่ได้ — node ลูกยังอยู่</div>`;
  if (errType === 'nopt')    html += `<div class="ni-locked-msg">⚠ points หมดแล้ว (${MAX_POINTS}/${MAX_POINTS})</div>`;
  if (errType === 'noreq')   html += `<div class="ni-locked-msg">🔒 ต้องอัพ parent ให้ครบก่อน</div>`;
  if (isUnlocked && !isRootNode(node)) html += `<div style="font-size:11px;color:var(--text3);margin-top:4px">คลิกอีกครั้งเพื่อยกเลิก (คืน 1 point)</div>`;

  box.innerHTML = html;
}

// ── Stat summary ──
function renderSummary() {
  const totals = TreeModel.calcStats(tree, unlocked);
  const container = document.getElementById('stat-summary');
  container.innerHTML = '';
  const groups = {
    'โจมตี': ['attack-damage','attack-speed','critical-strike-chance','critical-strike-power','skill-critical-strike-chance','skill-critical-strike-power'],
    'ความเสียหาย': ['physical-damage','magic-damage','skill-damage','weapon-damage','projectile-damage','pve-damage','pvp-damage','undead-damage','elemental-damage','lifesteal','spell-vampirism'],
    'ป้องกัน': ['defense','damage-reduction','physical-damage-reduction','magic-damage-reduction','projectile-damage-reduction','fire-damage-reduction','fall-damage-reduction','pve-damage-reduction','pvp-damage-reduction'],
    'หลบ/บล็อค': ['block-rating','block-power','block-cooldown-reduction','dodge-rating','dodge-cooldown-reduction','parry-rating','parry-cooldown-reduction'],
    'ฟื้นฟู/ทรัพยากร': ['max-health','health-regeneration','max-mana','mana-regeneration','max-stamina','stamina-regeneration'],
    'ยูทิลิตี้': ['cooldown-reduction','movement-speed'],
  };
  let hasAny = false;
  for (const [groupName, statIds] of Object.entries(groups)) {
    const relevant = statIds.filter(id => totals[id]);
    if (!relevant.length) continue;
    hasAny = true;
    const label = document.createElement('div');
    label.className = 'stat-group-label';
    label.textContent = groupName;
    container.appendChild(label);
    relevant.forEach(id => {
      const def = statMap[id];
      const val = totals[id];
      const unit = def && def.unit==='percent' ? '%' : '';
      const line = document.createElement('div');
      line.className = 'stat-line';
      line.innerHTML = `<span class="s-name">${def?def.label:id}</span><span class="s-val">+${val}${unit}</span>`;
      container.appendChild(line);
    });
  }
  if (!hasAny) container.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px 0">ยังไม่ได้อัพ node ใดเลย</div>';
}

function renderPts() {
  if (!tree) return;
  const remaining = MAX_POINTS - pointsUsed;
  document.getElementById('pts-used').textContent = pointsUsed;
  document.getElementById('pts-total').textContent = MAX_POINTS;
  document.getElementById('pts-remaining').textContent = remaining;
  document.getElementById('pts-bar-fill').style.width = (pointsUsed / MAX_POINTS * 100) + '%';
  // เปลี่ยนสี bar เมื่อใกล้หมด
  const bar = document.getElementById('pts-bar-fill');
  if (remaining <= 10) bar.style.background = 'var(--red)';
  else if (remaining <= 30) bar.style.background = 'var(--gold)';
  else bar.style.background = 'var(--accent2)';
}

// ── Canvas events ──
function bindCanvas() {
  canvasWrap.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvasWrap.getBoundingClientRect();
    const mx = e.clientX-rect.left, my = e.clientY-rect.top;
    const delta = e.deltaY>0 ? 0.9 : 1.1;
    const ns = Math.min(2.5, Math.max(0.3, scale*delta));
    panX = mx-(mx-panX)*(ns/scale); panY = my-(my-panY)*(ns/scale);
    scale = ns; applyTransform();
  }, {passive:false});

  canvasWrap.addEventListener('mousedown', e => {
    if (e.button===1 || (e.button===0 && e.altKey)) {
      e.preventDefault(); isPanning=true;
      panStart={x:e.clientX,y:e.clientY,panX,panY};
      canvasWrap.style.cursor='grabbing';
    }
  });
  window.addEventListener('mousemove', e => {
    if (!isPanning) return;
    panX = panStart.panX+(e.clientX-panStart.x);
    panY = panStart.panY+(e.clientY-panStart.y);
    applyTransform();
  });
  window.addEventListener('mouseup', () => {
    if (isPanning) { isPanning=false; canvasWrap.style.cursor='default'; }
  });
}

// ── Topbar ──
function bindTopbar() {
  document.getElementById('btn-load').addEventListener('click', showLoadScreen);
  document.getElementById('btn-import').addEventListener('click', importJSON);
  document.getElementById('btn-reset-view').addEventListener('click', resetView);
  document.getElementById('btn-reset-pts').addEventListener('click', () => {
    if (!tree) return;
    unlocked = new Set();
    pointsUsed = 0;
    tree.nodes.filter(n => TreeModel.isOriginNode(n)).forEach(n => unlocked.add(n.id));
    renderAll();
    document.getElementById('node-info').innerHTML = '<span style="color:var(--text3);font-size:12px">คลิก node เพื่อดูรายละเอียด</span>';
  });
}

init();
