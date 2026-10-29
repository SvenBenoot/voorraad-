// ---- Afmetingen
// Maten van tv's en video soundbars, om ze juist aan de muur te hangen. Lijst met zoeken, één toestel in 3D op
// schaal (vooraan, zijkant, achterkant met de VESA-gaten), een tv en soundbar samen (Combineren) en de verwijderde
// toestellen (via Instellingen > Prullenmand). Maten staan in mm; tonen in mm of cm kies je in Instellingen.
import { html, useState } from '../../lib/preact-htm.js';
import { Icon, GradientIcon } from '../icons.js';
import { store, prefs, collator, fold, liveDevices, deviceName, daysLeft, DEVICE_KINDS } from '../store.js';
import {
  useData, usePrefs, BrandBar, TopBar, IconButton, Button, Footer, SearchField, FilterChip, Card, EmptyState, ConfirmDialog,
  Dialog, DialogButtons, TextField, plural, toast, fmtDate,
} from '../ui.js';
import { go, back, home, toStart } from '../router.js';
import { SyncButton, SyncDialog } from '../cloud-card.js';
import { Render3D, tvBlocks, barBlocks, VIEWS, fmtLen } from '../render3d.js';

const KIND_ICON = { tv: 'tv', bar: 'videobar' };
const kindLabel = (k) => DEVICE_KINDS.find((x) => x.key === k).label;
const touch = () => window.matchMedia('(pointer: coarse)').matches;

/** "1450 × 830 × 60 mm" (breedte × hoogte × diepte). */
export function fmtDims(t, unit = prefs.value.unit) {
  const n = (v) => fmtLen(v, unit).replace(/ \w+$/, '');
  return `${n(t.width)} × ${n(t.height)} × ${n(t.depth)} ${unit}`;
}

const byName = (a, b) => collator.compare(a.brand, b.brand) || collator.compare(a.model, b.model);

function DeviceIcon({ kind, size = 44 }) {
  return html`<span class="item-icon" style=${`width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.27)}px`}>
    <${GradientIcon} name=${KIND_ICON[kind]} size=${Math.round(size * 0.56)} />
  </span>`;
}

function DeviceCard({ device: t, onClick, children }) {
  return html`<${Card} onClick=${onClick} cls="item-card dev-card">
    <${DeviceIcon} kind=${t.kind} />
    <div class="item-body">
      <div class="card-title clamp2">${deviceName(t)}</div>
      <div class="sub">${fmtDims(t)}</div>
      ${children}
    </div>
  <//>`;
}

// ---- lijst

const kept = { query: '', filter: 'all' };

