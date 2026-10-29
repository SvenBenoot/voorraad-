// ---- Online opslaan (Firebase)
// De gegevens blijven gewoon op het toestel staan (zo werkt alles ook zonder internet). Ben je ingelogd, dan gaat
// elke wijziging ook naar Firestore, en komen wijzigingen van een ander toestel (bv. je pc) hier binnen.
// Firestore bewaart zelf wat nog niet verstuurd is en stuurt het door zodra er weer internet is.
//
// Indeling online (één document mag max. 1 MB zijn, daarom niet alles in één stuk):
//   voorraad/data                  categorieën, merken, magazijnlijst
//   voorraad/data/items/{id}       één document per artikel (deletedAt = tijd van verwijderen: dan zit het in de prullenmand,
//                                  at = servertijd van de laatste wijziging)
//   voorraad/data/movements/{id}   één document per regel in het logboek (id = tijd_artikel, at = servertijd)
//   voorraad/data/projects/{id}    één document per project (sinds 1.20; deletedAt = in de prullenmand, at = servertijd)
//   voorraad/data/notes/{id}       één document per notitie of taak, met projectId (zelfde velden deletedAt en at)
//   voorraad/data/devices/{id}     één document per toestel bij Afmetingen (sinds 1.24; zelfde velden deletedAt en at)
//   Definitief gewist (artikel, project of notitie): het document blijft nog 30 dagen staan met purged = tijd van wissen.
//   Een ander toestel leest enkel wat sinds de vorige keer wijzigde, en zou een echt verwijderd document niet merken.
//   voorraad/data/photos/{id}      foto's bij notities, enkel in 1.21.0; wordt leeggemaakt (dropOldPhotos)
// Wie erin mag, staat in de Firestore-regels (enkel Svens e-mailadres).
import { localStore } from './storage.js';
import { store, normalize, normProject, normNote, normDevice, prefs, setSyncer, OTHER, MAX_MOVEMENTS, TRASH_DAYS } from './store.js';

const DAY = 24 * 3600 * 1000;
const KEEP = TRASH_DAYS * DAY;

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
addEventListener('online', () => {
  setStatus({ online: true });
  // Opstarten lukte niet (geen internet of een tijdelijke fout): nu opnieuw proberen.
  if (status.state === 'error' && prefs.value.cloudUser && !unsubscribe.length) cloud.start();
});
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
  let db;
  try {
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    // Geen blijvende opslag mogelijk (bv. privémodus): dan werkt het enkel zolang de app open is.
    db = F.initializeFirestore(app, { ignoreUndefinedProperties: true });
  }
  const meta = F.doc(db, 'voorraad', 'data');
  fb = {
    A, F, auth, db, meta, items: F.collection(meta, 'items'), movements: F.collection(meta, 'movements'),
    projects: F.collection(meta, 'projects'), notes: F.collection(meta, 'notes'), devices: F.collection(meta, 'devices'), photos: F.collection(meta, 'photos'),
  };
  return fb;
}

// ---- van gegevens naar documenten

