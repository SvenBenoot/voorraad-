// ---- Online opslaan (Firebase)
// De gegevens blijven gewoon op het toestel staan (zo werkt alles ook zonder internet). Ben je ingelogd, dan gaat
// elke wijziging ook naar Firestore, en komen wijzigingen van een ander toestel (bv. je pc) hier binnen.
// Firestore bewaart zelf wat nog niet verstuurd is en stuurt het door zodra er weer internet is.
//
// Indeling online (één document mag max. 1 MB zijn, daarom niet alles in één stuk):
//   voorraad/data                  categorieën, merken, magazijnlijst
//   voorraad/data/items/{id}       één document per artikel
//   voorraad/data/movements/{id}   één document per regel in het logboek (id = tijd_artikel)
// Wie erin mag, staat in de Firestore-regels (enkel Svens e-mailadres).
import { store, normalize, prefs, setSyncer, OTHER, MAX_MOVEMENTS } from './store.js';

const config = {
  apiKey: 'AIzaSyCpAoYnxmogU_QtiCz7EMjTTNfh0aly04o',
  authDomain: 'voorraad-van-gils.firebaseapp.com',
  projectId: 'voorraad-van-gils',
  storageBucket: 'voorraad-van-gils.firebasestorage.app',
  messagingSenderId: '570737347595',
  appId: '1:570737347595:web:34635a4803a06aa7500b0e',
};

// ---- toestand (Instellingen toont die)

// state: 'off' (niet ingelogd), 'busy' (bezig met inloggen/verbinden), 'on', 'error'
let status = { state: 'off', email: prefs.value.cloudUser, pending: false, online: navigator.onLine, error: '' };
const listeners = new Set();
function setStatus(patch) {
  status = { ...status, ...patch };
  for (const fn of listeners) fn(status);
}
addEventListener('online', () => setStatus({ online: true }));
addEventListener('offline', () => setStatus({ online: false }));

// ---- Firebase pas laden als het nodig is (de bibliotheek is groot)

