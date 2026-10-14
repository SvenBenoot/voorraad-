// ---- Bouwstenen
// Dezelfde onderdelen als in de Android-app (PrimaryButton, VgCard, StatusBanner, ItemCard…),
// alle kleuren komen uit de CSS-variabelen van het thema.
import { html, useEffect, useRef, useState } from '../lib/preact-htm.js';
import { Icon, GradientIcon, CATEGORY_ICONS } from './icons.js';
import { store, prefs, status, needsRestock, shortage, OTHER } from './store.js';

// ---- winkel volgen

export function useData() {
  const [d, setD] = useState(store.data);
  useEffect(() => store.subscribe(setD), []);
  return d;
}

export function usePrefs() {
  const [p, setP] = useState(prefs.value);
  useEffect(() => prefs.subscribe(setP), []);
  return p;
}

// ---- knoppen

export function Button({ kind = 'secondary', icon, onClick, disabled, children, cls = '', type = 'button', label }) {
  return html`<button type=${type} class=${`btn btn-${kind} ${cls}`} onClick=${onClick} disabled=${disabled} aria-label=${label}>
    ${icon && html`<${Icon} name=${icon} size=${18} />`}${children && html`<span>${children}</span>`}
  </button>`;
}

export function IconButton({ icon, label, onClick, cls = '', size = 24, badge }) {
  return html`<button type="button" class=${'icon-btn ' + cls} onClick=${onClick} aria-label=${label} title=${label}>
    <${Icon} name=${icon} size=${size} />
    ${badge ? html`<span class="badge">${badge}</span>` : null}
  </button>`;
}

/** − of + in een vierkant vlak; + in het merkverloop. */
export function StepButton({ add, onClick, disabled, size = 44, label }) {
  return html`<button type="button" class=${'step ' + (add ? 'step-add' : 'step-sub')} style=${`width:${size}px;height:${size}px`}
    onClick=${onClick} disabled=${disabled} aria-label=${label ?? (add ? 'Eén meer' : 'Eén minder')}>
    <${Icon} name=${add ? 'i_add' : 'i_remove'} size=${Math.round(size * 0.5)} />
  </button>`;
}

// ---- balken

export function BrandBar({ title, children }) {
  return html`<header class="bar">
    <div class="bar-row">
      <span class="logo">
        <img class="logo-light" src="img/logo_zwart.png" alt="Van Gils" />
        <img class="logo-dark" src="img/logo_wit.png" alt="Van Gils" />
      </span>
      <span class="bar-sep"></span>
      <span class="bar-title sub">${title}</span>
      <span class="bar-actions">${children}</span>
    </div>
    <div class="brand-strip"></div>
  </header>`;
}

export function TopBar({ title, onBack, children }) {
  return html`<header class="bar">
    <div class="bar-row bar-row-back">
      <${IconButton} icon="i_back" label="Terug" onClick=${onBack} />
      <span class="bar-title">${title}</span>
      <span class="bar-actions">${children}</span>
    </div>
    <div class="brand-strip"></div>
  </header>`;
}

export function Footer({ children }) {
  return html`<footer class="footer">${children}</footer>`;
}

// ---- kaarten en labels

export function Card({ children, selected, onClick, cls = '', pad }) {
  return html`<div class=${`card ${selected ? 'selected' : ''} ${onClick ? 'clickable' : ''} ${cls}`}
    style=${pad != null ? `padding:${pad}px` : null} onClick=${onClick}>${children}</div>`;
}

export const SectionHeader = ({ children }) => html`<div class="section">${children}</div>`;

export const Chip = ({ children, icon }) => html`<span class="chip">${icon && html`<${Icon} name=${icon} size=${14} />`}${children}</span>`;

export function FilterChip({ selected, onClick, children }) {
  return html`<button type="button" class=${'fchip' + (selected ? ' on' : '')} onClick=${onClick}>${children}</button>`;
}

export const TONE = { EMPTY: 'red', LOW: 'orange', OK: 'green', NO_MINIMUM: 'gray' };
const PILL = { EMPTY: 'Op', LOW: 'Bijvullen', OK: 'In orde', NO_MINIMUM: 'Geen min.' };