// Firestore weigert ids met / of die op __x__ lijken, en ids van "." of "..".
const docId = (id) => {
  const s = String(id).replace(/\//g, '_').slice(0, 200);
  return /^\.{1,2}$|^__.*__$/.test(s) ? 'id_' + s : s;
};
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

// De vorige toestand is de volgende keer weer de "oude": onthouden, zodat ze niet opnieuw uitgerekend wordt.
const docsCache = new WeakMap();
function docsOf(d) {
  if (!d) return { meta: null, items: new Map(), movements: new Map(), projects: new Map(), notes: new Map(), devices: new Map() };
  let docs = docsCache.get(d);
  if (!docs) {
    docs = {
      meta: metaOf(d), items: new Map([...d.items, ...d.trash].map((i) => [docId(i.id), i])), movements: movesById(d.movements),
      projects: new Map(d.projects.map((x) => [docId(x.id), x])), notes: new Map(d.notes.map((x) => [docId(x.id), x])),
      devices: new Map(d.devices.map((x) => [docId(x.id), x])),
    };
    docsCache.set(d, docs);
  }
  return docs;
}

// Artikels en logboekregels zijn platte objecten met tekst en getallen: veld voor veld vergelijken is veel
// sneller dan er tekst van te maken. Al het andere (categorieën, merken, lijsten) vergelijkt via JSON.
function same(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    const x = a[k];
    const y = b[k];
    if (x === y) continue;
    if (typeof x !== 'object' || typeof y !== 'object' || !x || !y) return false;
    if (JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}

// Documenten met een eigen wijziging die de server nog niet bevestigde. Zolang de servertijd (at) nog niet gekend is,
// valt zo'n document lokaal even uit een query "at > …" en meldt Firestore het als verwijderd. Dat is geen echte
// verwijdering, dus die melding negeren.
const inFlight = new Map();
const flightKey = (coll, id) => coll.path + '/' + id;
const busy = (coll, id) => (inFlight.get(flightKey(coll, id)) ?? 0) > 0;
// Een bevestiging van een vorige eigen wijziging kan binnenkomen nadat je hetzelfde al opnieuw wijzigde (bv. twee
// keer snel +1). Die oudere versie niet tonen, anders springt het aantal even terug en kan er een tik verloren gaan.
const stale = (coll, id, remote, local) => busy(coll, id) && local && (remote.updatedAt ?? 0) < (local.updatedAt ?? 0);
function fly(keys, delta) {
  for (const k of keys) {
    const n = (inFlight.get(k) ?? 0) + delta;
    if (n > 0) inFlight.set(k, n); else inFlight.delete(k);
  }
}

/** Mislukte verzending onthouden: bij het volgende opstarten wordt alles weer gelijkgezet (zie start). */
function lost(e) {
  if (!prefs.value.cloudDirty) prefs.set({ cloudDirty: true });
  fail(e);
}

/** Stuurt enkel wat veranderd is tussen [prev] en [next] (null = nog niets online). */
function push(prev, next) {
  try {
    send(prev, next);
  } catch (e) {
    lost(e);
  }
}

function send(prev, next) {
  const { F, db, meta, items, movements, projects, notes, devices } = fb;
  const a = docsOf(prev);
  const b = docsOf(next);
  const ops = [];
  if (!same(a.meta, b.meta)) ops.push((batch) => batch.set(meta, b.meta));
  // Projecten, notities en afmetingen in aparte batches: een fout daar mag het bewaren van de voorraad niet tegenhouden.
  const later = [];
  for (const [coll, x, y] of [[items, a.items, b.items], [movements, a.movements, b.movements],
    [projects, a.projects, b.projects], [notes, a.notes, b.notes], [devices, a.devices, b.devices]]) {
    const list = coll === projects || coll === notes || coll === devices ? later : ops;
    // Logboekregels krijgen de servertijd mee, zodat een ander toestel enkel de nieuwe hoeft op te halen.
    // Elke regel krijgt de servertijd (at) mee; artikels ook een deletedAt (leeg als ze niet verwijderd zijn),
    // zodat terugzetten het veld ook online wist.
    // purged: null, zodat iets wat elders gewist was en hier toch weer bewaard wordt (bv. uit een reservekopie) terugkomt.
    const stamp = coll === movements ? (v) => ({ ...v, at: F.serverTimestamp() })
      : (v) => ({ ...v, deletedAt: v.deletedAt ?? null, purged: null, at: F.serverTimestamp() });
    // merge: wijzigden twee toestellen een ander veld van hetzelfde artikel, dan blijven beide wijzigingen.
    for (const [id, v] of y) {
      if (x.has(id) && same(x.get(id), v)) continue;
      const op = (batch) => batch.set(F.doc(coll, id), stamp(v), { merge: true });
      op.key = flightKey(coll, id);
      list.push(op);
    }
    const now = Date.now();
    for (const [id, old] of x) {
      if (y.has(id)) continue;
      // Definitief gewist: een gewone verwijdering ziet een ander toestel niet (dat leest enkel wat wijzigde), dus een
      // merkteken achterlaten. Wat na 30 dagen vanzelf uit de prullenmand valt, doet elk toestel zelf: gewoon weg.
      if (coll === movements || (old.deletedAt && now - old.deletedAt > KEEP)) {
        list.push((batch) => batch.delete(F.doc(coll, id)));
        continue;
      }
      const op = (batch) => batch.set(F.doc(coll, id), { ...old, deletedAt: old.deletedAt || now, purged: now, at: F.serverTimestamp() });
      op.key = flightKey(coll, id);
      list.push(op);
    }
  }
  // Max. 500 schrijfacties per keer, de servertijd telt extra mee: dus ruim eronder blijven.
  for (const group of [ops, later]) {
    for (let i = 0; i < group.length; i += 200) {
      const batch = F.writeBatch(db);
      const part = group.slice(i, i + 200);
      for (const op of part) op(batch);
      const keys = part.map((op) => op.key).filter(Boolean);
      fly(keys, 1);
      batch.commit().then(() => fly(keys, -1), (e) => { fly(keys, -1); lost(e); });
    }
  }
}

// ---- van online naar de app

let unsubscribe = [];
let waitingSince = null; // gegevens van vóór de eerste wijziging die nog niet verstuurd kon worden
const pending = { meta: false, items: false, movements: false, projects: false, notes: false, devices: false };

/** Ids die online een merkteken "definitief gewist" kregen en hier nog staan. */
function purgedIn(changes, coll, byId) {
  return changes.filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites && c.doc.data().purged
    && !busy(coll, c.doc.id) && byId.has(c.doc.id)).map((c) => c.doc.id);
}

function sortMoves(list) { return list.sort((x, y) => x.time - y.time).slice(-MAX_MOVEMENTS); }

/**
 * Luistert naar de online gegevens en zet wat een ander toestel wijzigde in de app.
 * Documenten met eigen, nog niet bevestigde wijzigingen worden overgeslagen: die staan al goed in de app.
 */
function listen() {
  stop();
  const { F, meta, items, movements } = fb;
  const opts = { includeMetadataChanges: true };
  // Eén keer na deze versie alles volledig inlezen: wat vroeger elders definitief gewist werd, verdwijnt dan ook hier.
  if ((prefs.value.syncV || 0) < 2) prefs.set({ itemsFullAt: 0, projectsFullAt: 0, notesFullAt: 0, devicesFullAt: 0, syncV: 2 });
  // Lezen kost per document. Daarom haalt de app artikels en logboek normaal enkel op wat sinds de vorige keer
  // wijzigde (op servertijd). Eén keer per dag, of als er nog geen startpunt is, leest ze alles volledig in: dan
  // merkt ze ook wat elders definitief verdween, en krijgen oudere documenten hun servertijd.
  const fullItems = !prefs.value.itemsAt || Date.now() - (prefs.value.itemsFullAt || 0) > DAY;
  const synced = { items: !fullItems, movements: true };
  let seen = prefs.value.syncAt || 0;
  let seenItems = prefs.value.itemsAt || 0;
  const since = (t) => F.Timestamp.fromMillis(Math.max(0, t - 60000)); // een minuut marge
  const track = (key, snap) => {
    pending[key] = snap.metadata.hasPendingWrites;
    setStatus({ pending: Object.values(pending).some(Boolean) });
  };

  // Merktekens van definitief gewiste documenten: ouder dan 30 dagen mogen ze echt weg (bij een volledige lezing).
  const dropMarks = (coll, snap) => {
    const old = snap.docs.filter((s) => !s.metadata.hasPendingWrites && s.data().purged && Date.now() - s.data().purged > KEEP);
    for (let i = 0; i < old.length; i += 200) {
      const batch = F.writeBatch(fb.db);
      for (const s of old.slice(i, i + 200)) batch.delete(s.ref);
      batch.commit().catch(lost);
    }
  };

  const restore = [];
  const onColl = (key) => (snap) => {
    track(key, snap);
    // Eerste keer rechtstreeks van de server: alles gelijk zetten (ook wat intussen elders verwijderd is).
    const full = !synced[key] && !snap.metadata.fromCache;
    if (full) {
      synced[key] = true;
      prefs.set({ itemsFullAt: Date.now() });
      // Artikels van vóór deze versie hebben nog geen servertijd: die nu geven (enkel dat veld).
      const old = snap.docs.filter((s) => !s.metadata.hasPendingWrites && s.data().at == null);
      for (let i = 0; i < old.length; i += 200) {
        const batch = F.writeBatch(fb.db);
        for (const s of old.slice(i, i + 200)) batch.set(F.doc(items, s.id), { at: F.serverTimestamp() }, { merge: true });
        batch.commit().catch(lost);
      }
      if (key === 'items') dropMarks(items, snap);
    }
    const changes = snap.docChanges(opts);
    // Echo van je eigen, nog niet bevestigde wijziging: staat al goed in de app, dus niets te doen.
    if (!full && !changes.some((c) => c.type === 'removed' || !c.doc.metadata.hasPendingWrites)) return;
    store.applyRemote((d) => {
      const list = key === 'items' ? [...d.items, ...d.trash] : d.movements;
      const ids = key === 'items' ? list.map((i) => docId(i.id)) : [...movesById(list).keys()];
      const byId = new Map(list.map((x, i) => [ids[i], x]));
      let changed = false;
      // Wat online verdwenen is: bij een volledige lezing alles wat ontbreekt, anders de verwijderde documenten.
      const coll = key === 'items' ? items : movements;
      let gone = changes.filter((c) => c.type === 'removed' && !busy(coll, c.doc.id)).map((c) => c.doc.id);
      if (full) {
        const online = new Set(snap.docs.map((s) => s.id));
        gone = [...byId.keys()].filter((id) => !online.has(id));
      }
      gone = gone.filter((id) => byId.has(id));
      // Verdwijnt ineens de helft van je artikels online (bv. per ongeluk gewist in de console), dan volgt de app
      // dat niet: ze zet de artikels terug online. Alleen artikels tellen mee; de prullenmand ruimt zichzelf op.
      const live = gone.filter((id) => !byId.get(id).deletedAt);
      const liveTotal = [...byId.values()].filter((i) => !i.deletedAt).length;
      if (key === 'items' && live.length > 3 && live.length > liveTotal / 2) {
        for (const id of live) restore.push([id, byId.get(id)]);
        gone = gone.filter((id) => !live.includes(id));
      }
      // Definitief gewist op een ander toestel (met merkteken): dat was bewust, dus altijd volgen.
      if (key === 'items') gone.push(...purgedIn(changes, coll, byId));
      for (const id of gone) { byId.delete(id); changed = true; }
      for (const c of changes) {
        if (c.type === 'removed') continue;
        if (c.doc.metadata.hasPendingWrites) continue;
        const { at, purged, ...v } = c.doc.data();
        if (at && key === 'movements') seen = Math.max(seen, at.toMillis());
        if (at && key === 'items') seenItems = Math.max(seenItems, at.toMillis());
        if (purged) continue;
        if (v.deletedAt == null) delete v.deletedAt;
        if (stale(coll, c.doc.id, v, byId.get(c.doc.id))) continue;
        if (!same(byId.get(c.doc.id), v)) { byId.set(c.doc.id, v); changed = true; }
      }
      if (key === 'movements' && seen > (prefs.value.syncAt || 0)) prefs.set({ syncAt: seen });
      if (key === 'items' && seenItems > (prefs.value.itemsAt || 0)) prefs.set({ itemsAt: seenItems });
      if (!changed) return null;
      const fresh = normalize({ ...d, items: key === 'items' ? [...byId.values()] : d.items, trash: key === 'items' ? [] : d.trash, movements: key === 'movements' ? [...byId.values()] : d.movements });
      if (key === 'items') { d.items = fresh.items; d.trash = fresh.trash; }
      else d.movements = sortMoves(fresh.movements);
      return d;
    });
    if (restore.length) {
      const { db } = fb;
      const batch = F.writeBatch(db);
      for (const [id, v] of restore.splice(0, 200)) batch.set(F.doc(items, id), v, { merge: true });
      batch.commit().catch(lost);
    }
  };

  // Projecten en notities: verwijderen gebeurt met deletedAt, dus normaal volstaat wat sinds de vorige keer wijzigde.
  // Eén keer per week alles: dan merkt de app ook wat elders na 30 dagen prullenmand definitief weg is.
  const WEEK = 7 * DAY;
  const listenSimple = (key, norm, atKey, fullKey) => {
    const coll = fb[key];
    const fullRead = !prefs.value[atKey] || Date.now() - (prefs.value[fullKey] || 0) > WEEK;
    let done = !fullRead;
    let seenAt = prefs.value[atKey] || 0;
    return F.onSnapshot(fullRead ? coll : F.query(coll, F.where('at', '>', since(seenAt))), opts, (snap) => {
      track(key, snap);
      const full = !done && !snap.metadata.fromCache;
      if (full) { done = true; prefs.set({ [fullKey]: Date.now() }); dropMarks(coll, snap); }
      const changes = snap.docChanges(opts);
      if (!full && !changes.some((c) => (c.type === 'removed' && !busy(coll, c.doc.id)) || !c.doc.metadata.hasPendingWrites)) return;
      const back = [];
      store.applyRemote((d) => {
        const byId = new Map(d[key].map((x) => [docId(x.id), x]));
        let changed = false;
        let gone = changes.filter((c) => c.type === 'removed' && !busy(coll, c.doc.id)).map((c) => c.doc.id);
        if (full) {
          const online = new Set(snap.docs.map((x) => x.id));
          gone = [...byId.keys()].filter((id) => !online.has(id));
        }
        gone = gone.filter((id) => byId.has(id));
        // Zelfde bescherming als bij de artikels: verdwijnt ineens meer dan de helft, dan terug online zetten.
        const live = gone.filter((id) => !byId.get(id).deletedAt);
        const liveTotal = [...byId.values()].filter((x) => !x.deletedAt).length;
        if (live.length > 3 && live.length > liveTotal / 2) {
          for (const id of live) back.push([id, byId.get(id)]);
          gone = gone.filter((id) => !live.includes(id));
        }
        gone.push(...purgedIn(changes, coll, byId));
        for (const id of gone) { byId.delete(id); changed = true; }
        for (const c of changes) {
          if (c.type === 'removed' || c.doc.metadata.hasPendingWrites) continue;
          const { at, purged, ...raw } = c.doc.data();
          if (at) seenAt = Math.max(seenAt, at.toMillis());
          if (purged) continue;
          if (raw.id == null || (key === 'notes' && raw.projectId == null)) continue;
          const v = norm(raw);
          if (stale(coll, c.doc.id, v, byId.get(c.doc.id))) continue;
          if (!same(byId.get(c.doc.id), v)) { byId.set(c.doc.id, v); changed = true; }
        }
        if (seenAt > (prefs.value[atKey] || 0)) prefs.set({ [atKey]: seenAt });
        if (!changed) return null;
        d[key] = [...byId.values()];
        return d;
      });
      if (back.length) {
        const batch = F.writeBatch(fb.db);
        for (const [id, v] of back.slice(0, 200)) batch.set(F.doc(coll, id), { ...v, deletedAt: v.deletedAt ?? null, at: F.serverTimestamp() }, { merge: true });
        batch.commit().catch(lost);
      }
    }, fail);
  };

  // Wat je wijzigde terwijl Firebase nog aan het laden was, eerst versturen: dan staat het al in de wachtrij
  // voor de eerste serverantwoorden binnenkomen.
  if (waitingSince) push(waitingSince, store.data);
  waitingSince = null;
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
    F.onSnapshot(fullItems ? items : F.query(items, F.where('at', '>', since(seenItems))), opts, onColl('items'), fail),
    // Het logboek kan tot 3000 regels hebben. Elke keer alles inlezen kost veel reads, dus enkel wat er
    // sinds de vorige keer bijkwam (een minuut marge voor regels die net gelijktijdig binnenkwamen).
    F.onSnapshot(F.query(movements, F.where('at', '>', since(seen))), opts, onColl('movements'), fail),
    listenSimple('projects', normProject, 'projectsAt', 'projectsFullAt'),
    listenSimple('notes', normNote, 'notesAt', 'notesFullAt'),
    listenSimple('devices', normDevice, 'devicesAt', 'devicesFullAt'),
  ];
  setSyncer(push);
  setStatus({ state: 'on', error: '' });
  dropOldPhotos();
}

