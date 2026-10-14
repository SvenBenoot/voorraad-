// ---- Gegevens
// Zelfde opbouw als de Android-app (voorraad.json), zodat een reservekopie van de ene in de andere past.
// Alles staat op het toestel zelf in IndexedDB: één record met de gegevens en een tabel met foto's.

export const OTHER = 'OTHER';

// De ids zijn dezelfde als in de Android-app, zodat oude gegevens blijven kloppen.
export const DEFAULT_CATEGORIES = [
  { id: 'CABLE', name: 'Kabel', icon: 'cable' },
  { id: 'CONNECTOR', name: 'Fiche', icon: 'connector' },
  { id: 'DEVICE', name: 'Toestel', icon: 'device' },
  { id: 'BIN', name: 'Bakje', icon: 'bin' },
  { id: OTHER, name: 'Andere', icon: 'other' },
];

const MAX_MOVEMENTS = 3000;

export const SORT_MODES = [
  { key: 'NAME', label: 'Naam', icon: 'i_sort_alpha' },
  { key: 'CATEGORY', label: 'Categorie', icon: 'i_category' },
  { key: 'QUANTITY', label: 'Aantal, laagste eerst', icon: 'i_trend_up' },
  { key: 'QUANTITY_DESC', label: 'Aantal, hoogste eerst', icon: 'i_trend_down' },
  { key: 'LOCATION', label: 'Plaats', icon: 'i_place' },
  { key: 'RECENT', label: 'Laatst gewijzigd', icon: 'i_history' },
];

export const collator = new Intl.Collator('nl-BE', { sensitivity: 'base', numeric: true });

// ---- artikel-hulpjes

export const needsRestock = (it) => it.minimum > 0 && it.quantity < it.minimum;
export const shortage = (it) => Math.max(0, it.minimum - it.quantity);
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
  const d = {
    version: raw?.version ?? 1,
    items: (raw?.items ?? []).map((it) => ({
      id: String(it.id), code: String(it.code ?? ''), name: String(it.name ?? ''), brand: String(it.brand ?? ''),
      category: it.category ?? 'CABLE', quantity: Math.max(0, it.quantity | 0), minimum: Math.max(0, it.minimum | 0),
      location: it.location ?? '', note: it.note ?? '', photo: it.photo ?? null,
      createdAt: it.createdAt ?? now, updatedAt: it.updatedAt ?? now,
    })),
    movements: (raw?.movements ?? []).map((m) => ({
      itemId: m.itemId, delta: m.delta | 0, newQuantity: m.newQuantity | 0, time: m.time ?? now,
      ...(m.restock ? { restock: true } : {}),
      ...(m.name ? { name: String(m.name) } : {}),
    })),
    categories: raw?.categories?.length ? raw.categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon ?? 'box' })) : DEFAULT_CATEGORIES.slice(),
    pickList: (raw?.pickList ?? []).map((p) => ({ itemId: p.itemId, amount: Math.max(1, p.amount | 0), done: !!p.done })),
  };
  // "Andere" kan niet weg: daar komen artikels van een verwijderde categorie terecht.
  if (!d.categories.some((c) => c.id === OTHER)) d.categories.push(DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1]);
  return d;
}

