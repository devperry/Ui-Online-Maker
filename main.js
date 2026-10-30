// ============ ESTADO ============
const root = { id: 'root', type: 'ScreenGui', name: 'ScreenGui', children: [] };
let nextId = 0;
let selectedId = null;
let drag = null;
let resize = null;
let currentDropTarget = null;

const MIN_SIZE = 20;
const canvas = document.getElementById('canvas');

// ============ TREE HELPERS ============
function findNode(id, node = root) {
  if (node.id === id) return node;
  for (const c of node.children || []) { const f = findNode(id, c); if (f) return f; }
  return null;
}
function findParent(target, node = root) {
  for (const c of node.children || []) {
    if (c === target) return node;
    const p = findParent(target, c); if (p) return p;
  }
  return null;
}
function isDescendant(node, ancestor) {
  if (node === ancestor) return true;
  for (const c of ancestor.children || []) if (isDescendant(node, c)) return true;
  return false;
}
function canBeParent(node) { return node === root || node.type === 'Frame'; }
function hasText(node) { return node.type === 'TextLabel' || node.type === 'TextButton'; }

function getAbsolutePosition(node) {
  if (node === root) return { x: 0, y: 0 };
  const parent = findParent(node);
  if (!parent) return { x: node.x, y: node.y };
  const pAbs = getAbsolutePosition(parent);
  const own = parent.layout
    ? (computeChildPositions(parent)[node.id] || { x: node.x, y: node.y })
    : { x: node.x, y: node.y };
  return { x: pAbs.x + own.x, y: pAbs.y + own.y };
}

// ============ DEFAULTS ============
const DEFAULTS = {
  Frame: {
    w: 200, h: 120, bg: '#3a3a4a', bgTransparency: 0,
    textColor: '#ffffff', text: '', fontSize: 16, cornerRadius: 8,
    visible: true, active: false, draggable: false,
    zIndex: 1, borderSizePixel: 0, clipsDescendants: false,
    layout: null, padding: { top: 0, right: 0, bottom: 0, left: 0 },
  },
  TextLabel: {
    w: 160, h: 40, bg: '#2e2e42', bgTransparency: 0,
    textColor: '#ffffff', text: 'Texto', fontSize: 16, cornerRadius: 6,
    visible: true, draggable: false,
    zIndex: 1, borderSizePixel: 0,
    textTransparency: 0, textScaled: false, textWrapped: false,
    textXAlignment: 'Center', textYAlignment: 'Center',
  },
  TextButton: {
    w: 160, h: 44, bg: '#5a5aff', bgTransparency: 0,
    textColor: '#ffffff', text: 'Botón', fontSize: 16, cornerRadius: 8,
    visible: true, active: true, draggable: false, autoButtonColor: true,
    zIndex: 1, borderSizePixel: 0,
    textTransparency: 0, textScaled: false, textWrapped: false,
    textXAlignment: 'Center', textYAlignment: 'Center',
  },
  ImageLabel: {
    w: 120, h: 120, bg: '#444455', bgTransparency: 0,
    textColor: '#ffffff', text: '', fontSize: 16, cornerRadius: 8,
    visible: true, draggable: false,
    zIndex: 1, borderSizePixel: 0,
    image: '', imageTransparency: 0,
  },
};

