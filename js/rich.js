// ---- Opgemaakte tekst in notities
// De editor bewaart HTML. Die komt ook van andere toestellen (via de online opslag), dus alles wat getoond of
// bewaard wordt, gaat eerst door sanitize: enkel een korte lijst tags en attributen blijft over.
// Daarnaast houdt elke notitie een gewone tekstversie bij (zoeken, delen, korte weergaven).

const BLOCK = new Set(['P', 'H2', 'UL', 'OL', 'LI']);
const KEEP = new Set(['P', 'H2', 'B', 'I', 'U', 'UL', 'OL', 'LI', 'A', 'SPAN', 'BR']);
// Andere schrijfwijzen van hetzelfde (bv. wat Safari of plakken oplevert).
const RENAME = { STRONG: 'B', EM: 'I', H1: 'H2', H3: 'H2', H4: 'H2', DIV: 'P', FONT: 'SPAN' };
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'IMG', 'VIDEO', 'AUDIO', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'FORM', 'LINK', 'META', 'HEAD', 'TITLE']);
const COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i;
const HREF_RE = /^(https?:|mailto:|tel:)/i;

/** Tekstkleuren in de editor: leesbaar op een lichte én een donkere achtergrond. */
export const TEXT_COLORS = [
  { key: '#e0525a', label: 'Rood' }, { key: '#e3a23b', label: 'Oranje' }, { key: '#2fbf80', label: 'Groen' },
  { key: '#30a9ce', label: 'Blauw' }, { key: '#8e6cef', label: 'Paars' },
];

function colorOf(el) {
  const c = (el.tagName === 'FONT' ? el.getAttribute('color') : el.style?.color) || '';
  return COLOR_RE.test(c.trim()) ? c.trim() : '';
}

function clean(src, doc) {
  const out = doc.createDocumentFragment();
  for (const node of [...src.childNodes]) {
    if (node.nodeType === 3) { out.append(doc.createTextNode(node.nodeValue)); continue; }
    if (node.nodeType !== 1) continue;
    const tag = RENAME[node.tagName] ?? node.tagName;
    if (DROP.has(node.tagName)) continue;
    const kids = clean(node, doc);
    if (!KEEP.has(tag)) { out.append(kids); continue; }
    // Kleur via style (Chrome) of <font color> (Safari); een span zonder kleur heeft geen zin.
    if (tag === 'SPAN') {
      const c = colorOf(node);
      if (!c) { out.append(kids); continue; }
      const s = doc.createElement('span');
      s.style.color = c;
      s.append(kids);
      out.append(s);
      continue;
    }
    // Vet of cursief via style (bv. geplakte tekst) wordt niet overgenomen: dat houdt het eenvoudig.
    const el = doc.createElement(tag);
    if (tag === 'A') {
      const href = (node.getAttribute('href') || '').trim();
      if (!HREF_RE.test(href)) { out.append(kids); continue; }
      el.setAttribute('href', href);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
    if (tag === 'UL' && node.getAttribute('data-type') === 'check') el.setAttribute('data-type', 'check');
    if (tag === 'LI' && node.getAttribute('data-done') === 'true') el.setAttribute('data-done', 'true');
    el.append(kids);
    // Helemaal lege alinea (blijft soms over na een lijstje): weglaten. Een bewust lege regel heeft een <br>.
    if (tag === 'P' && !el.childNodes.length) continue;
    out.append(el);
  }
  return out;
}

const parse = (html) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

/** Enkel toegelaten opmaak; al de rest verdwijnt (de tekst erin blijft). */
export function sanitize(html) {
  if (!html) return '';
  const doc = parse(html);
  const box = doc.createElement('div');
  box.append(clean(doc.body, doc));
  // Lege blokken op het einde (een Enter te veel) weglaten.
  while (box.lastChild && box.lastChild.nodeType === 1 && BLOCK.has(box.lastChild.tagName) && !box.lastChild.textContent.trim()
    && box.lastChild.tagName !== 'LI') box.lastChild.remove();
  return box.innerHTML;
}

/** Gewone tekst: blokken op een eigen regel, lijstjes met • of 1. ervoor, afvinklijstjes met ☐ of ☑. */
export function toPlain(html) {
  if (!html) return '';
  const doc = parse(html);
  const lines = [];
  let line = '';
  // Een lege regel enkel waar er bewust een staat (een <br>), niet tussen elk blok.
  const flush = (empty) => { if (line.trim() || (empty && lines.length)) lines.push(line.trimEnd()); line = ''; };
  const walk = (node, list) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { line += n.nodeValue.replace(/\s+/g, ' '); continue; }
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'BR') { flush(true); continue; }
      if (n.tagName === 'UL' || n.tagName === 'OL') {
        flush();
        walk(n, { type: n.tagName === 'OL' ? 'ol' : n.getAttribute('data-type') === 'check' ? 'check' : 'ul', i: 0 });
        continue;
      }
      if (n.tagName === 'LI') {
        flush();
        list = list ?? { type: 'ul', i: 0 };
        list.i++;
        line = list.type === 'ol' ? `${list.i}. ` : list.type === 'check' ? (n.getAttribute('data-done') === 'true' ? '☑ ' : '☐ ') : '• ';
        walk(n, null);
        flush();
        continue;
      }
      if (BLOCK.has(n.tagName) || n.tagName === 'DIV') { flush(); walk(n, list); flush(); continue; }
      walk(n, list);
    }
  };
  walk(doc.body, null);
  flush();
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/** Gewone tekst (oude notities) als HTML voor de editor: elke regel een alinea, links klikbaar. */
export function textToHtml(text) {
  if (!text) return '';
  return text.split('\n').map((l) => `<p>${l.trim() ? esc(l).replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1">$1</a>') : '<br>'}</p>`).join('');
}

/** HTML om te tonen: de opgemaakte versie, of de gewone tekst van een oudere notitie. */
export const htmlOf = (note) => sanitize(note.html || textToHtml(note.text));

/** Vinkt het [index]-de punt van de afvinklijstjes aan of af. */
export function toggleCheck(html, index) {
  const doc = parse(sanitize(html));
  const li = doc.body.querySelectorAll('ul[data-type="check"] > li')[index];
  if (!li) return html;
  if (li.getAttribute('data-done') === 'true') li.removeAttribute('data-done');
  else li.setAttribute('data-done', 'true');
  return doc.body.innerHTML;
}

/** Hoeveel punten in de afvinklijstjes, en hoeveel daarvan afgevinkt. */
export function checkCount(html) {
  if (!html || !html.includes('data-type')) return { done: 0, total: 0 };
  const items = parse(html).body.querySelectorAll('ul[data-type="check"] > li');
  return { total: items.length, done: [...items].filter((li) => li.getAttribute('data-done') === 'true').length };
}
