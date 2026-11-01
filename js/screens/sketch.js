// ---- Schets tekenen
// Schermvullend blad (A4) om op te tekenen met pen, vinger of muis. Zodra er een pen gebruikt wordt, tekent een vinger
// of handpalm niet meer mee. Op het toestel bewaard na elke lijn (met een korte pauze), online één keer per pauze.
import { html, useState, useEffect, useLayoutEffect, useRef } from '../../lib/preact-htm.js';
import { Icon } from '../icons.js';
import { store, prefs } from '../store.js';
import { useData, IconButton, Button, EmptyState, Dialog, DialogButtons, ConfirmDialog, TextField, toast } from '../ui.js';
import { back } from '../router.js';
import {
  BACKGROUNDS, COLORS, SIZES, MAX_INK, pageSize, encodeStrokes, decodeStrokes, tidy, drawStroke, drawInk, drawBackground, fitCanvas,
} from '../sketch.js';

const TOOLS = [
  { key: 'p', label: 'Pen', icon: 'i_pen' },
  { key: 'm', label: 'Markeerstift', icon: 'i_marker' },
  { key: 'e', label: 'Gum', icon: 'i_eraser' },
];
const SAVE_AFTER = 2500; // ms zonder tekenen, dan bewaren

const defaultTools = () => ({ tool: 'p', color: { p: COLORS[0].c, m: '#facc15' }, size: { p: 1, m: 1, e: 1 }, custom: '#0e7490' });
function savedTools() {
  const v = prefs.value.sketchTool;
  const d = defaultTools();
  if (!v || typeof v !== 'object') return d;
  return { ...d, ...v, color: { ...d.color, ...v.color }, size: { ...d.size, ...v.size } };
}

export function SketchScreen({ id }) {
  const data = useData();
  const sketch = data.sketches.find((x) => x.id === id && !x.deletedAt);
  if (!sketch) {
    return html`<div class="screen">
      <header class="bar"><div class="bar-row bar-row-back">
        <${IconButton} icon="i_back" label="Terug" onClick=${() => back('/projecten')} />
        <span class="bar-title">Schets</span>
      </div><div class="brand-strip"></div></header>
      <main class="content"><${EmptyState} icon="i_pen" title="Schets niet gevonden" text="Ze is misschien verwijderd." /></main>
    </div>`;
  }
  return html`<${Editor} key=${id} sketch=${sketch} />`;
}