// ============ COMPUTE LAYOUT ============
// Devuelve { [childId]: {x, y} } relativo al content box del padre
function computeChildPositions(parent) {
  const positions = {};
  if (!parent.layout) {
    for (const c of parent.children) positions[c.id] = { x: c.x, y: c.y };
    return positions;
  }
  const pad = parent.padding || { top: 0, right: 0, bottom: 0, left: 0 };
  const innerW = parent.w - pad.left - pad.right;
  const innerH = parent.h - pad.top - pad.bottom;

  if (parent.layout.type === 'UIListLayout') {
    const L = parent.layout;
    let cursor = 0;
    for (const c of parent.children) {
      if (L.fillDirection === 'Vertical') {
        let x;
        if (L.horizontalAlignment === 'Left') x = pad.left;
        else if (L.horizontalAlignment === 'Right') x = pad.left + innerW - c.w;
        else x = pad.left + (innerW - c.w) / 2;
        positions[c.id] = { x: Math.round(x), y: Math.round(pad.top + cursor) };
        cursor += c.h + L.padding;
      } else {
        let y;
        if (L.verticalAlignment === 'Top') y = pad.top;
        else if (L.verticalAlignment === 'Bottom') y = pad.top + innerH - c.h;
        else y = pad.top + (innerH - c.h) / 2;
        positions[c.id] = { x: Math.round(pad.left + cursor), y: Math.round(y) };
        cursor += c.w + L.padding;
      }
    }
  } else if (parent.layout.type === 'UIGridLayout') {
    const G = parent.layout;
    const cols = Math.max(1, Math.floor((innerW + G.cellPaddingX) / (G.cellSizeX + G.cellPaddingX)));
    parent.children.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions[c.id] = {
        x: Math.round(pad.left + col * (G.cellSizeX + G.cellPaddingX)),
        y: Math.round(pad.top + row * (G.cellSizeY + G.cellPaddingY)),
      };
    });
  }
  return positions;
}

function getRenderedPosition(node) {
  const parent = findParent(node);
  if (!parent || !parent.layout) return { x: node.x, y: node.y };
  return computeChildPositions(parent)[node.id] || { x: node.x, y: node.y };
}

// ============ PATHS (para props anidadas) ============
function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setByPath(obj, path, val) {
  const keys = path.split('.');
  let t = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (t[keys[i]] == null) t[keys[i]] = {};
    t = t[keys[i]];
  }
  t[keys[keys.length - 1]] = val;
}

// ============ ADD ============
function addNode(type) {
  const d = DEFAULTS[type] || DEFAULTS.Frame;
  const sel = selectedId ? findNode(selectedId) : null;
  const parent = sel && canBeParent(sel) ? sel : root;

  const node = JSON.parse(JSON.stringify(d));
  Object.assign(node, { id: ++nextId, type, name: `${type}${nextId}`, x: 10, y: 10, children: [] });
  parent.children.push(node);
  selectedId = node.id;
  render();
  updateProps();
}
document.querySelectorAll('#palette button').forEach(b =>
  b.addEventListener('click', () => addNode(b.dataset.type))
);

// ============ RENDER ============
function render() {
  canvas.innerHTML = '';
  for (const c of root.children) canvas.appendChild(renderNode(c, { x: c.x, y: c.y }));
}

function renderNode(node, pos) {
  const el = document.createElement('div');
  el.className = 'node' + (node.id === selectedId ? ' selected' : '');
  if (node.layout) el.classList.add('has-layout');
  el.dataset.id = node.id;
  applyStyles(el, node, pos);

  const childPositions = computeChildPositions(node);
  for (const c of node.children) el.appendChild(renderNode(c, childPositions[c.id]));

  if (node.id === selectedId) {
    for (const dir of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const h = document.createElement('div');
      h.className = `handle handle-${dir}`;
      h.dataset.dir = dir;
      el.appendChild(h);
    }
  }
  return el;
}

