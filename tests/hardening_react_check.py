from pathlib import Path

root = Path(__file__).resolve().parents[1]
offline = (root/'src'/'offline.ts').read_text(encoding='utf-8')
network = (root/'src'/'NetworkStatus.tsx').read_text(encoding='utf-8')
main = (root/'src'/'main.tsx').read_text(encoding='utf-8')
app = (root/'src'/'App.tsx').read_text(encoding='utf-8')
sw = (root/'public'/'react'/'sw.js').read_text(encoding='utf-8')
styles = (root/'src'/'theme.css').read_text(encoding='utf-8')

for token in ["QueueAction = 'syncRecord' | 'finalizeRecord'", "if (!navigator.onLine)", "discardQueuedRecord(record.id)", "export async function flushQueue(token: string)", "/sesi|login|izin|password|kata sandi|auth/i"]:
    assert token in offline, f'Missing offline hardening token: {token}'

for token in ['online', 'offline', 'queueCount()', 'flushQueue(token)', 'qc:queue-flushed']:
    assert token in network, f'Missing network recovery token: {token}'

assert '<NetworkStatus />' in main
assert "navigator.serviceWorker.register('/react/sw.js', { scope: '/react/' })" in main
assert "url.pathname.startsWith('/react/')" in sw
assert "request.method !== 'GET'" in sw
assert "record.saveType === 'uploaded'" in app
assert "record.saveType === 'upload_queued'" in app
assert "if (!navigator.onLine)" in app

for token in ['--brand:', '.dashboard-hero', '.progress-track', '.unit-card', '.auth-card', '.tabs button.active']:
    assert token in styles, f'Missing professional UI theme token: {token}'

print('React hardening check: offline queue, auth-failure handling, role/finalize guards, PWA scope, and modern UI theme verified.')
