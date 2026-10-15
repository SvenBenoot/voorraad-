// ---- Instellingen › Online opslaan
// Inloggen, account maken en tonen of alles online staat.
import { html, useEffect, useState } from '../lib/preact-htm.js';
import { cloud } from './cloud.js';
import { Card, Button, TextField, StatusBanner, ConfirmDialog, usePrefs, toast } from './ui.js';

function useCloud() {
  const [s, setS] = useState(cloud.status);
  useEffect(() => cloud.subscribe(setS), []);
  return s;
}

function syncBanner(s) {
  if (s.state === 'error') return { tone: 'orange', icon: 'i_cloud_off', title: 'Online opslaan lukt niet', text: s.error };
  if (s.state === 'busy') return { tone: 'blue', icon: 'i_cloud_sync', title: 'Bezig met verbinden…', text: '' };
  if (s.pending || !s.online) {
    return { tone: 'orange', icon: 'i_cloud_sync', title: s.online ? 'Bezig met online bewaren…' : 'Wacht op internet',
      text: 'Je wijzigingen staan op dit toestel en gaan online zodra er verbinding is.' };
  }
  return { tone: 'green', icon: 'i_cloud_done', title: 'Alles online bewaard', text: '' };
}

export function CloudCard() {
  const s = useCloud();
  const p = usePrefs();
  const [email, setEmail] = useState(s.email || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [askOut, setAskOut] = useState(false);

  if (p.cloudUser) {
    const b = syncBanner(s);
    return html`<${Card}>
      <${StatusBanner} tone=${b.tone} icon=${b.icon} title=${b.title} text=${b.text} />
      <p class="sub">Ingelogd als <b>${p.cloudUser}</b>. Wat je wijzigt, gaat ook naar je online database. Zo staat alles veilig
        als je iPhone stuk of kwijt is, en zie je dezelfde voorraad op elk toestel waar je inlogt.</p>
      <${Button} icon="i_logout" onClick=${() => setAskOut(true)}>Uitloggen<//>
      ${askOut && html`<${ConfirmDialog} icon="i_logout" title="Uitloggen?"
        text="De gegevens blijven op dit toestel staan, maar wijzigingen gaan niet meer online. Log je later opnieuw in, dan wordt alles weer samengevoegd."
        confirmLabel="Uitloggen" onConfirm=${() => { setAskOut(false); cloud.signOut(); toast('Uitgelogd'); }}
        onDismiss=${() => setAskOut(false)} />`}
    <//>`;
  }

  const go = async (create) => {
    setBusy(true);
    const ok = await cloud.signIn(email, password, create);
    setBusy(false);
    if (ok) { setPassword(''); toast(create ? 'Account gemaakt, alles staat nu online' : 'Ingelogd, alles staat nu online'); }
  };
  const ready = email.includes('@') && password.length > 0;

  return html`<${Card}>
    <div class="card-title">Bewaar je voorraad online</div>
    <p class="sub">Log in met je e-mailadres. Dan gaat alles ook naar je eigen online database: veilig als je iPhone stuk
      of kwijt is, en op je pc zie je dezelfde voorraad. Zonder internet werkt de app gewoon verder.</p>
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
  <//>`;
}