function applyStyles(el, node, pos) {
  pos = pos || getRenderedPosition(node);
  el.style.left = pos.x + 'px';
  el.style.top = pos.y + 'px';
  el.style.width = node.w + 'px';
  el.style.height = node.h + 'px';
  el.style.background = hexToRgba(node.bg, 1 - (node.bgTransparency || 0));
  el.style.color = node.textColor;
  el.style.fontSize = (node.fontSize || 16) + 'px';
  el.style.borderRadius = (node.cornerRadius || 0) + 'px';
  el.style.zIndex = node.id === selectedId ? 999 : (node.zIndex || 1);

  if (node.visible === false) el.classList.add('node-hidden');
  else el.classList.remove('node-hidden');

  const alignX = { Left: 'flex-start', Center: 'center', Right: 'flex-end' }[node.textXAlignment] || 'center';
  const alignY = { Top: 'flex-start', Center: 'center', Bottom: 'flex-end' }[node.textYAlignment] || 'center';
  el.style.justifyContent = alignX;
  el.style.alignItems = alignY;

  let textEl = el.querySelector(':scope > .node-text');
  if (!textEl) {
    textEl = document.createElement('span');
    textEl.className = 'node-text';
    el.prepend(textEl);
  }
  if (hasText(node)) {
    textEl.style.display = '';
    textEl.textContent = node.text || '';
    textEl.style.color = node.textColor || '#fff';
    textEl.style.fontSize = (node.fontSize || 16) + 'px';
    textEl.style.opacity = 1 - (node.textTransparency || 0);
    textEl.style.whiteSpace = node.textWrapped ? 'normal' : 'nowrap';
    textEl.style.textOverflow = node.textWrapped ? 'clip' : 'ellipsis';
  } else textEl.style.display = 'none';
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${alpha})`;
}

// ============ RESIZE ============
function startResize(e, handle) {
  const el = handle.closest('.node');
  const node = findNode(+el.dataset.id);
  resize = {
    node,
    startX: e.clientX, startY: e.clientY,
    origX: node.x, origY: node.y,
    origW: node.w, origH: node.h,
    dir: handle.dataset.dir,
  };
  canvas.setPointerCapture(e.pointerId);
  e.stopPropagation();
}

function doResize(e) {
  const dx = e.clientX - resize.startX;
  const dy = e.clientY - resize.startY;
  const { dir } = resize;
  let x = resize.origX, y = resize.origY;
  let w = resize.origW, h = resize.origH;

  if (dir.includes('e')) w = Math.max(MIN_SIZE, resize.origW + dx);
  if (dir.includes('s')) h = Math.max(MIN_SIZE, resize.origH + dy);
  if (dir.includes('w')) {
    const nw = Math.max(MIN_SIZE, resize.origW - dx);
    x = resize.origX + (resize.origW - nw); w = nw;
  }
  if (dir.includes('n')) {
    const nh = Math.max(MIN_SIZE, resize.origH - dy);
    y = resize.origY + (resize.origH - nh); h = nh;
  }

  resize.node.x = Math.round(x);
  resize.node.y = Math.round(y);
  resize.node.w = Math.round(w);
  resize.node.h = Math.round(h);
  render(); // re-render completo: respeta layouts del padre y de los hijos
}

// ============ DRAG / DROP ============
canvas.addEventListener('pointerdown', (e) => {
  const handle = e.target.closest('.handle');
  if (handle) { startResize(e, handle); return; }

  const el = e.target.closest('.node');
  if (!el) { selectedId = null; render(); updateProps(); return; }

  const node = findNode(+el.dataset.id);
  selectedId = node.id;
  const rendered = getRenderedPosition(node);
  const parent = findParent(node);

  drag = {
    node, el,
    startX: e.clientX, startY: e.clientY,
    origX: rendered.x, origY: rendered.y,
    parentHasLayout: !!(parent && parent.layout),
    moved: false,
  };
  el.classList.add('dragging');
  canvas.setPointerCapture(e.pointerId);
  document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
  el.classList.add('selected');
  updateProps();
});

canvas.addEventListener('pointermove', (e) => {
  if (resize) { doResize(e); return; }
  if (!drag) return;
  const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  const newX = Math.round(drag.origX + dx);
  const newY = Math.round(drag.origY + dy);
  drag.el.style.left = newX + 'px';
  drag.el.style.top = newY + 'px';
  if (!drag.parentHasLayout) { drag.node.x = newX; drag.node.y = newY; }
  if (drag.moved) updateDropTarget(e.clientX, e.clientY);
});

canvas.addEventListener('pointerup', (e) => {
  if (resize) {
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    resize = null; render(); updateProps(); return;
  }
  if (!drag) return;
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
  drag.el.classList.remove('dragging');
  clearDropTarget();
  if (drag.moved) {
    const target = findDropTarget(e.clientX, e.clientY, drag.node);
    const parent = findParent(drag.node);
    if (target && target !== parent) reparent(drag.node, target);
  }
  drag = null; render(); updateProps();
});

canvas.addEventListener('pointercancel', () => {
  if (resize) { resize = null; render(); updateProps(); return; }
  if (!drag) return;
  drag.el.classList.remove('dragging');
  clearDropTarget();
  drag = null; render(); updateProps();
});

function findDropTarget(x, y, dragged) {
  const el = document.elementFromPoint(x, y);
  if (!el) return root;
  const nodeEl = el.closest('.node');
  if (!nodeEl) return root;
  const node = findNode(+nodeEl.dataset.id);
  if (!node) return root;
  if (node === dragged || isDescendant(node, dragged)) return findParent(dragged) || root;
  if (!canBeParent(node)) return findParent(dragged) || root;
  return node;
}
function updateDropTarget(x, y) {
  const target = findDropTarget(x, y, drag.node);
  if (target === currentDropTarget) return;
  clearDropTarget();
  currentDropTarget = target;
  const parent = findParent(drag.node);
  if (target && target !== root && target !== parent) {
    canvas.querySelector(`.node[data-id="${target.id}"]`)?.classList.add('drop-target');
  }
}
function clearDropTarget() {
  if (currentDropTarget && currentDropTarget !== root) {
    canvas.querySelector(`.node[data-id="${currentDropTarget.id}"]`)?.classList.remove('drop-target');
  }
  currentDropTarget = null;
}
function reparent(node, newParent) {
  const oldParent = findParent(node);
  if (!oldParent || oldParent === newParent) return;
  if (oldParent.layout || newParent.layout) {
    // En layouts la posición no importa; solo movemos en el árbol
    oldParent.children = oldParent.children.filter(c => c !== node);
    newParent.children.push(node);
    return;
  }
  const abs = getAbsolutePosition(node);
  const npAbs = getAbsolutePosition(newParent);
  oldParent.children = oldParent.children.filter(c => c !== node);
  node.x = Math.round(abs.x - npAbs.x);
  node.y = Math.round(abs.y - npAbs.y);
  newParent.children.push(node);
}

// ============ PROPS PANEL ============
const propsPanel   = document.getElementById('properties');
const propsContent = document.getElementById('props-content');
const hierarchyEl  = document.getElementById('hierarchy');

document.getElementById('close-props').addEventListener('click', () => {
  selectedId = null;
  propsPanel.classList.add('hidden');
  render();
});

function readValue(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'number' || input.type === 'range') return +input.value;
  return input.value;
}

function renderField(node, f) {
  const label = f.label || f.prop;
  let val;
  if (f.prop === '_layoutType') val = node.layout?.type || 'None';
  else val = getByPath(node, f.prop);

  if (f.type === 'checkbox') {
    return `<label class="field"><span>${label}</span>
      <input type="checkbox" data-prop="${f.prop}" ${val ? 'checked' : ''} /></label>`;
  }
  if (f.type === 'select') {
    const opts = f.options.map(o =>
      `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('');
    return `<label class="field"><span>${label}</span>
      <select data-prop="${f.prop}">${opts}</select></label>`;
  }
  if (f.type === 'range') {
    return `<label class="field"><span>${label} <small>${val}</small></span>
      <input type="range" data-prop="${f.prop}" min="${f.min}" max="${f.max}"
             step="${f.step}" value="${val}" /></label>`;
  }
  if (f.type === 'color') {
    return `<label class="field"><span>${label}</span>
      <input type="color" data-prop="${f.prop}" value="${val || '#000000'}" /></label>`;
  }
  return `<label class="field"><span>${label}</span>
    <input type="${f.type || 'text'}" data-prop="${f.prop}" value="${val ?? ''}" /></label>`;
}

