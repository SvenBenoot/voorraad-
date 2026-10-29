// ---- 3D-weergave voor Afmetingen
// Een tv (altijd zonder voet, hij hangt aan de muur) en een video soundbar als eenvoudige 3D-blokken op schaal, met
// maatlijnen. Geen bibliotheek: de blokken worden zelf geprojecteerd (rechte projectie, geen perspectief), zodat
// maten op het scherm in verhouding blijven. Details (scherm, camera, VESA-gaten) teken je gewoon in mm op het vlak;
// een SVG-matrix zet ze mee schuin.
import { html, useRef, useState } from '../lib/preact-htm.js';
import { prefs } from './store.js';

/** Vaste standpunten: [draaien, kantelen] in graden. */
export const VIEWS = { '3d': [-28, 14], front: [0, 0], side: [-90, 0], back: [180, 0] };

/** Lengte in mm als "1450 mm" of "145 cm", volgens Instellingen. */
export function fmtLen(v, unit = prefs.value.unit) {
  if (unit === 'cm') return (Math.round(v) / 10).toLocaleString('nl-BE', { maximumFractionDigits: 1, useGrouping: false }) + ' cm';
  return Math.round(v).toLocaleString('nl-BE', { useGrouping: false }) + ' mm';
}

// ---- projectie

const rad = (g) => (g * Math.PI) / 180;
function camera([yaw, pitch]) {
  const ca = Math.cos(rad(yaw)), sa = Math.sin(rad(yaw)), cb = Math.cos(rad(pitch)), sb = Math.sin(rad(pitch));
  // x naar rechts, y omhoog, z naar je toe (z = 0 is de muur). Positief kantelen = van boven kijken.
  const rot = ([x, y, z]) => { const z1 = -x * sa + z * ca; return [x * ca + z * sa, y * cb - z1 * sb, y * sb + z1 * cb]; };
  const P = (p) => { const r = rot(p); return [r[0], -r[1]]; };
  // Een vlak op diepte z0 (voor- of achterkant) als SVG-matrix: daarin teken je in mm, met y omhoog.
  const plane = (z0) => `matrix(${ca} ${-sa * sb} 0 ${-cb} ${z0 * sa} ${z0 * ca * sb})`;
  return { rot, P, plane };
}

// ---- kleuren (toestellen zijn zwart; licht van linksboven-voor geeft elk vlak een eigen tint)

