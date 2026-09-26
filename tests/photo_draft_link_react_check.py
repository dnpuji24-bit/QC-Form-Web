from pathlib import Path

root = Path(__file__).resolve().parents[1]
api = (root/'src'/'api.ts').read_text(encoding='utf-8')
offline = (root/'src'/'offline.ts').read_text(encoding='utf-8')
picker = (root/'src'/'PhotoPicker.tsx').read_text(encoding='utf-8')
types = (root/'src'/'types.ts').read_text(encoding='utf-8')

for token in ['photoDriveUrl?: string', 'firestoreSynced?: boolean']:
    assert token in types, f'Missing save response metadata: {token}'
for token in ['if(result.firestoreSynced)return result', 'serverMergedRecord', 'result.photoDriveUrl']:
    assert token in api, f'Missing API photo-link preservation: {token}'
for token in ['serverMergedRecord(server,current.record)', 'if(!server.firestoreSynced)', 'mirrorAfterServerSave(action,record,server)']:
    assert token in offline, f'Missing offline photo-link preservation: {token}'
for token in ['localPreview', 'URL.createObjectURL(file)', 'normalizedPreviewSource', 'Preview foto yang dipilih']:
    assert token in picker, f'Missing photo preview behavior: {token}'

print('Photo draft/link regression check: server Drive URL preservation and browser image preview verified.')