function buildSections(node) {
  const sections = [];

  sections.push({ title: 'General', fields: [
    { prop: 'name', type: 'text', label: 'Nombre' },
    { prop: 'visible', type: 'checkbox', label: 'Visible' },
    { prop: 'zIndex', type: 'number', label: 'ZIndex' },
  ]});

  sections.push({ title: 'Layout', fields: [
    { prop: 'x', type: 'number', label: 'X' },
    { prop: 'y', type: 'number', label: 'Y' },
    { prop: 'w', type: 'number', label: 'Ancho' },
    { prop: 'h', type: 'number', label: 'Alto' },
    { prop: 'cornerRadius', type: 'number', label: 'Radio' },
  ]});

  sections.push({ title: 'Apariencia', fields: [
    { prop: 'bg', type: 'color', label: 'Fondo' },
    { prop: 'bgTransparency', type: 'range', label: 'Transp. fondo', min: 0, max: 1, step: 0.05 },
    { prop: 'borderSizePixel', type: 'number', label: 'BorderSizePixel' },
  ]});

  if (hasText(node)) {
    sections.push({ title: 'Texto', fields: [
      { prop: 'text', type: 'text', label: 'Texto' },
      { prop: 'textColor', type: 'color', label: 'Color' },
      { prop: 'textTransparency', type: 'range', label: 'Transp.', min: 0, max: 1, step: 0.05 },
      { prop: 'fontSize', type: 'number', label: 'Tamaño' },
      { prop: 'textScaled', type: 'checkbox', label: 'TextScaled' },
      { prop: 'textWrapped', type: 'checkbox', label: 'TextWrapped' },
      { prop: 'textXAlignment', type: 'select', label: 'Align X', options: ['Left', 'Center', 'Right'] },
      { prop: 'textYAlignment', type: 'select', label: 'Align Y', options: ['Top', 'Center', 'Bottom'] },
    ]});
  }

  // === LAYOUT / PADDING (solo Frames) ===
  if (node.type === 'Frame') {
    const layoutType = node.layout?.type || 'None';
    const fields = [
      { prop: '_layoutType', type: 'select', label: 'Layout', options: ['None', 'UIListLayout', 'UIGridLayout'] },
    ];
    if (layoutType === 'UIListLayout') {
      fields.push(
        { prop: 'layout.fillDirection', type: 'select', label: 'Direction', options: ['Vertical', 'Horizontal'] },
        { prop: 'layout.padding', type: 'number', label: 'Padding' },
        { prop: 'layout.horizontalAlignment', type: 'select', label: 'Align X', options: ['Left', 'Center', 'Right'] },
        { prop: 'layout.verticalAlignment', type: 'select', label: 'Align Y', options: ['Top', 'Center', 'Bottom'] },
      );
    } else if (layoutType === 'UIGridLayout') {
      fields.push(
        { prop: 'layout.cellSizeX', type: 'number', label: 'Cell W' },
        { prop: 'layout.cellSizeY', type: 'number', label: 'Cell H' },
        { prop: 'layout.cellPaddingX', type: 'number', label: 'Gap X' },
        { prop: 'layout.cellPaddingY', type: 'number', label: 'Gap Y' },
      );
    }
    sections.push({ title: 'Layout automático', fields });

    sections.push({ title: 'UIPadding', fields: [
      { prop: 'padding.top', type: 'number', label: 'Top' },
      { prop: 'padding.right', type: 'number', label: 'Right' },
      { prop: 'padding.bottom', type: 'number', label: 'Bottom' },
      { prop: 'padding.left', type: 'number', label: 'Left' },
    ]});
  }

  if (node.type === 'Frame' || node.type === 'TextButton') {
    const fields = [];
    fields.push({ prop: 'active', type: 'checkbox', label: 'Active' });
    if (node.type === 'TextButton')
      fields.push({ prop: 'autoButtonColor', type: 'checkbox', label: 'AutoButtonColor' });
    fields.push({ prop: 'draggable', type: 'checkbox', label: 'Draggable' });
    sections.push({ title: 'Interacción', fields });
  } else {
    sections.push({ title: 'Interacción', fields: [
      { prop: 'draggable', type: 'checkbox', label: 'Draggable' },
    ]});
  }

  if (node.type === 'Frame')
    sections.push({ title: 'Frame', fields: [
      { prop: 'clipsDescendants', type: 'checkbox', label: 'ClipsDescendants' },
    ]});

  if (node.type === 'ImageLabel')
    sections.push({ title: 'Imagen', fields: [
      { prop: 'image', type: 'text', label: 'Asset ID' },
      { prop: 'imageTransparency', type: 'range', label: 'Transp.', min: 0, max: 1, step: 0.05 },
    ]});

  return sections;
}