export const StatusPill = ({ tone, children }) => html`<span class=${'pill tone-' + tone}>${children}</span>`;

export function StatusBanner({ tone, icon, title, text, onClick, trailing }) {
  return html`<div class=${`banner tone-${tone} ${onClick ? 'clickable' : ''}`} onClick=${onClick}>
    <span class="banner-icon"><${Icon} name=${icon} size=${20} /></span>
    <span class="banner-body"><b>${title}</b>${text && html`<span>${text}</span>`}</span>
    ${trailing}
  </div>`;
}

export function EmptyState({ title, text, icon = 'bin' }) {
  return html`<div class="empty">
    <div class="empty-icon"><${Icon} name=${icon} size=${32} /></div>
    <div class="empty-title">${title}</div>
    <div class="empty-text">${text}</div>
  </div>`;
}

/**
 * Icoon van een artikel in de stijl van het app-logo: donker petrol vlak met het icoon in het merkverloop.
 * [icon] = eigen keuze van het artikel, anders dat van de categorie.
 */
export function ItemIcon({ category, icon, size = 52 }) {
  const s = Math.round(size * 0.56);
  return html`<span class="item-icon" style=${`width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.27)}px`}>
    <${GradientIcon} name=${icon || category.icon} size=${s} />
  </span>`;
}

export function BigNumber({ value, size = 30 }) {
  return html`<span class=${'bignum' + (value === 0 ? ' zero' : '')} style=${`font-size:${size}px`}>${value}</span>`;
}

/** Lijstkaart van een artikel: icoon, naam, labels, rechts het aantal en de status. */
export function ItemCard({ item, category, onClick }) {
  const st = status(item);
  return html`<${Card} onClick=${onClick} cls="item-card">
    <${ItemIcon} category=${category} icon=${item.icon} />
    <div class="item-body">
      <div class="card-title clamp2">${item.name}</div>
      <div class="chips">${item.brand && html`<${Chip}>${item.brand}<//>`}<${Chip}>${category.name}<//>${item.location && html`<${Chip}>${item.location}<//>`}</div>
      ${needsRestock(item) && html`<div class="shortage tone-text-orange"><i class="dot"></i>Nog ${shortage(item)} nodig · ${item.minimum ? 'minimum ' + item.minimum : 'op'}</div>`}
    </div>
    <div class="item-end">
      <${BigNumber} value=${item.quantity} />
      <${StatusPill} tone=${TONE[st]}>${PILL[st]}<//>
    </div>
  <//>`;
}

// ---- velden

export function SearchField({ value, onInput, hint = 'Zoeken' }) {
  return html`<label class="search">
    <${Icon} name="i_search" size=${20} />
    <input type="search" enterkeyhint="search" placeholder=${hint} value=${value}
      onInput=${(e) => onInput(e.currentTarget.value)}
      onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    ${value && html`<button type="button" class="icon-btn small" aria-label="Wissen" onClick=${() => onInput('')}><${Icon} name="i_close" size=${20} /></button>`}
  </label>`;
}

export function TextField({ label, value, onInput, hint, help, error, multiline, mono, autoFocus }) {
  const props = {
    value, placeholder: hint, class: (error ? 'err ' : '') + (mono ? 'mono' : ''),
    onInput: (e) => onInput(e.currentTarget.value), autoFocus,
  };
  return html`<label class="field">
    <span class="field-label">${label}</span>
    ${multiline ? html`<textarea rows="3" ...${props}></textarea>` : html`<input type="text" enterkeyhint="done"
      onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} ...${props} />`}
    ${error ? html`<span class="field-help tone-text-red">${error}</span>` : help && html`<span class="field-help">${help}</span>`}
  </label>`;
}

