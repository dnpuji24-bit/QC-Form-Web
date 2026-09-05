from pathlib import Path
import json, re, sys

root = Path(__file__).resolve().parents[1]
html = (root / 'public/index.html').read_text(encoding='utf-8')
js = (root / 'public/app.js').read_text(encoding='utf-8')
sw = (root / 'public/sw.js').read_text(encoding='utf-8')

ids = re.findall(r'id="([^"]+)"', html)
assert len(ids) == len(set(ids)), 'Duplicate HTML id found'
for required in ['authView','appView','qcForm','metrics','recordsList','usersBody','logsBody']:
    assert required in ids, f'Missing #{required}'
for forbidden in ['password: \'123456\'', 'owner123', 'QC2026', 'getUsersDB']:
    assert forbidden not in js, f'Forbidden insecure client pattern: {forbidden}'
manifest = json.loads((root / 'public/manifest.json').read_text(encoding='utf-8'))
firebase = json.loads((root / 'firebase.json').read_text(encoding='utf-8'))
assert manifest['start_url'] == './'
assert firebase['hosting']['public'] == 'public'
for asset in re.findall(r"'\./([^']+)'", sw):
    assert (root / 'public' / asset).exists() or asset == '', f'Missing cached asset: {asset}'
print('static_check: OK')
