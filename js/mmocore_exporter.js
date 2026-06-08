// mmocore_exporter.js — แปลง STB tree → MMOCore YAML

// ── Stat ID mapping: STB → MMOCore ──
const STAT_MAP = {
  'max-health':                 'MAX_HEALTH',
  'health-regeneration':        'HEALTH_REGENERATION',
  'max-mana':                   'MAX_MANA',
  'mana-regeneration':          'MANA_REGENERATION',
  'max-stamina':                'MAX_STAMINA',
  'stamina-regeneration':       'STAMINA_REGENERATION',
  'attack-damage':              'ATTACK_DAMAGE',
  'attack-speed':               'ATTACK_SPEED',
  'critical-strike-chance':     'CRITICAL_STRIKE_CHANCE',
  'critical-strike-power':      'CRITICAL_STRIKE_POWER',
  'skill-critical-strike-chance':'SKILL_CRITICAL_STRIKE_CHANCE',
  'skill-critical-strike-power': 'SKILL_CRITICAL_STRIKE_POWER',
  'physical-damage':            'PHYSICAL_DAMAGE',
  'magic-damage':               'MAGIC_DAMAGE',
  'skill-damage':               'SKILL_DAMAGE',
  'weapon-damage':              'WEAPON_DAMAGE',
  'projectile-damage':          'PROJECTILE_DAMAGE',
  'pve-damage':                 'PVE_DAMAGE',
  'pvp-damage':                 'PVP_DAMAGE',
  'undead-damage':              'UNDEAD_DAMAGE',
  'elemental-damage':           'ELEMENTAL_DAMAGE',
  'lifesteal':                  'LIFESTEAL',
  'spell-vampirism':            'SPELL_VAMPIRISM',
  'defense':                    'DEFENSE',
  'damage-reduction':           'DAMAGE_REDUCTION',
  'physical-damage-reduction':  'PHYSICAL_DAMAGE_REDUCTION',
  'magic-damage-reduction':     'MAGIC_DAMAGE_REDUCTION',
  'projectile-damage-reduction':'PROJECTILE_DAMAGE_REDUCTION',
  'fire-damage-reduction':      'FIRE_DAMAGE_REDUCTION',
  'fall-damage-reduction':      'FALL_DAMAGE_REDUCTION',
  'pve-damage-reduction':       'PVE_DAMAGE_REDUCTION',
  'pvp-damage-reduction':       'PVP_DAMAGE_REDUCTION',
  'block-rating':               'BLOCK_RATING',
  'block-power':                'BLOCK_POWER',
  'block-cooldown-reduction':   'BLOCK_COOLDOWN_REDUCTION',
  'dodge-rating':               'DODGE_RATING',
  'dodge-cooldown-reduction':   'DODGE_COOLDOWN_REDUCTION',
  'parry-rating':               'PARRY_RATING',
  'parry-cooldown-reduction':   'PARRY_COOLDOWN_REDUCTION',
  'cooldown-reduction':         'COOLDOWN_REDUCTION',
  'movement-speed':             'MOVEMENT_SPEED',
};

const STAT_LABEL = {};
if (window.STATS_DATA) {
  window.STATS_DATA.forEach(s => { STAT_LABEL[s.id] = s.label; });
}

// ── Color name → custom-model-data ──
const COLOR_MODEL = {
  red:    { unlocked:423, unlockable:420 },
  green:  { unlocked:422, unlockable:419 },
  pink:   { unlocked:425, unlockable:418 },
  blue:   { unlocked:424, unlockable:421 },
  yellow: { unlocked:414, unlockable:415 },
};

function getDisplayData(node) {
  const color = (node.mmoColor || 'red'); // default red ถ้าไม่ได้ตั้ง
  const m = COLOR_MODEL[color] || COLOR_MODEL.red;
  return {
    unlocked:      { item:'YELLOW_DYE', 'custom-model-data': m.unlocked },
    unlockable:    { item:'YELLOW_DYE', 'custom-model-data': m.unlockable },
    locked:        { item:'YELLOW_DYE', 'custom-model-data': 412 },
    'fully-locked':{ item:'YELLOW_DYE', 'custom-model-data': 413 },
  };
}

function nodeId(node, isOrigin) {
  if (isOrigin) return 'start';
  return node.id.replace(/[^a-zA-Z0-9_]/g, '_');
}

// MMOCore ใช้ stride 2 เสมอ
function toMMOCoord(gx, gy) {
  return { x: gx * 2, y: gy * 2 };
}

// คำนวณ path direction (normalized unit vector)
// parent coord → child coord → direction step
// เช่น parent(0,0) child(-2,0) → path '-1 0'
// เช่น parent(0,0) child(0,4)  → path '0 1' (ใน MMOCore coord คือ 0,4 → step 0,1)
function calcPath(parentNode, childNode) {
  const px = parentNode.gx * 2;
  const py = parentNode.gy * 2;
  const cx = childNode.gx * 2;
  const cy = childNode.gy * 2;
  const dx = cx - px;
  const dy = cy - py;
  // normalize เป็น unit direction
  const len = Math.max(Math.abs(dx), Math.abs(dy));
  if (len === 0) return '0 0';
  const nx = dx / len;
  const ny = dy / len;
  return `${nx} ${ny}`;
}

