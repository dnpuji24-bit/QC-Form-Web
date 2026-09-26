from pathlib import Path

root=Path(__file__).resolve().parents[1]
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')
workspace=(root/'src'/'PlanWorkspace.tsx').read_text(encoding='utf-8')

for token in [
    "Summary",
    "Monthly Plan",
    "Daily Plan",
    "Actual Plan",
    "Rekonsiliasi",
]:
    assert token in workspace, f'Missing primary Plan menu item: {token}'

for token in [
    "Compact desktop Plan submenus",
    "@media(min-width:761px)",
    "width:max-content",
    "grid-template-columns:none!important",
    ".plan-primary-nav button.active",
    ".plan-secondary-nav button.active",
    "min-height:34px",
]:
    assert token in css, f'Missing compact desktop Plan navigation token: {token}'

assert "width:auto!important" in css, "Desktop Plan nav buttons must not stretch across empty columns."
assert "gap:6px" in css, "Desktop Plan navigation should use compact spacing."
print("Compact Plan navigation check passed: desktop primary and secondary menus use content-width pill navigation without large empty grid areas.")
