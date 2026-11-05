from pathlib import Path

root=Path(__file__).resolve().parents[1]
workflow=(root/'.github'/'workflows'/'firebase-preview.yml').read_text(encoding='utf-8')
sw=(root/'public'/'react'/'sw.js').read_text(encoding='utf-8')
firebase=(root/'firebase.json').read_text(encoding='utf-8')
main=(root/'src'/'main.tsx').read_text(encoding='utf-8')

assert "branches:\n      - migrate/react-typescript-vite" in workflow
assert "\n    paths:" not in workflow
assert "qc-react-v3" in sw
assert "fetch(request, { cache: 'no-store' })" in sw
assert "url.pathname.startsWith('/react/assets/')" in sw
assert '"source": "/react/index.html"' in firebase
assert "no-cache, no-store, must-revalidate" in firebase
assert "registration.update()" in main
print("React preview deploy/cache freshness checks: OK")
