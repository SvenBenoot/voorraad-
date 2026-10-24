// ---- Prullenmand
// Verwijderde artikels blijven 30 dagen bewaard; je kan ze terugzetten of definitief wissen.
import { html, useState } from '../../lib/preact-htm.js';
import { store, daysLeft, collator } from '../store.js';
import {
  useData, TopBar, Card, Button, IconButton, ItemIcon, EmptyState, ConfirmDialog, plural, toast,
} from '../ui.js';
import { back } from '../router.js';

export function TrashScreen() {
  const data = useData();
  const [ask, setAsk] = useState(null); // { kind: 'one' | 'all', item? }
  const list = [...data.trash].sort((a, b) => b.deletedAt - a.deletedAt || collator.compare(a.name, b.name));

  const restore = async (item) => {
    const r = await store.restore(item.id);
    toast(r.renewed ? 'Teruggezet met een nieuwe code' : 'Teruggezet');
  };

  return html`<div class="screen scr-trash">
    <${TopBar} title="Prullenmand" onBack=${back}>
      ${list.length > 0 && html`<${IconButton} icon="i_delete" label="Leeg maken" onClick=${() => setAsk({ kind: 'all' })} />`}
    <//>
    <main class="content">
      ${list.length === 0 ? html`<${EmptyState} icon="i_delete" title="Prullenmand is leeg" text="Verwijderde artikels blijven hier 30 dagen." />`
        : list.map((it) => html`<${Card} key=${it.id} cls="trash-card">
          <div class="trash-top">
            <${ItemIcon} icon=${it.icon} />
            <div class="item-body">
              <div class="card-title clamp2">${it.name}</div>
              <div class="small faint">Nog ${plural(daysLeft(it), 'dag', 'dagen')}</div>
            </div>
          </div>
          <div class="btn-row">
            <${Button} icon="i_restore" onClick=${() => restore(it)}>Terugzetten<//>
            <${Button} cls="danger-text" icon="i_delete" onClick=${() => setAsk({ kind: 'one', item: it })}>Wissen…<//>
          </div>
        <//>`)}
    </main>

    ${ask && html`<${ConfirmDialog} kind="danger" icon="i_delete"
      title=${ask.kind === 'all' ? 'Prullenmand leegmaken?' : ask.item.name + ' definitief wissen?'}
      text="Dit kan niet ongedaan gemaakt worden."
      confirmLabel=${ask.kind === 'all' ? 'Leegmaken' : 'Wissen'}
      onConfirm=${() => { const a = ask; setAsk(null); store.deleteForever(a.kind === 'all' ? undefined : [a.item.id]); }}
      onDismiss=${() => setAsk(null)} />`}
  </div>`;
}
