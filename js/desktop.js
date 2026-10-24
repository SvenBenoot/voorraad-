// ---- Pc-weergave
// Op een breed scherm (vanaf 1024 px) een zijbalk met de schermen en een overzicht over de volle breedte:
// kerncijfers, een tabel met alle artikels en rechts wat aandacht vraagt. Op een gsm verandert er niets.
import { html, useEffect, useState } from '../lib/preact-htm.js';
import { Icon } from './icons.js';
import { store, prefs, collator, categoryOf, needsRestock, shortage, status, SORT_MODES } from './store.js';
import {
  useData, usePrefs, Button, SearchField, FilterChip, StatusPill, StepButton, ItemIcon, Dialog, DialogButtons, TONE, plural,
} from './ui.js';
import { SyncButton, SyncDialog } from './cloud-card.js';
import { usageOn, startOfDay } from './screens/usage.js';
import { go, home } from './router.js';

const WIDE = '(min-width: 1024px)';

/** true op een breed scherm (pc, of tablet liggend). Volgt mee als het venster groter of kleiner wordt. */
export function useDesktop() {
  const mq = window.matchMedia(WIDE);
  const [wide, setWide] = useState(mq.matches);
  useEffect(() => {
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

// ---- zijbalk

const NAV = [
  { path: '/', icon: 'i_inventory', label: 'Overzicht', match: ['', 'artikel', 'wijzigen', 'maken'] },
  { path: '/scan', icon: 'i_scan', label: 'Scannen', match: ['scan'] },
  { path: '/nieuw', icon: 'i_add', label: 'Nieuw artikel', match: ['nieuw'] },
  { path: '/aanvullen', icon: 'i_checklist', label: 'Aanvullen', match: ['aanvullen'], badge: true },
  { path: '/verbruik', icon: 'i_history', label: 'Verbruik', match: ['verbruik'] },
  { path: '/prullenmand', icon: 'i_delete', label: 'Prullenmand', match: ['prullenmand'] },
  { path: '/instellingen', icon: 'i_settings', label: 'Instellingen', match: ['instellingen'] },
];

function Sidebar({ path }) {
  const data = useData();
  const p = usePrefs();
  const [syncInfo, setSyncInfo] = useState(false);
  const section = path.split('/')[1] ?? '';
  const restock = data.items.filter(needsRestock).length;
  return html`<nav class="side" aria-label="Menu">
    <div class="side-brand">
      <img src="img/logo-doos.svg" alt="" width="32" height="32" />
      <span>Voorraad</span>
    </div>
    <div class="side-nav">
      ${NAV.map((n) => {
        const on = n.match.includes(section);
        return html`<a key=${n.path} href=${'#' + n.path} class=${'side-item' + (on ? ' on' : '')} aria-current=${on ? 'page' : null}
          onClick=${(e) => { e.preventDefault(); if (section === n.path.slice(1)) return; if (n.path === '/') home(); else go(n.path); }}>
          <${Icon} name=${n.icon} size=${22} />
          <span>${n.label}</span>
          ${n.badge && restock > 0 && html`<b class="side-badge" aria-label=${restock + ' bij te vullen'}>${restock}</b>`}
        </a>`;
      })}
    </div>
    <div class="side-foot">
      <${SyncButton} onClick=${() => setSyncInfo(true)} />
      <span class="side-user ellipsis" title=${p.cloudUser}>${p.cloudUser}</span>
    </div>
    ${syncInfo && html`<${SyncDialog} onDismiss=${() => setSyncInfo(false)} />`}
  </nav>`;
}

/** Zijbalk links, het gekozen scherm rechts. Het overzicht krijgt de volle breedte, de rest blijft leesbaar smal. */
export function DesktopShell({ path, children }) {
  const home = (path.split('/')[1] ?? '') === '';
  return html`<div class="desk">
    <${Sidebar} path=${path} />
    <div class=${'desk-main' + (home ? ' full' : '')}>${children}</div>
  </div>`;
}

// ---- overzicht

// Zoeken, filter en merk blijven staan als je een artikel opent en terugkomt.
const kept = { query: '', filter: 'all', brand: null };
function useKept(key) {
  const [v, setV] = useState(kept[key]);
  return [v, (x) => { kept[key] = x; setV(x); }];
}

// Kolommen waarop je kan sorteren, met de sortering uit de instellingen (dezelfde als op de gsm).
const COLS = [
  { key: 'NAME', label: 'Artikel' },
  { key: 'CATEGORY', label: 'Categorie' },
  { key: 'LOCATION', label: 'Plaats' },
  { key: 'QUANTITY', alt: 'QUANTITY_DESC', label: 'Aantal', num: true },
];

/** Kerncijfer bovenaan; met [onClick] filtert het de tabel. */
function Kpi({ icon, tone, value, label, onClick, on }) {
  const inner = html`<span class="kpi-icon"><${Icon} name=${icon} size=${22} /></span>
    <span class="kpi-body"><b>${value}</b><span>${label}</span></span>`;
  return onClick
    ? html`<button type="button" class=${'kpi tone-' + tone + (on ? ' on' : '')} onClick=${onClick} aria-pressed=${on}>${inner}</button>`
    : html`<div class=${'kpi tone-' + tone}>${inner}</div>`;
}

const fmtTime = (t) => {
  const today = startOfDay(Date.now());
  const time = new Date(t).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  if (t >= today) return time;
  if (t >= today - 864e5) return 'gisteren ' + time;
  return new Date(t).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
};

export function DashboardScreen() {
  const data = useData();
  const p = usePrefs();
  const [query, setQuery] = useKept('query');
  const [filter, setFilter] = useKept('filter');
  const [brand, setBrand] = useKept('brand');
  const [brandMenu, setBrandMenu] = useState(false);

  const sortKey = SORT_MODES.some((m) => m.key === p.sort) ? p.sort : 'NAME';
  const activeFilter = ['all', 'restock', 'empty'].includes(filter) || data.categories.some((c) => c.id === filter) ? filter : 'all';
  const restock = data.items.filter(needsRestock);
  const empty = data.items.filter((it) => it.quantity <= 0).length;
  const pieces = data.items.reduce((s, it) => s + it.quantity, 0);
  const brandCounts = new Map();
  for (const it of data.items) if (it.brand) brandCounts.set(it.brand, (brandCounts.get(it.brand) ?? 0) + 1);
  const brands = [...brandCounts.keys()].sort(collator.compare);
  const activeBrand = brand && brandCounts.has(brand) ? brand : null;
  const catOrder = Object.fromEntries(data.categories.map((c, i) => [c.id, i]));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const byName = (a, b) => collator.compare(a.name, b.name);

  const shown = data.items
    .filter((it) => activeFilter === 'all' || (activeFilter === 'restock' ? needsRestock(it)
      : activeFilter === 'empty' ? it.quantity <= 0 : categoryOf(data, it).id === activeFilter))
    .filter((it) => !activeBrand || it.brand === activeBrand)
    .filter((it) => {
      const hay = `${it.name} ${it.brand ?? ''} ${it.location} ${it.note} ${it.code} ${categoryOf(data, it).name}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort({
      NAME: byName,
      CATEGORY: (a, b) => (catOrder[categoryOf(data, a).id] ?? 1e9) - (catOrder[categoryOf(data, b).id] ?? 1e9) || byName(a, b),
      QUANTITY: (a, b) => a.quantity - b.quantity || byName(a, b),
      QUANTITY_DESC: (a, b) => b.quantity - a.quantity || byName(a, b),
      LOCATION: (a, b) => (!a.location - !b.location) || collator.compare(a.location, b.location) || byName(a, b),
      RECENT: (a, b) => b.updatedAt - a.updatedAt,
    }[sortKey]);

  const sortBy = (c) => prefs.set({ sort: sortKey === c.key && c.alt ? c.alt : c.key });
  const ariaSort = (c) => (sortKey === c.key ? 'ascending' : sortKey === c.alt ? 'descending' : null);

  // Rechterkolom: wat vandaag gebruikt is en de laatste wijzigingen.
  const used = usageOn(data, startOfDay(Date.now()));
  const usedTotal = Object.values(used).reduce((s, n) => s + n, 0);
  const nameOf = (id) => data.items.find((i) => i.id === id)?.name ?? data.movements.find((m) => m.itemId === id && m.name)?.name ?? 'Verwijderd artikel';
  const recent = data.movements.slice(-8).reverse();
  const toRestock = [...restock].sort((a, b) => a.quantity - b.quantity || byName(a, b));
  const catsInUse = data.categories.filter((c) => data.items.some((it) => categoryOf(data, it).id === c.id));
  const today = new Date().toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });

  return html`<div class="dash">
    <header class="dash-head">
      <div>
        <h1 class="dash-title">Overzicht</h1>
        <div class="sub">${today.charAt(0).toUpperCase() + today.slice(1)}</div>
      </div>
      <div class="dash-actions">
        <${Button} icon="i_add" onClick=${() => go('/nieuw')}>Nieuw artikel<//>
        <${Button} kind="primary" icon="i_scan" onClick=${() => go('/scan')}>Scannen<//>
      </div>
    </header>

    <div class="kpis">
      <${Kpi} icon="i_inventory" tone="blue" value=${data.items.length} label=${data.items.length === 1 ? 'artikel' : 'artikels'}
        on=${activeFilter === 'all'} onClick=${() => setFilter('all')} />
      <${Kpi} icon="i_table" tone="green" value=${pieces.toLocaleString('nl-BE')} label=${pieces === 1 ? 'stuk in voorraad' : 'stuks in voorraad'} />
      <${Kpi} icon="i_warning" tone="orange" value=${restock.length} label="bijvullen"
        on=${activeFilter === 'restock'} onClick=${() => setFilter('restock')} />
      <${Kpi} icon="i_error" tone="red" value=${empty} label="op"
        on=${activeFilter === 'empty'} onClick=${() => setFilter('empty')} />
    </div>

    <div class="dash-grid">
      <section class="panel dash-table" aria-label="Artikels">
        <div class="panel-tools">
          <div class="dash-search"><${SearchField} value=${query} onInput=${setQuery} hint="Zoeken op naam, merk, plaats of code" /></div>
          ${brands.length > 0 && html`<${Button} kind="ghost" icon="i_category" cls=${'brand-filter' + (activeBrand ? ' on' : '')}
            onClick=${() => setBrandMenu(true)}>${activeBrand ?? 'Alle merken'}<//>`}
        </div>
        <div class="chip-row tight wrap">
          <${FilterChip} selected=${activeFilter === 'all'} onClick=${() => setFilter('all')}>Alles · ${data.items.length}<//>
          <${FilterChip} selected=${activeFilter === 'restock'} onClick=${() => setFilter('restock')}>Bijvullen · ${restock.length}<//>
          ${empty > 0 && html`<${FilterChip} selected=${activeFilter === 'empty'} onClick=${() => setFilter('empty')}>Op · ${empty}<//>`}
          ${catsInUse.map((c) => html`<${FilterChip} key=${c.id} selected=${activeFilter === c.id} onClick=${() => setFilter(c.id)}>
            ${c.name} · ${data.items.filter((it) => categoryOf(data, it).id === c.id).length}<//>`)}
        </div>

        ${data.items.length === 0 ? html`<div class="empty">
            <div class="empty-icon"><${Icon} name="bin" size=${32} /></div>
            <div class="empty-title">Nog geen artikels</div>
            <div class="empty-text">Voeg je eerste artikel toe.</div>
            <div class="btn-row"><${Button} kind="primary" icon="i_add" onClick=${() => go('/nieuw')}>Nieuw artikel<//></div>
          </div>`
        : html`<div class="table-wrap">
          <table class="tbl">
            <caption class="sr-only">Artikels, ${plural(shown.length, 'resultaat', 'resultaten')}</caption>
            <thead><tr>
              ${COLS.map((c) => html`<th key=${c.key} scope="col" class=${c.num ? 'num' : ''} aria-sort=${ariaSort(c)}>
                <button type="button" class=${'th-btn' + (ariaSort(c) ? ' on' : '')} onClick=${() => sortBy(c)}>
                  ${c.label}${ariaSort(c) && html`<span class="th-arrow" aria-hidden="true">${ariaSort(c) === 'descending' ? '↓' : '↑'}</span>`}
                </button>
              </th>`)}
              <th scope="col" class="col-min num">Minimum</th>
              <th scope="col">Status</th>
            </tr></thead>
            <tbody>
              ${shown.map((it) => {
                const st = status(it);
                const open = () => go('/artikel/' + it.id);
                return html`<tr key=${it.id} class="row" onClick=${open}>
                  <td>
                    <div class="cell-item">
                      <${ItemIcon} icon=${it.icon} size=${36} />
                      <div class="cell-name">
                        <a href=${'#/artikel/' + it.id} class="row-link" onClick=${(e) => { e.preventDefault(); e.stopPropagation(); open(); }}>${it.name}</a>
                        ${it.brand && html`<span class="small faint">${it.brand}</span>`}
                      </div>
                    </div>
                  </td>
                  <td>${categoryOf(data, it).name}</td>
                  <td>${it.location || html`<span class="faint">–</span>`}</td>
                  <td class="num">
                    <div class="cell-qty" onClick=${(e) => e.stopPropagation()}>
                      <${StepButton} add=${false} size=${32} disabled=${it.quantity <= 0} label=${'Eén minder: ' + it.name}
                        onClick=${() => store.adjust(it.id, -1)} />
                      <b class=${it.quantity === 0 ? 'tone-text-red' : ''}>${it.quantity}</b>
                      <${StepButton} add=${true} size=${32} label=${'Eén meer: ' + it.name} onClick=${() => store.adjust(it.id, 1)} />
                    </div>
                  </td>
                  <td class="num col-min">${it.minimum || html`<span class="faint">–</span>`}</td>
                  <td><${StatusPill} tone=${TONE[st]}>${{ EMPTY: 'Op', LOW: 'Bijvullen', NO_MINIMUM: 'Geen min.', OK: 'In orde' }[st]}<//></td>
                </tr>`;
              })}
            </tbody>
          </table>
          ${shown.length === 0 && html`<p class="sub nothing center">Niets gevonden.</p>`}
        </div>`}
      </section>

      <aside class="dash-side">
        <section class="panel">
          <div class="panel-head">
            <h2>Bijvullen</h2>
            ${toRestock.length > 0 && html`<span class="pill tone-orange">${toRestock.length}</span>`}
          </div>
          ${toRestock.length === 0 ? html`<p class="sub ok-line"><${Icon} name="i_check_circle" size=${20} cls="tone-text-green" />Alles is op peil.</p>`
            : html`<ul class="mini-list">
              ${toRestock.slice(0, 8).map((it) => html`<li key=${it.id}>
                <a href=${'#/artikel/' + it.id} class="mini-row" onClick=${(e) => { e.preventDefault(); go('/artikel/' + it.id); }}>
                  <${ItemIcon} icon=${it.icon} size=${32} />
                  <span class="mini-name ellipsis">${it.name}</span>
                  <span class=${'mini-num ' + (it.quantity === 0 ? 'tone-text-red' : 'tone-text-orange')}>${it.quantity} / ${Math.max(it.minimum, 1)}</span>
                </a>
              </li>`)}
            </ul>
            ${toRestock.length > 8 && html`<p class="small faint">en nog ${toRestock.length - 8}</p>`}
            <${Button} kind="primary" icon="i_checklist" cls="wide" onClick=${() => go('/aanvullen')}>Aanvullen (${toRestock.reduce((s, it) => s + shortage(it), 0)} stuks)<//>`}
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Vandaag gebruikt</h2>
            <a href="#/verbruik" class="panel-link" onClick=${(e) => { e.preventDefault(); go('/verbruik'); }}>Verbruik</a>
          </div>
          ${usedTotal === 0 ? html`<p class="sub">Vandaag nog niets gebruikt.</p>`
            : html`<p class="used"><b>${usedTotal}</b> ${usedTotal === 1 ? 'stuk' : 'stuks'} · ${plural(Object.keys(used).length, 'artikel', 'artikels')}</p>`}
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Laatste wijzigingen</h2></div>
          ${recent.length === 0 ? html`<p class="sub">Nog geen wijzigingen.</p>`
            : html`<ul class="mini-list">
              ${recent.map((m, i) => html`<li key=${i} class="mini-row static">
                <b class=${'mini-delta ' + (m.delta < 0 ? 'tone-text-red' : 'tone-text-green')}>${m.delta > 0 ? '+' + m.delta : '−' + -m.delta}</b>
                <span class="mini-name ellipsis">${nameOf(m.itemId)}</span>
                <span class="small faint">${fmtTime(m.time)}</span>
              </li>`)}
            </ul>`}
        </section>
      </aside>
    </div>

    ${brandMenu && html`<${Dialog} onDismiss=${() => setBrandMenu(false)} cls="sheet">
      <div class="sheet-title">Toon merk</div>
      <div class="pick-grid">
        ${[null, ...brands].map((b) => {
          const on = (activeBrand ?? null) === b;
          return html`<button type="button" key=${b ?? '*'} class=${'pick-tile' + (on ? ' on' : '')} aria-pressed=${on}
            onClick=${() => { setBrand(b); setBrandMenu(false); }}>
            <span class="pick-name">${b ?? 'Alle merken'}</span>
            <span class="pick-sub">${plural(b ? brandCounts.get(b) : data.items.length, 'artikel', 'artikels')}</span>
            ${on && html`<span class="pick-check"><${Icon} name="i_check" size=${16} /></span>`}
          </button>`;
        })}
      </div>
      <${DialogButtons}><${Button} onClick=${() => setBrandMenu(false)}>Annuleren<//><//>
    <//>`}
  </div>`;
}
