// ---- Schetsen: lijnen bewaren en tekenen
// Een blad is een A4 (staand 1000 × 1414, liggend 1414 × 1000 eenheden). Elke lijn wordt bewaard als punten in die
// eenheden, niet als beeld: zo blijft een blad klein (online max. 1 MB per document) en scherp op elk scherm.
// De gum is een lijn die wegveegt (zoals een echte gum), dus ook halve lijnen.
import { deflateSync, inflateSync, strToU8, strFromU8 } from '../lib/fflate.js';

export const PAGE_W = 1000;
export const PAGE_H = 1414;
/** Breedte en hoogte van een blad in eenheden. */
export const pageSize = (landscape) => (landscape ? [PAGE_H, PAGE_W] : [PAGE_W, PAGE_H]);
/** 1 mm in eenheden (A4 is 210 mm breed). */
const MM = PAGE_W / 210;

export const BACKGROUNDS = [
  { key: 'blank', label: 'Blanco' },
  { key: 'lines', label: 'Lijntjes' },
  { key: 'grid', label: 'Ruitjes' },
  { key: 'dots', label: 'Stippen' },
  { key: 'mm', label: 'Millimeter' },
];

export const COLORS = [
  { c: '#1a1a1a', label: 'Zwart' }, { c: '#1d4ed8', label: 'Blauw' }, { c: '#dc2626', label: 'Rood' },
  { c: '#16a34a', label: 'Groen' }, { c: '#ea580c', label: 'Oranje' }, { c: '#7c3aed', label: 'Paars' },
  { c: '#facc15', label: 'Geel' }, { c: '#6b7280', label: 'Grijs' },
];

/** Diktes per gereedschap (in eenheden): fijn, normaal, dik. */
export const SIZES = { p: [2, 4, 8], m: [16, 26, 40], e: [14, 32, 70] };
const MARK_ALPHA = 0.38;

// ---- bewaren als tekst
// Lijn = "p|1a1a1a|4|x,y,dx,dy,…" (gereedschap p = pen, m = markeerstift, e = gum; punten op een halve eenheid,
// na het eerste punt enkel het verschil). Lijnen gescheiden door ";". Wordt het groot, dan ingepakt ("z:" + base64).

const PACK_FROM = 400_000;
/** Groter mag een blad online niet worden (Firestore: 1 MB per document, met wat ruimte voor de andere velden). */
export const MAX_INK = 900_000;

export function encodeStrokes(strokes) {
  const text = strokes.map((s) => {
    const q = s.pts.map((v) => Math.round(v * 2));
    const out = [q[0], q[1]];
    for (let i = 2; i < q.length; i += 2) out.push(q[i] - q[i - 2], q[i + 1] - q[i - 1]);
    return `${s.t}|${s.c.replace('#', '')}|${s.w}|${out.join(',')}`;
  }).join(';');
  if (text.length < PACK_FROM) return text;
  return 'z:' + toBase64(deflateSync(strToU8(text), { level: 9 }));
}