export function DevicesScreen() {
  const data = useData();
  usePrefs();
  const [query, setQueryState] = useState(kept.query);
  const [filter, setFilterState] = useState(kept.filter);
  const setQuery = (v) => { kept.query = v; setQueryState(v); };
  const setFilter = (v) => { kept.filter = v; setFilterState(v); };
  const [creating, setCreating] = useState(false);
  const [syncInfo, setSyncInfo] = useState(false);

  const all = liveDevices(data);
  const words = fold(query).split(/\s+/).filter(Boolean);
  const shown = all.filter((t) => (filter === 'all' || t.kind === filter)
    && words.every((w) => fold(`${t.brand} ${t.model} ${t.note}`).includes(w))).sort(byName);
  const count = (k) => all.filter((t) => t.kind === k).length;

  return html`<div class="screen scr-devices">
    <${BrandBar} title="Afmetingen" many>
      <${IconButton} icon="grid_view" label="Start" onClick=${toStart} />
      <${SyncButton} onClick=${() => setSyncInfo(true)} />
      <${IconButton} icon="i_add" label="Toestel toevoegen" size=${28} onClick=${() => setCreating(true)} />
      <${IconButton} icon="i_settings" label="Instellingen" onClick=${() => go('/instellingen')} />
    <//>
    <main class="content">
      ${all.length > 0 && html`
        <${SearchField} value=${query} onInput=${setQuery} hint="Zoeken op merk of type" />
        <div class="chip-row">
          <${FilterChip} selected=${filter === 'all'} onClick=${() => setFilter('all')}>Alles · ${all.length}<//>
          <${FilterChip} selected=${filter === 'tv'} onClick=${() => setFilter('tv')}>Tv · ${count('tv')}<//>
          <${FilterChip} selected=${filter === 'bar'} onClick=${() => setFilter('bar')}>Video soundbar · ${count('bar')}<//>
        </div>`}
      ${all.length === 0 ? html`<${EmptyState} icon="square_foot" title="Nog geen toestellen" text="Tik op + om een tv of video soundbar toe te voegen." />`
        : shown.length === 0 ? html`<p class="sub nothing center">Niets gevonden.</p>`
        : html`<div class="proj-grid">${shown.map((t) => html`<${DeviceCard} key=${t.id} device=${t} onClick=${() => go('/afmeting/' + t.id)}>
            ${t.kind === 'tv' && t.vesaW > 0 && t.vesaH > 0 && html`<div class="small faint">VESA ${t.vesaW} × ${t.vesaH}</div>`}
          <//>`)}</div>`}
    </main>
    <${Footer}>
      ${all.length > 0 && html`<${Button} icon="combo" onClick=${() => go('/combineren')}>Combineren<//>`}
      <${Button} kind="primary" icon="i_add" onClick=${() => setCreating(true)}>Nieuw toestel<//>
    <//>
    ${creating && html`<${DeviceDialog} onDismiss=${() => setCreating(false)} onSaved=${(t) => go('/afmeting/' + t.id)} />`}
    ${syncInfo && html`<${SyncDialog} onDismiss=${() => setSyncInfo(false)} />`}
  </div>`;
}

// ---- één toestel

function singleScene(t, key) {
  const { width: w, height: h, depth: d } = t;
  const g = Math.max(w, h, d) * 0.07;
  const blocks = t.kind === 'tv' ? tvBlocks(t) : barBlocks(t);
  const dims = [];
  const notes = [];
  if (key === 'side') {
    dims.push({ a: [w, 0, 0], b: [w, h, 0], off: [0, 0, -g], text: fmtLen(h) });
    dims.push({ a: [w, 0, 0], b: [w, 0, d], off: [0, -g, 0], text: fmtLen(d) });
  } else if (key === 'back') {
    dims.push({ a: [0, 0, 0], b: [w, 0, 0], off: [0, -g, 0], text: fmtLen(w) });
    dims.push({ a: [0, 0, 0], b: [0, h, 0], off: [-g, 0, 0], text: fmtLen(h) });
    if (t.vesaW && t.vesaH) notes.push({ at: [w / 2, h / 2 - t.vesaH / 2, 0], text: `VESA ${t.vesaW} × ${t.vesaH}`, dy: 1.4 });
  } else {
    dims.push({ a: [0, 0, d], b: [w, 0, d], off: [0, -g, 0], text: fmtLen(w) });
    dims.push({ a: [w, 0, d], b: [w, h, d], off: [g, 0, 0], text: fmtLen(h) });
    if (key === '3d') dims.push({ a: [w, h, 0], b: [w, h, d], off: [0, g, 0], text: fmtLen(d) });
    // Het midden van de tv: vanaf de zijkant en vanaf de onderkant.
    if (key === 'front' && t.kind === 'tv') {
      dims.push({ a: [0, h / 2, d], b: [w / 2, h / 2, d], text: fmtLen(w / 2), dashed: true });
      dims.push({ a: [w / 2, h / 2, d], b: [w / 2, 0, d], text: fmtLen(h / 2), dashed: true });
    }
  }
  return { blocks, dims, notes };
}

function ViewSwitch({ views, value, onPick }) {
  const names = { '3d': '3D', front: 'Voor', side: 'Zij', back: 'Achter' };
  return html`<div class="seg r3-views" role="group" aria-label="Weergave" style=${`grid-template-columns:repeat(${views.length},1fr)`}>
    ${views.map((k) => html`<button type="button" key=${k} class=${value === k ? 'on' : ''} aria-pressed=${value === k} onClick=${() => onPick(k)}>${names[k]}</button>`)}
  </div>`;
}

/** Weergave kiezen of zelf draaien (slepen); draaien telt als 3D. */
function useView(start = '3d') {
  const [key, setKey] = useState(start);
  const [angles, setAngles] = useState(VIEWS[start]);
  return { key, angles, pick: (k) => { setKey(k); setAngles(VIEWS[k]); }, rotate: (a) => { setKey('3d'); setAngles(a); } };
}

const Row = ({ label, children }) => html`<div class="dev-row"><span>${label}</span><b>${children}</b></div>`;

// Gekozen tv en soundbar bij Combineren (blijft staan zolang de app open is).
const combo = { tv: null, bar: null, gap: 0, above: false };

export function DeviceScreen({ id }) {
  const data = useData();
  usePrefs();
  const view = useView();
  const [editing, setEditing] = useState(null); // 'edit' of 'copy'
  const t = data.devices.find((x) => x.id === id && !x.deletedAt);
  if (!t) {
    return html`<div class="screen">
      <${TopBar} title="Toestel" onBack=${() => back('/afmetingen')} />
      <main class="content">
        <${EmptyState} icon="square_foot" title="Toestel niet gevonden" text="Het is misschien verwijderd." />
        <${Button} kind="primary" onClick=${() => home('/afmetingen')}>Naar afmetingen<//>
      </main>
    </div>`;
  }
  const tv = t.kind === 'tv';
  const scene = singleScene(t, view.key);
  return html`<div class="screen scr-device">
    <${TopBar} title=${deviceName(t)} onBack=${() => back('/afmetingen')}>
      <${IconButton} icon="i_copy" label="Kopiëren als nieuw model" onClick=${() => setEditing('copy')} />
      <${IconButton} icon="i_edit" label="Wijzigen" onClick=${() => setEditing('edit')} />
    <//>
    <main class="content">
      <${ViewSwitch} views=${tv ? ['3d', 'front', 'side', 'back'] : ['3d', 'front', 'side']} value=${view.key} onPick=${view.pick} />
      <div class="card r3-card">
        <${Render3D} ...${scene} view=${view.angles} onRotate=${view.rotate} label=${deviceName(t) + ', ' + fmtDims(t)} />
      </div>
      <${Card} cls="dev-rows">
        <${Row} label="Soort">${kindLabel(t.kind)}<//>
        <${Row} label="Breedte">${fmtLen(t.width)}<//>
        <${Row} label="Hoogte">${fmtLen(t.height)}<//>
        <${Row} label="Diepte">${fmtLen(t.depth)}<//>
        ${tv && html`<${Row} label="Midden">${fmtLen(t.width / 2)} van de zijkant · ${fmtLen(t.height / 2)} van de onderkant<//>`}
        ${tv && t.vesaW > 0 && t.vesaH > 0 && html`<${Row} label="VESA">${t.vesaW} × ${t.vesaH}<//>`}
        ${t.weight > 0 && html`<${Row} label="Gewicht">${t.weight.toLocaleString('nl-BE')} kg<//>`}
      <//>
      ${t.note && html`<${Card}><div class="sub pre">${t.note}</div><//>`}
    </main>
    <${Footer}>
      <${Button} kind="primary" icon="combo" cls="wide" onClick=${() => { combo[t.kind] = t.id; go('/combineren'); }}>Combineren<//>
    <//>
    ${editing && html`<${DeviceDialog} key=${editing} device=${editing === 'edit' ? t : null} copyOf=${editing === 'copy' ? t : null}
      onDismiss=${() => setEditing(null)} onSaved=${(x) => { if (editing === 'copy') go('/afmeting/' + x.id, { replace: true }); }}
      onDeleted=${() => home('/afmetingen')} />`}
  </div>`;
}

// ---- tv en soundbar samen

function comboScene(tv, bar, gap, above, key) {
  const W = Math.max(tv.width, bar.width);
  const ty = above ? 0 : bar.height + gap;
  const by = above ? tv.height + gap : 0;
  const top = Math.max(ty + tv.height, by + bar.height);
  const g = Math.max(W, top) * 0.07;
  const z = Math.max(tv.depth, bar.depth);
  const blocks = [...tvBlocks(tv, -tv.width / 2, ty), ...barBlocks(bar, -bar.width / 2, by)];
  const tvEdge = above ? ty : ty + tv.height; // rand van de tv aan de kant zonder soundbar
  const barEdge = above ? by + bar.height : by;
  const dims = [
    { a: [-W / 2, 0, z], b: [-W / 2, top, z], off: [-g, 0, 0], text: fmtLen(top) },
    { a: [-tv.width / 2, tvEdge, tv.depth], b: [tv.width / 2, tvEdge, tv.depth], off: [0, above ? -g : g, 0], text: fmtLen(tv.width) },
    { a: [-bar.width / 2, barEdge, bar.depth], b: [bar.width / 2, barEdge, bar.depth], off: [0, above ? g : -g, 0], text: fmtLen(bar.width) },
    { a: [W / 2, ty, z], b: [W / 2, ty + tv.height, z], off: [g, 0, 0], text: fmtLen(tv.height) },
    { a: [W / 2, by, z], b: [W / 2, by + bar.height, z], off: [g, 0, 0], text: fmtLen(bar.height) },
  ];
  if (gap > top * 0.06) {
    const g0 = above ? tv.height : bar.height;
    dims.push({ a: [W / 2, g0, z], b: [W / 2, g0 + gap, z], off: [g, 0, 0], text: fmtLen(gap) });
  }
  if (key === '3d') dims.splice(3);
  return { blocks, dims };
}

const toField = (v, unit) => (v ? (unit === 'cm' ? String(v / 10).replace('.', ',') : String(v)) : '');
const fromField = (s, unit) => { const n = parseFloat(String(s).replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(unit === 'cm' ? n * 10 : n) : 0; };

function PickCard({ kind, device, onClick }) {
  return html`<${Card} onClick=${onClick} cls="item-card dev-pick">
    <${DeviceIcon} kind=${kind} size=${40} />
    <div class="item-body">
      <div class="small faint">${kindLabel(kind)}</div>
      <div class=${'card-title clamp2' + (device ? '' : ' faint')}>${device ? deviceName(device) : 'Kiezen…'}</div>
    </div>
    <${Icon} name="i_edit" size=${20} cls="faint" />
  <//>`;
}

