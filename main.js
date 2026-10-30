// ============ ESTADO ============
let nodes = [];        // lista plana de elementos (hijos directos del ScreenGui)
let selectedId = null;
let idCounter = 0;
let drag = null;

const canvas = document.getElementById('canvas');

// ============ AÑADIR ELEMENTOS ============
const DEFAULTS = {
  Frame:      { w: 200, h: 120, bg: '#3a3a4a', textColor: '#ffffff', text: '',      fontSize: 16, cornerRadius: 8 },
  TextLabel:  { w: 160, h: 40,  bg: '#2a2a3a', textColor: '#ffffff', text: 'Texto', fontSize: 16, cornerRadius: 6 },
  TextButton: { w: 160, h: 44,  bg: '#5a5aff', textColor: '#ffffff', text: 'Botón', fontSize: 16, cornerRadius: 8 },
  ImageLabel: { w: 120, h: 120, bg: '#444455', textColor: '#ffffff', text: '',      fontSize: 16, cornerRadius: 8 },
};

function addNode(type) {
  const d = DEFAULTS[type] || DEFAULTS.Frame;
  const node = {
    id: ++idCounter,
    type,
    name: `${type}${idCounter}`,
    x: 20,
    y: 20 + nodes.length * 16,
    ...d,
  };
  nodes.push(node);
  selectedId = node.id;
  render();
  updateProps();
}

document.querySelectorAll('#palette button').forEach(btn => {
  btn.addEventListener('click', () => addNode(btn.dataset.type));
});

// ============ RENDER ============
function render() {
  canvas.innerHTML = '';
  for (const node of nodes) {
    const el = document.createElement('div');
    el.className = 'node' + (node.id === selectedId ? ' selected' : '');
    el.dataset.id = node.id;
    applyStyles(el, node);
    canvas.appendChild(el);
  }
}

function applyStyles(el, node) {
  el.style.left = node.x + 'px';
  el.style.top = node.y + 'px';
  el.style.width = node.w + 'px';
  el.style.height = node.h + 'px';
  el.style.background = node.bg;
  el.style.color = node.textColor;
  el.style.fontSize = node.fontSize + 'px';
  el.style.borderRadius = node.cornerRadius + 'px';
  el.textContent = node.text || '';
}

// ============ DRAG (touch + mouse) ============
canvas.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.node');
  if (!el) {
    selectedId = null;
    render();
    updateProps();
    return;
  }
  const id = +el.dataset.id;
  const node = nodes.find(n => n.id === id);
  selectedId = id;

  drag = { id, el, node, startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y };

  canvas.setPointerCapture(e.pointerId);
  document.querySelectorAll('.node.selected').forEach(n => n.classList.remove('selected'));
  el.classList.add('selected');
  updateProps();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.node.x = Math.round(drag.origX + (e.clientX - drag.startX));
  drag.node.y = Math.round(drag.origY + (e.clientY - drag.startY));
  drag.el.style.left = drag.node.x + 'px';
  drag.el.style.top = drag.node.y + 'px';
});

canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });

// ============ PANEL DE PROPIEDADES ============
const propsPanel = document.getElementById('properties');
const propsContent = document.getElementById('props-content');

document.getElementById('close-props').addEventListener('click', () => {
  selectedId = null;
  propsPanel.classList.add('hidden');
  render();
});

function updateProps() {
  const node = nodes.find(n => n.id === selectedId);
  if (!node) {
    propsPanel.classList.add('hidden');
    return;
  }
  propsPanel.classList.remove('hidden');

  const hasText = node.type === 'TextLabel' || node.type === 'TextButton';
  propsContent.innerHTML = `
    <label>Nombre <input data-prop="name" value="${node.name}" /></label>
    <label>X <input type="number" data-prop="x" value="${node.x}" /></label>
    <label>Y <input type="number" data-prop="y" value="${node.y}" /></label>
    <label>Ancho <input type="number" data-prop="w" value="${node.w}" /></label>
    <label>Alto <input type="number" data-prop="h" value="${node.h}" /></label>
    <label>Fondo <input type="color" data-prop="bg" value="${node.bg}" /></label>
    ${hasText ? `
      <label>Texto <input data-prop="text" value="${node.text}" /></label>
      <label>Color texto <input type="color" data-prop="textColor" value="${node.textColor}" /></label>
      <label>Tamaño fuente <input type="number" data-prop="fontSize" value="${node.fontSize}" /></label>
    ` : ''}
    <label>Radio <input type="number" data-prop="cornerRadius" value="${node.cornerRadius}" /></label>
  `;

  propsContent.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', (e) => {
      const prop = e.target.dataset.prop;
      const val = e.target.type === 'number' ? +e.target.value : e.target.value;
      node[prop] = val;
      const el = canvas.querySelector(`.node[data-id="${node.id}"]`);
      if (el) applyStyles(el, node);
    });
  });
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

  for (const n of nodes) {
    const v = 'ui_' + n.name.replace(/[^a-zA-Z0-9_]/g, '');
    L.push(`-- ${n.name}`);
    L.push(`local ${v} = Instance.new("${n.type}")`);
    L.push(`${v}.Name = "${n.name}"`);
    L.push(`${v}.Position = UDim2.fromOffset(${n.x}, ${n.y})`);
    L.push(`${v}.Size = UDim2.fromOffset(${n.w}, ${n.h})`);
    L.push(`${v}.BackgroundColor3 = ${color3(n.bg)}`);
    if (n.text) {
      L.push(`${v}.Text = "${escape(n.text)}"`);
      L.push(`${v}.TextColor3 = ${color3(n.textColor)}`);
      L.push(`${v}.TextSize = ${n.fontSize}`);
    }
    if (n.cornerRadius > 0) {
      L.push(`local corner_${v} = Instance.new("UICorner")`);
      L.push(`corner_${v}.CornerRadius = UDim.new(0, ${n.cornerRadius})`);
      L.push(`corner_${v}.Parent = ${v}`);
    }
    L.push(`${v}.Parent = screenGui`);
    L.push('');
  }

  return L.join('\n');
}

function color3(hex) {
  const h = hex.replace('#', '');
  return `Color3.fromRGB(${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)})`;
}

function escape(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ============ EXPORT MODAL ============
const modal = document.getElementById('export-modal');
const codeEl = document.getElementById('export-code');

document.getElementById('export-btn').addEventListener('click', () => {
  codeEl.textContent = generateLuau();
  modal.classList.remove('hidden');
});

document.getElementById('close-export').addEventListener('click', () => {
  modal.classList.add('hidden');
});

document.getElementById('copy-btn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(codeEl.textContent);
    document.getElementById('copy-btn').textContent = '¡Copiado!';
    setTimeout(() => document.getElementById('copy-btn').textContent = 'Copiar código', 1500);
  } catch {
    document.getElementById('copy-btn').textContent = 'Error al copiar';
  }
});

// ============ INICIAL ============
render();