// ---- IndexedDB

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('voorraad', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
      req.result.createObjectStore('photos');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// ---- winkel (één bron van waarheid, schermen luisteren mee)

let data = normalize(null);
const listeners = new Set();
const photoUrls = new Map();

export const store = {
  get data() { return data; },

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  async load() {
    const saved = await tx('kv', 'readonly', (s) => s.get('data'));
    data = normalize(saved);
    // Vraag de browser om de gegevens niet zomaar op te ruimen bij plaatsgebrek.
    try { await navigator.storage?.persist?.(); } catch { /* niet erg */ }
    emit();
  },

  /** Wijzigt de gegevens met [fn] (krijgt een kopie) en bewaart meteen. */
  async update(fn) {
    const next = fn(structuredClone(data));
    if (!next || next === data) return;
    data = next;
    emit();
    try {
      await tx('kv', 'readwrite', (s) => s.put(data, 'data'));
    } catch (e) {
      // Bv. geheugen vol: zeggen, anders denk je dat alles bewaard is.
      window.dispatchEvent(new CustomEvent('voorraad-fout', { detail: 'Bewaren lukte niet. Is het geheugen van je iPhone vol? Maak plaats en probeer opnieuw.' }));
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
    const photo = this.item(id)?.photo;
    await this.update((d) => {
      const name = d.items.find((i) => i.id === id)?.name ?? '';
      d.items = d.items.filter((i) => i.id !== id);
      // Logboek houden (met de naam erbij), zodat Verbruik van die dag blijft kloppen.
      d.movements = d.movements.map((m) => (m.itemId === id ? { ...m, name } : m));
      d.pickList = d.pickList.filter((p) => p.itemId !== id);
      return d;
    });
    if (photo) await this.deletePhoto(photo);
  },

  // ---- categorieën

  async addCategory(name, icon) {
    const cat = { id: newId(), name: name.trim(), icon };
    // Nieuwe categorie vóór "Andere", die blijft achteraan.
    await this.update((d) => {
      const others = d.categories.filter((c) => c.id === OTHER);
      d.categories = [...d.categories.filter((c) => c.id !== OTHER), cat, ...others];
      return d;
    });
    return cat;
  },

  updateCategory(cat) {
    return this.update((d) => {
      d.categories = d.categories.map((c) => (c.id === cat.id ? { ...cat, name: cat.name.trim() } : c));
      return d;
    });
  },

  /** Verwijdert een categorie; de artikels erin komen bij "Andere". */
  deleteCategory(id) {
    if (id === OTHER) return;
    return this.update((d) => {
      d.categories = d.categories.filter((c) => c.id !== id);
      d.items = d.items.map((i) => (i.category === id ? { ...i, category: OTHER } : i));
      return d;
    });
  },

  moveCategory(id, up) {
    return this.update((d) => {
      const i = d.categories.findIndex((c) => c.id === id);
      const j = up ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= d.categories.length) return null;
      [d.categories[i], d.categories[j]] = [d.categories[j], d.categories[i]];
      return d;
    });
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

  // ---- foto's

  async savePhoto(itemId, blob) {
    const name = `${itemId}-${Date.now()}.jpg`;
    await tx('photos', 'readwrite', (s) => s.put(blob, name));
    return name;
  },

  async deletePhoto(name) {
    if (!name) return;
    const url = photoUrls.get(name);
    if (url) { URL.revokeObjectURL(url); photoUrls.delete(name); }
    await tx('photos', 'readwrite', (s) => s.delete(name));
  },

  photoBlob(name) { return name ? tx('photos', 'readonly', (s) => s.get(name)) : Promise.resolve(null); },

  /** Object-URL voor een foto, één keer gemaakt en daarna hergebruikt. */
  async photoUrl(name) {
    if (!name) return null;
    if (photoUrls.has(name)) return photoUrls.get(name);
    const blob = await this.photoBlob(name);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    photoUrls.set(name, url);
    return url;
  },
  cachedPhotoUrl(name) { return photoUrls.get(name) ?? null; },

  async allPhotos() {
    const out = {};
    for (const name of this.data.items.map((i) => i.photo).filter(Boolean)) {
      const b = await this.photoBlob(name);
      if (b) out[name] = b;
    }
    return out;
  },

  /** Vervangt alles door een reservekopie (gegevens + foto's). */
  async replaceAll(raw, photos) {
    const next = normalize(raw);
    for (const url of photoUrls.values()) URL.revokeObjectURL(url);
    photoUrls.clear();
    await tx('photos', 'readwrite', (s) => {
      s.clear();
      for (const [name, blob] of Object.entries(photos)) s.put(blob, name);
    });
    data = next;
    emit();
    await tx('kv', 'readwrite', (s) => s.put(data, 'data'));
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
const settingDefaults = { theme: 'SYSTEM', sort: 'NAME', swipeLearned: false, lastBackup: 0, backupReminder: true, scanSound: true };

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