export function ComboScreen() {
  const data = useData();
  const p = usePrefs();
  const view = useView('front');
  const [, redraw] = useState(0);
  const [picking, setPicking] = useState(null);
  const [gapText, setGapText] = useState(toField(combo.gap, p.unit));
  const set = (patch) => { Object.assign(combo, patch); redraw((n) => n + 1); };

  const tv = combo.tv && store.device(combo.tv);
  const bar = combo.bar && store.device(combo.bar);
  const scene = tv && bar && comboScene(tv, bar, combo.gap, combo.above, view.key);
  const total = tv && bar ? tv.height + bar.height + combo.gap : 0;
  const diff = tv && bar ? bar.width - tv.width : 0;

  return html`<div class="screen scr-combo">
    <${TopBar} title="Combineren" onBack=${() => back('/afmetingen')} />
    <main class="content">
      <${PickCard} kind="tv" device=${tv} onClick=${() => setPicking('tv')} />
      <${PickCard} kind="bar" device=${bar} onClick=${() => setPicking('bar')} />
      <div class="combo-opts">
        <div class="field">
          <span class="field-label">Soundbar</span>
          <div class="seg" role="group" aria-label="Plaats van de soundbar">
            <button type="button" class=${!combo.above ? 'on' : ''} aria-pressed=${!combo.above} onClick=${() => set({ above: false })}>Onder</button>
            <button type="button" class=${combo.above ? 'on' : ''} aria-pressed=${combo.above} onClick=${() => set({ above: true })}>Boven</button>
          </div>
        </div>
        <label class="field combo-gap">
          <span class="field-label">Tussenruimte (${p.unit})</span>
          <input type="text" inputmode="decimal" enterkeyhint="done" value=${gapText} placeholder="0"
            onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onInput=${(e) => { setGapText(e.currentTarget.value); set({ gap: fromField(e.currentTarget.value, p.unit) }); }} />
        </label>
      </div>
      ${scene ? html`
        <${ViewSwitch} views=${['3d', 'front']} value=${view.key} onPick=${view.pick} />
        <div class="card r3-card">
          <${Render3D} ...${scene} view=${view.angles} onRotate=${view.rotate} label=${'Totale hoogte ' + fmtLen(total)} />
        </div>
        <${Card} cls="dev-rows">
          <div class="dev-total"><span>Totale hoogte</span><b>${fmtLen(total)}</b></div>
          <${Row} label="Breedte tv">${fmtLen(tv.width)}<//>
          <${Row} label="Breedte soundbar">${fmtLen(bar.width)}<//>
          <${Row} label="Verschil">${diff === 0 ? 'Even breed' : `Soundbar ${fmtLen(Math.abs(diff))} ${diff > 0 ? 'breder' : 'smaller'}`}<//>
          ${combo.gap > 0 && html`<${Row} label="Tussenruimte">${fmtLen(combo.gap)}<//>`}
        <//>`
        : html`<p class="sub nothing center">Kies een tv en een video soundbar.</p>`}
    </main>
    ${picking && html`<${DevicePicker} kind=${picking} devices=${liveDevices(data).filter((x) => x.kind === picking).sort(byName)}
      onPick=${(x) => { setPicking(null); set({ [picking]: x.id }); }} onDismiss=${() => setPicking(null)} />`}
  </div>`;
}

function DevicePicker({ kind, devices, onPick, onDismiss }) {
  const [q, setQ] = useState('');
  const words = fold(q).split(/\s+/).filter(Boolean);
  const list = devices.filter((t) => words.every((w) => fold(`${t.brand} ${t.model}`).includes(w)));
  return html`<${Dialog} onDismiss=${onDismiss} cls="dev-picker">
    <div class="dialog-body">
      <div class="card-title">${kind === 'tv' ? 'Kies een tv' : 'Kies een video soundbar'}</div>
      ${devices.length > 6 && html`<${SearchField} value=${q} onInput=${setQ} hint="Zoeken" />`}
      <div class="dev-pick-list">
        ${list.map((t) => html`<button type="button" key=${t.id} class="menu-item" onClick=${() => onPick(t)}>
          <${Icon} name=${KIND_ICON[kind]} size=${22} />
          <span class="dev-pick-text"><b>${deviceName(t)}</b><span class="small faint">${fmtDims(t)}</span></span>
        </button>`)}
        ${devices.length === 0 && html`<p class="sub">${kind === 'tv' ? 'Nog geen tv toegevoegd.' : 'Nog geen video soundbar toegevoegd.'}</p>`}
        ${devices.length > 0 && list.length === 0 && html`<p class="sub">Niets gevonden.</p>`}
      </div>
    </div>
    <${DialogButtons}><${Button} onClick=${onDismiss}>Annuleren<//><//>
  <//>`;
}