export function decodeStrokes(ink) {
  if (!ink) return [];
  let text = ink;
  if (text.startsWith('z:')) {
    try { text = strFromU8(inflateSync(fromBase64(text.slice(2)))); } catch { return []; }
  }
  const list = [];
  for (const part of text.split(';')) {
    const [t, c, w, nums] = part.split('|');
    if (!nums || !'pme'.includes(t)) continue;
    const q = nums.split(',').map(Number);
    if (q.length < 2 || q.some((v) => !Number.isFinite(v))) continue;
    const pts = [q[0] / 2, q[1] / 2];
    for (let i = 2; i + 1 < q.length; i += 2) pts.push(pts[i - 2] + q[i] / 2, pts[i - 1] + q[i + 1] / 2);
    list.push({ t, c: '#' + c, w: +w || 4, pts });
  }
  return list;
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ---- een getekende lijn opkuisen: wat afvlakken en overbodige punten weg (kleiner, en mooier)

export function tidy(pts, w) {
  if (pts.length <= 4) return pts.slice();
  // Licht afvlakken (begin en einde blijven waar ze waren).
  const n = pts.length / 2;
  const sm = pts.slice();
  for (let i = 1; i < n - 1; i++) {
    sm[i * 2] = (pts[i * 2 - 2] + 2 * pts[i * 2] + pts[i * 2 + 2]) / 4;
    sm[i * 2 + 1] = (pts[i * 2 - 1] + 2 * pts[i * 2 + 1] + pts[i * 2 + 3]) / 4;
  }
  return simplify(sm, Math.min(0.6, Math.max(0.25, w / 16)));
}

/** Ramer-Douglas-Peucker: punten weglaten die minder dan [eps] van de lijn liggen. */
function simplify(pts, eps) {
  const n = pts.length / 2;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let far = -1, max = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i * 2] - ax) * dy - (pts[i * 2 + 1] - ay) * dx) / len;
      if (d > max) { max = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

// ---- tekenen op een canvas (ctx staat al geschaald naar eenheden)

/** Lijn als vloeiende boog door de middens van de punten. */
function path(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  if (pts.length === 4) { ctx.lineTo(pts[2], pts[3]); return; }
  for (let i = 2; i < pts.length - 2; i += 2) {
    ctx.quadraticCurveTo(pts[i], pts[i + 1], (pts[i] + pts[i + 2]) / 2, (pts[i + 1] + pts[i + 3]) / 2);
  }
  ctx.lineTo(pts[pts.length - 2], pts[pts.length - 1]);
}

export function drawStroke(ctx, s) {
  const { pts } = s;
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = s.t === 'e' ? 'destination-out' : s.t === 'm' ? 'multiply' : 'source-over';
  ctx.globalAlpha = s.t === 'm' ? MARK_ALPHA : 1;
  ctx.strokeStyle = ctx.fillStyle = s.t === 'e' ? '#000' : s.c;
  ctx.lineWidth = s.w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 2) {
    // Een tik: een stip.
    ctx.beginPath();
    ctx.arc(pts[0], pts[1], s.w / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    path(ctx, pts);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawInk(ctx, strokes) {
  for (const s of strokes) drawStroke(ctx, s);
}

/** Achtergrond van het blad: wit papier met lijntjes, ruitjes, stippen of millimeterpapier. */
export function drawBackground(ctx, bg, w, h, scale = 1) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  // Minstens ongeveer een halve pixel dik, anders verdwijnen de lijnen op een klein voorbeeld.
  const hair = Math.max(0.9, Math.min(0.6 / scale, 2.5));
  const lines = (step, color, width, horizontalOnly = false, from = step) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let y = from; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    if (!horizontalOnly) for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    ctx.stroke();
  };
  if (bg === 'lines') lines(8 * MM, '#b9cde0', hair * 1.2, true, 24 * MM);
  else if (bg === 'grid') lines(5 * MM, '#c9d7e4', hair);
  else if (bg === 'mm') {
    if (scale > 0.3) lines(MM, '#e4ecd9', hair * 0.7);
    lines(5 * MM, '#c8dab4', hair);
    lines(10 * MM, '#a9c58c', hair * 1.3);
  } else if (bg === 'dots') {
    ctx.fillStyle = '#a8b6c3';
    const r = Math.max(1.3, Math.min(0.9 / scale, 3));
    for (let y = 5 * MM; y < h; y += 5 * MM) {
      for (let x = 5 * MM; x < w; x += 5 * MM) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.restore();
}

/** Canvas klaarzetten voor [cssW] × [cssH] pixels op dit scherm, met tekenen in eenheden van het blad. */
export function fitCanvas(canvas, cssW, cssH, pageW) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  const k = (cssW / pageW) * dpr;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  return { ctx, scale: cssW / pageW };
}
