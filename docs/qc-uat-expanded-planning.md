# Expanded synthetic planning DTO — first offline candidate

Baseline: 8e2938e. This is a standalone source-only candidate, not imported by the production app or existing emulator lab. No Rules, Auth, hosting, storage, SDK, production data, or Supabase changes. Hosted UAT remains OFF.

Run: `node scripts/test-qc-uat-expanded-planning.mjs` (no emulator needed).

The candidate takes synthetic fixtures only: explicit testOnly and uat-* IDs, exact field allowlists, integer hundredths of hectares (reject >2 decimals, no rounding), company/paddock/farm and variety breakdown, explicit currentStage/stage, areaPlantedHa/areaPaddockHa and varietyAreaTotalHa/plantAreaHa aliases from MonthlyPlanWebEntryPanel (conflicts rejected), material and activity linkage, monthly period and parent identity, linked daily rows and complete multi-PID work groups. Activity IDs on MP/DP are explicit synthetic fixture references, not inferred from labels or claimed production fields.

Strict limits (nonnegative balances, variety totals equal planted area, positive linked daily rows, closed monthly parent rejection, exact group shared fields, material labels/units, bounded list and area) are proposed fixture constraints, not a claim about all historical data or approved production policy. Unlinked/imported DP, plantProgress fallback, resource/duplicate unit name mapping, precise week boundaries, variety selection per plan, status lifecycle, signed balances, manual actual semantics, cumulative area limits, dose conversions and full operational compatibility are deliberately deferred. Do not use this mapper on live data or extend candidate Rules until those gaps are resolved. No automatic conversion from production IDs or real records.

Verification: 26 pure JavaScript checks passed before commit in a JS runtime. Node execution in operator Cloud Shell and all existing regression suites remain pending. This is not a release gate pass. Next: verify offline Node test, extend fixtures for remaining mapping gaps, then separately design QC lifecycle and qcactual_ linkage in the isolated emulator.