export function NumberField({ label, value, onChange, help, min = 0 }) {
  return html`<div class="field">
    <span class="field-label">${label}</span>
    <div class="number-row">
      <${StepButton} add=${false} disabled=${value <= min} onClick=${() => onChange(Math.max(min, value - 1))} />
      <input class="number" type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" value=${String(value)}
        onFocus=${(e) => e.currentTarget.select()}
        onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        onInput=${(e) => {
          const digits = e.currentTarget.value.replace(/\D/g, '').slice(0, 6);
          onChange(Math.max(min, parseInt(digits || '0', 10)));
        }} />
      <${StepButton} add=${true} onClick=${() => onChange(value + 1)} />
    </div>
    ${help && html`<span class="field-help">${help}</span>`}
  </div>`;
}

export function Switch({ checked, onChange, label }) {
  return html`<button type="button" role="switch" aria-checked=${checked} aria-label=${label}
    class=${'switch' + (checked ? ' on' : '')} onClick=${() => onChange(!checked)}><i></i></button>`;
}

// ---- vensters

export function Dialog({ onDismiss, children, cls = '' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onDismiss?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);
  return html`<div class="scrim" onClick=${(e) => { if (e.target === e.currentTarget) onDismiss?.(); }}>
    <div class=${'dialog ' + cls} role="dialog" aria-modal="true">
      <div class="brand-strip thick"></div>
      ${children}
    </div>
  </div>`;
}

export function DialogButtons({ children }) {
  return html`<div class="dialog-buttons">${children}</div>`;
}

/** Bevestiging in de eigen stijl. Gevaar = rode knop, en dan is Annuleren de veilige keuze. */
export function ConfirmDialog({ kind = 'question', icon, title, text, confirmLabel, onConfirm, onDismiss, dismissLabel = 'Annuleren', children }) {
  const tone = kind === 'danger' ? 'red' : kind === 'warning' ? 'orange' : 'blue';
  return html`<${Dialog} onDismiss=${onDismiss}>
    <div class="confirm">
      <span class=${'confirm-icon tone-' + tone}><${Icon} name=${icon} size=${22} /></span>
      <div class="confirm-body">
        <div class="card-title">${title}</div>
        <div class="confirm-text">${text}</div>
        ${children}
      </div>
    </div>
    <${DialogButtons}>
      <${Button} kind="secondary" onClick=${onDismiss}>${dismissLabel}<//>
      ${confirmLabel && html`<${Button} kind=${kind === 'danger' ? 'danger' : 'primary'} onClick=${onConfirm}>${confirmLabel}<//>`}
    <//>
  <//>`;
}

/** Categorie toevoegen of wijzigen: naam en icoon in één venster. */
export function CategoryDialog({ existing, initialName = '', takenNames, onSave, onDismiss }) {
  const [name, setName] = useState(existing?.name ?? initialName);
  const [icon, setIcon] = useState(existing?.icon ?? 'box');
  const [error, setError] = useState(null);
  const save = () => {
    const t = name.trim();
    const err = !t ? 'Geef een naam in. Bv. Luidsprekers'
      : takenNames.some((n) => n.toLowerCase() === t.toLowerCase() && n.toLowerCase() !== (existing?.name ?? '').toLowerCase())
        ? 'Deze categorie bestaat al. Kies een andere naam.' : null;
    setError(err);
    if (!err) onSave(t, icon);
  };
  return html`<${Dialog} onDismiss=${onDismiss}>
    <div class="dialog-body">
      <div class="card-title">${existing ? 'Categorie wijzigen' : 'Nieuwe categorie'}</div>
      <${TextField} label="Naam" value=${name} onInput=${(v) => { setName(v); setError(null); }} hint="Bv. Luidsprekers" error=${error} />
      <div class="field-label">Icoon</div>
      <${IconGrid} value=${icon} onPick=${setIcon} />
    </div>
    <${DialogButtons}>
      <${Button} kind="secondary" onClick=${onDismiss}>Annuleren<//>
      <${Button} kind="primary" onClick=${save}>Bewaren<//>
    <//>
  <//>`;
}