function makeTriggers(stats) {
  if (!stats || stats.length === 0) return [];
  return stats.map(s => {
    const mmo = STAT_MAP[s.stat] || s.stat.toUpperCase().replace(/-/g,'_');
    return `stat{stat="${mmo}";amount=${s.value};type="FLAT"}`;
  });
}

function makeLore(node, unlocked) {
  const lines = [];
  const statusColor = unlocked ? '&a' : '&8';
  lines.push(`${statusColor}${node.label}`);
  if (node.stats && node.stats.length > 0) {
    lines.push('');
    lines.push('<#49e3ff>ได้รับ:');
    node.stats.forEach(s => {
      const label = STAT_LABEL[s.stat] || s.stat;
      const unit  = (window.STATS_DATA||[]).find(x=>x.id===s.stat)?.unit==='percent'?'%':'';
      lines.push(`<#ccf7ff> ▪ ${label} <#aff2ff>(+${s.value}${unit})`);
    });
  }
  return lines;
}

function yamlStr(val) {
  return `'${String(val).replace(/'/g,"''")}'`;
}

function yamlLines(lines) {
  return lines.map(l => `        - ${yamlStr(l)}`).join('\n');
}

function exportToMMOCore(tree, opts = {}) {
  const treeName  = (opts.treeName || tree.meta?.name || 'my_tree')
    .toLowerCase().replace(/[^a-z0-9_]/g,'_');
  const displayName = opts.displayName || opts.treeName || tree.meta?.name || 'My Tree';
  const maxPoints = opts.maxPoints || 100;

  const nodes = tree.nodes || [];
  const isOriginFn = n => !!(n.isOrigin || (n.gx===0 && n.gy===0 && n.parents.length===0));
  const originNode = nodes.find(n => isOriginFn(n));

  let yaml = '';
  yaml += `id: '${treeName}'\n`;
  yaml += `name: '<#AEC6CF>${displayName}'\n`;
  yaml += `type: 'custom'\n`;
  yaml += `item: 'YELLOW_DYE'\n`;
  yaml += `custom-model-data: 426\n`;
  yaml += `lore:\n`;
  yaml += `- '<#d2dae2>Passive tree สำหรับ ${displayName}'\n`;
  yaml += `max-point-spent: ${maxPoints}\n`;
  yaml += `\nnodes:\n`;

  // ── เขียนทุก node ──
  nodes.forEach(node => {
    const isOri = isOriginFn(node);
    const id    = nodeId(node, isOri);
    const coord = toMMOCoord(node.gx, node.gy);
    const display = getDisplayData(node);
    const triggers = makeTriggers(node.stats || []);
    // keystone ใช้ size 1 เหมือนกัน
    const size = 1;

    // หา children ของ node นี้
    const children = nodes.filter(ch => ch.parents.includes(node.id));

    yaml += `########################################################################\n`;
    yaml += `  ${id}:\n`;
    yaml += `    name: '<#AEC6CF>${node.label}'\n`;
    yaml += `    coordinates:\n`;
    yaml += `      x: ${coord.x}\n`;
    yaml += `      y: ${coord.y}\n`;

    // paths (ถ้ามี children)
    if (children.length > 0) {
      yaml += `    paths:\n`;
      children.forEach(ch => {
        const chId = nodeId(ch, isOriginFn(ch));
        const path = calcPath(node, ch); // returns 'nx ny'
        const pathComma = path.replace(' ', ','); // '0 -1' → '0,-1'
        yaml += `      ${chId}:\n`;
        yaml += `        path: '${pathComma}'\n`;
      });
    }

    // parents (ถ้าไม่ใช่ root)
    if (!isOri && node.parents && node.parents.length > 0) {
      yaml += `    parents:\n`;
      yaml += `      strong:\n`;
      node.parents.forEach(pid => {
        const pNode = nodes.find(n => n.id === pid);
        const pId   = pNode ? nodeId(pNode, isOriginFn(pNode)) : pid;
        yaml += `        ${pId}: 1\n`;
      });
    }

    // display
    yaml += `    display:\n`;
    Object.entries(display).forEach(([k,v]) => {
      yaml += `      ${k}:\n`;
      yaml += `        item: "${v.item}"\n`;
      yaml += `        custom-model-data: ${v['custom-model-data']}\n`;
    });

    yaml += `    max-level: 1\n`;
    yaml += `    size: ${size}\n`;
    if (isOri) yaml += `    is-root: true\n`;
    yaml += `    point-consumed: 1\n`;
    yaml += `    experience-table:\n`;
    yaml += `      first_table_item:\n`;
    yaml += `        triggers:\n`;
    if (triggers.length > 0) {
      triggers.forEach(t => { yaml += `          - '${t}'\n`; });
    } else {
      yaml += `          - 'stat{stat="MAX_HEALTH";amount=1;type="FLAT"}'\n`;
    }
    yaml += `    lores:\n`;
    yaml += `      0:\n`;
    yaml += yamlLines(makeLore(node, false)) + '\n';
    yaml += `      1:\n`;
    yaml += yamlLines(makeLore(node, true)) + '\n';
  });

  return yaml;
}

window.exportToMMOCore = exportToMMOCore;
