// ---- Foto's
// Verkleinen (een foto van een iPhone is 12 MP, voor een artikel is 1280 px ruim genoeg),
// draaien en bijsnijden met een kader dat je versleept.
import { html, useEffect, useRef, useState } from '../lib/preact-htm.js';
import { Button } from './ui.js';

const MAX_SIDE = 1280;

function toCanvas(src, sw, sh, sx = 0, sy = 0, sWidth = sw, sHeight = sh) {
  const scale = Math.min(1, MAX_SIDE / Math.max(sWidth, sHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sWidth * scale);
  canvas.height = Math.round(sHeight * scale);
  canvas.getContext('2d').drawImage(src, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Leest een gekozen of gemaakte foto in als verkleinde canvas (draaiing volgens de camera wordt gevolgd). */
export async function loadPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return toCanvas(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function rotate(canvas) {
  const out = document.createElement('canvas');
  out.width = canvas.height;
  out.height = canvas.width;
  const ctx = out.getContext('2d');
  ctx.translate(out.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

export function crop(canvas, r) {
  return toCanvas(canvas, canvas.width, canvas.height, r.l, r.t, r.r - r.l, r.b - r.t);
}

export const toJpeg = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));

const full = (c) => ({ l: 0, t: 0, r: c.width, b: c.height });

/**
 * Bijsnijden en draaien. [onDone] krijgt de bewerkte canvas, of null bij "Overslaan".
 */
export function PhotoEditor({ original, onDone }) {
  const [img, setImg] = useState(original);
  const [rect, setRect] = useState(full(original));
  const [box, setBox] = useState(null);
  const area = useRef(null);
  const view = useRef(null);
  const drag = useRef(null);
  const [src, setSrc] = useState('');

  useEffect(() => { setSrc(img.toDataURL('image/jpeg', 0.9)); }, [img]);

  // Hoe groot de foto op het scherm staat (passend in het vak).
  useEffect(() => {
    const measure = () => {
      const a = area.current;
      if (!a) return;
      const w = a.clientWidth, h = a.clientHeight;
      const s = Math.min(w / img.width, h / img.height);
      setBox({ s, ox: (w - img.width * s) / 2, oy: (h - img.height * s) / 2 });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [img]);

  const minSide = 40;
  const onDown = (e) => {
    if (!box) return;
    const a = area.current.getBoundingClientRect();
    const px = e.clientX - a.left, py = e.clientY - a.top;
    const pts = [[rect.l, rect.t], [rect.r, rect.t], [rect.l, rect.b], [rect.r, rect.b]]
      .map(([x, y]) => [box.ox + x * box.s, box.oy + y * box.s]);
    const handle = 34;
    const corner = pts.findIndex(([x, y]) => Math.abs(x - px) < handle && Math.abs(y - py) < handle);
    const inside = px > pts[0][0] && px < pts[1][0] && py > pts[0][1] && py < pts[2][1];
    const mode = corner >= 0 ? corner : inside ? 4 : -1;
    if (mode < 0) return;
    drag.current = { mode, x: e.clientX, y: e.clientY, start: rect };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / box.s, dy = (e.clientY - d.y) / box.s;
    const r = d.start, W = img.width, H = img.height;
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let n = r;
    if (d.mode === 0) n = { ...r, l: cl(r.l + dx, 0, r.r - minSide), t: cl(r.t + dy, 0, r.b - minSide) };
    if (d.mode === 1) n = { ...r, r: cl(r.r + dx, r.l + minSide, W), t: cl(r.t + dy, 0, r.b - minSide) };
    if (d.mode === 2) n = { ...r, l: cl(r.l + dx, 0, r.r - minSide), b: cl(r.b + dy, r.t + minSide, H) };
    if (d.mode === 3) n = { ...r, r: cl(r.r + dx, r.l + minSide, W), b: cl(r.b + dy, r.t + minSide, H) };
    if (d.mode === 4) {
      const mx = cl(dx, -r.l, W - r.r), my = cl(dy, -r.t, H - r.b);
      n = { l: r.l + mx, t: r.t + my, r: r.r + mx, b: r.b + my };
    }
    setRect(n);
  };
  const onUp = () => { drag.current = null; };

  const isFull = rect.l === 0 && rect.t === 0 && rect.r === img.width && rect.b === img.height;
  const changed = img !== original || !isFull;

  let frame = null;
  if (box) {
    const l = box.ox + rect.l * box.s, t = box.oy + rect.t * box.s;
    const w = (rect.r - rect.l) * box.s, h = (rect.b - rect.t) * box.s;
    frame = html`<div class="crop-frame" style=${`left:${l}px;top:${t}px;width:${w}px;height:${h}px`}>
      <i class="g1"></i><i class="g2"></i><i class="g3"></i><i class="g4"></i>
      <b class="h tl"></b><b class="h tr"></b><b class="h bl"></b><b class="h br"></b>
    </div>`;
  }

  return html`<div class="fullscreen editor">
    <div class="editor-head">
      <div class="window-title">Foto bewerken</div>
      <div class="subtitle">Versleep de hoeken om bij te snijden. Draai de foto als ze scheef staat.</div>
    </div>
    <div class="editor-area" ref=${area} onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}>
      ${src && box && html`<img ref=${view} src=${src} alt="Foto" draggable="false"
        style=${`left:${box.ox}px;top:${box.oy}px;width:${img.width * box.s}px;height:${img.height * box.s}px`}/>`}
      ${frame}
    </div>
    <div class="editor-tools">
      <${Button} kind="secondary" icon="i_rotate" onClick=${() => { const r = rotate(img); setImg(r); setRect(full(r)); }}>Draaien<//>
      ${changed && html`<${Button} kind="ghost" icon="i_restore" onClick=${() => { setImg(original); setRect(full(original)); }}>Opnieuw<//>`}
    </div>
    <div class="footer">
      <${Button} kind="secondary" onClick=${() => onDone(null)}>Overslaan<//>
      <${Button} kind="primary" onClick=${() => onDone(changed ? (isFull ? img : crop(img, rect)) : null)}>Gebruiken<//>
    </div>
  </div>`;
}
