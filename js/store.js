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
/** Hoelang een verwijderd artikel in de prullenmand blijft. */
export const TRASH_DAYS = 30;
const DAY = 24 * 3600 * 1000;
/** Nog hoeveel dagen (minstens 1) een artikel in de prullenmand blijft. */
export const daysLeft = (t) => Math.max(1, Math.ceil((t.deletedAt + TRASH_DAYS * DAY - Date.now()) / DAY));

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
  const mapItem = (it) => ({
    id: String(it.id), code: String(it.code ?? ''), name: String(it.name ?? ''), brand: String(it.brand ?? ''),
    category: it.category ?? 'CABLE', quantity: Math.max(0, it.quantity | 0), minimum: Math.max(0, it.minimum | 0),
    location: it.location ?? '', note: it.note ?? '', icon: it.icon || iconOf(it.category ?? 'CABLE'),
    createdAt: it.createdAt ?? now, updatedAt: it.updatedAt ?? now,
  });
  // Verwijderde artikels (met deletedAt) staan apart in de prullenmand. Online staan ze samen met de andere artikels;
  // komt een artikel in beide lijsten voor, dan telt de recentste wijziging of verwijdering.
  const byId = new Map();
  for (const it of [...(raw?.items ?? []), ...(raw?.trash ?? [])]) {
    const at = it.deletedAt || it.updatedAt || 0;
    const old = byId.get(String(it.id));
    if (!old || at > (old.deletedAt || old.updatedAt || 0)) byId.set(String(it.id), it);
  }
  const all = [...byId.values()];
  const d = {
    version: raw?.version ?? 1,
    items: all.filter((it) => !it.deletedAt).map(mapItem),
    trash: all.filter((it) => it.deletedAt).map((it) => ({ ...mapItem(it), deletedAt: +it.deletedAt })),
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
    // Projecten en hun notities (sinds 1.20). Verwijderde houden een deletedAt (30 dagen), zodat andere toestellen dat ook zien.
    projects: (raw?.projects ?? []).filter((x) => x?.id != null).map(normProject),
    notes: (raw?.notes ?? []).filter((x) => x?.id != null && x.projectId != null).map(normNote),
    // Afmetingen van tv's en video soundbars (sinds 1.24), ook met deletedAt.
    devices: (raw?.devices ?? []).filter((x) => x?.id != null).map(normDevice),
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

// ---- projecten en notities

/** Kleuren die je een project kan geven (de streep links op de kaart). */
export const PROJECT_COLORS = [
  { key: 'blue', label: 'Blauw' }, { key: 'petrol', label: 'Petrol' }, { key: 'green', label: 'Groen' },
  { key: 'orange', label: 'Oranje' }, { key: 'red', label: 'Rood' }, { key: 'purple', label: 'Paars' }, { key: 'gray', label: 'Grijs' },
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const time = (t, fallback) => (Number.isFinite(+t) && +t > 0 ? +t : fallback);

// Altijd dezelfde velden in dezelfde vorm: zo ziet de vergelijking met de online versie geen schijnverschillen.
export function normProject(p) {
  const now = Date.now();
  const createdAt = time(p.createdAt, now);
  return {
    id: String(p.id), name: String(p.name ?? ''), note: String(p.note ?? ''),
    color: PROJECT_COLORS.some((c) => c.key === p.color) ? p.color : 'blue',
    done: !!p.done, pinned: !!p.pinned, createdAt, updatedAt: time(p.updatedAt, createdAt),
    ...(p.deletedAt ? { deletedAt: +p.deletedAt } : {}),
  };
}

export function normNote(n) {
  const now = Date.now();
  const createdAt = time(n.createdAt, now);
  return {
    id: String(n.id), projectId: String(n.projectId), text: String(n.text ?? ''), task: n.task !== false,
    done: n.task !== false && !!n.done, important: !!n.important, due: n.task !== false && DATE_RE.test(n.due ?? '') ? n.due : '',
    createdAt, updatedAt: time(n.updatedAt, createdAt), doneAt: n.done ? time(n.doneAt, 0) : 0,
    // Opgemaakte tekst (sinds 1.21; text blijft de gewone tekstversie), eigen volgorde en foto's.
    html: String(n.html ?? ''),
    order: Number.isFinite(+n.order) && n.order !== null && n.order !== '' ? +n.order : noteOrder(n.task !== false, createdAt),
    ...(n.deletedAt ? { deletedAt: +n.deletedAt } : {}),
  };
}

// ---- afmetingen (tv's en video soundbars)

/** Soorten toestellen bij Afmetingen. */
export const DEVICE_KINDS = [{ key: 'tv', label: 'Tv' }, { key: 'bar', label: 'Video soundbar' }];
// Maten in hele mm (zo bewaard, ook als je in cm werkt), gewicht in kg.
// Op 0,1 mm (fabrikanten geven bv. 969,5 mm op).
const mm = (v) => (Number.isFinite(+v) && +v > 0 ? Math.round(+v * 10) / 10 : 0);

export function normDevice(x) {
  const now = Date.now();
  const createdAt = time(x.createdAt, now);
  const tv = x.kind !== 'bar';
  return {
    id: String(x.id), kind: tv ? 'tv' : 'bar', brand: String(x.brand ?? ''), model: String(x.model ?? ''),
    width: mm(x.width), height: mm(x.height), depth: mm(x.depth),
    weight: Number.isFinite(+x.weight) && +x.weight > 0 ? Math.round(+x.weight * 10) / 10 : 0,
    vesaW: tv ? mm(x.vesaW) : 0, vesaH: tv ? mm(x.vesaH) : 0, note: String(x.note ?? ''),
    createdAt, updatedAt: time(x.updatedAt, createdAt),
    ...(x.deletedAt ? { deletedAt: +x.deletedAt } : {}),
  };
}

/** Ingebouwde modellen (officiële Samsung-datasheets, zonder voet), één keer toegevoegd. */
const SEED_AT = Date.UTC(2026, 9, 31);
// v = in welke ronde het model erbij kwam (enkel nieuwe rondes worden toegevoegd, wat je wist komt niet terug).
const seedTv = (v, serie, s, width, height, depth, weight, vesaW, vesaH) =>
  ({ v, id: `samsung-${serie}${s}c`, kind: 'tv', brand: 'Samsung', model: `${serie.toUpperCase()}${s}C`, width, height, depth, weight, vesaW, vesaH });
// QMC en QBC hebben dezelfde behuizing en dus dezelfde maten.
const SIZES = [
  [43, 969.5, 557.8, 28.5, 8.8, 200, 200],
  [50, 1124.1, 644.8, 28.5, 11.8, 200, 200],
  [55, 1237.9, 708.8, 28.5, 15.7, 200, 200],
  [65, 1456.8, 831.9, 28.5, 21.5, 400, 300],
  [75, 1682.3, 960.4, 28.5, 33.4, 400, 400],
  [85, 1904.3, 1085.3, 28.5, 41.9, 600, 400],
  [98, 2193.2, 1248.8, 48.1, 56.3, 600, 400],
];
const DEVICE_SEED = [...SIZES.map((x) => seedTv(1, 'qm', ...x)), ...SIZES.map((x) => seedTv(2, 'qb', ...x))];
const SEED_V = 2;

export const liveDevices = (d) => d.devices.filter((x) => !x.deletedAt);
/** "Samsung QE55Q80D", of enkel het merk of type als het andere leeg is. */
export const deviceName = (x) => [x.brand, x.model].filter((t) => t.trim()).join(' ') || 'Zonder naam';

/** Plaats van een nieuwe notitie: een taak onderaan de lijst, een notitie bovenaan. */
export const noteOrder = (task, t = Date.now()) => (task ? t : -t);

/** Datum als "2026-10-25" in de eigen tijdzone (zo bewaart een datumveld ze ook). */
export function dayKey(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Hoeveel dagen [due] van vandaag ligt (negatief = voorbij). */
export function daysUntil(due) {
  const [y, m, d] = due.split('-').map(Number);
  const now = new Date();
  return Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY);
}

export const liveProjects = (d) => d.projects.filter((p) => !p.deletedAt);
export const notesOf = (d, projectId) => d.notes.filter((n) => n.projectId === projectId && !n.deletedAt);

/** In de volgorde die je zelf koos (verslepen); nieuwe taken komen onderaan, nieuwe notities bovenaan. */
export function sortTasks(list) {
  return [...list].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
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

  /** Een verwijderd artikel met deze code (staat in de prullenmand). */
  trashByCode(code) {
    const c = code.trim().toLowerCase();
    return data.trash.find((i) => i.code.toLowerCase() === c);
  },

  /** Nieuwe, korte code voor een QR-label, bv. "VR-K7M2QX". Zonder tekens die op elkaar lijken (0/O, 1/I). */
  newCode() { return freshCode(data); },

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

  /** Verwijderen = naar de prullenmand (30 dagen), niet meteen weg. */
  async delete(id) {
    await this.update((d) => {
      const item = d.items.find((i) => i.id === id);
      if (!item) return null;
      d.items = d.items.filter((i) => i.id !== id);
      d.trash = [...d.trash, { ...item, deletedAt: Date.now() }];
      // Logboek houden (met de naam erbij), zodat Verbruik van die dag blijft kloppen.
      d.movements = d.movements.map((m) => (m.itemId === id ? { ...m, name: item.name } : m));
      d.pickList = d.pickList.filter((p) => p.itemId !== id);
      return d;
    });
  },

  /** Haalt een artikel uit de prullenmand. Is de code intussen aan iets anders gegeven, dan krijgt het een nieuwe code. */
  async restore(id) {
    let renewed = false;
    await this.update((d) => {
      const t = d.trash.find((i) => i.id === id);
      if (!t) return null;
      const { deletedAt, ...item } = t; // eslint-disable-line no-unused-vars
      if (d.items.some((i) => i.code.toLowerCase() === item.code.toLowerCase())) { item.code = freshCode(d); renewed = true; }
      d.trash = d.trash.filter((i) => i.id !== id);
      d.items = [...d.items, { ...item, updatedAt: Date.now() }];
      // De naam in het logboek was enkel nodig zolang het artikel weg was.
      d.movements = d.movements.map((m) => { if (m.itemId !== id || !('name' in m)) return m; const { name, ...rest } = m; return rest; }); // eslint-disable-line no-unused-vars
      return d;
    });
    return { renewed };
  },

  /** Definitief verwijderen uit de prullenmand ([ids] weglaten = alles). */
  deleteForever(ids) {
    return this.update((d) => {
      const gone = ids ? new Set(ids) : null;
      const keep = gone ? d.trash.filter((i) => !gone.has(i.id)) : [];
      if (keep.length === d.trash.length) return null;
      d.trash = keep;
      return d;
    });
  },

  /** Haalt wat langer dan 30 dagen in de prullenmand zit weg. */
  purgeTrash() {
    const limit = Date.now() - TRASH_DAYS * DAY;
    return this.update((d) => {
      const keep = d.trash.filter((i) => i.deletedAt > limit);
      // Verwijderde projecten (met hun notities) en losse verwijderde notities ook.
      const gone = new Set(d.projects.filter((p) => p.deletedAt && p.deletedAt <= limit).map((p) => p.id));
      const projects = d.projects.filter((p) => !gone.has(p.id));
      const notes = d.notes.filter((n) => !gone.has(n.projectId) && !(n.deletedAt && n.deletedAt <= limit));
      const devices = d.devices.filter((x) => !(x.deletedAt && x.deletedAt <= limit));
      if (keep.length === d.trash.length && projects.length === d.projects.length && notes.length === d.notes.length
        && devices.length === d.devices.length) return null;
      d.trash = keep;
      d.projects = projects;
      d.notes = notes;
      d.devices = devices;
      return d;
    });
  },

  // ---- projecten

  project(id) { return data.projects.find((p) => p.id === id && !p.deletedAt); },

  async addProject({ name, note = '', color = 'blue' }) {
    const now = Date.now();
    const p = normProject({ id: newId(), name: name.trim(), note: note.trim(), color, createdAt: now, updatedAt: now });
    await this.update((d) => { d.projects = [...d.projects, p]; return d; });
    return p;
  },

  /** Velden van een project wijzigen, bv. { name }, { done: true } of { pinned: false }. */
  editProject(id, patch) {
    return this.update((d) => {
      const old = d.projects.find((p) => p.id === id);
      if (!old) return null;
      const next = normProject({ ...old, ...patch, updatedAt: Date.now() });
      d.projects = d.projects.map((p) => (p.id === id ? next : p));
      return d;
    });
  },

  /** Project naar de prullenmand (30 dagen); de notities blijven erbij en komen mee terug. */
  deleteProject(id) {
    const now = Date.now();
    return this.update((d) => {
      if (!d.projects.some((p) => p.id === id && !p.deletedAt)) return null;
      d.projects = d.projects.map((p) => (p.id === id ? { ...p, deletedAt: now, updatedAt: now } : p));
      return d;
    });
  },

  restoreProject(id) {
    return this.update((d) => {
      if (!d.projects.some((p) => p.id === id && p.deletedAt)) return null;
      d.projects = d.projects.map((p) => { if (p.id !== id) return p; const { deletedAt, ...rest } = p; return { ...rest, updatedAt: Date.now() }; }); // eslint-disable-line no-unused-vars
      return d;
    });
  },

  /** Definitief weg, met alle notities ([ids] weglaten = alle verwijderde projecten). */
  deleteProjectsForever(ids) {
    return this.update((d) => {
      const gone = new Set(d.projects.filter((p) => p.deletedAt && (!ids || ids.includes(p.id))).map((p) => p.id));
      if (!gone.size) return null;
      d.projects = d.projects.filter((p) => !gone.has(p.id));
      const notes = d.notes.filter((n) => !gone.has(n.projectId));
      d.notes = notes;
      return d;
    });
  },

  // ---- notities en taken

  async addNote(projectId, { text, html = '', task = true, due = '', important = false }) {
    const now = Date.now();
    const n = normNote({ id: newId(), projectId, text: text.trim(), html, task, due, important, createdAt: now, updatedAt: now });
    await this.update((d) => {
      d.notes = [...d.notes, n];
      // Zo staat het project bovenaan bij "laatst gewijzigd".
      d.projects = d.projects.map((p) => (p.id === projectId ? { ...p, updatedAt: now } : p));
      return d;
    });
    return n;
  },

  /** Velden van een notitie wijzigen, bv. { text }, { due }, { projectId } (verplaatsen). */
  editNote(id, patch) {
    return this.update((d) => {
      const old = d.notes.find((n) => n.id === id);
      if (!old) return null;
      const now = Date.now();
      const merged = { ...old, ...patch, updatedAt: now };
      if (patch.done != null && patch.done !== old.done) merged.doneAt = patch.done ? now : 0;
      const next = normNote(merged);
      if (same(old, next, ['updatedAt'])) return null;
      d.notes = d.notes.map((n) => (n.id === id ? next : n));
      return d;
    });
  },

  toggleNote(id) {
    const n = data.notes.find((x) => x.id === id);
    return n ? this.editNote(id, { done: !n.done }) : undefined;
  },

  /** Naar de prullenmand; [ids] kan er ook meerdere zijn (bv. alle afgevinkte taken). */
  deleteNotes(ids) {
    const now = Date.now();
    const set = new Set(ids);
    return this.update((d) => {
      if (!d.notes.some((n) => set.has(n.id) && !n.deletedAt)) return null;
      d.notes = d.notes.map((n) => (set.has(n.id) && !n.deletedAt ? { ...n, deletedAt: now, updatedAt: now } : n));
      return d;
    });
  },

  restoreNotes(ids) {
    const set = new Set(ids);
    return this.update((d) => {
      if (!d.notes.some((n) => set.has(n.id) && n.deletedAt)) return null;
      d.notes = d.notes.map((n) => { if (!set.has(n.id) || !n.deletedAt) return n; const { deletedAt, ...rest } = n; return { ...rest, updatedAt: Date.now() }; }); // eslint-disable-line no-unused-vars
      return d;
    });
  },

  // ---- afmetingen

  device(id) { return data.devices.find((x) => x.id === id && !x.deletedAt); },

  /** Ingebouwde modellen één keer toevoegen (vaste id's, dus geen dubbels tussen toestellen). */
  seedDevices() {
    const done = prefs.value.deviceSeed || 0;
    if (done >= SEED_V) return;
    prefs.set({ deviceSeed: SEED_V });
    const ids = new Set(data.devices.map((x) => x.id));
    const names = new Set(data.devices.map((x) => deviceName(x).toLowerCase()));
    const add = DEVICE_SEED.filter((x) => x.v > done && !ids.has(x.id) && !names.has(deviceName(x).toLowerCase()))
      .map(({ v, ...x }) => normDevice({ ...x, createdAt: SEED_AT, updatedAt: SEED_AT }));
    if (add.length) this.update((d) => { d.devices = [...d.devices, ...add]; return d; });
  },

  async addDevice(fields) {
    const now = Date.now();
    const x = normDevice({ ...fields, id: newId(), createdAt: now, updatedAt: now });
    await this.update((d) => { d.devices = [...d.devices, x]; return d; });
    return x;
  },

  editDevice(id, patch) {
    return this.update((d) => {
      const old = d.devices.find((x) => x.id === id);
      if (!old) return null;
      const next = normDevice({ ...old, ...patch, updatedAt: Date.now() });
      if (same(old, next, ['updatedAt'])) return null;
      d.devices = d.devices.map((x) => (x.id === id ? next : x));
      return d;
    });
  },

  /** Naar de prullenmand (30 dagen), zoals projecten. */
  deleteDevice(id) {
    const now = Date.now();
    return this.update((d) => {
      if (!d.devices.some((x) => x.id === id && !x.deletedAt)) return null;
      d.devices = d.devices.map((x) => (x.id === id ? { ...x, deletedAt: now, updatedAt: now } : x));
      return d;
    });
  },

  restoreDevice(id) {
    return this.update((d) => {
      if (!d.devices.some((x) => x.id === id && x.deletedAt)) return null;
      d.devices = d.devices.map((x) => { if (x.id !== id) return x; const { deletedAt, ...rest } = x; return { ...rest, updatedAt: Date.now() }; }); // eslint-disable-line no-unused-vars
      return d;
    });
  },

  /** Definitief weg ([ids] weglaten = alle verwijderde toestellen). */
  deleteDevicesForever(ids) {
    return this.update((d) => {
      const keep = d.devices.filter((x) => !x.deletedAt || (ids && !ids.includes(x.id)));
      if (keep.length === d.devices.length) return null;
      d.devices = keep;
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
    // Een reservekopie van vóór 1.20 heeft geen projecten: dan blijven de huidige staan.
    // Zo ook voor de afmetingen (sinds 1.24).
    const keep = { ...(raw && !('projects' in raw) ? { projects: data.projects, notes: data.notes } : {}),
      ...(raw && !('devices' in raw) ? { devices: data.devices } : {}) };
    data = normalize(raw ? { ...raw, ...keep } : raw);
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

/** Platte objecten veld voor veld vergelijken, zonder de velden in [skip]. */
function same(a, b, skip = []) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!skip.includes(k) && a[k] !== b[k]) return false;
  return true;
}

/** Een code die nog niet bij een artikel hoort (ook niet bij een in de prullenmand, dat label zit er misschien nog op). */
function freshCode(d) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const taken = new Set([...d.items, ...d.trash].map((i) => i.code.toLowerCase()));
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = 'VR-' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    if (!taken.has(code.toLowerCase())) return code;
  }
}

// ---- instellingen (klein, per toestel)

const SETTINGS_KEY = 'voorraad-instellingen';
const settingDefaults = { cloudUser: '', syncAt: 0, itemsAt: 0, itemsFullAt: 0, projectsAt: 0, projectsFullAt: 0, notesAt: 0, notesFullAt: 0, devicesAt: 0, devicesFullAt: 0, photosCleared: false, cloudDirty: false, theme: 'SYSTEM', sort: 'NAME', swipeLearned: false, lastBackup: 0, scanSound: true, startAt: '/start', projectSort: 'RECENT', unit: 'mm', deviceSeed: 0 };

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
