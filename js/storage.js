// ---- Opslag
// Alles wat de app bewaart, loopt via dit bestand; de rest van de app weet niet waar de gegevens staan.
// Nu is dat IndexedDB op het toestel. Voor een online database komt hier een tweede uitvoering met dezelfde
// functies (gegevens laden en bewaren), en kiest store.js welke het gebruikt.

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('voorraad', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
      req.result.createObjectStore('photos'); // vroeger foto's; blijft bestaan omdat oudere installaties hem al hebben
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

export const localStore = {
  /** De gegevens (artikels, categorieën, logboek, …) zoals ze laatst bewaard zijn, of undefined. */
  loadData: () => tx('kv', 'readonly', (s) => s.get('data')),
  saveData: (data) => tx('kv', 'readwrite', (s) => s.put(data, 'data')),

  /** Eigen productlijst uit een CRM-export; los van de gegevens en niet in de reservekopie. */
  loadCatalog: () => tx('kv', 'readonly', (s) => s.get('catalog')),
  saveCatalog: (value) => tx('kv', 'readwrite', (s) => (value ? s.put(value, 'catalog') : s.delete('catalog'))),

  /** Foto's zijn er sinds 1.6 niet meer: wat er nog staat opruimen, dat spaart plaats op de iPhone. */
  clearOldPhotos: () => tx('photos', 'readwrite', (s) => { s.clear(); }),

  /** Vraag de browser om de gegevens niet zomaar op te ruimen bij plaatsgebrek. */
  async keep() { try { await navigator.storage?.persist?.(); } catch { /* niet erg */ } },
};