function updateProps() {
  const node = selectedId ? findNode(selectedId) : null;
  if (!node) { propsPanel.classList.add('hidden'); return; }
  propsPanel.classList.remove('hidden');
  renderHierarchy();

  const sections = buildSections(node);
  let html = '';
  for (const s of sections) {
    html += `<details open><summary>${s.title}</summary>`;
    for (const f of s.fields) html += renderField(node, f);
    html += `</details>`;
  }
  html += `<div class="props-actions">
    <button id="delete-btn">Eliminar</button>
    ${findParent(node) !== root ? '<button id="root-btn">Mover a raíz</button>' : ''}
  </div>`;
  propsContent.innerHTML = html;

  propsContent.querySelectorAll('[data-prop]').forEach(input => {
    const ev = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(ev, (e) => {
      const prop = e.target.dataset.prop;
      const val = readValue(e.target);

      // Selector de tipo de layout
      if (prop === '_layoutType') {
        if (val === 'None') node.layout = null;
        else if (val === 'UIListLayout') {
          if (node.layout?.type !== 'UIListLayout') node.layout = {
            type: 'UIListLayout', fillDirection: 'Vertical', padding: 8,
            horizontalAlignment: 'Center', verticalAlignment: 'Top',
          };
        } else if (val === 'UIGridLayout') {
          if (node.layout?.type !== 'UIGridLayout') node.layout = {
            type: 'UIGridLayout', cellSizeX: 100, cellSizeY: 100,
            cellPaddingX: 8, cellPaddingY: 8, fillDirection: 'Horizontal',
          };
        }
        render();
        updateProps();
        return;
      }

      setByPath(node, prop, val);
      render();
      if (prop === 'name') renderHierarchy();
    });
  });

  document.getElementById('delete-btn').addEventListener('click', () => {
    const p = findParent(node);
    if (p) p.children = p.children.filter(c => c !== node);
    selectedId = null; render(); updateProps();
  });
  const rootBtn = document.getElementById('root-btn');
  if (rootBtn) rootBtn.addEventListener('click', () => {
    reparent(node, root); render(); updateProps();
  });
}

