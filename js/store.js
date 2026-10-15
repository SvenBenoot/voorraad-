// ---- Gegevens
// Zelfde opbouw als de Android-app (voorraad.json), zodat een reservekopie van de ene in de andere past.
// Waar ze bewaard worden, regelt storage.js.
import { localStore } from './storage.js';

// De opslag op het toestel. Ben je ingelogd voor online opslaan, dan stuurt cloud.js elke wijziging ook door.
const backend = localStore;

export const OTHER = 'OTHER';

// De ids zijn dezelfde als in de Android-app, zodat oude gegevens blijven kloppen.
export const DEFAULT_CATEGORIES = [
  { id: 'CABLE', name: 'Kabel', icon: 'cable' },
  { id: 'CONNECTOR', name: 'Fiche', icon: 'connector' },
  { id: 'DEVICE', name: 'Toestel', icon: 'device' },
  { id: 'BIN', name: 'Bakje', icon: 'bin' },
  // Sinds 1.7 erbij; bestaande gegevens krijgen ze één keer (zie normalize), daarna mag je ze gewoon verwijderen.
  { id: 'ADAPTER', name: 'Adapter', icon: 'adapter' },
  { id: 'NETWORK', name: 'Netwerk', icon: 'ethernet' },
  { id: 'WIRELESS', name: 'Draadloos', icon: 'wifi' },
  { id: 'POWER', name: 'Stroom', icon: 'powerstrip' },
  { id: 'BATTERY', name: 'Batterijen', icon: 'battery' },
  { id: 'MIC', name: 'Microfoon', icon: 'mic' },
  { id: 'SPEAKER', name: 'Luidspreker', icon: 'speaker' },
  { id: 'AMP', name: 'Versterker', icon: 'amp' },
  { id: 'MIXER', name: 'Mixer', icon: 'mixer' },
  { id: 'SCREEN', name: 'Scherm', icon: 'tv' },
  { id: 'PROJECTOR', name: 'Projector', icon: 'projector' },
  { id: 'CAMERA', name: 'Camera', icon: 'video' },
  { id: 'LIGHT', name: 'Licht', icon: 'spot' },
  { id: 'COMPUTER', name: 'Computer', icon: 'computer' },
  { id: 'REMOTE', name: 'Afstandsbediening', icon: 'remote' },
  { id: 'MOUNT', name: 'Beugels en statieven', icon: 'tripod' },
  { id: 'RACK', name: 'Rack', icon: 'rack' },
  { id: 'WALLPLATE', name: 'Wandplaat', icon: 'wallplate' },
  { id: 'FIXING', name: 'Bevestiging', icon: 'screw' },
  { id: 'TAPE', name: 'Tape en tie-wraps', icon: 'cabletie' },
  { id: 'TOOL', name: 'Gereedschap', icon: 'tool' },
  { id: 'CONSUMABLE', name: 'Verbruiksmateriaal', icon: 'box' },
  { id: OTHER, name: 'Andere', icon: 'other' },
];

export const MAX_MOVEMENTS = 3000;

export const SORT_MODES = [
  { key: 'NAME', label: 'Naam', icon: 'i_sort_alpha' },
  { key: 'CATEGORY', label: 'Categorie', icon: 'i_category' },
  { key: 'QUANTITY', label: 'Aantal, laagste eerst', icon: 'i_trend_up' },
  { key: 'QUANTITY_DESC', label: 'Aantal, hoogste eerst', icon: 'i_trend_down' },
  { key: 'LOCATION', label: 'Plaats', icon: 'i_place' },
  { key: 'RECENT', label: 'Laatst gewijzigd', icon: 'i_history' },
];

export const collator = new Intl.Collator('nl-BE', { sensitivity: 'base', numeric: true });
/** Tekst om te zoeken: kleine letters en zonder accenten (é → e). */
export const fold = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ---- artikel-hulpjes

/** Naam met merk ervoor, voor lijsten die je doorstuurt (bv. "Procab CLA901/1"). */
export const fullName = (it) => (it.brand && !it.name.toLowerCase().startsWith(it.brand.toLowerCase()) ? `${it.brand} ${it.name}` : it.name);

// Zonder minimum telt "op" ook als bijvullen: dan neem je er minstens 1 mee.
const target = (it) => Math.max(it.minimum, 1);
export const needsRestock = (it) => it.quantity < target(it);
export const shortage = (it) => Math.max(0, target(it) - it.quantity);
export function status(it) {
  if (it.quantity <= 0) return 'EMPTY';
  if (needsRestock(it)) return 'LOW';
  if (it.minimum === 0) return 'NO_MINIMUM';
  return 'OK';
}