function Editor({ sketch }) {
  const id = sketch.id;
  const [W, H] = pageSize(sketch.landscape);
  const [tools, setToolsState] = useState(savedTools);
  const setTools = (patch) => setToolsState((t) => { const n = { ...t, ...patch }; prefs.set({ sketchTool: n }); return n; });
  const [, setRev] = useState(0);
  const [menu, setMenu] = useState(false);
  const [askClear, setAskClear] = useState(false);
  const [fit, setFit] = useState(null); // { w, h } in css-pixels

  // Alles wat tijdens het tekenen verandert, staat in refs: geen nieuwe weergave per punt.
  const st = useRef(null);
  if (!st.current) {
    st.current = {
      strokes: decodeStrokes(sketch.ink), undo: [], redo: [], ink: sketch.ink, saved: sketch.ink,
      timer: 0, active: null, live: null, raf: 0, scale: 1,
    };
  }
  const s = st.current;
  const stage = useRef(null);
  const page = useRef(null);
  const bgC = useRef(null);
  const inkC = useRef(null);
  const liveC = useRef(null);
  const ctx = useRef({});
  const toolsRef = useRef(tools);
  toolsRef.current = tools;

  // ---- bewaren

  const flush = () => {
    clearTimeout(s.timer);
    s.timer = 0;
    if (s.ink === s.saved) return;
    s.saved = s.ink;
    store.editSketch(id, { ink: s.ink });
  };
  const changed = () => {
    s.ink = encodeStrokes(s.strokes);
    clearTimeout(s.timer);
    s.timer = setTimeout(flush, SAVE_AFTER);
    setRev((r) => r + 1);
  };
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', flush); flush(); };
  }, []);

  // Op een ander toestel gewijzigd (en hier niets meer te bewaren): dat tonen.
  useEffect(() => {
    if (sketch.ink === s.saved || s.ink !== s.saved || s.active) return;
    s.strokes = decodeStrokes(sketch.ink);
    s.ink = s.saved = sketch.ink;
    s.undo = []; s.redo = [];
    redraw();
    setRev((r) => r + 1);
  }, [sketch.ink]);

  // ---- tekenen

  const redraw = () => {
    const c = ctx.current.ink;
    if (!c) return;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, inkC.current.width, inkC.current.height); c.restore();
    drawInk(c, s.strokes);
  };
  const clearLive = () => {
    const c = ctx.current.live;
    if (!c) return;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, liveC.current.width, liveC.current.height); c.restore();
  };

  // Blad zo groot mogelijk in het vlak, met de verhouding van A4.
  useLayoutEffect(() => {
    const el = stage.current;
    const measure = () => {
      const pad = 12;
      const aw = Math.max(50, el.clientWidth - pad * 2), ah = Math.max(50, el.clientHeight - pad * 2);
      const k = Math.min(aw / W, ah / H);
      setFit((f) => { const n = { w: Math.floor(W * k), h: Math.floor(H * k) }; return f && f.w === n.w && f.h === n.h ? f : n; });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  useLayoutEffect(() => {
    if (!fit) return;
    const bg = fitCanvas(bgC.current, fit.w, fit.h, W);
    const ink = fitCanvas(inkC.current, fit.w, fit.h, W);
    const live = fitCanvas(liveC.current, fit.w, fit.h, W);
    ctx.current = { bg: bg.ctx, ink: ink.ctx, live: live.ctx };
    s.scale = bg.scale;
    drawBackground(bg.ctx, sketch.bg, W, H, bg.scale);
    redraw();
  }, [fit, W, H]);

  useEffect(() => {
    const c = ctx.current.bg;
    if (c && fit) drawBackground(c, sketch.bg, W, H, s.scale);
  }, [sketch.bg]);

  // Pen, vinger en muis. Na de eerste pen telt een vinger niet meer (handpalm op het scherm).
  useEffect(() => {
    const el = page.current;
    const point = (e, rect) => [(e.clientX - rect.left) / s.scale, (e.clientY - rect.top) / s.scale];
    const paint = () => {
      s.raf = 0;
      const a = s.active;
      if (!a) return;
      if (a.stroke.t === 'e') {
        // Gum: meteen op de inkt wegvegen, en een cirkeltje waar je veegt.
        const pts = a.stroke.pts;
        const from = Math.max(0, a.painted - 2);
        if (pts.length - from >= 2) drawStroke(ctx.current.ink, { ...a.stroke, pts: pts.slice(from) });
        a.painted = pts.length;
        clearLive();
        const c = ctx.current.live;
        c.save();
        c.strokeStyle = 'rgba(60,70,80,.55)';
        c.lineWidth = 1.2 / s.scale;
        c.beginPath();
        c.arc(pts[pts.length - 2], pts[pts.length - 1], a.stroke.w / 2, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      } else {
        clearLive();
        drawStroke(ctx.current.live, a.stroke);
      }
    };
    const schedule = () => { if (!s.raf) s.raf = requestAnimationFrame(paint); };

    const cancel = () => {
      if (!s.active) return;
      const wasErase = s.active.stroke.t === 'e';
      s.active = null;
      clearLive();
      if (wasErase) redraw();
    };

    const down = (e) => {
      if (e.pointerType === 'pen' && !prefs.value.penSeen) prefs.set({ penSeen: true });
      if (e.pointerType === 'touch' && prefs.value.penSeen) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (s.active) {
        // Pen terwijl een vinger (handpalm) al aan het "tekenen" was: die lijn vergeten.
        if (e.pointerType === 'pen' && s.active.type !== 'pen') cancel();
        else return;
      }
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* niet erg */ }
      const t = toolsRef.current;
      const tool = t.tool;
      const color = tool === 'e' ? '#000000' : t.color[tool];
      const w = SIZES[tool][t.size[tool]] ?? SIZES[tool][1];
      const rect = el.getBoundingClientRect();
      s.active = { id: e.pointerId, type: e.pointerType, rect, painted: 0, stroke: { t: tool, c: color, w, pts: point(e, rect) } };
      schedule();
    };
    const move = (e) => {
      const a = s.active;
      if (!a || a.id !== e.pointerId) return;
      e.preventDefault();
      const list = e.getCoalescedEvents?.() ?? [];
      for (const x of (list.length ? list : [e])) {
        const [px, py] = point(x, a.rect);
        const pts = a.stroke.pts;
        // Bijna hetzelfde punt: overslaan (spaart plaats).
        if (Math.hypot(px - pts[pts.length - 2], py - pts[pts.length - 1]) < 0.6) continue;
        pts.push(px, py);
      }
      schedule();
    };
    const up = (e) => {
      const a = s.active;
      if (!a || a.id !== e.pointerId) return;
      if (e.type === 'pointercancel' && a.type === 'touch') { cancel(); return; }
      s.active = null;
      cancelAnimationFrame(s.raf); s.raf = 0;
      const stroke = { ...a.stroke, pts: tidy(a.stroke.pts, a.stroke.w) };
      s.strokes.push(stroke);
      const ink = encodeStrokes(s.strokes);
      clearLive();
      if (ink.length > MAX_INK) {
        s.strokes.pop();
        redraw();
        toast('Dit blad is vol. Begin een nieuw blad.');
        return;
      }
      if (stroke.t === 'e') redraw(); else drawStroke(ctx.current.ink, stroke);
      s.undo.push({ type: 'add', stroke });
      s.redo = [];
      changed();
    };
    // Geen scrollen, zoomen of tekst selecteren terwijl je tekent.
    const block = (e) => { if (s.active || e.touches?.length === 1) e.preventDefault(); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('touchmove', block, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('touchmove', block);
      cancelAnimationFrame(s.raf);
    };
  }, []);

  // ---- ongedaan maken

  const undo = () => {
    const a = s.undo.pop();
    if (!a) return;
    if (a.type === 'add') s.strokes.pop(); else s.strokes = a.before;
    s.redo.push(a);
    redraw();
    changed();
  };
  const redo = () => {
    const a = s.redo.pop();
    if (!a) return;
    if (a.type === 'add') s.strokes.push(a.stroke); else s.strokes = [];
    s.undo.push(a);
    redraw();
    changed();
  };
  const clearAll = () => {
    if (!s.strokes.length) return;
    s.undo.push({ type: 'clear', before: s.strokes });
    s.redo = [];
    s.strokes = [];
    redraw();
    changed();
  };

  // Ongedaan maken met het toetsenbord (pc of tablet met toetsenbord).
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || document.querySelector('.scrim')) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const leave = () => { flush(); back(`/project/${sketch.projectId}`); };
  const tool = tools.tool;
  const color = tool === 'e' ? null : tools.color[tool];
  const pickColor = (c) => setTools({ color: { ...tools.color, [tool === 'e' ? 'p' : tool]: c }, tool: tool === 'e' ? 'p' : tool });
  const custom = !COLORS.some((x) => x.c === color) ? color : tools.custom;

  return html`<div class="sketch-screen">
    <header class="bar sk-bar">
      <div class="bar-row bar-row-back">
        <${IconButton} icon="i_back" label="Terug" onClick=${leave} />
        <button type="button" class="bar-title sk-title" onClick=${() => setMenu(true)}>${sketch.name || 'Schets'}</button>
        <span class="bar-actions">
          <${IconButton} icon="i_undo" label="Ongedaan maken" cls=${s.undo.length ? '' : 'off'} onClick=${undo} />
          <${IconButton} icon="i_redo" label="Opnieuw" cls=${s.redo.length ? '' : 'off'} onClick=${redo} />
          <${IconButton} icon="i_more" label="Blad" onClick=${() => setMenu(true)} />
        </span>
      </div>
      <div class="brand-strip"></div>
    </header>

    <div class="sk-tools" role="toolbar" aria-label="Gereedschap">
      <div class="sk-group">
        ${TOOLS.map((t) => html`<button type="button" key=${t.key} class=${'sk-btn' + (tool === t.key ? ' on' : '')}
          aria-pressed=${tool === t.key} aria-label=${t.label} title=${t.label} onClick=${() => setTools({ tool: t.key })}>
          <${Icon} name=${t.icon} size=${24} /></button>`)}
      </div>
      <span class="sk-sep"></span>
      <div class="sk-group">
        ${SIZES[tool].map((w, i) => html`<button type="button" key=${i} class=${'sk-btn sk-size' + (tools.size[tool] === i ? ' on' : '')}
          aria-pressed=${tools.size[tool] === i} aria-label=${['Fijn', 'Normaal', 'Dik'][i]} title=${['Fijn', 'Normaal', 'Dik'][i]}
          onClick=${() => setTools({ size: { ...tools.size, [tool]: i } })}>
          <i class=${tool === 'e' ? 'ring' : ''} style=${`width:${[6, 11, 18][i]}px;height:${[6, 11, 18][i]}px;${color ? 'background:' + color : ''}`}></i>
        </button>`)}
      </div>
      <span class="sk-sep"></span>
      <div class="sk-group sk-colors">
        ${COLORS.map((x) => html`<button type="button" key=${x.c} class=${'sk-color' + (color === x.c ? ' on' : '')}
          aria-pressed=${color === x.c} aria-label=${x.label} title=${x.label} style=${'--c:' + x.c} onClick=${() => pickColor(x.c)}></button>`)}
        <label class=${'sk-color sk-custom' + (color && color === custom && !COLORS.some((x) => x.c === color) ? ' on' : '')} title="Eigen kleur" style=${'--c:' + custom}>
          <input type="color" value=${custom} aria-label="Eigen kleur"
            onInput=${(e) => { const c = e.currentTarget.value; setTools({ custom: c, color: { ...tools.color, [tool === 'e' ? 'p' : tool]: c }, tool: tool === 'e' ? 'p' : tool }); }} />
        </label>
      </div>
    </div>

    <div class="sk-stage" ref=${stage}>
      <div class="sk-page" ref=${page} style=${fit ? `width:${fit.w}px;height:${fit.h}px` : 'visibility:hidden'}>
        <canvas ref=${bgC}></canvas>
        <canvas ref=${inkC}></canvas>
        <canvas ref=${liveC}></canvas>
      </div>
    </div>

    ${menu && html`<${SheetDialog} sketch=${sketch} empty=${s.strokes.length === 0} onDismiss=${() => setMenu(false)}
      onClear=${() => { setMenu(false); setAskClear(true); }}
      onDelete=${async () => {
        setMenu(false);
        flush();
        await store.deleteSketch(id);
        back(`/project/${sketch.projectId}`);
        toast('Schets verwijderd', { label: 'Ongedaan maken', onClick: () => store.restoreSketch(id) });
      }} />`}
    ${askClear && html`<${ConfirmDialog} kind="danger" icon="i_delete" title="Blad wissen?" text="Je kan het nog ongedaan maken."
      confirmLabel="Wissen" onConfirm=${() => { setAskClear(false); clearAll(); }} onDismiss=${() => setAskClear(false)} />`}
  </div>`;
}

/** Naam, achtergrond, staand of liggend (enkel zolang het blad leeg is), wissen en verwijderen. */
function SheetDialog({ sketch, empty, onDismiss, onClear, onDelete }) {
  const [name, setName] = useState(sketch.name);
  const done = () => {
    const n = name.trim();
    if (n && n !== sketch.name) store.editSketch(sketch.id, { name: n });
    onDismiss();
  };
  return html`<${Dialog} onDismiss=${done} cls="sheet-dialog">
    <div class="dialog-body">
      <${TextField} label="Naam" value=${name} onInput=${setName} />
      <div class="field">
        <span class="field-label">Achtergrond</span>
        <div class="sk-bgs">
          ${BACKGROUNDS.map((b) => html`<button type="button" key=${b.key} class=${'sk-bg' + (sketch.bg === b.key ? ' on' : '')}
            aria-pressed=${sketch.bg === b.key} onClick=${() => store.editSketch(sketch.id, { bg: b.key })}>
            <${Thumb} bg=${b.key} landscape=${false} w=${44} /><span>${b.label}</span></button>`)}
        </div>
      </div>
      ${empty && html`<div class="field">
        <span class="field-label">Blad</span>
        <div class="seg">
          <button type="button" class=${!sketch.landscape ? 'on' : ''} onClick=${() => store.editSketch(sketch.id, { landscape: false })}>
            <${Icon} name="i_page" size=${20} /> Staand</button>
          <button type="button" class=${sketch.landscape ? 'on' : ''} onClick=${() => store.editSketch(sketch.id, { landscape: true })}>
            <${Icon} name="i_page_land" size=${20} /> Liggend</button>
        </div>
      </div>`}
      <div class="sk-dialog-actions">
        ${!empty && html`<${Button} kind="ghost" icon="i_eraser" cls="align-start" onClick=${onClear}>Blad wissen…<//>`}
        <${Button} kind="ghost" icon="i_delete" cls="danger-text align-start" onClick=${onDelete}>Schets verwijderen<//>
      </div>
    </div>
    <${DialogButtons}><${Button} kind="primary" onClick=${done}>Klaar<//><//>
  <//>`;
}

/** Klein voorbeeld van een blad (achtergrond en lijnen), voor de lijst en de keuze van achtergrond. */
export function Thumb({ bg, landscape, ink = '', w = 120 }) {
  const ref = useRef(null);
  const [W, H] = pageSize(landscape);
  const h = Math.round((w * H) / W);
  useLayoutEffect(() => {
    const { ctx, scale } = fitCanvas(ref.current, w, h, W);
    drawBackground(ctx, bg, W, H, scale);
    if (ink) {
      // Inkt apart tekenen: de gum mag de achtergrond niet wegvegen.
      const layer = document.createElement('canvas');
      const l = fitCanvas(layer, w, h, W);
      drawInk(l.ctx, decodeStrokes(ink));
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(layer, 0, 0); ctx.restore();
    }
  }, [bg, landscape, ink, w]);
  return html`<canvas class="sk-thumb" ref=${ref} aria-hidden="true"></canvas>`;
}
