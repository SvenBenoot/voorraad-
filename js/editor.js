// ---- Editor voor taken en notities
// Werkbalk zoals in een gewone teksteditor: ongedaan maken, alinea, titel, vet, cursief, onderstreept, lijstjes
// (bolletjes, nummers, afvinken), link, kleur en opmaak wissen. Werkt met contenteditable + execCommand: dat doet
// elke browser, ook op de gsm, en het ongedaan maken komt er gratis bij.
import { html, useEffect, useRef, useState } from '../lib/preact-htm.js';
import { Icon } from './icons.js';
import { Button, Dialog, DialogButtons } from './ui.js';
import { sanitize, TEXT_COLORS } from './rich.js';

// Lijniconen in dezelfde stijl als de rest (24×24, lijn 1,8, ronde uiteinden).
const L = (d) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.4" fill="currentColor"/>`;
const T = (x, y, s, t, w = 700) => `<text x="${x}" y="${y}" font-size="${s}" font-weight="${w}" font-family="-apple-system, Segoe UI, Roboto, sans-serif" fill="currentColor">${t}</text>`;
const SVG = {
  undo: L('M9 6L4.5 10.5 9 15') + L('M4.5 10.5H15a4.5 4.5 0 0 1 0 9h-3'),
  redo: L('M15 6l4.5 4.5L15 15') + L('M19.5 10.5H9a4.5 4.5 0 0 0 0 9h3'),
  h2: T(2.5, 17, 13, 'H') + T(13.2, 19, 9, '2'),
  bold: T(6.5, 17.5, 15, 'B', 800),
  italic: T(8, 17.5, 15, 'I', 600).replace('fill=', 'font-style="italic" fill='),
  underline: T(6.4, 15.5, 13.5, 'U', 600) + L('M6 20h12'),
  ul: dot(5, 6.5) + dot(5, 12) + dot(5, 17.5) + L('M9.5 6.5H20M9.5 12H20M9.5 17.5H20'),
  ol: T(2.5, 9, 7.5, '1') + T(2.5, 20, 7.5, '2') + L('M9.5 6.5H20M9.5 12H20M9.5 17.5H20'),
  check: L('M3.5 4.5h5v5h-5zM3.5 14.5h5v5h-5z') + L('M4.7 17l1.3 1.3 2.2-2.6') + L('M11.5 7H20M11.5 17H20'),
  link: L('M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.2 1.2') + L('M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.2-1.2'),
  clear: T(3, 15.5, 13, 'T', 600) + L('M13 13.5l7 7M20 13.5l-7 7'),
};
export const Svg = ({ name, size = 20 }) => html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true"
  dangerouslySetInnerHTML=${{ __html: SVG[name] }}></svg>`;

const exec = (cmd, value = null) => document.execCommand(cmd, false, value);

/** Het blok (alinea, titel, lijstpunt) en de lijst waarin de cursor staat, binnen [root]. */
function where(root) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return {};
  let n = sel.anchorNode;
  if (!n || !root.contains(n)) return {};
  const res = {};
  for (; n && n !== root; n = n.parentNode) {
    if (n.nodeType !== 1) continue;
    if (!res.list && (n.tagName === 'UL' || n.tagName === 'OL')) res.list = n;
    if (!res.block && /^(P|H2|DIV|LI)$/.test(n.tagName)) res.block = n;
  }
  return res;
}

export function RichEditor({ value, onChange, placeholder, autoFocus }) {
  const ref = useRef(null);
  const saved = useRef(null);
  const [state, setState] = useState({});
  const [colors, setColors] = useState(false);
  const [linkAsk, setLinkAsk] = useState(null); // { url }

  // De inhoud enkel bij het openen zetten: daarna is de editor zelf de bron (anders springt de cursor).
  useEffect(() => {
    const el = ref.current;
    // Altijd in een alinea beginnen, anders staat de eerste regel als losse tekst (zonder <p>).
    el.innerHTML = value || '<p><br></p>';
    try { exec('defaultParagraphSeparator', 'p'); exec('styleWithCSS', false); } catch { /* oude browser */ }
    el.classList.toggle('is-empty', !el.textContent.trim() && !el.querySelector('li'));
    if (autoFocus) { el.focus(); placeCaretAtEnd(el); }
  }, []);

  const emit = () => {
    const el = ref.current;
    // Lege editor (ook een overgebleven lege alinea): dan de grijze voorbeeldtekst tonen.
    el.classList.toggle('is-empty', !el.textContent.trim() && !el.querySelector('li'));
    onChange(sanitize(el.innerHTML));
  };

  // Welke knoppen "aan" staan (vet, lijst…), bijwerken als de cursor verschuift.
  useEffect(() => {
    const update = () => {
      const el = ref.current;
      if (!el || !el.contains(window.getSelection()?.anchorNode)) return;
      const w = where(el);
      const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } };
      setState({
        bold: q('bold'), italic: q('italic'), underline: q('underline'),
        ul: w.list?.tagName === 'UL' && w.list.getAttribute('data-type') !== 'check',
        ol: w.list?.tagName === 'OL', check: w.list?.getAttribute('data-type') === 'check',
        h2: !!w.block && w.block.tagName === 'H2',
      });
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  const keep = () => { const s = window.getSelection(); saved.current = s?.rangeCount ? s.getRangeAt(0).cloneRange() : null; };
  const restore = () => {
    ref.current.focus();
    if (saved.current) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(saved.current); }
  };
  const run = (fn) => { restore(); fn(); emit(); keep(); document.dispatchEvent(new Event('selectionchange')); };

  const checklist = () => run(() => {
    const el = ref.current;
    let { list } = where(el);
    if (list?.getAttribute('data-type') === 'check') { exec('insertUnorderedList'); return; } // weer gewone tekst
    if (list?.tagName === 'OL') { exec('insertOrderedList'); list = null; }
    if (!list || list.tagName !== 'UL') { exec('insertUnorderedList'); list = where(el).list; }
    list?.setAttribute('data-type', 'check');
  });
  const bullets = () => run(() => {
    const { list } = where(ref.current);
    if (list?.getAttribute('data-type') === 'check') list.removeAttribute('data-type');
    else exec('insertUnorderedList');
  });
  const block = (tag) => run(() => {
    const { list } = where(ref.current);
    if (list) exec(list.tagName === 'OL' ? 'insertOrderedList' : 'insertUnorderedList');
    exec('formatBlock', tag === 'p' ? 'p' : '<h2>');
  });

  const B = (key, label, fn, on) => html`<button type="button" class=${'tb' + (on ? ' on' : '')} aria-label=${label} title=${label}
    aria-pressed=${on ? 'true' : 'false'} onPointerDown=${(e) => { e.preventDefault(); keep(); }} onClick=${fn}><${Svg} name=${key} /></button>`;

  // In een afvinklijstje: tik op het vakje = afvinken (zoals in de lijst zelf).
  const onClick = (e) => {
    const li = e.target.closest?.('ul[data-type="check"] > li');
    if (!li || e.clientX - li.getBoundingClientRect().left > 26) return;
    e.preventDefault();
    if (li.getAttribute('data-done') === 'true') li.removeAttribute('data-done'); else li.setAttribute('data-done', 'true');
    emit();
  };

  return html`<div class="rte">
    <div class="rte-bar" role="toolbar" aria-label="Opmaak">
      <div class="tb-group">
        ${B('undo', 'Ongedaan maken', () => run(() => exec('undo')))}
        ${B('redo', 'Opnieuw', () => run(() => exec('redo')))}
      </div>
      <div class="tb-group">
        ${B('h2', 'Titel', () => block(state.h2 ? 'p' : 'h2'), state.h2)}
      </div>
      <div class="tb-group">
        ${B('bold', 'Vet', () => run(() => exec('bold')), state.bold)}
        ${B('italic', 'Cursief', () => run(() => exec('italic')), state.italic)}
        ${B('underline', 'Onderstreept', () => run(() => exec('underline')), state.underline)}
      </div>
      <div class="tb-group">
        ${B('ul', 'Opsomming', bullets, state.ul)}
        ${B('ol', 'Nummering', () => run(() => exec('insertOrderedList')), state.ol)}
        ${B('check', 'Afvinklijst', checklist, state.check)}
      </div>
      <div class="tb-group">
        ${B('link', 'Link', () => { keep(); const a = window.getSelection()?.anchorNode?.parentElement?.closest?.('a'); setLinkAsk({ url: a?.getAttribute('href') ?? 'https://' }); })}
        <button type="button" class=${'tb' + (colors ? ' on' : '')} aria-label="Tekstkleur" title="Tekstkleur" aria-expanded=${colors}
          onPointerDown=${(e) => { e.preventDefault(); keep(); }} onClick=${() => setColors(!colors)}><${Icon} name="palette" size=${20} /></button>
        ${B('clear', 'Opmaak wissen', () => run(() => { exec('removeFormat'); exec('unlink'); }))}
      </div>
    </div>
    ${colors && html`<div class="menu-scrim" onClick=${() => setColors(false)}></div>
      <div class="tb-colors" role="menu">
        ${TEXT_COLORS.map((c) => html`<button type="button" key=${c.key} class="tb-color" style=${'background:' + c.key} aria-label=${c.label} title=${c.label}
          onPointerDown=${(e) => e.preventDefault()} onClick=${() => { setColors(false); run(() => exec('foreColor', c.key)); }}></button>`)}
      </div>`}
    <div ref=${ref} class="rte-area rt" contenteditable="true" role="textbox" aria-multiline="true" aria-label=${placeholder}
      data-placeholder=${placeholder} onInput=${emit} onBlur=${keep} onKeyUp=${keep} onMouseUp=${keep} onClick=${onClick}></div>
    ${linkAsk && html`<${LinkDialog} url=${linkAsk.url} onDismiss=${() => { setLinkAsk(null); restore(); }}
      onSave=${(url) => {
        setLinkAsk(null);
        run(() => {
          if (!url) { exec('unlink'); return; }
          const sel = window.getSelection();
          // Niets geselecteerd: het adres zelf als tekst invoegen.
          if (!sel || sel.isCollapsed) exec('insertHTML', `<a href="${url.replace(/"/g, '%22')}">${url.replace(/[<>&]/g, '')}</a>&nbsp;`);
          else exec('createLink', url);
        });
      }} />`}
  </div>`;
}

function LinkDialog({ url, onSave, onDismiss }) {
  const [v, setV] = useState(url);
  const clean = v.trim();
  const full = !clean || /^(https?:|mailto:|tel:)/i.test(clean) ? clean : 'https://' + clean;
  const ok = !clean || clean === 'https://' ? false : true;
  return html`<${Dialog} onDismiss=${onDismiss} cls="link-dialog">
    <div class="dialog-body">
      <label class="field">
        <span class="field-label">Link</span>
        <input type="url" inputmode="url" autocapitalize="off" autocomplete="off" value=${v} autoFocus
          onInput=${(e) => setV(e.currentTarget.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && ok) { e.preventDefault(); onSave(full); } }} />
      </label>
    </div>
    <${DialogButtons}>
      ${url !== 'https://' ? html`<${Button} cls="danger-text" onClick=${() => onSave('')}>Weghalen<//>` : html`<${Button} onClick=${onDismiss}>Annuleren<//>`}
      <${Button} kind="primary" disabled=${!ok} onClick=${() => onSave(full)}>Bewaren<//>
    <//>
  <//>`;
}

function placeCaretAtEnd(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
}