export function categoryOf(data, idOrItem) {
  const id = typeof idOrItem === 'string' ? idOrItem : idOrItem.category;
  return data.categories.find((c) => c.id === id)
    || data.categories.find((c) => c.id === OTHER)
    || DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

/** Ontbrekende velden aanvullen, zoals kotlinx.serialization dat met standaardwaarden doet. */
export function normalize(raw) {
  const now = Date.now();
  const categories = raw?.categories?.length
    ? raw.categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon ?? 'box' })) : DEFAULT_CATEGORIES.slice();
  // Een artikel heeft altijd een eigen icoon. Oudere gegevens (geen icoon = dat van de categorie) krijgen het icoon
  // dat ze nu tonen, zodat het niet meer meeverandert als je de categorie wijzigt.
  const iconOf = (catId) => (categories.find((c) => c.id === catId) ?? categories.find((c) => c.id === OTHER))?.icon ?? 'other';
  const d = {
    version: raw?.version ?? 1,
    items: (raw?.items ?? []).map((it) => ({
      id: String(it.id), code: String(it.code ?? ''), name: String(it.name ?? ''), brand: String(it.brand ?? ''),
      category: it.category ?? 'CABLE', quantity: Math.max(0, it.quantity | 0), minimum: Math.max(0, it.minimum | 0),
      location: it.location ?? '', note: it.note ?? '', icon: it.icon || iconOf(it.category ?? 'CABLE'),
      createdAt: it.createdAt ?? now, updatedAt: it.updatedAt ?? now,
    })),
    movements: (raw?.movements ?? []).map((m) => ({
      itemId: m.itemId, delta: m.delta | 0, newQuantity: m.newQuantity | 0, time: m.time ?? now,
      ...(m.restock ? { restock: true } : {}),
      ...(m.name ? { name: String(m.name) } : {}),
    })),
    categories,
    // Zelf toegevoegde merken (de merken uit de productlijst en van je artikels komen er vanzelf bij).
    brands: (raw?.brands ?? []).map((b) => String(b).trim()).filter(Boolean),
    // Merken uit de productlijst die je weghaalde; die verschijnen niet meer in de merkenlijst.
    hiddenBrands: (raw?.hiddenBrands ?? []).map((b) => String(b).trim()).filter(Boolean),
    pickList: (raw?.pickList ?? []).map((p) => ({ itemId: p.itemId, amount: Math.max(1, p.amount | 0), done: !!p.done })),
  };
  // De categorieën die er in 1.7 bijkwamen één keer toevoegen (vóór "Andere"), tenzij er al een met die naam is.
  if (raw?.categories?.length && !raw.extraCategories) {
    const names = new Set(d.categories.map((c) => c.name.trim().toLowerCase()));
    const ids = new Set(d.categories.map((c) => c.id));
    const add = DEFAULT_CATEGORIES.filter((c) => !ids.has(c.id) && !names.has(c.name.toLowerCase()) && c.id !== OTHER);
    const at = d.categories.findIndex((c) => c.id === OTHER);
    d.categories.splice(at < 0 ? d.categories.length : at, 0, ...add);
  }
  d.extraCategories = true;
  // "Andere" kan niet weg: daar komen artikels van een verwijderde categorie terecht.
  if (!d.categories.some((c) => c.id === OTHER)) d.categories.push(DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1]);
  return d;
}

// ---- winkel (één bron van waarheid, schermen luisteren mee)

let data = normalize(null);
const listeners = new Set();
// Krijgt (vorige, nieuwe) gegevens bij elke eigen wijziging; zet cloud.js als je online bewaart.
let onSaved = null;
export function setSyncer(fn) { onSaved = fn; }
// Online opslaan mag het bewaren op het toestel nooit in de weg zitten: een fout daar wordt enkel gelogd.
function sync(prev, next) {
  try { onSaved?.(prev, next); } catch (e) { console.warn('Online opslaan', e); }
}

