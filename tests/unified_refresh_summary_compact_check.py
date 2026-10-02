from pathlib import Path
root=Path(__file__).resolve().parents[1]
component=(root/'src'/'YinYangRefreshButton.tsx').read_text(encoding='utf-8')
summary=(root/'src'/'PlanSummaryDashboard.tsx').read_text(encoding='utf-8')
calendar=(root/'src'/'PlanCalendarRecap.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')
assert "export function YinYangIcon" in component
assert "export default function YinYangRefreshButton" in component
assert "summary-compact-head" in summary
assert "summary-compact-alert" in summary
assert 'label="Refresh Summary"' in summary
assert "import { YinYangIcon } from './YinYangRefreshButton'" in calendar
assert "function YinYangIcon({spinning=false}" not in calendar
assert "Unified yin-yang refresh controls" in css
assert "Summary compact premium layout" in css
print("Shared yin-yang refresh + compact Summary checks: OK")