// ---- foto's bij notities (enkel in 1.21.0): wat daarvan nog online of op het toestel staat, één keer opruimen

async function dropOldPhotos() {
  if (prefs.value.photosCleared) return;
  localStore.dropNotePhotos();
  try {
    const { F, db, photos } = fb;
    const snap = await F.getDocsFromServer(photos);
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = F.writeBatch(db);
      for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
      await batch.commit();
    }
    prefs.set({ photosCleared: true });
  } catch { /* geen verbinding: volgende keer opnieuw */ }
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
  // Staat een artikel op beide plaatsen, dan wint de recentste wijziging of verwijdering.
  const when = (i) => i.deletedAt || i.updatedAt;
  const all = new Map([...r.items, ...r.trash].map((i) => [i.id, i]));
  for (const i of [...local.items, ...local.trash]) if (!all.has(i.id) || when(i) > when(all.get(i.id))) all.set(i.id, i);
  r.items = [...all.values()].filter((i) => !i.deletedAt);
  r.trash = [...all.values()].filter((i) => i.deletedAt);
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
  // Projecten, notities en afmetingen: per stuk wint de recentste wijziging (verwijderen telt ook als wijziging).
  for (const key of ['projects', 'notes', 'devices']) {
    const byId = new Map(r[key].map((x) => [x.id, x]));
    for (const x of local[key]) if (!byId.has(x.id) || x.updatedAt > byId.get(x.id).updatedAt) byId.set(x.id, x);
    r[key] = [...byId.values()];
  }
  return r;
}