function renderHierarchy() {
  hierarchyEl.innerHTML = '';
  const items = [];
  (function walk(node, depth) {
    for (const c of node.children) { items.push({ node: c, depth }); walk(c, depth + 1); }
  })(root, 0);

  if (!items.length) {
    hierarchyEl.innerHTML = '<div style="padding:8px;color:#888;font-size:13px;">Sin elementos todavía</div>';
    return;
  }
  const ICON = { Frame: '▢', TextLabel: 'T', TextButton: '▷', ImageLabel: '▣' };
  const LAYOUT_TAG = { UIListLayout: '↕', UIGridLayout: '▦' };
  for (const { node, depth } of items) {
    const btn = document.createElement('button');
    btn.className = 'hier-item' + (node.id === selectedId ? ' active' : '');
    btn.style.paddingLeft = (10 + depth * 14) + 'px';
    const layoutTag = node.layout ? ` <span style="opacity:.7">${LAYOUT_TAG[node.layout.type] || ''}</span>` : '';
    btn.innerHTML = `${ICON[node.type] || '•'} ${node.name}${layoutTag}`;
    if (node.visible === false) btn.classList.add('hidden-node');
    btn.addEventListener('click', () => {
      selectedId = node.id; render(); updateProps();
    });
    hierarchyEl.appendChild(btn);
  }
}

