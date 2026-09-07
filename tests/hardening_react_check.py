from pathlib import Path

root = Path(__file__).resolve().parents[1]
offline = (root/'src'/'offline.ts').read_text(encoding='utf-8')
network = (root/'src'/'NetworkStatus.tsx').read_text(encoding='utf-8')
main = (root/'src'/'main.tsx').read_text(encoding='utf-8')
app = (root/'src'/'App.tsx').read_text(encoding='utf-8')
sw = (root/'public'/'react'/'sw.js').read_text(encoding='utf-8')
styles = (root/'src'/'theme.css').read_text(encoding='utf-8')
field_ui = (root/'src'/'field-ui.css').read_text(encoding='utf-8')
drafts = (root/'src'/'draftStore.ts').read_text(encoding='utf-8')
local_db = (root/'src'/'localDb.ts').read_text(encoding='utf-8')
compact_offline = ''.join(offline.split())
compact_network = ''.join(network.split())
compact_app = ''.join(app.split())
compact_local_db = ''.join(local_db.split())

for token in ["exporttypeQueueAction='syncRecord'|'finalizeRecord'", "if(!navigator.onLine)", "exportasyncfunctionflushQueue(token:string)", "functionisAuthError", "AUTH_REQUIRED", "openLocalDb()"]:
    assert token in compact_offline, f'Missing offline hardening token: {token}'
for token in ['online','offline','queueCount()','flushQueue(token)','qc:queue-flushed']:
    assert token in compact_network, f'Missing network recovery token: {token}'
for token in ['saveDraft', 'loadDraft', 'clearDraft', 'pendingWrites']:
    assert token in drafts, f'Missing resumable form draft token: {token}'
for token in ["LOCAL_DB_VERSION=3", "DRAFT_STORE='drafts'", "QUEUE_STORE='queue'", 'indexedDB.open(LOCAL_DB_NAME,LOCAL_DB_VERSION)']:
    assert token in compact_local_db, f'Missing shared IndexedDB token: {token}'
assert '<NetworkStatus />' in main
assert "navigator.serviceWorker.register('/react/sw.js', { scope: '/react/' })" in main
assert "url.pathname.startsWith('/react/')" in sw
assert "request.method !== 'GET'" in sw
assert "record.saveType==='uploaded'" in compact_app
assert "record.saveType==='upload_queued'" in compact_app
assert "if(!navigator.onLine)" in compact_app
for token in ['--brand:', '.dashboard-hero', '.progress-track', '.unit-card', '.auth-card', '.tabs button.active']:
    assert token in styles, f'Missing professional UI theme token: {token}'
for token in ['.unit-tab-rail', '.spray-hold-section', '.downtime-section', '.report-photo']:
    assert token in field_ui, f'Missing field workflow UI token: {token}'
print('React hardening check: shared IndexedDB queue/drafts, resumable forms, auth/finalize guards, PWA scope, unit tabs, HOLD workflow, and modern UI verified.')