export const store = {
  get data() { return data; },

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  async load() {
    data = normalize(await backend.loadData());
    backend.clearOldPhotos().catch(() => {});
    await backend.keep();
    emit();
  },

  /** Wijzigt de gegevens met [fn] (krijgt een kopie) en bewaart meteen. */
  async update(fn) {
    const next = fn(structuredClone(data));
    if (!next || next === data) return;
    const prev = data;
    data = next;
    emit();
    sync(prev, next);
    try {
      await backend.saveData(data);
    } catch (e) {
      // Bv. geheugen vol: zeggen, anders denk je dat alles bewaard is.
      window.dispatchEvent(new CustomEvent('voorraad-fout', { detail: 'Bewaren lukte niet. Is de opslag vol?' }));
      throw e;
    }
  },

  item(id) { return data.items.find((i) => i.id === id); },

  itemByCode(code) {
    const c = code.trim().toLowerCase();
    return data.items.find((i) => i.code.toLowerCase() === c);
  },

  /** Nieuwe, korte code voor een QR-label, bv. "VG-K7M2QX". Zonder tekens die op elkaar lijken (0/O, 1/I). */
  newCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      const code = 'VG-' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
      if (!this.itemByCode(code)) return code;
    }
  },

  // ---- artikels

  save(item) {
    return this.update((d) => {
      const now = Date.now();
      const old = d.items.find((i) => i.id === item.id);
      const saved = { ...item, updatedAt: now };
      d.items = old ? d.items.map((i) => (i.id === item.id ? saved : i)) : [...d.items, saved];
      // Aantal aangepast in het formulier: ook in het logboek zetten.
      const delta = saved.quantity - (old?.quantity ?? 0);
      if (delta !== 0) d.movements = [...d.movements, { itemId: item.id, delta, newQuantity: saved.quantity, time: now }].slice(-MAX_MOVEMENTS);
      return d;
    });
  },

  /** Aantal verhogen of verlagen; nooit onder nul. Geeft het nieuwe aantal terug. */
  async adjust(id, delta) {
    let result = null;
    await this.update((d) => {
      const old = d.items.find((i) => i.id === id);
      if (!old) return null;
      const q = Math.max(0, old.quantity + delta);
      result = q;
      if (q === old.quantity) return null;
      return applyDeltas(d, { [id]: delta });
    });
    return result ?? this.item(id)?.quantity ?? null;
  },

  setQuantity(id, quantity) {
    const old = this.item(id);
    if (old) return this.adjust(id, Math.max(0, quantity) - old.quantity);
  },

  adjustMany(deltas) { return this.update((d) => applyDeltas(d, deltas)); },

  async delete(id) {
    await this.update((d) => {
      const name = d.items.find((i) => i.id === id)?.name ?? '';
      d.items = d.items.filter((i) => i.id !== id);
      // Logboek houden (met de naam erbij), zodat Verbruik van die dag blijft kloppen.
      d.movements = d.movements.map((m) => (m.itemId === id ? { ...m, name } : m));
      d.pickList = d.pickList.filter((p) => p.itemId !== id);
      return d;
    });
  },

  // ---- eigen productlijst (ingelezen uit een CRM-export; los van de gegevens, niet in de reservekopie)

  getCatalog() { return backend.loadCatalog(); },
  setCatalog(value) { return backend.saveCatalog(value); },

  // ---- merken

  addBrands(names) {
    return this.update((d) => {
      const have = new Set(d.brands.map((b) => b.toLowerCase()));
      const add = names.map((b) => b.trim()).filter((b) => b && !have.has(b.toLowerCase()));
      const back = new Set(names.map((b) => b.trim().toLowerCase()));
      const hidden = d.hiddenBrands.filter((b) => !back.has(b.toLowerCase()));
      if (!add.length && hidden.length === d.hiddenBrands.length) return null;
      d.brands = [...d.brands, ...add];
      d.hiddenBrands = hidden;
      return d;
    });
  },

  /** Merk weghalen uit de lijst (ook een uit de productlijst), en van de artikels die het hadden. */
  removeBrand(name) {
    const k = name.trim().toLowerCase();
    return this.update((d) => {
      d.brands = d.brands.filter((b) => b.toLowerCase() !== k);
      if (!d.hiddenBrands.some((b) => b.toLowerCase() === k)) d.hiddenBrands = [...d.hiddenBrands, name.trim()];
      d.items = d.items.map((i) => ((i.brand ?? '').trim().toLowerCase() === k ? { ...i, brand: '', updatedAt: Date.now() } : i));
      return d;
    });
  },

  // ---- categorieën

  async addCategory(name) {
    // Het icoon van een categorie toont de app niet meer, maar het veld blijft voor de Android-app.
    const cat = { id: newId(), name: name.trim(), icon: 'box' };
    // Nieuwe categorie vóór "Andere", die blijft achteraan.
    await this.update((d) => {
      const others = d.categories.filter((c) => c.id === OTHER);
      d.categories = [...d.categories.filter((c) => c.id !== OTHER), cat, ...others];
      return d;
    });
    return cat;
  },

  // ---- magazijnlijst

  /** Zet alles wat onder het minimum zit op de lijst (met het tekort als aantal), als het er nog niet op staat. */
  syncPickList() {
    return this.update((d) => {
      const ids = new Set(d.items.map((i) => i.id));
      const kept = d.pickList.filter((p) => ids.has(p.itemId));
      const onList = new Set(kept.map((p) => p.itemId));
      const added = d.items.filter((i) => needsRestock(i) && !onList.has(i.id)).map((i) => ({ itemId: i.id, amount: shortage(i), done: false }));
      if (!added.length && kept.length === d.pickList.length) return null;
      d.pickList = [...kept, ...added];
      return d;
    });
  },

  addPick(itemId, amount = 1) {
    return this.update((d) => {
      if (d.pickList.some((p) => p.itemId === itemId)) return null;
      d.pickList.push({ itemId, amount, done: false });
      return d;
    });
  },

  setPickAmount(itemId, amount) {
    return this.update((d) => {
      d.pickList = d.pickList.map((p) => (p.itemId === itemId ? { ...p, amount: Math.max(1, amount) } : p));
      return d;
    });
  },

  togglePick(itemId) {
    return this.update((d) => {
      d.pickList = d.pickList.map((p) => (p.itemId === itemId ? { ...p, done: !p.done } : p));
      return d;
    });
  },

  /** Enkel voor artikels die niet (meer) onder het minimum zitten: tekorten blijven staan tot ze aangevuld zijn. */
  removePick(itemId) {
    return this.update((d) => {
      const it = d.items.find((i) => i.id === itemId);
      if (it && needsRestock(it)) return null;
      d.pickList = d.pickList.filter((p) => p.itemId !== itemId);
      return d;
    });
  },

  /** Telt alles wat afgevinkt is bij de voorraad en haalt die regels van de lijst. */
  finishPickList() {
    return this.update((d) => {
      const done = Object.fromEntries(d.pickList.filter((p) => p.done).map((p) => [p.itemId, p.amount]));
      const next = applyDeltas(d, done, { restock: true });
      next.pickList = d.pickList.filter((p) => !p.done);
      return next;
    });
  },

  /** Vervangt alles door een reservekopie. */
  async replaceAll(raw) {
    const prev = data;
    data = normalize(raw);
    emit();
    sync(prev, data);
    await backend.saveData(data);
  },

  /** Wijziging die van de online database komt: tonen en op het toestel bewaren, maar niet terugsturen. */
  applyRemote(fn) {
    const next = fn(structuredClone(data));
    if (!next) return;
    data = next;
    emit();
    backend.saveData(data).catch(() => {});
  },
};