// ============ GENERADOR LUAU ============
function generateLuau() {
  const L = [];
  L.push('-- Generado por Luau GUI Designer');
  L.push('local Players = game:GetService("Players")');
  L.push('local player = Players.LocalPlayer');
  L.push('local playerGui = player:WaitForChild("PlayerGui")');
  L.push('');
  L.push('local screenGui = Instance.new("ScreenGui")');
  L.push('screenGui.Name = "MyUI"');
  L.push('screenGui.ResetOnSpawn = false');
  L.push('screenGui.Parent = playerGui');
  L.push('');

  const used = new Set(['screenGui']);
  function varFor(node) {
    let base = 'ui_' + sanitize(node.name);
    if (base === 'ui_') base = 'ui_' + node.type.toLowerCase();
    let name = base, i = 2;
    while (used.has(name)) name = base + '_' + i++;
    used.add(name);
    return name;
  }

  function emit(node, parentVar, depth, inLayout) {
    const ind = '  '.repeat(depth);
    const v = varFor(node);

    L.push(`${ind}local ${v} = Instance.new("${node.type}")`);
    L.push(`${ind}${v}.Name = "${esc(node.name)}"`);

    if (inLayout) L.push(`${ind}${v}.Position = UDim2.fromOffset(0, 0)`);
    else          L.push(`${ind}${v}.Position = UDim2.fromOffset(${node.x}, ${node.y})`);

    L.push(`${ind}${v}.Size = UDim2.fromOffset(${node.w}, ${node.h})`);
    L.push(`${ind}${v}.BackgroundColor3 = ${color3(node.bg)}`);
    if (node.bgTransparency) L.push(`${ind}${v}.BackgroundTransparency = ${node.bgTransparency}`);
    if (node.visible === false) L.push(`${ind}${v}.Visible = false`);
    if (node.zIndex && node.zIndex !== 1) L.push(`${ind}${v}.ZIndex = ${node.zIndex}`);
    if (node.borderSizePixel !== undefined) L.push(`${ind}${v}.BorderSizePixel = ${node.borderSizePixel}`);
    if (node.clipsDescendants) L.push(`${ind}${v}.ClipsDescendants = true`);
    if (node.draggable) L.push(`${ind}${v}.Draggable = true`);
    if (node.active !== undefined && node.type !== 'TextLabel' && node.type !== 'ImageLabel')
      L.push(`${ind}${v}.Active = ${node.active}`);
    if (node.autoButtonColor !== undefined && node.type === 'TextButton')
      L.push(`${ind}${v}.AutoButtonColor = ${node.autoButtonColor}`);

    if (hasText(node)) {
      L.push(`${ind}${v}.Text = "${esc(node.text || '')}"`);
      L.push(`${ind}${v}.TextColor3 = ${color3(node.textColor)}`);
      L.push(`${ind}${v}.TextSize = ${node.fontSize}`);
      if (node.textTransparency) L.push(`${ind}${v}.TextTransparency = ${node.textTransparency}`);
      if (node.textScaled) L.push(`${ind}${v}.TextScaled = true`);
      if (node.textWrapped) L.push(`${ind}${v}.TextWrapped = true`);
      if (node.textXAlignment) L.push(`${ind}${v}.TextXAlignment = Enum.TextXAlignment.${node.textXAlignment}`);
      if (node.textYAlignment) L.push(`${ind}${v}.TextYAlignment = Enum.TextYAlignment.${node.textYAlignment}`);
    }
    if (node.type === 'ImageLabel' && node.image) {
      L.push(`${ind}${v}.Image = "${esc(normalizeAsset(node.image))}"`);
      if (node.imageTransparency) L.push(`${ind}${v}.ImageTransparency = ${node.imageTransparency}`);
    }
    if (node.cornerRadius > 0) {
      L.push(`${ind}local corner_${v} = Instance.new("UICorner")`);
      L.push(`${ind}corner_${v}.CornerRadius = UDim.new(0, ${node.cornerRadius})`);
      L.push(`${ind}corner_${v}.Parent = ${v}`);
    }

    // Layout automático
    if (node.layout?.type === 'UIListLayout') {
      L.push(`${ind}local listLayout_${v} = Instance.new("UIListLayout")`);
      L.push(`${ind}listLayout_${v}.FillDirection = Enum.FillDirection.${node.layout.fillDirection}`);
      L.push(`${ind}listLayout_${v}.Padding = UDim.new(0, ${node.layout.padding})`);
      L.push(`${ind}listLayout_${v}.HorizontalAlignment = Enum.HorizontalAlignment.${node.layout.horizontalAlignment}`);
      L.push(`${ind}listLayout_${v}.VerticalAlignment = Enum.VerticalAlignment.${node.layout.verticalAlignment}`);
      L.push(`${ind}listLayout_${v}.SortOrder = Enum.SortOrder.LayoutOrder`);
      L.push(`${ind}listLayout_${v}.Parent = ${v}`);
    } else if (node.layout?.type === 'UIGridLayout') {
      L.push(`${ind}local gridLayout_${v} = Instance.new("UIGridLayout")`);
      L.push(`${ind}gridLayout_${v}.CellSize = UDim2.fromOffset(${node.layout.cellSizeX}, ${node.layout.cellSizeY})`);
      L.push(`${ind}gridLayout_${v}.CellPadding = UDim2.fromOffset(${node.layout.cellPaddingX}, ${node.layout.cellPaddingY})`);
      L.push(`${ind}gridLayout_${v}.FillDirection = Enum.FillDirection.${node.layout.fillDirection || 'Horizontal'}`);
      L.push(`${ind}gridLayout_${v}.Parent = ${v}`);
    }

    // UIPadding
    const p = node.padding;
    if (p && (p.top || p.right || p.bottom || p.left)) {
      L.push(`${ind}local padding_${v} = Instance.new("UIPadding")`);
      L.push(`${ind}padding_${v}.PaddingTop = UDim.new(0, ${p.top || 0})`);
      L.push(`${ind}padding_${v}.PaddingRight = UDim.new(0, ${p.right || 0})`);
      L.push(`${ind}padding_${v}.PaddingBottom = UDim.new(0, ${p.bottom || 0})`);
      L.push(`${ind}padding_${v}.PaddingLeft = UDim.new(0, ${p.left || 0})`);
      L.push(`${ind}padding_${v}.Parent = ${v}`);
    }

    L.push(`${ind}${v}.Parent = ${parentVar}`);
    L.push('');

    const childInLayout = !!node.layout;
    for (const c of node.children) emit(c, v, depth, childInLayout);
  }

  for (const c of root.children) emit(c, 'screenGui', 0, false);
  return L.join('\n');
}

const sanitize = s => s.replace(/[^a-zA-Z0-9_]/g, '');
const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const color3 = hex => {
  const h = hex.replace('#', '');
  return `Color3.fromRGB(${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)})`;
};
const normalizeAsset = s => /^\d+$/.test(s) ? `rbxassetid://${s}` : s;

// ============ EXPORT MODAL ============
const modal  = document.getElementById('export-modal');
const codeEl = document.getElementById('export-code');

document.getElementById('export-btn').addEventListener('click', () => {
  codeEl.textContent = generateLuau();
  modal.classList.remove('hidden');
});
document.getElementById('close-export').addEventListener('click', () => modal.classList.add('hidden'));
document.getElementById('copy-btn').addEventListener('click', async () => {
  const btn = document.getElementById('copy-btn');
  try {
    await navigator.clipboard.writeText(codeEl.textContent);
    btn.textContent = '¡Copiado!';
    setTimeout(() => btn.textContent = 'Copiar código', 1500);
  } catch { btn.textContent = 'Error al copiar'; }
});

// ============ INIT ============
render();