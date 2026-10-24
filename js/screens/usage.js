// ---- Verbruik
// Dagoverzicht van wat er uit de bestelwagen ging (bij de klant gebruikt), uit het logboek van aantallen.
// Elke verlaging telt als gebruik. Een + kort na een − (binnen 5 minuten) geldt als correctie en
// schrapt die −; een + die niet direct volgt op een − (bijtellen, nieuw artikel, aanvullen) raakt het
// verbruik niet. Zo telt "+5 erbij, daarna −4 bij de klant" gewoon als 4 gebruikt.
import { html, useState } from '../../lib/preact-htm.js';
import { Icon } from '../icons.js';
import { collator, categoryOf, OTHER, fullName } from '../store.js';
import { useData, TopBar, IconButton, Card, SectionHeader, EmptyState, ItemIcon, BigNumber, toast, plural } from '../ui.js';
import { shareText } from '../files.js';
import { go, back } from '../router.js';

const DAY = 24 * 60 * 60 * 1000;
const UNDO_WINDOW = 5 * 60 * 1000;
export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Een dag verder of terug, ook rond de overgang naar zomer- of wintertijd. */
const shiftDay = (day, n) => startOfDay(day + n * DAY + 12 * 60 * 60 * 1000);

function dayLabel(day) {
  const today = startOfDay(Date.now());
  if (day === today) return 'Vandaag';
  if (day === shiftDay(today, -1)) return 'Gisteren';
  const s = new Date(day).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Gebruikte stuks per artikel op [day]: { itemId: aantal }. */
export function usageOn(data, day) {
  const end = shiftDay(day, 1);
  const open = {}; // per artikel: verlagingen van die dag die nog door een correctie geschrapt kunnen worden
  const moves = data.movements.filter((m) => m.time >= day && m.time < end).sort((a, b) => a.time - b.time);
  for (const m of moves) {
    const list = (open[m.itemId] ??= []);
    if (m.delta < 0) { list.push({ n: -m.delta, time: m.time }); continue; }
    if (m.restock) continue;
    // Correctie: schrap recente verlagingen, de laatste eerst.
    let left = m.delta;
    for (let i = list.length - 1; i >= 0 && left > 0 && m.time - list[i].time <= UNDO_WINDOW; i--) {
      const take = Math.min(left, list[i].n);
      list[i].n -= take; left -= take;
    }
  }
  const used = {};
  for (const [id, list] of Object.entries(open)) {
    const n = list.reduce((s, x) => s + x.n, 0);
    if (n > 0) used[id] = n;
  }
  return used;
}

export function UsageScreen() {
  const data = useData();
  const today = startOfDay(Date.now());
  // null = vandaag, zodat het overzicht na middernacht vanzelf op de nieuwe dag springt.
  const [picked, setDay] = useState(null);
  const day = picked ?? today;

  const used = usageOn(data, day);
  const catOrder = Object.fromEntries(data.categories.map((c, i) => [c.id, i]));
  // Een intussen verwijderd artikel blijft staan, met de naam uit het logboek.
  const gone = (id) => {
    const name = data.movements.find((m) => m.itemId === id && m.name)?.name;
    return name ? { id, name: name + ' (verwijderd)', category: OTHER, quantity: 0, location: '', icon: 'other', deleted: true } : null;
  };
  const rows = Object.entries(used)
    .map(([id, n]) => [data.items.find((i) => i.id === id) ?? gone(id), n])
    .filter(([it]) => it)
    .sort(([a], [b]) => (catOrder[categoryOf(data, a).id] ?? 1e9) - (catOrder[categoryOf(data, b).id] ?? 1e9) || collator.compare(a.name, b.name));
  const total = rows.reduce((s, [, n]) => s + n, 0);

  // Vorige of volgende dag mét verbruik, zodat je niet door lege dagen moet tikken.
  const usedDays = [...new Set(data.movements.filter((m) => m.delta < 0 && !m.restock).map((m) => startOfDay(m.time)))]
    .filter((d) => Object.keys(usageOn(data, d)).length).sort((a, b) => a - b);
  const prevDay = usedDays.filter((d) => d < day).pop();
  const nextDay = usedDays.find((d) => d > day && d <= today) ?? (day < today ? today : undefined);

  const listText = () => {
    const date = new Date(day).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: '2-digit', year: 'numeric' });
    let out = `Gebruikt bij de klant (${date}):`;
    let lastCat = null;
    for (const [it, n] of rows) {
      const cat = categoryOf(data, it).name;
      if (cat !== lastCat) { out += `\n\n${cat.toUpperCase()}`; lastCat = cat; }
      out += `\n${n}× ${fullName(it)}`;
    }
    return out + `\n\nTotaal: ${plural(total, 'stuk', 'stuks')}`;
  };

  const list = [];
  rows.forEach(([it, n], i) => {
    const cat = categoryOf(data, it);
    if (i === 0 || categoryOf(data, rows[i - 1][0]).id !== cat.id) list.push(html`<${SectionHeader} key=${'kop-' + cat.id}>${cat.name}<//>`);
    list.push(html`<${Card} key=${it.id} cls="usage-row" onClick=${it.deleted ? null : () => go('/artikel/' + it.id)}>
      <${ItemIcon} icon=${it.icon} size=${40} />
      <div class="pick-body">
        <div class="card-title clamp2">${it.name}</div>
        <div class="small faint">${it.deleted ? 'Niet meer in je voorraad' : `Nu nog ${it.quantity}${it.location ? ' · ' + it.location : ''}`}</div>
      </div>
      <${BigNumber} value=${'−' + n} size=${26} />
    <//>`);
  });

  return html`<div class="screen">
    <${TopBar} title="Verbruik" onBack=${back}>
      ${rows.length > 0 && html`<${IconButton} icon="i_share" label="Overzicht delen"
        onClick=${async () => { if ((await shareText(listText())) === 'copied') toast('Overzicht gekopieerd'); }} />`}
    <//>
    <main class="content">
      <div class="day-nav">
        <button type="button" class="icon-btn" aria-label="Vorige dag" disabled=${prevDay == null} onClick=${() => setDay(prevDay)}>
          <${Icon} name="i_back" />
        </button>
        <span class="day-label">${dayLabel(day)}</span>
        <button type="button" class="icon-btn flip" aria-label="Volgende dag" disabled=${nextDay == null} onClick=${() => setDay(nextDay === today ? null : nextDay)}>
          <${Icon} name="i_back" />
        </button>
      </div>

      ${rows.length === 0 ? html`<${EmptyState} icon="i_history" title=${day === today ? 'Vandaag nog niets gebruikt' : 'Niets gebruikt op deze dag'}
          text="Wat je gebruikt, verschijnt hier per dag." />`
        : html`
        <${Card}>
          <div class="progress-head">
            <${BigNumber} value=${total} size=${40} />
            <span class="sub">${total === 1 ? 'stuk' : 'stuks'} gebruikt<br />${plural(rows.length, 'artikel', 'artikels')}</span>
          </div>
        <//>
        ${list}`}
    </main>
  </div>`;
}