// ---- toevoegen, wijzigen, kopiëren

function NumField({ label, value, onInput, error }) {
  return html`<label class="field">
    <span class="field-label">${label}</span>
    <input type="text" inputmode="decimal" enterkeyhint="done" value=${value} class=${error ? 'err' : ''}
      onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      onInput=${(e) => onInput(e.currentTarget.value)} />
  </label>`;
}

/** [device] = wijzigen, [copyOf] = nieuw model op basis van een ander, geen van beide = nieuw toestel. */
export function DeviceDialog({ device, copyOf, onDismiss, onSaved, onDeleted }) {
  const unit = prefs.value.unit;
  const src = device ?? copyOf;
  const [kind, setKind] = useState(src?.kind ?? 'tv');
  const [brand, setBrand] = useState(src?.brand ?? '');
  const [model, setModel] = useState(src?.model ?? '');
  const [size, setSize] = useState({
    width: toField(src?.width, unit), height: toField(src?.height, unit), depth: toField(src?.depth, unit),
    weight: src?.weight ? String(src.weight).replace('.', ',') : '', vesaW: src?.vesaW ? String(src.vesaW) : '', vesaH: src?.vesaH ? String(src.vesaH) : '',
  });
  const [note, setNote] = useState(src?.note ?? '');
  const [tried, setTried] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const field = (k) => (v) => setSize((s) => ({ ...s, [k]: v }));

  const fields = {
    kind, brand: brand.trim(), model: model.trim(), note: note.trim(),
    width: fromField(size.width, unit), height: fromField(size.height, unit), depth: fromField(size.depth, unit),
    weight: parseFloat(size.weight.replace(',', '.')) || 0, vesaW: fromField(size.vesaW, 'mm'), vesaH: fromField(size.vesaH, 'mm'),
  };
  const noName = !fields.brand && !fields.model;
  const noSize = !fields.width || !fields.height || !fields.depth;

  const save = async () => {
    if (noName || noSize) { setTried(true); return; }
    if (device) {
      await store.editDevice(device.id, fields);
      onDismiss();
      onSaved?.(device);
    } else {
      const x = await store.addDevice(fields);
      onDismiss();
      onSaved?.(x);
      toast(copyOf ? 'Nieuw model bewaard' : 'Toestel bewaard');
    }
  };

  if (askDelete) {
    return html`<${ConfirmDialog} kind="danger" icon="i_delete" title=${deviceName(device) + ' verwijderen?'}
      text="Je vindt het 30 dagen terug in Instellingen, bij Prullenmand." confirmLabel="Verwijderen"
      onDismiss=${() => setAskDelete(false)}
      onConfirm=${async () => {
        const id = device.id;
        onDismiss();
        await store.deleteDevice(id);
        onDeleted?.();
        toast('Verwijderd', { label: 'Ongedaan maken', onClick: () => store.restoreDevice(id) });
      }} />`;
  }

  return html`<${Dialog} onDismiss=${onDismiss} cls="device-dialog" sticky>
    <div class="dialog-body">
      <div class="card-title">${device ? 'Toestel wijzigen' : copyOf ? 'Nieuw model' : 'Nieuw toestel'}</div>
      <div class="seg" role="group" aria-label="Soort">
        ${DEVICE_KINDS.map((k) => html`<button type="button" key=${k.key} class=${kind === k.key ? 'on' : ''} aria-pressed=${kind === k.key}
          onClick=${() => setKind(k.key)}>${k.label}</button>`)}
      </div>
      <div class="dev-grid two">
        <${TextField} label="Merk" value=${brand} onInput=${setBrand} hint=${kind === 'tv' ? 'bv. Samsung' : 'bv. Yealink'}
          error=${tried && noName ? 'Vul merk of type in.' : ''} />
        <${TextField} label="Type" value=${model} onInput=${setModel} hint=${kind === 'tv' ? 'bv. QE55Q80D' : 'bv. A40'}
          autoFocus=${!!copyOf && !touch()} />
      </div>
      <div class="dev-grid three">
        <${NumField} label=${`Breedte (${unit})`} value=${size.width} onInput=${field('width')} error=${tried && !fields.width} />
        <${NumField} label=${`Hoogte (${unit})`} value=${size.height} onInput=${field('height')} error=${tried && !fields.height} />
        <${NumField} label=${`Diepte (${unit})`} value=${size.depth} onInput=${field('depth')} error=${tried && !fields.depth} />
      </div>
      ${tried && noSize && html`<span class="field-help tone-text-red" role="alert">Vul breedte, hoogte en diepte in.</span>`}
      <div class=${'dev-grid ' + (kind === 'tv' ? 'three' : 'two')}>
        <${NumField} label="Gewicht (kg)" value=${size.weight} onInput=${field('weight')} />
        ${kind === 'tv' && html`
          <${NumField} label="VESA breed (mm)" value=${size.vesaW} onInput=${field('vesaW')} />
          <${NumField} label="VESA hoog (mm)" value=${size.vesaH} onInput=${field('vesaH')} />`}
      </div>
      <${TextField} label="Notitie" value=${note} onInput=${setNote} hint="Optioneel" multiline />
      ${device && html`<${Button} kind="ghost" icon="i_delete" cls="danger-text align-start" onClick=${() => setAskDelete(true)}>Verwijderen…<//>`}
    </div>
    <${DialogButtons}>
      <${Button} onClick=${onDismiss}>Annuleren<//>
      <${Button} kind="primary" onClick=${save}>Bewaren<//>
    <//>
  <//>`;
}

