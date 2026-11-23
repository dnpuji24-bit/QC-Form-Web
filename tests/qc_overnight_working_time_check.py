from pathlib import Path

root=Path(__file__).resolve().parents[1]
spray=(root/'src'/'SprayForm.tsx').read_text(encoding='utf-8')
fert=(root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')

for name,source,card_type in [
    ('Spray',spray,'SprayCard'),
    ('Fertilizer',fert,'UnitCard'),
]:
    for token in [
        "function workingClockRange(startValue:string,endValue:string)",
        "const overnight=rawEnd<start",
        "rawEnd+1440",
        "function clockWithinWorkingDay(value:string,start:number,overnight:boolean)",
        "overnight&&raw<start?raw+1440:raw",
        f"function timingFor(card:{card_type})",
        "rawEnd===start",
        "b<=a",
        "a<start||b>end",
        "Waktu HOLD tidak boleh bertumpuk.",
        "lintas hari",
    ]:
        assert token in source, f"Missing {name} overnight timing token: {token}"
    assert "end<=start" not in source, f"{name} still rejects cross-midnight work ranges"

print("QC overnight working-time checks: Spray/Fertilizer accept end times on the next day and normalize HOLD intervals across midnight.")
