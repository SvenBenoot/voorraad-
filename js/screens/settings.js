// ---- Instellingen
// Weergave, projecten, afmetingen, productlijst, Excel, labels, prullenmand, reservekopie en "Over deze app".
// Wijzigingen worden meteen bewaard.
import { html, useEffect, useRef, useState } from '../../lib/preact-htm.js';
import { Icon } from '../icons.js';
import { store, prefs, collator } from '../store.js';
import {
  useData, usePrefs, TopBar, Card, SectionHeader, Button, FilterChip, Switch, StatusBanner, Dialog,
  DialogButtons, ConfirmDialog, fmtDate, plural, toast,
} from '../ui.js';
import { makeBackup, readBackup, makeExcel, labelsPdf, shareOrDownload } from '../files.js';
import { back, go } from '../router.js';
import { VERSION } from '../version.js';
import { loadCatalog, resetCatalog } from '../catalog.js';
import { CloudCard } from '../cloud-card.js';

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/**
 * Venster dat een bestand klaarmaakt en daarna met één tik het deelmenu opent.
 * (Delen moet rechtstreeks uit een tik komen, daarom eerst maken en dan pas de knop.)
 */
function ShareDialog({ make, icon, title, text, button, onShared, onDismiss }) {
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
        <div class="confirm-text">${error ? 'Probeer opnieuw.' : file ? text : 'Bezig met klaarmaken…'}</div>
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
    text="Bewaar ze bv. in je cloudopslag."
    button="Bewaren…" onDismiss=${onDismiss}
    onShared=${(res) => { prefs.set({ lastBackup: Date.now() }); toast(res === 'downloaded' ? 'Reservekopie gedownload' : 'Reservekopie bewaard'); }} />`;
}

export function SettingsScreen() {
  const data = useData();
  const p = usePrefs();
  const [notice, setNotice] = useState(null);
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
      setNotice({ ok: false, title: 'Inlezen mislukt', text: 'Kies een Excel-export (.xlsx) met de kolommen Merk, Interne referentie, Barcode en Naam.' });
    }
    setCatBusy(false);
    window.scrollTo(0, 0);
  };

  const themes = [['SYSTEM', 'Volgens systeem'], ['LIGHT', 'Licht'], ['DARK', 'Donker']];
  const starts = [['/start', 'Keuzescherm'], ['/', 'Inventaris'], ['/projecten', 'Projecten'], ['/afmetingen', 'Afmetingen']];
  const units = [['mm', 'Millimeter'], ['cm', 'Centimeter']];
  const deletedDevices = data.devices.filter((x) => x.deletedAt).length;
  const projectSorts = [['RECENT', 'Laatst gewijzigd'], ['NAME', 'Naam']];
  const deletedProjects = data.projects.filter((x) => x.deletedAt).length;
  const liveCount = (raw) => (raw.projects ?? []).filter((x) => x && !x.deletedAt).length;
  const noItems = (what) => setNotice({ ok: false, title: 'Nog geen artikels', text: `Voeg eerst artikels toe, dan kan je ${what}.` });

  const onRestoreFile = async (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      setRestore({ file, ...(await readBackup(file)) });
    } catch {
      setNotice({ ok: false, title: 'Terugzetten mislukt', text: 'Dit is geen reservekopie van deze app.' });
    }
  };

  return html`<div class="screen scr-settings">
    <${TopBar} title="Instellingen" onBack=${back} />
    <main class="content">
      ${notice && html`<${StatusBanner} tone=${notice.ok ? 'green' : 'orange'} icon=${notice.ok ? 'i_check_circle' : 'i_error'}
        title=${notice.title} text=${notice.text} onClick=${() => setNotice(null)} />`}

      ${!isStandalone() && html`<section class="set-block set-install"><${SectionHeader}>Op je beginscherm<//>
        <${Card}>
          <div class="card-title">Zet de app op je beginscherm</div>
          <p class="sub">Open het deelmenu <span class="inline-icon"><${Icon} name="i_share" size=${16} /></span> van je browser en kies <b>Zet op beginscherm</b>.</p>
        <//></section>`}

      <section class="set-block"><${SectionHeader}>Online opslaan<//>
      <${CloudCard} /></section>

      <section class="set-block"><${SectionHeader}>Weergave<//>
      <${Card}>
        <div class="set-label">Thema</div>
        <div class="chip-row tight">${themes.map(([k, l]) => html`<${FilterChip} selected=${p.theme === k} onClick=${() => prefs.set({ theme: k })}>${l}<//>`)}</div>
        <div class="set-label">Openen met</div>
        <div class="chip-row tight">${starts.map(([k, l]) => html`<${FilterChip} selected=${p.startAt === k} onClick=${() => prefs.set({ startAt: k })}>${l}<//>`)}</div>
        <div class="setting-row">
          <div><div class="card-title">Piep bij scannen</div><div class="small faint">Toon bij een gelezen code.</div></div>
          <${Switch} checked=${p.scanSound} label="Piep bij scannen" onChange=${(v) => prefs.set({ scanSound: v })} />
        </div>
      <//></section>

      <section class="set-block"><${SectionHeader}>Projecten<//>
      <${Card}>
        <div class="set-label">Sorteren</div>
        <div class="chip-row tight">${projectSorts.map(([k, l]) => html`<${FilterChip} selected=${p.projectSort === k} onClick=${() => prefs.set({ projectSort: k })}>${l}<//>`)}</div>
        <p class="small faint">Vastgezette projecten staan altijd bovenaan.</p>
      <//></section>

      <section class="set-block"><${SectionHeader}>Afmetingen<//>
      <${Card}>
        <div class="set-label">Maten in</div>
        <div class="chip-row tight">${units.map(([k, l]) => html`<${FilterChip} selected=${p.unit === k} onClick=${() => prefs.set({ unit: k })}>${l}<//>`)}</div>
      <//></section>

      <section class="set-block"><${SectionHeader}>Productlijst<//>
      <${Card}>
        <div class="card-title">Producten uit het CRM</div>
        <p class="sub">De lijst waaruit je kiest bij een nieuw artikel.</p>
        <p class="small faint">${!catInfo ? 'Laden…' : `${catInfo.count.toLocaleString('nl-BE')} producten · `
          + (catInfo.own ? `ingelezen op ${fmtDate(catInfo.own.date, false)} uit ${catInfo.own.file}` : 'meegeleverde lijst')}</p>
        <div class="btn-row wrap">
          <${Button} icon="i_upload" disabled=${catBusy} onClick=${() => xlsxInput.current.click()}>${catBusy ? 'Bezig met inlezen…' : 'Excel inlezen…'}<//>
          ${catInfo?.own && html`<${Button} kind="ghost" icon="i_restore" onClick=${async () => {
            await store.setCatalog(null); await refreshCatalog(); toast('Meegeleverde productlijst terug in gebruik');
          }}>Meegeleverde lijst<//>`}
        </div>
        <input ref=${xlsxInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange=${onCatalogFile} />
      <//></section>

      <section class="set-block"><${SectionHeader}>Exporteren<//>
      <${Card}>
        <div class="card-title">Excel-lijst</div>
        <p class="sub">Alle artikels in een Excel-bestand.</p>
        <${Button} icon="i_table" onClick=${() => (data.items.length ? setShare('excel') : noItems('ze exporteren'))}>Excel maken…<//>
      <//></section>

      <section class="set-block"><${SectionHeader}>QR-labels<//>
      <${Card}>
        <div class="card-title">Alle labels afdrukken</div>
        <p class="sub">Een PDF met een label per artikel, 12 per A4.</p>
        <${Button} icon="i_print" onClick=${() => (data.items.length ? setShare('labels') : noItems('hun labels afdrukken'))}>PDF maken…<//>
      <//></section>

      <section class="set-block"><${SectionHeader}>Prullenmand<//>
      <${Card} onClick=${() => go('/prullenmand')}>
        <div class="card-title">Verwijderde artikels</div>
        <p class="small faint">${data.trash.length ? plural(data.trash.length, 'artikel', 'artikels') + ' · 30 dagen bewaard' : 'Leeg'}</p>
      <//>
      <${Card} onClick=${() => go('/verwijderde-projecten')}>
        <div class="card-title">Verwijderde projecten</div>
        <p class="small faint">${deletedProjects ? plural(deletedProjects, 'project', 'projecten') + ' · 30 dagen bewaard' : 'Leeg'}</p>
      <//>
      <${Card} onClick=${() => go('/verwijderde-afmetingen')}>
        <div class="card-title">Verwijderde toestellen</div>
        <p class="small faint">${deletedDevices ? plural(deletedDevices, 'toestel', 'toestellen') + ' · 30 dagen bewaard' : 'Leeg'}</p>
      <//></section>

      <section class="set-block"><${SectionHeader}>Reservekopie<//>
      <${Card}>
        <div class="card-title">Kopie als bestand</div>
        <p class="sub">Artikels, projecten, afmetingen en instellingen in één bestand.</p>
        <p class="small faint">${p.lastBackup ? 'Laatste kopie: ' + fmtDate(p.lastBackup) : 'Nog geen kopie gemaakt.'}</p>
        <div class="btn-row wrap">
          <${Button} kind="primary" icon="i_backup" onClick=${() => setShare('backup')}>Reservekopie maken…<//>
          <${Button} icon="i_restore" onClick=${() => fileInput.current.click()}>Terugzetten…<//>
        </div>
        <input ref=${fileInput} type="file" accept=".zip,application/zip" hidden onChange=${onRestoreFile} />
      <//></section>

      <section class="set-block"><${SectionHeader}>Over deze app<//>
      <${Card}>
        <div class="card-title">Voorraad</div>
        <div class="sub">Versie ${VERSION} · web-app</div>
      <//></section>
    </main>

    ${share === 'backup' && html`<${BackupDialog} onDismiss=${() => setShare(null)} />`}
    ${share === 'excel' && html`<${ShareDialog} make=${async () => makeExcel()} icon="i_table" title="Excel-lijst klaar"
      text=${`${plural(data.items.length, 'artikel staat', 'artikels staan')} in het bestand. Deel het of bewaar het in Bestanden.`}
      button="Delen…" onDismiss=${() => setShare(null)} />`}
    ${share === 'labels' && html`<${ShareDialog} icon="i_print" title="Labels klaar"
      make=${() => labelsPdf([...data.items].sort((a, b) => collator.compare(a.name, b.name)))}
      text="Druk af of bewaar de PDF." button="Delen…" onDismiss=${() => setShare(null)} />`}

    ${restore && html`<${ConfirmDialog} kind="danger" icon="i_restore" title="Reservekopie terugzetten?"
      text=${'projects' in restore.raw
        ? `Alles wordt vervangen door de kopie: ${plural(restore.raw.items?.length ?? 0, 'artikel', 'artikels')} en ${plural(liveCount(restore.raw), 'project', 'projecten')}. Dit kan niet ongedaan gemaakt worden.`
        : `Je huidige artikels worden vervangen door de ${plural(restore.raw.items?.length ?? 0, 'artikel', 'artikels')} uit de kopie. Je projecten blijven staan. Dit kan niet ongedaan gemaakt worden.`}
      confirmLabel="Terugzetten" onConfirm=${async () => {
        const r = restore;
        setRestore(null);
        try {
          await store.replaceAll(r.raw);
          if (r.settings) prefs.set(r.settings);
          const n = store.data.projects.filter((x) => !x.deletedAt).length;
          setNotice({ ok: true, title: 'Reservekopie teruggezet', text: 'projects' in r.raw
            ? `${plural(store.data.items.length, 'artikel', 'artikels')} en ${plural(n, 'project', 'projecten')} hersteld.`
            : `${plural(store.data.items.length, 'artikel is', 'artikels zijn')} hersteld.` });
        } catch {
          setNotice({ ok: false, title: 'Terugzetten mislukt', text: 'Probeer opnieuw.' });
        }
      }} onDismiss=${() => setRestore(null)} />`}
  </div>`;
}
