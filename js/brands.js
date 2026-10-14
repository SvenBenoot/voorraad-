// ---- Merken
// Keuzelijst met alle merken uit de productlijst, de merken van je eigen artikels en de merken die je zelf toevoegde.
// Zelf toegevoegde merken zitten bij je gegevens, dus ook in de reservekopie.
import { html, useEffect, useRef, useState } from '../lib/preact-htm.js';
import { store, prefs, collator } from './store.js';
import { Dialog, DialogButtons, Button, SearchField } from './ui.js';
import { Icon } from './icons.js';
import { loadCatalog } from './catalog.js';

let fromCatalog = [];

function allBrands() {
  const seen = new Map();
  for (const b of [...fromCatalog, ...store.data.items.map((i) => i.brand), ...store.data.brands]) {
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
  // Versie 1.4 bewaarde eigen merken enkel op het toestel: eenmalig overzetten naar de gegevens.
  useEffect(() => {
    const old = prefs.value.brands;
    if (old?.length) store.addBrands(old).then(() => prefs.set({ brands: undefined })).catch(() => {});
  }, []);

  const brands = allBrands();
  const q = query.trim();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? brands.filter((b) => words.every((w) => b.toLowerCase().includes(w))) : brands;
  const exact = q && brands.some((b) => b.toLowerCase() === q.toLowerCase());

  // Merken die je al gebruikt staan vooraan, met hoeveel artikels.
  const used = new Map();
  for (const it of store.data.items) { const k = (it.brand ?? '').trim().toLowerCase(); if (k) used.set(k, (used.get(k) ?? 0) + 1); }
  hits.sort((a, b) => !used.has(a.toLowerCase()) - !used.has(b.toLowerCase()));
  const pick = (b) => { onPick(b); onDismiss(); };
  const addNew = () => { store.addBrands([q]).catch(() => {}); pick(q); };

  return html`<${Dialog} onDismiss=${onDismiss} cls="sheet brand-sheet">
    <div class="sheet-title">Merk</div>
    <div class="brand-search" ref=${box}>
      <${SearchField} value=${query} onInput=${setQuery} hint="Zoek of typ een nieuw merk" />
    </div>
    <div class="brand-list">
      <div class="pick-grid">
        ${!q && value && html`<button type="button" class="pick-tile pick-new" onClick=${() => pick('')}>
          <span class="pick-name"><${Icon} name="i_close" size=${18} />Geen merk</span><span class="pick-sub">Merk weghalen</span></button>`}
        ${hits.map((b) => {
          const on = value.toLowerCase() === b.toLowerCase();
          const n = used.get(b.toLowerCase());
          return html`<button type="button" key=${b} class=${'pick-tile' + (on ? ' on' : '')} aria-pressed=${on} onClick=${() => pick(b)}>
            <span class="pick-name">${b}</span>
            ${n && html`<span class="pick-sub">${n} ${n === 1 ? 'artikel' : 'artikels'}</span>`}
            ${on && html`<span class="pick-check"><${Icon} name="i_check" size=${16} /></span>`}
          </button>`;
        })}
        ${q && !exact && html`<button type="button" class="pick-tile pick-new" onClick=${addNew}>
          <span class="pick-name"><${Icon} name="i_add" size=${18} />«${q}»</span><span class="pick-sub">Nieuw merk toevoegen</span></button>`}
      </div>
      ${!q && html`<p class="small faint brand-tip">Staat je merk er niet bij? Typ het in het zoekveld en tik op toevoegen.</p>`}
    </div>
    <${DialogButtons}><${Button} onClick=${onDismiss}>Annuleren<//><//>
  <//>`;
}