const LIGHT = (() => { const v = [-0.35, 0.75, 0.55]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
const BASE = { body: [40, 46, 51], bar: [48, 54, 59] };
function shade(tone, n) {
  const f = 0.62 + 0.7 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  const [r, g, b] = BASE[tone].map((c) => Math.min(255, Math.round(c * f)));
  return `rgb(${r},${g},${b})`;
}

function faces({ min: [x0, y0, z0], max: [x1, y1, z1] }) {
  return [
    { n: [0, 0, 1], key: 'front', z: z1, pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { n: [0, 0, -1], key: 'back', z: z0, pts: [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]] },
    { n: [0, 1, 0], key: 'top', pts: [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]] },
    { n: [0, -1, 0], key: 'bottom', pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
    { n: [-1, 0, 0], key: 'left', pts: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
    { n: [1, 0, 0], key: 'right', pts: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },
  ];
}

// ---- toestellen als blokken

/**
 * Tv met de linkeronderhoek op (x, y). Vooraan een dun paneel met het scherm, achteraan een kleinere behuizing
 * met de VESA-gaten ongeveer in het midden (zoals bij de meeste tv's). Is de tv overal even dun, dan enkel het paneel.
 */
export function tvBlocks(t, x = 0, y = 0) {
  const { width: w, height: h, depth: d } = t;
  const p = Math.min(d, Math.max(12, Math.min(30, d * 0.4)));
  const cx = x + w / 2, cy = y + h / 2;
  const blocks = [];
  const vesa = (z) => (t.vesaW && t.vesaH ? { z, cx, cy, w: t.vesaW, h: t.vesaH } : null);
  const holes = (r) => {
    const s = Math.max(6, Math.min(w, h) * 0.008);
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [cx + (i * r.w) / 2, cy + (j * r.h) / 2]);
    return html`<rect x=${cx - r.w / 2} y=${cy - r.h / 2} width=${r.w} height=${r.h} fill="none" class="r3-vesa-line"
        stroke-width=${s * 0.5} stroke-dasharray=${`${s * 1.6} ${s * 1.2}`} />
      ${pts.map(([hx, hy]) => html`<circle cx=${hx} cy=${hy} r=${s} fill="#07090a" class="r3-vesa-hole" stroke-width=${s * 0.45} />`)}`;
  };
  if (d - p > 4) {
    const bw = Math.min(w - 40 > 0 ? w - 40 : w, Math.max(w * 0.62, (t.vesaW || 0) + 80));
    const bh = Math.min(h - 40 > 0 ? h - 40 : h, Math.max(h * 0.55, (t.vesaH || 0) + 80));
    const v = vesa(0);
    blocks.push({ tone: 'body', g: y, min: [cx - bw / 2, cy - bh / 2, 0], max: [cx + bw / 2, cy + bh / 2, d - p], back: v && holes(v) });
  }
  const b = Math.max(4, Math.min(w, h) * 0.012);
  const v = d - p > 4 ? null : vesa(0);
  blocks.push({
    tone: 'body', g: y, min: [x, y, d - p], max: [x + w, y + h, d],
    back: v && holes(v),
    front: html`<rect x=${x + b} y=${y + b * 1.6} width=${w - 2 * b} height=${h - 2.6 * b} fill="url(#r3-glass)" />`,
  });
  return blocks;
}

/** Video soundbar met de linkeronderhoek op (x, y): stoffen rooster links en rechts, camera in het midden. */
export function barBlocks(s, x = 0, y = 0) {
  const { width: w, height: h, depth: d } = s;
  const cx = x + w / 2, cy = y + h / 2;
  const cw = Math.min(w * 0.18, h * 2.4), ch = h * 0.78;
  const r = Math.min(ch * 0.36, cw * 0.3);
  const m = h * 0.14;
  const grille = (gx, gw) => (gw > 0 ? html`<rect x=${gx} y=${y + m} width=${gw} height=${h - 2 * m} rx=${h * 0.08} fill="url(#r3-grille)" />` : null);
  return [{
    tone: 'bar', g: y, min: [x, y, 0], max: [x + w, y + h, d],
    front: html`
      ${grille(x + m, cx - cw / 2 - m * 0.6 - (x + m))}
      ${grille(cx + cw / 2 + m * 0.6, x + w - m - (cx + cw / 2 + m * 0.6))}
      <rect x=${cx - cw / 2} y=${cy - ch / 2} width=${cw} height=${ch} rx=${ch / 2} fill="#0a0d0f" />
      <circle cx=${cx} cy=${cy} r=${r * 1.18} fill="none" stroke="#6d7a83" stroke-width=${r * 0.12} />
      <circle cx=${cx} cy=${cy} r=${r} fill="url(#r3-lens)" />
      <circle cx=${cx - r * 0.32} cy=${cy + r * 0.32} r=${r * 0.2} fill="#ffffff" opacity=".35" />
      <circle cx=${cx + cw / 2 - ch * 0.42} cy=${cy} r=${Math.max(1.2, h * 0.025)} fill="#30cf8a" />`,
  }];
}

// ---- tekening

/**
 * [blocks] van tvBlocks/barBlocks, [dims] = maatlijnen { a, b, off, text, dashed } in mm (off = waar de lijn naast
 * het toestel komt), [notes] = losse labels { at, text, dy }. [view] = [draaien, kantelen]; met [onRotate] kan je
 * slepen om te draaien.
 */
export function Render3D({ blocks, dims = [], notes = [], guides = [], marks = [], center, view, onRotate, label }) {
  const drag = useRef(null);
  const [id] = useState(() => 'r3' + Math.random().toString(36).slice(2, 7));
  const { rot, P, plane } = camera(view);

  // Grootte van het geheel: daarop schalen letters, lijnen en afstanden mee.
  const ext = [0, 1, 2].map((i) => Math.max(...blocks.map((b) => b.max[i])) - Math.min(...blocks.map((b) => b.min[i])));
  const S = Math.max(...ext, 100);
  const fs = S * 0.048, sw = S * 0.0035;

  const pts = [];
  const add = (p) => { pts.push(p); return p; };
  // Volgorde van tekenen (wat achter ligt eerst). Per toestel: van vooraan gezien eerst de behuizing en dan het
  // paneel, van achteraan omgekeerd. Tussen toestellen: van boven gezien eerst het onderste.
  const fromFront = rot([0, 0, 1])[2] >= 0;
  const fromAbove = view[1] >= 0;
  const order = (b) => [(b.g ?? 0) * (fromAbove ? 1 : -1), b.min[2] * (fromFront ? 1 : -1)];
  const sorted = [...blocks].sort((a, b) => { const x = order(a), y = order(b); return x[0] - y[0] || x[1] - y[1]; });
  const polys = [];
  for (const b of sorted) {
    for (const f of faces(b)) {
      const nz = rot(f.n)[2] - rot([0, 0, 0])[2];
      if (nz <= 1e-3) continue;
      const deco = f.key === 'front' ? b.front : f.key === 'back' ? b.back : null;
      polys.push({ fill: shade(b.tone, f.n), pts: f.pts.map((p) => add(P(p))), deco: deco && { z: f.z, svg: deco } });
    }
  }

  // Maatlijnen: hulplijnen vanaf het toestel, de lijn zelf met schuine streepjes aan de uiteinden, de maat erbij.
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const lines = [];
  const labels = [];
  for (const m of dims) {
    const off = m.off ?? [0, 0, 0];
    const a = P(m.a), b = P(m.b);
    const A = P(m.a.map((v, i) => v + off[i])), B = P(m.b.map((v, i) => v + off[i]));
    const len = Math.hypot(...sub(B, A));
    if (len < S * 0.03) continue;
    const u = sub(B, A).map((v) => v / len);
    let o = sub(A, a);
    let ol = Math.hypot(...o);
    if (ol < 1e-6) { o = [-u[1], u[0]]; ol = 1; }
    o = o.map((v) => v / ol);
    const t = fs * 0.35;
    const tick = (p) => `M${p[0] - (u[0] - o[0]) * t} ${p[1] - (u[1] - o[1]) * t}L${p[0] + (u[0] - o[0]) * t} ${p[1] + (u[1] - o[1]) * t}`;
    const ext2 = (p, q) => (Math.hypot(...sub(q, p)) > 1 ? `M${p[0]} ${p[1]}L${q[0] + o[0] * t} ${q[1] + o[1] * t}` : '');
    lines.push({ d: `M${A[0]} ${A[1]}L${B[0]} ${B[1]}` + (m.dashed ? '' : tick(A) + tick(B)), ext: ext2(a, A) + ext2(b, B), dashed: m.dashed, half: m.half });
    add(A); add(B);
    // Tekst naast de lijn, aan de buitenkant; bij een staande lijn links of rechts ervan.
    const w = m.text.length * fs * 0.56;
    const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const side = Math.abs(o[0]) > Math.abs(o[1]) ? Math.sign(o[0]) : 0;
    const at = side ? [mid[0] + side * (fs * 0.5 + w / 2), mid[1]] : [mid[0], mid[1] + Math.sign(o[1] || -1) * fs * 0.95];
    // Botst de maat met een vorige (bv. kleine maten boven elkaar), dan verder naar buiten schuiven.
    const hit = (q) => labels.some((l) => Math.abs(l.at[0] - q[0]) < (l.w + w) / 2 + fs * 0.4 && Math.abs(l.at[1] - q[1]) < fs * 1.5);
    for (let i = 0; i < 4 && hit(at); i++) {
      if (side) at[0] += side * (w + fs * 0.6); else at[1] += Math.sign(o[1] || -1) * fs * 1.5;
    }
    labels.push({ at, text: m.text, w, half: m.half });
  }
  for (const n of notes) {
    const p = P(n.at);
    const w = n.text.length * fs * 0.56;
    labels.push({ at: [p[0], p[1] + (n.dy ?? 0) * fs], text: n.text, w, note: true });
  }
  for (const l of labels) { add([l.at[0] - l.w / 2, l.at[1] - fs * 0.7]); add([l.at[0] + l.w / 2, l.at[1] + fs * 0.7]); }

  // Hulplijnen (bv. van het midden naar zijn maten) en kruisjes (het midden).
  const guideLines = guides.map((l) => [P(l.a), P(l.b)]);
  const markPts = marks.map((p) => P(p));

  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const pad = fs * 0.8;
  let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  // Het toestel in het midden van de tekening, ook als er links minder maten staan dan rechts.
  if (center) { const c = P(center)[0]; const r = Math.max(c - x0, x1 - c); x0 = c - r; x1 = c + r; }
  const box = [x0, Math.min(...ys) - pad, x1 - x0, Math.max(...ys) - Math.min(...ys) + 2 * pad];

  const down = (e) => {
    if (!onRotate) return;
    drag.current = { x: e.clientX, y: e.clientY, v: view, mouse: e.pointerType === 'mouse' };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const yaw = d.v[0] + (e.clientX - d.x) * 0.5;
    // Op een gsm schuift op en neer de pagina; kantelen enkel met de muis.
    const pitch = d.mouse ? Math.max(-20, Math.min(60, d.v[1] + (e.clientY - d.y) * 0.4)) : d.v[1];
    onRotate([((yaw + 540) % 360) - 180, pitch]);
  };
  const up = () => { drag.current = null; };

  return html`<svg class=${'r3' + (onRotate ? ' r3-drag' : '')} viewBox=${box.join(' ')} role="img" aria-label=${label}
    onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
    <defs>
      <linearGradient id="r3-glass" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#080b0d" /><stop offset=".42" stop-color="#101c22" />
        <stop offset=".5" stop-color="#1f4352" /><stop offset=".58" stop-color="#0d161b" /><stop offset="1" stop-color="#07090b" />
      </linearGradient>
      <radialGradient id="r3-lens" cx=".4" cy=".6" r=".7">
        <stop offset="0" stop-color="#2a6f8e" /><stop offset=".45" stop-color="#0d2633" /><stop offset="1" stop-color="#030405" />
      </radialGradient>
      <pattern id="r3-grille" patternUnits="userSpaceOnUse" width=${S * 0.006} height=${S * 0.006}>
        <rect width=${S * 0.006} height=${S * 0.006} fill="#20262a" />
        <circle cx=${S * 0.003} cy=${S * 0.003} r=${S * 0.0016} fill="#3c464d" />
      </pattern>
    </defs>
    ${polys.map((f, i) => html`<g key=${id + i}>
      <polygon points=${f.pts.map((p) => p.join(',')).join(' ')} fill=${f.fill} class="r3-edge" stroke-width=${sw * 0.6} />
      ${f.deco && html`<g transform=${plane(f.deco.z)}>${f.deco.svg}</g>`}
    </g>`)}
    ${guideLines.map(([a, b]) => html`<path d=${`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} class="r3-guide" stroke-width=${sw * 0.8}
      stroke-dasharray=${`${fs * 0.3} ${fs * 0.22}`} />`)}
    ${markPts.map((p) => html`<circle cx=${p[0]} cy=${p[1]} r=${fs * 0.45} class="r3-mark" stroke-width=${sw * 1.1} />
      <path d=${`M${p[0] - fs * 0.75} ${p[1]}H${p[0] + fs * 0.75}M${p[0]} ${p[1] - fs * 0.75}V${p[1] + fs * 0.75}`} class="r3-mark" stroke-width=${sw * 1.1} />`)}
    ${lines.map((l) => html`<path d=${l.ext} class="r3-ext" stroke-width=${sw * 0.7} />
      <path d=${l.d} class=${'r3-dim' + (l.dashed ? ' dashed' : '') + (l.half ? ' half' : '')} stroke-width=${sw * (l.dashed ? 1 : 1.1)}
        stroke-dasharray=${l.dashed ? `${fs * 0.35} ${fs * 0.25}` : null} />`)}
    ${labels.map((l) => html`<rect x=${l.at[0] - l.w / 2 - fs * 0.3} y=${l.at[1] - fs * 0.72} width=${l.w + fs * 0.6} height=${fs * 1.44}
        rx=${fs * 0.35} class="r3-chip" stroke-width=${sw * 0.6} />
      <text x=${l.at[0]} y=${l.at[1]} font-size=${fs} class=${'r3-text' + (l.note ? ' note' : '') + (l.half ? ' half' : '')}
        text-anchor="middle" dominant-baseline="central">${l.text}</text>`)}
  </svg>`;
}

// ---- als afbeelding delen

// In een losse afbeelding gelden de stijlen van de app niet: de kleuren gaan er rechtstreeks in.
const PAPER = {
  'r3-edge': { stroke: '#66737c' },
  'r3-ext': { stroke: '#8a979f', fill: 'none' },
  'r3-dim': { stroke: '#207088', fill: 'none', 'stroke-linecap': 'round' },
  half: { stroke: '#1d7c53' },
  halfText: { fill: '#1d7c53' },
  'r3-vesa-line': { stroke: '#30cf8a' },
  'r3-vesa-hole': { stroke: '#30cf8a' },
  'r3-chip': { fill: '#ffffff', stroke: '#dfe6ea' },
  'r3-text': { fill: '#191d1f', 'font-weight': '600' },
  note: { fill: '#207088' },
};
// Blauwdruk: witte lijnen op blauw.
const BLUEPRINT = {
  ...PAPER,
  'r3-edge': { stroke: '#9fc3dc' },
  'r3-ext': { stroke: '#7fa9c9', fill: 'none' },
  'r3-dim': { stroke: '#ffffff', fill: 'none', 'stroke-linecap': 'round' },
  half: { stroke: '#6fe3b0' },
  halfText: { fill: '#6fe3b0' },
  'r3-chip': { fill: '#12416a', stroke: '#2d6693' },
  'r3-text': { fill: '#ffffff', 'font-weight': '600' },
  note: { fill: '#6fe3b0' },
};
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const loadImage = async (src) => { const img = new Image(); img.src = src; await img.decode(); return img; };

/** De tekening als afbeelding van [w] breed, met de kleuren van [theme]. Geeft { img, h }. */
async function svgImage(svg, w, theme) {
  const clone = svg.cloneNode(true);
  for (const el of clone.querySelectorAll('[class]')) {
    for (const c of el.getAttribute('class').split(/\s+/)) {
      // "half" kleurt een tekst met fill, een lijn met stroke.
      const st = c === 'half' && el.tagName === 'text' ? theme.halfText : theme[c];
      if (st) for (const [k, v] of Object.entries(st)) el.setAttribute(k, v);
    }
    el.removeAttribute('class');
  }
  const [, , vw, vh] = clone.getAttribute('viewBox').split(/\s+/).map(Number);
  const h = Math.round((w * vh) / vw);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  clone.setAttribute('font-family', FONT);
  return { img: await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone))), h };
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function grid(g, x, y, w, h, step, color) {
  g.save(); rr(g, x, y, w, h, 18); g.clip();
  g.strokeStyle = color; g.lineWidth = 1;
  for (let i = x + step; i < x + w; i += step) { g.beginPath(); g.moveTo(i, y); g.lineTo(i, y + h); g.stroke(); }
  for (let j = y + step; j < y + h; j += step) { g.beginPath(); g.moveTo(x, j); g.lineTo(x + w, j); g.stroke(); }
  g.restore();
}
const brandGrad = (g, x0, x1) => { const b = g.createLinearGradient(x0, 0, x1, 0); b.addColorStop(0, '#30a9ce'); b.addColorStop(1, '#30cf8a'); return b; };
/** Tekst inkorten met … als hij niet past. */
function fit(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

/** Maten als tegels in twee kolommen; een lange waarde krijgt de volle breedte. [accent] = eerste tegel uitgelicht. */
function tiles(g, rows, x, y, w, { accent, dark } = {}) {
  const gap = 16, colW = (w - gap) / 2, th = 104;
  let col = 0;
  g.font = `600 34px ${FONT}`;
  rows.forEach(([label, value], i) => {
    const full = g.measureText(value).width > colW - 56;
    if (full && col === 1) { col = 0; y += th + gap; }
    const tx = x + col * (colW + gap), tw = full ? w : colW;
    const hi = accent && i === 0;
    rr(g, tx, y, tw, th, 16);
    g.fillStyle = hi ? '#eaf6fa' : dark ? '#12416a' : '#f6f9fb'; g.fill();
    g.strokeStyle = hi ? '#207088' : dark ? '#2d6693' : '#e2e9ed'; g.lineWidth = hi ? 2.5 : 2; g.stroke();
    g.textAlign = 'left';
    g.fillStyle = hi ? '#207088' : dark ? '#9fc3dc' : '#5e6c77'; g.font = `600 22px ${FONT}`;
    g.fillText(label.toUpperCase(), tx + 26, y + 40);
    g.fillStyle = hi ? '#207088' : dark ? '#ffffff' : '#191d1f'; g.font = `${hi ? 700 : 600} 34px ${FONT}`;
    g.fillText(fit(g, value, tw - 52), tx + 26, y + 84);
    if (full || col === 1) { col = 0; y += th + gap; } else col = 1;
  });
  return col ? y + th + gap : y;
}
const tilesHeight = (g, rows, w) => { const c = document.createElement('canvas').getContext('2d'); return tiles(c, rows, 0, 0, w); };

const today = () => new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * De tekening op het scherm als PNG: kop met naam, de tekening en de maten ([rows] = [label, waarde]) eronder.
 * [sub] = regel onder de naam, [accent] = eerste maat uitgelicht. Licht, zodat ze ook afgedrukt goed leesbaar is.
 */
export async function drawingPng(svg, title, rows, name, { sub = '', accent = false, style = 'A' } = {}) {
  const W = 1400, pad = 64, S = 2;
  const logo = await loadImage('img/logo-doos.svg').catch(() => null);
  const blue = style === 'C';
  const drawW = W - 2 * pad - 80;
  const { img, h: dh } = await svgImage(svg, drawW, blue ? BLUEPRINT : PAPER);
  const head = style === 'A' ? 190 : 170;
  const cardH = dh + 80;
  const specH = tilesHeight(null, rows, W - 2 * pad);
  const tableH = rows.length * 64;
  const H = head + 40 + cardH + 56 + (style === 'B' ? tableH : specH) + 110;

  const canvas = document.createElement('canvas');
  canvas.width = W * S; canvas.height = H * S;
  const g = canvas.getContext('2d');
  g.scale(S, S);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);

  // kop
  if (style === 'A') {
    g.fillStyle = '#14272f'; g.fillRect(0, 0, W, head);
    g.fillStyle = brandGrad(g, 0, W); g.fillRect(0, head, W, 8);
    if (logo) g.drawImage(logo, pad, 52, 78, 85);
    g.fillStyle = '#ffffff'; g.font = `700 50px ${FONT}`; g.textAlign = 'left';
    g.fillText(fit(g, title, W - 2 * pad - 110), pad + 110, 100);
    g.fillStyle = '#b3c0c8'; g.font = `400 28px ${FONT}`; g.fillText(sub, pad + 110, 144);
  } else {
    g.fillStyle = brandGrad(g, 0, W); g.fillRect(0, 0, W, 10);
    if (logo) g.drawImage(logo, pad, 58, 64, 70);
    g.fillStyle = '#191d1f'; g.font = `700 48px ${FONT}`; g.textAlign = 'left';
    g.fillText(fit(g, title, W - 2 * pad - 420), pad + 92, 98);
    g.fillStyle = '#5e6c77'; g.font = `400 27px ${FONT}`; g.fillText(sub, pad + 92, 138);
    g.textAlign = 'right'; g.fillStyle = '#8a979f'; g.font = `400 24px ${FONT}`;
    g.fillText(today(), W - pad, 98);
    g.fillStyle = '#e4eaed'; g.fillRect(pad, head - 2, W - 2 * pad, 2);
  }

  // tekenvlak
  const cy = head + 40;
  rr(g, pad, cy, W - 2 * pad, cardH, 18);
  g.fillStyle = blue ? '#0f3554' : style === 'A' ? '#f6f9fb' : '#ffffff'; g.fill();
  if (style !== 'B') grid(g, pad, cy, W - 2 * pad, cardH, 28, blue ? 'rgba(255,255,255,.07)' : 'rgba(32,112,136,.07)');
  rr(g, pad, cy, W - 2 * pad, cardH, 18);
  g.strokeStyle = blue ? '#0f3554' : '#e2e9ed'; g.lineWidth = 2; g.stroke();
  g.drawImage(img, pad + 40, cy + 40, drawW, dh);

  // maten
  let y = cy + cardH + 56;
  if (style === 'B') {
    rows.forEach(([label, value], i) => {
      if (i % 2 === 0) { g.fillStyle = '#f4f8fa'; rr(g, pad, y, W - 2 * pad, 64, 10); g.fill(); }
      g.textAlign = 'left'; g.fillStyle = '#5e6c77'; g.font = `400 30px ${FONT}`; g.fillText(label, pad + 24, y + 43);
      g.textAlign = 'right'; g.fillStyle = accent && i === 0 ? '#207088' : '#191d1f'; g.font = `${accent && i === 0 ? 700 : 600} 30px ${FONT}`;
      g.fillText(fit(g, value, W - 2 * pad - 360), W - pad - 24, y + 43);
      y += 64;
    });
  } else {
    y = tiles(g, rows, pad, y, W - 2 * pad, { accent });
  }

  // voet
  const fy = H - 52;
  g.fillStyle = '#e4eaed'; g.fillRect(pad, fy - 40, W - 2 * pad, 2);
  g.textAlign = 'left'; g.fillStyle = '#8a979f'; g.font = `400 22px ${FONT}`;
  g.fillText(style === 'B' ? 'Maten op schaal' : `Maten op schaal · ${today()}`, pad, fy);
  g.textAlign = 'right'; g.fillStyle = '#207088'; g.font = `600 22px ${FONT}`; g.fillText('Voorraad · Afmetingen', W - pad, fy);

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  return new File([blob], (name.replace(/[^\w\- ]+/g, '').trim() || 'afmetingen') + '.png', { type: 'image/png' });
}
