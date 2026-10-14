// ---- Merken
// Keuzelijst met alle merken uit de productlijst, de merken van je eigen artikels en de merken die je zelf toevoegde.
// Zelf toegevoegde merken staan in de instellingen op dit toestel; zodra een artikel ze gebruikt, zitten ze ook in de reservekopie.
import { html, useEffect, useRef, useState } from '../lib/preact-htm.js';
import { store, prefs, collator } from './store.js';
import { Dialog, DialogButtons, Button, SearchField } from './ui.js';
import { Icon } from './icons.js';
import { loadCatalog } from './catalog.js';

let fromCatalog = [];

function allBrands() {
  const seen = new Map();
  for (const b of [...fromCatalog, ...store.data.items.map((i) => i.brand), ...(prefs.value.brands ?? [])]) {
    const t = (b ?? '').trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort(collator.compare);
}

export function BrandPicker({ value, onPick, onDismiss }) {
  const [, setLoaded] = useState(0);
  const [query, setQuery] = useState('');
  const box = useRef(null);
  useEffect(() => {
    loadCatalog().then((all) => { fromCatalog = all.map((p) => p.brand); setLoaded((n) => n + 1); }).catch(() => {});
  }, []);
  useEffect(() => { box.current?.querySelector('input')?.focus(); }, []);

  const brands = allBrands();
  const q = query.trim();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? brands.filter((b) => words.every((w) => b.toLowerCase().includes(w))) : brands;
  const exact = q && brands.some((b) => b.toLowerCase() === q.toLowerCase());

  const pick = (b) => { onPick(b); onDismiss(); };
  const addNew = () => {
    const mine = prefs.value.brands ?? [];
    if (!mine.some((b) => b.toLowerCase() === q.toLowerCase())) prefs.set({ brands: [...mine, q] });
    pick(q);
  };

  return html`<${Dialog} onDismiss=${onDismiss} cls="sheet brand-sheet">
    <div class="sheet-title">Merk</div>
    <div class="brand-search" ref=${box}>
      <${SearchField} value=${query} onInput=${setQuery} hint="Zoek of typ een nieuw merk" />
    </div>
    <div class="brand-list">
      ${!q && value && html`<button type="button" class="sheet-btn" onClick=${() => pick('')}>
        <${Icon} name="i_close" /><span class="sheet-grow">Geen merk</span></button>`}
      ${hits.map((b) => html`<button type="button" key=${b} class="sheet-btn" onClick=${() => pick(b)}>
        <span class="sheet-grow">${b}</span>
        ${value.toLowerCase() === b.toLowerCase() && html`<${Icon} name="i_check" />`}
      </button>`)}
      ${q && !exact && html`<button type="button" class="sheet-btn" onClick=${addNew}>
        <${Icon} name="i_add" /><span class="sheet-grow">«${q}» toevoegen als nieuw merk</span></button>`}
      ${!q && html`<p class="small faint brand-tip">Staat je merk er niet bij? Typ het in het zoekveld en tik op toevoegen.</p>`}
    </div>
    <${DialogButtons}><${Button} onClick=${onDismiss}>Annuleren<//><//>
  <//>`;
}
