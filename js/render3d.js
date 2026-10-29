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
export function Render3D({ blocks, dims = [], notes = [], view, onRotate, label }) {
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
    lines.push({ d: `M${A[0]} ${A[1]}L${B[0]} ${B[1]}` + (m.dashed ? '' : tick(A) + tick(B)), ext: ext2(a, A) + ext2(b, B), dashed: m.dashed });
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
    labels.push({ at, text: m.text, w });
  }
  for (const n of notes) {
    const p = P(n.at);
    const w = n.text.length * fs * 0.56;
    labels.push({ at: [p[0], p[1] + (n.dy ?? 0) * fs], text: n.text, w, note: true });
  }
  for (const l of labels) { add([l.at[0] - l.w / 2, l.at[1] - fs * 0.7]); add([l.at[0] + l.w / 2, l.at[1] + fs * 0.7]); }

  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const pad = fs * 0.8;
  const box = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad];

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
    ${lines.map((l) => html`<path d=${l.ext} class="r3-ext" stroke-width=${sw * 0.7} />
      <path d=${l.d} class=${'r3-dim' + (l.dashed ? ' dashed' : '')} stroke-width=${sw * (l.dashed ? 1 : 1.1)}
        stroke-dasharray=${l.dashed ? `${fs * 0.35} ${fs * 0.25}` : null} />`)}
    ${labels.map((l) => html`<rect x=${l.at[0] - l.w / 2 - fs * 0.3} y=${l.at[1] - fs * 0.72} width=${l.w + fs * 0.6} height=${fs * 1.44}
        rx=${fs * 0.35} class="r3-chip" stroke-width=${sw * 0.6} />
      <text x=${l.at[0]} y=${l.at[1]} font-size=${fs} class=${'r3-text' + (l.note ? ' note' : '')}
        text-anchor="middle" dominant-baseline="central">${l.text}</text>`)}
  </svg>`;
}
