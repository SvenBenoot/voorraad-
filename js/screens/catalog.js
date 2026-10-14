// ---- Nieuw artikel: zelf maken, of kiezen uit de productlijst van het CRM
// "Zelf maken" staat bovenaan, zodat je niet door duizenden producten hoeft te scrollen.
import { html, useEffect, useState } from '../../lib/preact-htm.js';
import { Icon } from '../icons.js';
import { store } from '../store.js';
import { useData, TopBar, SearchField, SectionHeader } from '../ui.js';
import { loadCatalog } from '../catalog.js';
import { go, back } from '../router.js';

const SHOWN = 60;

export function CatalogScreen() {
  const data = useData();
  const [all, setAll] = useState(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => { loadCatalog().then(setAll).catch(() => setFailed(true)); }, []);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = all ? (words.length ? all.filter((p) => words.every((w) => p.hay.includes(w))) : all) : [];
  const own = new Map(data.items.map((it) => [it.code.toLowerCase(), it]));

  return html`<div class="screen">
    <${TopBar} title="Nieuw artikel" onBack=${back} />
    <main class="content">
      <button type="button" class="card clickable cat-own" onClick=${() => go('/maken')}>
        <span class="cat-own-icon"><${Icon} name="i_add" size=${26} /></span>
        <span class="g-label">Zelf maken<small>Naam, merk, aantal en foto zelf ingeven</small></span>
        <svg class="chev" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>

      <${SectionHeader}>Uit de productlijst<//>
      <${SearchField} value=${query} onInput=${setQuery} hint="Zoek op merk, naam, barcode…" />
      ${failed ? html`<p class="sub">De productlijst kon niet geladen worden. Controleer je internet en open dit scherm opnieuw.</p>`
        : !all ? html`<p class="sub">Productlijst laden…</p>`
        : html`
          <p class="small faint">${words.length ? `${hits.length.toLocaleString('nl-BE')} gevonden` : `${all.length.toLocaleString('nl-BE')} producten`}${hits.length > SHOWN ? ` · eerste ${SHOWN} getoond, typ verder om te verfijnen` : ''}</p>
          ${hits.length > 0 && html`<div class="group">
            ${hits.slice(0, SHOWN).map((p) => {
              const have = p.barcode && own.get(p.barcode.toLowerCase());
              return html`<button type="button" key=${p.i} class="g-row g-btn cat-row"
                onClick=${() => go(have ? '/artikel/' + have.id : '/maken/' + p.i)}>
                <span class="g-label">
                  ${p.brand && html`<small class="cat-brand">${p.brand}</small>`}
                  <span class="cat-name">${p.name}</span>
                  ${p.description && html`<small class="clamp2">${p.description}</small>`}
                </span>
                ${have ? html`<span class="pill tone-green">In voorraad</span>`
                  : html`<svg class="chev" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`}
              </button>`;
            })}
          </div>`}
          ${words.length > 0 && hits.length === 0 && html`<p class="sub">Niets gevonden. Probeer een ander woord, of kies bovenaan Zelf maken.</p>`}`}
    </main>
  </div>`;
}