let fb = null;
async function sdk() {
  if (fb) return fb;
  const [{ initializeApp }, A, F] = await Promise.all([
    import('../lib/firebase/firebase-app.js'),
    import('../lib/firebase/firebase-auth.js'),
    import('../lib/firebase/firebase-firestore.js'),
  ]);
  const app = initializeApp(config);
  const auth = A.initializeAuth(app, { persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence] });
  auth.languageCode = 'nl';
  const db = F.initializeFirestore(app, {
    localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  const meta = F.doc(db, 'voorraad', 'data');
  fb = { A, F, auth, db, meta, items: F.collection(meta, 'items'), movements: F.collection(meta, 'movements') };
  return fb;
}

// ---- van gegevens naar documenten

const docId = (id) => String(id).replace(/\//g, '_');
const moveKey = (m) => `${m.time}_${docId(m.itemId)}`;

function metaOf(d) {
  return { version: d.version, categories: d.categories, brands: d.brands, hiddenBrands: d.hiddenBrands, pickList: d.pickList, extraCategories: true };
}

/** Logboek als id → regel. Twee regels met dezelfde tijd en hetzelfde artikel krijgen een volgnummer. */
function movesById(list) {
  const map = new Map();
  for (const m of list) {
    let k = moveKey(m);
    for (let n = 2; map.has(k); n++) k = `${moveKey(m)}_${n}`;
    map.set(k, m);
  }
  return map;
}

function docsOf(d) {
  if (!d) return { meta: null, items: new Map(), movements: new Map() };
  return { meta: metaOf(d), items: new Map(d.items.map((i) => [docId(i.id), i])), movements: movesById(d.movements) };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Stuurt enkel wat veranderd is tussen [prev] en [next] (null = nog niets online). */
function push(prev, next) {
  const { F, db, meta, items, movements } = fb;
  const a = docsOf(prev);
  const b = docsOf(next);
  const ops = [];
  if (!same(a.meta, b.meta)) ops.push((batch) => batch.set(meta, b.meta));
  for (const [coll, x, y] of [[items, a.items, b.items], [movements, a.movements, b.movements]]) {
    for (const [id, v] of y) if (!x.has(id) || !same(x.get(id), v)) ops.push((batch) => batch.set(F.doc(coll, id), v));
    for (const id of x.keys()) if (!y.has(id)) ops.push((batch) => batch.delete(F.doc(coll, id)));
  }
  // Max. 500 schrijfacties per keer.
  for (let i = 0; i < ops.length; i += 450) {
    const batch = F.writeBatch(db);
    for (const op of ops.slice(i, i + 450)) op(batch);
    batch.commit().catch(fail);
  }
}

// ---- van online naar de app

let unsubscribe = [];
let waitingSince = null; // gegevens van vóór de eerste wijziging die nog niet verstuurd kon worden
const pending = { meta: false, items: false, movements: false };

function sortMoves(list) { return list.sort((x, y) => x.time - y.time).slice(-MAX_MOVEMENTS); }

/**
 * Luistert naar de online gegevens en zet wat een ander toestel wijzigde in de app.
 * Documenten met eigen, nog niet bevestigde wijzigingen worden overgeslagen: die staan al goed in de app.
 */
function listen() {
  const { F, meta, items, movements } = fb;
  const opts = { includeMetadataChanges: true };
  const synced = { items: false, movements: false };
  const track = (key, snap) => {
    pending[key] = snap.metadata.hasPendingWrites;
    setStatus({ pending: Object.values(pending).some(Boolean) });
  };

  const onColl = (key) => (snap) => {
    track(key, snap);
    // Eerste keer rechtstreeks van de server: alles gelijk zetten (ook wat intussen elders verwijderd is).
    const full = !synced[key] && !snap.metadata.fromCache;
    if (full) synced[key] = true;
    const changes = snap.docChanges(opts);
    if (!full && !changes.length) return;
    store.applyRemote((d) => {
      const list = key === 'items' ? d.items : d.movements;
      const ids = key === 'items' ? list.map((i) => docId(i.id)) : [...movesById(list).keys()];
      const byId = new Map(list.map((x, i) => [ids[i], x]));
      let changed = false;
      if (full) {
        const online = new Set(snap.docs.map((s) => s.id));
        for (const id of [...byId.keys()]) if (!online.has(id)) { byId.delete(id); changed = true; }
      }
      for (const c of changes) {
        if (c.type === 'removed') { changed = byId.delete(c.doc.id) || changed; continue; }
        if (c.doc.metadata.hasPendingWrites) continue;
        const v = c.doc.data();
        if (!same(byId.get(c.doc.id), v)) { byId.set(c.doc.id, v); changed = true; }
      }
      if (!changed) return null;
      const fresh = normalize({ ...d, [key]: [...byId.values()] });
      if (key === 'items') d.items = fresh.items;
      else d.movements = sortMoves(fresh.movements);
      return d;
    });
  };

  unsubscribe = [
    F.onSnapshot(meta, opts, (snap) => {
      track('meta', snap);
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const m = snap.data();
      store.applyRemote((d) => {
        if (same(metaOf(d), metaOf(normalize({ ...d, ...m })))) return null;
        const n = normalize({ ...d, ...m });
        return { ...d, categories: n.categories, brands: n.brands, hiddenBrands: n.hiddenBrands, pickList: n.pickList };
      });
    }, fail),
    F.onSnapshot(items, opts, onColl('items'), fail),
    F.onSnapshot(movements, opts, onColl('movements'), fail),
  ];
  // Wat je wijzigde terwijl Firebase nog aan het laden was, nu alsnog versturen.
  if (waitingSince) push(waitingSince, store.data);
  waitingSince = null;
  setSyncer(push);
  setStatus({ state: 'on', error: '' });
}

function stop() {
  setSyncer(null);
  for (const u of unsubscribe) u();
  unsubscribe = [];
}

// ---- eerste keer inloggen op een toestel: samenvoegen

/** Alles van online, plus wat enkel op dit toestel staat (zo gaat er bij de eerste keer niets verloren). */
function merge(remote, local) {
  const r = normalize(remote);
  const itemIds = new Set(r.items.map((i) => i.id));
  r.items.push(...local.items.filter((i) => !itemIds.has(i.id)));
  const moves = movesById(r.movements);
  for (const [k, m] of movesById(local.movements)) if (!moves.has(k)) moves.set(k, m);
  r.movements = sortMoves([...moves.values()]);
  const catIds = new Set(r.categories.map((c) => c.id));
  const extra = local.categories.filter((c) => !catIds.has(c.id));
  const at = r.categories.findIndex((c) => c.id === OTHER);
  r.categories.splice(at < 0 ? r.categories.length : at, 0, ...extra);
  const brands = new Set(r.brands.map((b) => b.toLowerCase()));
  r.brands.push(...local.brands.filter((b) => !brands.has(b.toLowerCase())));
  const picks = new Set(r.pickList.map((p) => p.itemId));
  r.pickList.push(...local.pickList.filter((p) => !picks.has(p.itemId)));
  return r;
}

async function firstSync() {
  const { F, meta, items, movements } = fb;
  const m = await F.getDocFromServer(meta);
  if (!m.exists()) {
    push(null, store.data); // nog niets online: alles van dit toestel opladen
    return;
  }
  const [its, mvs] = await Promise.all([F.getDocsFromServer(items), F.getDocsFromServer(movements)]);
  const remote = normalize({ ...m.data(), items: its.docs.map((s) => s.data()), movements: sortMoves(mvs.docs.map((s) => s.data())) });
  const merged = merge(remote, store.data);
  store.applyRemote(() => merged);
  push(remote, merged);
}

// ---- fouten

const MESSAGES = {
  'auth/invalid-credential': 'E-mailadres of wachtwoord klopt niet.',
  'auth/wrong-password': 'Het wachtwoord klopt niet.',
  'auth/user-not-found': 'Er is geen account met dit e-mailadres.',
  'auth/invalid-email': 'Dit e-mailadres klopt niet.',
  'auth/missing-password': 'Vul je wachtwoord in.',
  'auth/operation-not-allowed': 'Inloggen met e-mail en wachtwoord staat nog niet aan in Firebase (Authentication › Sign-in method › E-mailadres/wachtwoord).',
  'auth/too-many-requests': 'Te veel pogingen. Wacht even en probeer opnieuw.',
  'auth/network-request-failed': 'Geen internet. Probeer opnieuw als je verbinding hebt.',
  'permission-denied': 'Dit account mag niet in de online database. Staat dit e-mailadres in de Firestore-regels?',
  unavailable: 'Geen verbinding met de online database. Probeer opnieuw als je internet hebt.',
};
const message = (e) => MESSAGES[e?.code] ?? 'Er ging iets mis met online opslaan. Probeer opnieuw.';

function fail(e) {
  console.warn('Firebase', e);
  setStatus({ state: 'error', error: message(e) });
}

// ---- wat de app gebruikt

export const cloud = {
  get status() { return status; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Bij het opstarten, als je op dit toestel ingelogd was. */
  async start() {
    if (!prefs.value.cloudUser) return;
    setStatus({ state: 'busy', email: prefs.value.cloudUser });
    setSyncer((prev) => { waitingSince ??= prev; });
    try {
      await sdk();
      await fb.auth.authStateReady();
      if (!fb.auth.currentUser) {
        setSyncer(null);
        waitingSince = null;
        prefs.set({ cloudUser: '' });
        setStatus({ state: 'off', error: 'Je bent niet meer ingelogd. Log opnieuw in om online te bewaren.' });
        return;
      }
      listen();
    } catch (e) {
      // Bv. zonder internet bij de allereerste keer laden: de app werkt gewoon verder op het toestel.
      fail(e);
    }
  },

  /** Inloggen en de gegevens samenvoegen met wat online staat. Accounts maak je in de Firebase-console. */
  async signIn(email, password) {
    setStatus({ state: 'busy', error: '' });
    try {
      await sdk();
      const { A, auth } = fb;
      const cred = await A.signInWithEmailAndPassword(auth, email.trim(), password);
      try {
        await firstSync();
      } catch (e) {
        await A.signOut(auth).catch(() => {});
        throw e;
      }
      prefs.set({ cloudUser: cred.user.email });
      setStatus({ email: cred.user.email });
      listen();
      return true;
    } catch (e) {
      setStatus({ state: 'off', error: message(e) });
      return false;
    }
  },


  /** Uitloggen: de gegevens blijven op dit toestel staan, maar gaan niet meer online. */
  async signOut() {
    stop();
    waitingSince = null;
    prefs.set({ cloudUser: '' });
    setStatus({ state: 'off', pending: false, error: '' });
    try { await fb?.A.signOut(fb.auth); } catch { /* niet erg */ }
  },
};
