from pathlib import Path

root=Path(__file__).resolve().parents[1]
css=(root/'src'/'antd-portal.css').read_text(encoding='utf-8')
workspace=(root/'src'/'PlanWorkspace.tsx').read_text(encoding='utf-8')
portal=(root/'src'/'PortalRouter.tsx').read_text(encoding='utf-8')

for token in [
    "Monthly Plan",
    "Daily Plan",
    "Actual Plan",
    "Rekonsiliasi",
]:
    assert token in workspace, f'Missing primary Plan menu item: {token}'

for token in ['Summary','Calendar Rekap']:
    assert token in portal, f'Missing portal reporting card: {token}'
    assert token not in workspace, f'Reporting shortcut should not appear in Plan tabs: {token}'

for token in [
    ".plan-workspace-shell .plan-antd-nav",
    "width: fit-content",
    "max-width: 100%",
    ".plan-section-menu .ant-segmented-item-selected",
    "input:focus-visible",
    ".plan-subworkspace .plan-antd-nav .ant-segmented-item-label",
    "min-height: 44px",
]:
    assert token in css, f'Missing compact desktop Plan navigation token: {token}'

assert 'aria-label="Menu Plan"' in workspace
assert "allowed[item.value]" in workspace
print("Compact Plan navigation check passed: permitted sections, selected and focused controls, desktop fit and mobile touch targets.")
