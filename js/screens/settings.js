// ---- Instellingen
// Weergave, categorieën, productlijst, Excel, labels, reservekopie en "Over deze app". Wijzigingen worden meteen bewaard.
import { html, useEffect, useRef, useState } from '../../lib/preact-htm.js';
import { Icon } from '../icons.js';
import { store, prefs, collator, categoryOf, OTHER } from '../store.js';
import {
  useData, usePrefs, TopBar, Card, SectionHeader, Button, IconButton, FilterChip, Switch, StatusBanner, Dialog,
  DialogButtons, ConfirmDialog, CategoryDialog, fmtDate, plural, toast,
} from '../ui.js';
import { makeBackup, readBackup, makeExcel, labelsPdf, shareOrDownload } from '../files.js';
import { back } from '../router.js';
import { VERSION } from '../version.js';
import { loadCatalog, resetCatalog } from '../catalog.js';

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const DAY = 24 * 3600 * 1000;

/** Moet er een herinnering komen voor een reservekopie? Na een week zonder kopie, als er iets te bewaren is. */
export function backupDue(p, data) {
  return p.backupReminder && data.items.length > 0 && Date.now() - (p.lastBackup || p.firstUse || 0) > 7 * DAY;
}

/**
 * Venster dat een bestand klaarmaakt en daarna met één tik het deelmenu opent.
 * (Delen moet rechtstreeks uit een tik komen, daarom eerst maken en dan pas de knop.)
 */