/** Geeft de laatste servertijden van logboek en artikels terug (0 = nog niets), als startpunt voor later. */
async function firstSync() {
  const { F, meta, items, movements, projects, notes, devices } = fb;
  const m = await F.getDocFromServer(meta);
  if (!m.exists()) {
    push(null, store.data); // nog niets online: alles van dit toestel opladen
    return { syncAt: 0, itemsAt: 0, projectsAt: 0, notesAt: 0, devicesAt: 0 };
  }
  const [its, mvs, prj, nts, dvs] = await Promise.all([F.getDocsFromServer(items), F.getDocsFromServer(movements),
    F.getDocsFromServer(projects), F.getDocsFromServer(notes), F.getDocsFromServer(devices)]);
  // Definitief gewist op een ander toestel: niet meer tonen, en ook hier weghalen, tenzij het hier later nog gewijzigd werd.
  const purged = new Map();
  const keep = (docs) => docs.map((s) => s.data()).filter((v) => { if (v.purged) purged.set(v.id, v.purged); return !v.purged; });
  const remote = normalize({
    ...m.data(), items: keep(its.docs), movements: sortMoves(mvs.docs.map((s) => s.data())),
    projects: keep(prj.docs), notes: keep(nts.docs), devices: keep(dvs.docs),
  });
  const alive = (x) => !purged.has(x.id) || (x.deletedAt || x.updatedAt || 0) > purged.get(x.id);
  const local = store.data;
  const merged = merge(remote, { ...local, items: local.items.filter(alive), trash: local.trash.filter(alive),
    projects: local.projects.filter(alive), notes: local.notes.filter(alive), devices: local.devices.filter(alive) });
  store.applyRemote(() => merged);
  push(remote, merged);
  const last = (docs) => Math.max(0, ...docs.map((s) => s.data().at?.toMillis?.() ?? 0));
  const now = Date.now();
  return {
    syncAt: last(mvs.docs), itemsAt: last(its.docs),
    projectsAt: last(prj.docs), projectsFullAt: now, notesAt: last(nts.docs), notesFullAt: now,
    devicesAt: last(dvs.docs), devicesFullAt: now,
  };
}

