// ---- Online opslaan: inlogscherm, sync-icoon op het startscherm en het blok in Instellingen
import { html, useEffect, useState } from '../lib/preact-htm.js';
import { cloud } from './cloud.js';
import { Icon } from './icons.js';
import {
  Card, Button, TextField, StatusBanner, ConfirmDialog, Dialog, DialogButtons, IconButton, usePrefs, toast,
} from './ui.js';

function useCloud() {
  const [s, setS] = useState(cloud.status);
  useEffect(() => cloud.subscribe(setS), []);
  return s;
}

/** Hoe het online bewaren ervoor staat: kleur, icoon en uitleg. */
function syncInfo(s) {
  if (s.state === 'error') return { tone: 'red', icon: 'i_cloud_off', title: 'Online bewaren lukt niet', text: s.error };
  if (s.state === 'busy') return { tone: 'blue', icon: 'i_cloud_sync', title: 'Bezig met verbinden…', text: '' };
  if (!s.online) {
    return { tone: 'orange', icon: 'i_cloud_off', title: 'Geen internet',
      text: 'Je wijzigingen staan op dit toestel en gaan online zodra er verbinding is.' };
  }
  if (s.pending) return { tone: 'orange', icon: 'i_cloud_sync', title: 'Bezig met online bewaren…', text: '' };
  return { tone: 'green', icon: 'i_cloud_done', title: 'Alles online bewaard', text: '' };
}

// ---- inlogscherm (komt over alles tot je ingelogd bent)

export function LoginScreen() {
  const s = useCloud();
  const [email, setEmail] = useState(s.email || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (create) => {
    setBusy(true);
    const ok = await cloud.signIn(email, password, create);
    setBusy(false);
    if (ok) toast(create ? 'Account gemaakt, alles staat nu online' : 'Ingelogd');
  };
  const ready = email.includes('@') && password.length > 0;

  return html`<div class="screen login">
    <header class="bar">
      <div class="bar-row">
        <span class="logo">
          <img class="logo-light" src="img/logo_zwart.png" alt="Van Gils" />
          <img class="logo-dark" src="img/logo_wit.png" alt="Van Gils" />
        </span>
        <span class="bar-sep"></span>
        <span class="bar-title sub">Voorraad</span>
      </div>
      <div class="brand-strip"></div>
    </header>
    <main class="content">
      <div class="empty login-head">
        <div class="empty-icon"><${Icon} name="i_cloud_done" size=${32} /></div>
        <div class="empty-title">Inloggen</div>
        <div class="empty-text">Je voorraad wordt online bewaard, zodat ze veilig is als je iPhone stuk of kwijt is,
          en je op elk toestel dezelfde voorraad ziet.</div>
      </div>
      <${Card}>
        ${s.error && html`<${StatusBanner} tone="orange" icon="i_error" title="Lukte niet" text=${s.error} />`}
        <${TextField} label="E-mailadres" type="email" autocomplete="username" value=${email} onInput=${setEmail} hint="naam@gmail.com" />
        <${TextField} label="Wachtwoord" type="password" autocomplete="current-password" value=${password} onInput=${setPassword}
          help="De eerste keer: kies een wachtwoord (minstens 6 tekens) en tik op Account maken." />
        <div class="btn-row wrap">
          <${Button} kind="primary" icon="i_cloud_done" disabled=${busy || !ready} onClick=${() => go(false)}>${busy ? 'Bezig…' : 'Inloggen'}<//>
          <${Button} icon="i_add" disabled=${busy || !ready} onClick=${() => go(true)}>Account maken<//>
        </div>
        <${Button} kind="ghost" icon="i_key" disabled=${busy || !email.includes('@')} onClick=${async () => {
          if (await cloud.resetPassword(email)) toast('Mail verstuurd om je wachtwoord te wijzigen');
        }}>Wachtwoord vergeten?<//>
      <//>
    </main>
  </div>`;
}


// ---- sync-icoon in de balk van het startscherm

export function SyncButton({ onClick }) {
  const info = syncInfo(useCloud());
  return html`<${IconButton} icon=${info.icon} label=${info.title} cls=${'sync sync-' + info.tone} onClick=${onClick} />`;
}

/** Uitleg bij een tik op het sync-icoon (buiten de balk getekend, anders valt het venster erin). */
export function SyncDialog({ onDismiss }) {
  const p = usePrefs();
  const info = syncInfo(useCloud());
  return html`<${Dialog} onDismiss=${onDismiss}>
    <div class="confirm">
      <span class=${'confirm-icon tone-' + info.tone}><${Icon} name=${info.icon} size=${22} /></span>
      <div class="confirm-body">
        <div class="card-title">${info.title}</div>
        ${info.text && html`<div class="confirm-text">${info.text}</div>`}
        <div class="small faint">Ingelogd als ${p.cloudUser}</div>
      </div>
    </div>
    <${DialogButtons}><${Button} onClick=${onDismiss}>Sluiten<//><//>
  <//>`;
}

// ---- Instellingen

export function CloudCard() {
  const s = useCloud();
  const p = usePrefs();
  const [askOut, setAskOut] = useState(false);
  const info = syncInfo(s);
  return html`<${Card}>
    <${StatusBanner} tone=${info.tone} icon=${info.icon} title=${info.title} text=${info.text} />
    <p class="sub">Ingelogd als <b>${p.cloudUser}</b>. Wat je wijzigt, gaat ook naar je online database.</p>
    <${Button} icon="i_logout" onClick=${() => setAskOut(true)}>Uitloggen<//>
    ${askOut && html`<${ConfirmDialog} icon="i_logout" title="Uitloggen?"
      text="Daarna moet je opnieuw inloggen om de app te gebruiken. Je gegevens blijven online staan."
      confirmLabel="Uitloggen" onConfirm=${() => { setAskOut(false); cloud.signOut(); }}
      onDismiss=${() => setAskOut(false)} />`}
  <//>`;
}
