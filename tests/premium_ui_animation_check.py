from pathlib import Path
root=Path(__file__).resolve().parents[1]
plan=(root/'src'/'PlanWorkspace.tsx').read_text(encoding='utf-8')
portal=(root/'src'/'PortalRouter.tsx').read_text(encoding='utf-8')
app=(root/'src'/'App.tsx').read_text(encoding='utf-8')
styles=(root/'src'/'styles.css').read_text(encoding='utf-8')

assert 'key={tab} className="ui-view-transition plan-tab-transition"' in plan
assert 'key={dataView} className="ui-view-transition portal-view-transition"' in portal
assert 'key={view} className="ui-view-transition qc-view-transition"' in app

for token in [
    "Premium micro-interactions & view transitions",
    "@keyframes ui-view-enter",
    "@keyframes ui-tab-pop",
    "@keyframes ui-dialog-in",
    "@keyframes ui-dropdown-in",
    "button:not(:disabled):active",
    ".daily-activity-options",
    "@media(prefers-reduced-motion:reduce)",
]:
    assert token in styles, f"Missing animation token: {token}"

print("Premium UI animation and reduced-motion checks: OK")
