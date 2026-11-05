from pathlib import Path

root = Path(__file__).resolve().parents[1]
firebase = (root/'src'/'firebase.ts').read_text(encoding='utf-8')
preview = (root/'.github'/'workflows'/'firebase-preview.yml').read_text(encoding='utf-8')
ci = (root/'.github'/'workflows'/'react-ci.yml').read_text(encoding='utf-8')
env = (root/'.env.example').read_text(encoding='utf-8')

for token in [
    "initializeAppCheck",
    "ReCaptchaEnterpriseProvider",
    "VITE_RECAPTCHA_ENTERPRISE_SITE_KEY",
    "isTokenAutoRefreshEnabled:true",
]:
    assert token in firebase, f'Missing App Check token: {token}'

assert "VITE_RECAPTCHA_ENTERPRISE_SITE_KEY" in preview
assert "VITE_RECAPTCHA_ENTERPRISE_SITE_KEY" in ci
assert "VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=" in env

print('Firebase App Check regression check passed: reCAPTCHA Enterprise initialization and build-time site key wiring are present.')