/** [extra] komt bij elke regel in het logboek, bv. { restock: true } voor aanvullen uit het magazijn. */
function applyDeltas(d, deltas, extra = {}) {
  const now = Date.now();
  const moves = [];
  d.items = d.items.map((item) => {
    const delta = deltas[item.id];
    if (delta == null) return item;
    const q = Math.max(0, item.quantity + delta);
    if (q === item.quantity) return item;
    moves.push({ itemId: item.id, delta: q - item.quantity, newQuantity: q, time: now, ...extra });
    return { ...item, quantity: q, updatedAt: now };
  });
  d.movements = [...d.movements, ...moves].slice(-MAX_MOVEMENTS);
  return d;
}

function emit() { for (const fn of listeners) fn(data); }

// ---- instellingen (klein, per toestel)

const SETTINGS_KEY = 'voorraad-instellingen';
const settingDefaults = { cloudUser: '', syncAt: 0, cloudDirty: false, theme: 'SYSTEM', sort: 'NAME', swipeLearned: false, lastBackup: 0, scanSound: true };

function readSettings() {
  try { return { ...settingDefaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...settingDefaults }; }
}

let settings = readSettings();
const settingListeners = new Set();

export const prefs = {
  get value() { return settings; },
  set(patch) {
    settings = { ...settings, ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* privémodus */ }
    for (const fn of settingListeners) fn(settings);
  },
  subscribe(fn) { settingListeners.add(fn); return () => settingListeners.delete(fn); },
};