/** Raster met alle iconen, in de stijl van het app-logo, met een zoekveld. Gebruikt voor categorieën en artikels. */
export function IconGrid({ value, onPick }) {
  const [q, setQ] = useState('');
  const words = fold(q).split(/\s+/).filter(Boolean);
  const list = words.length ? CATEGORY_ICONS.filter((o) => words.every((w) => fold(o.find).includes(w))) : CATEGORY_ICONS;
  return html`<div class="icon-picker">
    <${SearchField} value=${q} onInput=${setQ} hint="Icoon zoeken, bv. kabel" />
    <div class="icon-grid">
      ${list.map((o) => html`<button type="button" key=${o.key} class=${'icon-opt' + (o.key === value ? ' on' : '')}
        aria-pressed=${o.key === value} aria-label=${o.label} title=${o.label} onClick=${() => onPick(o.key)}>
        <span class="icon-box"><${GradientIcon} name=${o.key} size=${24} /></span>
      </button>`)}
      ${!list.length && html`<p class="small faint icon-none">Geen icoon gevonden.</p>`}
    </div>
  </div>`;
}
const fold = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ---- korte melding onderaan

let toastSet;
export function toast(text) { toastSet?.(text); }
export function ToastHost() {
  const [text, setText] = useState(null);
  const timer = useRef();
  toastSet = (t, ms = 2600) => { setText(t); clearTimeout(timer.current); timer.current = setTimeout(() => setText(null), ms); };
  useEffect(() => {
    const onError = (e) => toastSet(e.detail, 6000);
    window.addEventListener('voorraad-fout', onError);
    return () => window.removeEventListener('voorraad-fout', onError);
  }, []);
  return text ? html`<div class="toast" role="status">${text}</div>` : null;
}

// ---- vegen

/**
 * Veeg naar rechts = wijzigen, naar links = verwijderen. Ver genoeg loslaten opent de vraag;
 * de kaart veert altijd terug, zodat er nooit per ongeluk iets weg is.
 */
export function SwipeRow({ onEdit, onDelete, onSwiped, children }) {
  const el = useRef(null);
  const st = useRef(null);
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(false);

  const start = (e) => {
    const t = e.touches[0];
    st.current = { x: t.clientX, y: t.clientY, dir: null };
    setAnim(false);
  };
  const move = (e) => {
    const s = st.current;
    if (!s) return;
    const t = e.touches[0];
    const mx = t.clientX - s.x, my = t.clientY - s.y;
    if (!s.dir) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      s.dir = Math.abs(mx) > Math.abs(my) * 1.3 ? 'h' : 'v';
    }
    if (s.dir !== 'h') return;
    e.preventDefault();
    setDx(mx);
  };
  const end = () => {
    const s = st.current;
    st.current = null;
    if (!s || s.dir !== 'h') return;
    const w = el.current?.offsetWidth ?? 300;
    const limit = Math.min(120, w * 0.3);
    setAnim(true);
    setDx(0);
    if (dx > limit) { onSwiped?.(); onEdit(); }
    else if (dx < -limit) { onSwiped?.(); onDelete(); }
  };

  // touchmove moet niet-passief zijn om het scrollen tegen te houden tijdens een zijwaartse veeg.
  useEffect(() => {
    const n = el.current;
    n.addEventListener('touchmove', move, { passive: false });
    return () => n.removeEventListener('touchmove', move);
  });

  const w = el.current?.offsetWidth ?? 300;
  const reached = Math.abs(dx) > Math.min(120, w * 0.3);
  return html`<div class="swipe" ref=${el} onTouchStart=${start} onTouchEnd=${end} onTouchCancel=${end}>
    ${dx > 0 && html`<div class=${'swipe-bg edit' + (reached ? ' reached' : '')}><${Icon} name="i_edit" /><span>Wijzigen</span></div>`}
    ${dx < 0 && html`<div class=${'swipe-bg delete' + (reached ? ' reached' : '')}><span>Verwijderen</span><${Icon} name="i_delete" /></div>`}
    <div class=${'swipe-fg' + (anim ? ' anim' : '')} style=${dx ? `transform:translateX(${dx}px)` : null}>${children}</div>
  </div>`;
}

export const plural = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export function fmtDate(t, withTime = true) {
  const d = new Date(t);
  const date = d.toLocaleDateString('nl-BE', { day: 'numeric', month: '2-digit', year: 'numeric' });
  return withTime ? `${date} ${d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}` : date;
}