// ---- fouten

const MESSAGES = {
  'auth/invalid-credential': 'E-mailadres of wachtwoord klopt niet.',
  'auth/wrong-password': 'Het wachtwoord klopt niet.',
  'auth/user-not-found': 'Er is geen account met dit e-mailadres.',
  'auth/invalid-email': 'Dit e-mailadres klopt niet.',
  'auth/missing-password': 'Vul je wachtwoord in.',
  'auth/operation-not-allowed': 'Inloggen is nog niet ingeschakeld.',
  'auth/too-many-requests': 'Te veel pogingen. Probeer later opnieuw.',
  'auth/network-request-failed': 'Geen internet. Probeer opnieuw.',
  'permission-denied': 'Dit account heeft geen toegang.',
  unavailable: 'Geen verbinding. Probeer opnieuw.',
};
const message = (e) => MESSAGES[e?.code] ?? 'Er ging iets mis. Probeer opnieuw.';

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
        setStatus({ state: 'off', error: 'Log opnieuw in.' });
        return;
      }
      // Vorige keer lukte het versturen niet helemaal: eerst alles gelijkzetten.
      if (prefs.value.cloudDirty) {
        setSyncer((prev) => { waitingSince ??= prev; });
        prefs.set({ ...(await firstSync()), itemsFullAt: Date.now(), cloudDirty: false });
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
      let at;
      try {
        at = await firstSync();
      } catch (e) {
        await A.signOut(auth).catch(() => {});
        throw e;
      }
      prefs.set({ cloudUser: cred.user.email, ...at, itemsFullAt: Date.now() });
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
    prefs.set({ cloudUser: '', syncAt: 0, itemsAt: 0, itemsFullAt: 0, projectsAt: 0, projectsFullAt: 0, notesAt: 0, notesFullAt: 0, devicesAt: 0, devicesFullAt: 0, cloudDirty: false });
    setStatus({ state: 'off', pending: false, error: '' });
    try { await fb?.A.signOut(fb.auth); } catch { /* niet erg */ }
  },
};