export function ShareDialog({ make, icon, title, text, button, onShared, onDismiss }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    make().then((f) => alive && setFile(f)).catch(() => alive && setError(true));
    return () => { alive = false; };
  }, []);
  return html`<${Dialog} onDismiss=${onDismiss}>
    <div class="confirm">
      <span class=${'confirm-icon tone-' + (error ? 'red' : 'blue')}><${Icon} name=${error ? 'i_error' : icon} size=${22} /></span>
      <div class="confirm-body">
        <div class="card-title">${error ? 'Lukte niet' : title}</div>
        <div class="confirm-text">${error ? 'Het bestand kon niet gemaakt worden. Probeer opnieuw.' : file ? text : 'Bezig met klaarmaken…'}</div>
        ${file && html`<div class="small faint mono">${file.name} · ${file.size < 1024 * 1024 ? Math.max(1, Math.round(file.size / 1024)) + ' kB' : (file.size / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB'}</div>`}
      </div>
    </div>
    <${DialogButtons}>
      <${Button} onClick=${onDismiss}>Sluiten<//>
      <${Button} kind="primary" icon="i_share" disabled=${!file} onClick=${async () => {
        const res = await shareOrDownload(file);
        if (res === 'cancelled') return;
        onShared?.(res);
        onDismiss();
      }}>${button}<//>
    <//>
  <//>`;
}

export function BackupDialog({ onDismiss }) {
  return html`<${ShareDialog} make=${makeBackup} icon="i_backup" title="Reservekopie klaar"
    text="Kies in het deelmenu Bewaar in Bestanden en dan iCloud Drive. Bewaar ze bv. in een map Voorraad."
    button="Bewaren…" onDismiss=${onDismiss}
    onShared=${(res) => { prefs.set({ lastBackup: Date.now() }); toast(res === 'downloaded' ? 'Reservekopie gedownload' : 'Reservekopie bewaard'); }} />`;
}

export function SettingsScreen() {
  const data = useData();
  const p = usePrefs();
  const [notice, setNotice] = useState(null);
  const [editCat, setEditCat] = useState(null); // categorie, of 'new'
  const [deleteCat, setDeleteCat] = useState(null);
  const [share, setShare] = useState(null);
  const [restore, setRestore] = useState(null);
  const fileInput = useRef(null);
  const xlsxInput = useRef(null);
  // Productlijst: hoeveel producten, en of het een zelf ingelezen export is.
  const [catInfo, setCatInfo] = useState(null);
  const [catBusy, setCatBusy] = useState(false);
  const refreshCatalog = async () => {
    resetCatalog();
    const [own, all] = await Promise.all([store.getCatalog().catch(() => null), loadCatalog().catch(() => null)]);
    setCatInfo({ own: own ? { date: own.date, file: own.file } : null, count: all?.length ?? 0 });
  };
  useEffect(() => { refreshCatalog(); }, []);

  const onCatalogFile = async (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    setCatBusy(true);
    try {
      const { parseCatalogXlsx } = await import('../catalog-import.js');
      const rows = parseCatalogXlsx(new Uint8Array(await file.arrayBuffer()));
      await store.setCatalog({ rows, date: Date.now(), file: file.name });
      await refreshCatalog();
      setNotice({ ok: true, title: 'Productlijst ingelezen', text: `${rows.length.toLocaleString('nl-BE')} producten uit ${file.name}.` });
    } catch {
      setNotice({ ok: false, title: 'Inlezen mislukt', text: 'Dit bestand kon niet gelezen worden. Kies de Excel-export (.xlsx) uit het CRM met de kolommen Merk, Interne referentie, Barcode en Naam.' });
    }
    setCatBusy(false);
    window.scrollTo(0, 0);
  };

  const themes = [['SYSTEM', 'Volgens systeem'], ['LIGHT', 'Licht'], ['DARK', 'Donker']];
  const noItems = (what) => setNotice({ ok: false, title: 'Nog geen artikels', text: `Voeg eerst artikels toe, dan kan je ${what}.` });

  const onRestoreFile = async (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      setRestore({ file, ...(await readBackup(file)) });
    } catch {
      setNotice({ ok: false, title: 'Terugzetten mislukt', text: 'Dit bestand is geen reservekopie van deze app. Kies het zip-bestand dat je met Bewaren… maakte.' });
    }
  };

  return html`<div class="screen">
    <${TopBar} title="Instellingen" onBack=${back} />
    <main class="content">
      ${notice && html`<${StatusBanner} tone=${notice.ok ? 'green' : 'orange'} icon=${notice.ok ? 'i_check_circle' : 'i_error'}
        title=${notice.title} text=${notice.text} onClick=${() => setNotice(null)} />`}

      ${!isStandalone() && html`<${SectionHeader}>Op je beginscherm<//>
        <${Card}>
          <div class="card-title">Zet de app op je beginscherm</div>
          <p class="sub">Tik in Safari onderaan op <span class="inline-icon"><${Icon} name="i_share" size=${16} /></span> Deel en kies <b>Zet op beginscherm</b>.
            Dan opent de app schermvullend, zonder adresbalk, en werkt ze ook zonder internet.</p>
        <//>`}

      <${SectionHeader}>Weergave<//>
      <${Card}>
        <div class="chip-row tight">${themes.map(([k, l]) => html`<${FilterChip} selected=${p.theme === k} onClick=${() => prefs.set({ theme: k })}>${l}<//>`)}</div>
        <div class="setting-row">
          <div><div class="card-title">Piep bij scannen</div><div class="small faint">Korte toon als een code gelezen is.</div></div>
          <${Switch} checked=${p.scanSound} label="Piep bij scannen" onChange=${(v) => prefs.set({ scanSound: v })} />
        </div>
      <//>

      <${SectionHeader}>Categorieën<//>
      <${Card} pad=${0}>
        ${data.categories.map((c, i) => {
          const n = data.items.filter((it) => categoryOf(data, it).id === c.id).length;
          return html`<div class="cat-row" key=${c.id}>
            <span class="item-icon small"><${Icon} name=${c.icon} size=${20} /></span>
            <div class="cat-text"><b>${c.name}</b><small class="faint">${plural(n, 'artikel', 'artikels')}</small></div>
            <${IconButton} icon="i_up" label="Hoger zetten" cls=${i === 0 ? 'invisible' : 'faint'} onClick=${() => store.moveCategory(c.id, true)} />
            <${IconButton} icon="i_edit" label="Wijzigen" cls="accent" onClick=${() => setEditCat(c)} />
            ${c.id !== OTHER ? html`<${IconButton} icon="i_delete" label="Verwijderen" cls="danger-text" onClick=${() => setDeleteCat(c)} />`
              : html`<span class="icon-btn invisible"></span>`}
          </div>`;
        })}
      <//>
      <${Button} icon="i_add" cls="wide" onClick=${() => setEditCat('new')}>Categorie toevoegen…<//>
      <p class="small faint">De volgorde hier is ook de volgorde als je de lijst op categorie sorteert.</p>

      <${SectionHeader}>Productlijst<//>
      <${Card}>
        <div class="card-title">Producten uit het CRM</div>
        <p class="sub">De lijst waaruit je kiest bij Nieuw artikel. Komt er een nieuwe export uit het CRM, lees die hier in.</p>
        <p class="small faint">${!catInfo ? 'Laden…' : `${catInfo.count.toLocaleString('nl-BE')} producten · `
          + (catInfo.own ? `ingelezen op ${fmtDate(catInfo.own.date, false)} uit ${catInfo.own.file}` : 'meegeleverde lijst')}</p>
        <div class="btn-row wrap">
          <${Button} icon="i_upload" disabled=${catBusy} onClick=${() => xlsxInput.current.click()}>${catBusy ? 'Bezig met inlezen…' : 'Excel inlezen…'}<//>
          ${catInfo?.own && html`<${Button} kind="ghost" icon="i_restore" onClick=${async () => {
            await store.setCatalog(null); await refreshCatalog(); toast('Meegeleverde productlijst terug in gebruik');
          }}>Meegeleverde lijst<//>`}
        </div>
        <input ref=${xlsxInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange=${onCatalogFile} />
      <//>

      <${SectionHeader}>Exporteren<//>
      <${Card}>
        <div class="card-title">Excel-lijst</div>
        <p class="sub">Alle artikels in een Excel-bestand: naam, merk, categorie, aantal, minimum, bij te vullen, plaats, QR-code, notitie en datum.</p>
        <${Button} icon="i_table" onClick=${() => (data.items.length ? setShare('excel') : noItems('ze exporteren'))}>Excel maken…<//>
      <//>

      <${SectionHeader}>QR-labels<//>
      <${Card}>
        <div class="card-title">Alle labels afdrukken</div>
        <p class="sub">Maakt een PDF met één label per artikel (12 per A4-blad). Deel hem naar je printer of mail.</p>
        <${Button} icon="i_print" onClick=${() => (data.items.length ? setShare('labels') : noItems('hun labels afdrukken'))}>PDF maken…<//>
      <//>

      <${SectionHeader}>Reservekopie<//>
      <${Card}>
        <div class="card-title">Gegevens bewaren in iCloud Drive</div>
        <p class="sub">Alles staat enkel op deze iPhone. Verwijder je de app, dan is alles weg. Bewaar daarom geregeld een reservekopie in iCloud Drive; die kan je ook terugzetten op een nieuwe gsm.</p>
        <p class="small faint">${p.lastBackup ? 'Laatste kopie: ' + fmtDate(p.lastBackup) : 'Nog geen kopie gemaakt op dit toestel.'}</p>
        <div class="btn-row wrap">
          <${Button} kind="primary" icon="i_backup" onClick=${() => setShare('backup')}>Reservekopie maken…<//>
          <${Button} icon="i_restore" onClick=${() => fileInput.current.click()}>Terugzetten…<//>
        </div>
        <input ref=${fileInput} type="file" accept=".zip,application/zip" hidden onChange=${onRestoreFile} />
        <div class="setting-row">
          <div><div class="card-title">Herinnering elke week</div><div class="small faint">Na een week zonder kopie vraagt de app op het startscherm om er een te maken.</div></div>
          <${Switch} checked=${p.backupReminder} label="Herinnering elke week" onChange=${(v) => prefs.set({ backupReminder: v })} />
        </div>
      <//>

      <${SectionHeader}>Over deze app<//>
      <${Card}>
        <div class="card-title">Voorraad · Van Gils</div>
        <div class="sub">Versie ${VERSION} · web-app</div>
        <p class="small faint">Gemaakt door Sven Benoot · Van Gils, Beernem · vangils.pro</p>
      <//>
      <p class="small faint">Wijzigingen worden meteen bewaard.</p>
    </main>

    ${share === 'backup' && html`<${BackupDialog} onDismiss=${() => setShare(null)} />`}
    ${share === 'excel' && html`<${ShareDialog} make=${async () => makeExcel()} icon="i_table" title="Excel-lijst klaar"
      text=${`${plural(data.items.length, 'artikel staat', 'artikels staan')} in het bestand. Deel het of bewaar het in Bestanden.`}
      button="Delen…" onDismiss=${() => setShare(null)} />`}
    ${share === 'labels' && html`<${ShareDialog} icon="i_print" title="Labels klaar"
      make=${() => labelsPdf([...data.items].sort((a, b) => collator.compare(a.name, b.name)))}
      text="Kies in het deelmenu Druk af, of bewaar de PDF in Bestanden." button="Delen…" onDismiss=${() => setShare(null)} />`}

    ${editCat && html`<${CategoryDialog} existing=${editCat === 'new' ? null : editCat} takenNames=${data.categories.map((c) => c.name)}
      onSave=${(name, icon) => {
        if (editCat === 'new') store.addCategory(name, icon);
        else store.updateCategory({ ...editCat, name, icon });
        setEditCat(null);
      }} onDismiss=${() => setEditCat(null)} />`}

    ${deleteCat && (() => {
      const n = data.items.filter((it) => it.category === deleteCat.id).length;
      return html`<${ConfirmDialog} kind="danger" icon="i_delete" title=${deleteCat.name + ' verwijderen?'}
        text=${n === 0 ? 'Deze categorie wordt verwijderd. Er zitten geen artikels in.'
          : `${n === 1 ? 'Het artikel' : `De ${n} artikels`} in deze categorie ${n === 1 ? 'komt' : 'komen'} bij Andere. De artikels zelf blijven bestaan.`}
        confirmLabel="Verwijderen" onConfirm=${() => { store.deleteCategory(deleteCat.id); setDeleteCat(null); }}
        onDismiss=${() => setDeleteCat(null)} />`;
    })()}

    ${restore && html`<${ConfirmDialog} kind="danger" icon="i_restore" title="Reservekopie terugzetten?"
      text=${`In de kopie staan ${plural(restore.raw.items?.length ?? 0, 'artikel', 'artikels')}. Alle artikels die nu op deze iPhone staan, worden vervangen door die uit de reservekopie. Dit kan niet ongedaan gemaakt worden.`}
      confirmLabel="Terugzetten" onConfirm=${async () => {
        const r = restore;
        setRestore(null);
        try {
          await store.replaceAll(r.raw, r.photos);
          setNotice({ ok: true, title: 'Reservekopie teruggezet', text: `${plural(store.data.items.length, 'artikel is', 'artikels zijn')} hersteld.` });
        } catch {
          setNotice({ ok: false, title: 'Terugzetten mislukt', text: 'De kopie kon niet ingelezen worden. Probeer opnieuw.' });
        }
      }} onDismiss=${() => setRestore(null)} />`}
  </div>`;
}