// ---- verwijderde toestellen (30 dagen)

export function DeviceTrashScreen() {
  const data = useData();
  const [ask, setAsk] = useState(null); // toestel, of 'all'
  const list = data.devices.filter((x) => x.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
  return html`<div class="screen scr-trash">
    <${TopBar} title="Verwijderde toestellen" onBack=${() => back('/instellingen')}>
      ${list.length > 0 && html`<${IconButton} icon="i_delete" label="Alles wissen" onClick=${() => setAsk('all')} />`}
    <//>
    <main class="content">
      ${list.length === 0 ? html`<${EmptyState} icon="i_delete" title="Geen verwijderde toestellen" text="Verwijderde toestellen blijven hier 30 dagen." />`
        : list.map((t) => html`<${Card} key=${t.id} cls="trash-card">
          <div class="trash-top">
            <${DeviceIcon} kind=${t.kind} size=${52} />
            <div class="item-body">
              <div class="card-title clamp2">${deviceName(t)}</div>
              <div class="small faint">Nog ${plural(daysLeft(t), 'dag', 'dagen')} · verwijderd ${fmtDate(t.deletedAt)}</div>
            </div>
          </div>
          <div class="btn-row">
            <${Button} icon="i_restore" onClick=${async () => { await store.restoreDevice(t.id); toast('Teruggezet'); }}>Terugzetten<//>
            <${Button} cls="danger-text" icon="i_delete" onClick=${() => setAsk(t)}>Wissen…<//>
          </div>
        <//>`)}
    </main>
    ${ask && html`<${ConfirmDialog} kind="danger" icon="i_delete"
      title=${ask === 'all' ? 'Alle verwijderde toestellen wissen?' : deviceName(ask) + ' definitief wissen?'}
      text="Dit kan niet ongedaan gemaakt worden." confirmLabel="Wissen"
      onConfirm=${() => { const a = ask; setAsk(null); store.deleteDevicesForever(a === 'all' ? undefined : [a.id]); }}
      onDismiss=${() => setAsk(null)} />`}
  </div>`;
}
