// ---- QR-codes maken
// Foutcorrectie M, zoals in de Android-app: blijft leesbaar met wat krassen of vuil.
import qrcode from '../lib/qrcode.mjs';
import { html } from '../lib/preact-htm.js';

// Standaard zet de bibliotheek tekens om als Latin-1; UTF-8 is wat scanners verwachten.
qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));

const cache = new Map();

/** Raster van true/false (zwart/wit), zonder witrand. */
export function qrMatrix(text) {
  if (cache.has(text)) return cache.get(text);
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const m = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
  cache.set(text, m);
  return m;
}

export function QrSvg({ text, size = 120 }) {
  const m = qrMatrix(text);
  const n = m.length + 2;
  let d = '';
  m.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + 1} ${r + 1}h1v1h-1z`; }));
  return html`<svg class="qr" width=${size} height=${size} viewBox=${`0 0 ${n} ${n}`} shape-rendering="crispEdges"
    role="img" aria-label=${'QR-code ' + text}><rect width=${n} height=${n} fill="#fff"/><path d=${d} fill="#000"/></svg>`;
}
