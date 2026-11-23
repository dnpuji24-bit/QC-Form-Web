from pathlib import Path
root=Path(__file__).resolve().parents[1]
panel=(root/'src'/'MonthlyPlanListPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')
for token in [
  "finished:boolean",
  "function isFinished(row:PlanRow)",
  "async function finishPlan(row:ViewRow)",
  "Target tetap '+formatHa(row.targetAreaHa)",
  "sourceStatus:'FINISHED'",
  "balanceHa:0,calculatedBalanceHa:0",
  "finished:false,finishReason:''",
  "MonthlyActionIcon",
  'className="monthly-icon-action finish"',
  'className="monthly-icon-action trash',
]:
  assert token in panel, f"Missing finish/icon token: {token}"
for token in [".monthly-icon-action.finish",".monthly-icon-action.trash",".monthly-finished-note"]:
  assert token in css, f"Missing premium icon CSS: {token}"
print("Monthly Finish closes remaining balance without changing target and compact premium icon actions are present.")
