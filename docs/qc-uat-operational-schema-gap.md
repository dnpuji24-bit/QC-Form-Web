# QC UnM operational schema gap inventory — source only

Reviewed feature branch commit `ecd2197c33549f58883bc058979ad0627374b336`. Operator evidence: 35 foundation, 48 domain, 24 SDK, 19 Auth SDK and 16 React browser demo checks passed. Browser WebSocket patch recorded in ecd2197. These are different suites, not proof of operational parity.

## Scope and safety

Target Firebase project: form-qc-unm; the existing isolated demo project remains demo-qc-uat-foundation. Source inspection only; no production document reads, writes, Firebase/Supabase deployment, IAM, billing, spreadsheet changes or hosted UAT activation. Hosted UAT remains frozen. No release approval. Do not import production Firebase initialization into the lab.

## Mapping and gaps

| Domain | Operational source / fields | Current demo contract | Required next validation |
|---|---|---|---|
| Company / paddock | master_companies, master_paddocks: pid, companyCode, farm, variety, varietyBreakdown, stage/currentStage, areaPaddockHa, plantAreaHa; legacy aliases | master_paddocks: pid, area100 | Distinguish planted vs paddock area; preserve per-variety breakdown and company/farm identity. Do not infer real PID from synthetic ID. |
| Activity / material / resources | master_activities: activityCode, description, activity, type, activityCategory, companyScope, active, components (sequence, label, activeIngredient, dosePerHa, unit); separate materials and resources | master_activities: formType | Validate active status, component units, lookup consistency and duplicate unit names. |
| Monthly Plan | monthly_plans: planLineId, monthKey, year, week, startDate, endDate, pid, companyCode, farm, activity, description, targetAreaHa, actualAreaHa, balanceHa, manualActualAreaHa, cancelled/finished flags | pid, activityId, targetArea100 | Preserve period and status; verify plan identity including PID and description when duplicates; define accumulation/over-allocation semantics before enforcing limits. |
| Daily Plan | daily_plans: dailyPlanId, workGroupId, workGroupPidCount, planningOrder, sourceType, monthlyLinkStatus, monthlyPlanLineId, date, monthKey, shift, pid, areaHa, foreman, manpower, unitName, unitReady/Standby/Breakdown, materials | pid, activityId, monthlyPlanLineId, targetArea100, formType | Preserve one card/multiple PID grouping; verify date, shift, foreman and parent link, material units and accumulated area. |
| Actual Plan | daily_reports: actualReportId, workGroupId, dailyPlanId, monthlyPlanLineId, actualAreaHa, plannedDailyAreaHa, dailyVarianceHa, date, shift, foreman, materials, sourceOrigin, qcRecordId | same-ID create-only QC pair | Actual can originate from QC, web or import; QC-derived ID uses qcactual_ + QC id. Test draft/no Actual, eligible save, conflict, replay and review-required removal. |
| QC Spray / Fertilizer | qc_records: id, sessionId, formType, date, shift, name, nameOfAssistan, paddock, dailyPlanId, monthlyPlanLineId, area/resultArea, saveType, holdIntervals, workingDurationMinutes, effectiveWorkingMinutes, productivityHaPerHour; open-ended QcRecord index signature | pid, parent IDs, formType, actualArea100 | Inventory actual form-specific fields separately; define status/revision/actor and time validation. Do not treat this interface as exhaustive. |
| Photos | photoDriveUrl, scanReportDriveUrl, holdIntervals[].photoDriveUrl, legacy Base64 fields; native manifest and signed read paths | absent | Separate synthetic storage and authorization test; legacy reads retained, no real URL or production photo writes. |
| Identity and permissions | users, role_access, user_access, registration_requests, firebase_registration_requests; none/view/edit permissions per menu; Owner/Asisten/Manager/Admin/Mandor/Pengunjung | qcUat claim and synthetic role allowlist | Map permission keys and overrides; ensure rules/server enforce privileges rather than UI alone. |

## Critical transaction difference

The existing operational candidate `commitQcAndActual` reads current QC and `qcactual_` Actual, uses clientRevision, baseRevision, jobId and uploaderUid, detects identity and revision conflicts, handles idempotent replay, prevents uploaded status regression and rejects implicit removal of an existing Actual. The Firestore adapter writes an operational audit row keyed by QC ID and revision. `buildQcActualPayload` only produces Actual when its eligibility predicate is met (linked DP, positive area and qualifying save/upload state). The current demo writes QC + Actual with the same ID unconditionally for its synthetic create path. Do not change live identifiers or assume the lab proves operational transaction parity.

## Inventory boundary

The existing `scripts/audit-qc-operational-inventory.mjs` lists 5 operational, 16 master, 5 identity and 7 history collections. Its live aggregate mode is not part of this source audit and has not been run here. Counts do not prove field-level parity. The earlier photo schema audit flags ownerUid, clientRevision and legacy Drive/HOLD references as compatibility requirements; historical notes are not current deployment evidence.

## Next implementation gate

1. Derive a pure expanded synthetic DTO from operational fields and explicit aliases, retaining integer hundredths of Ha or explicitly rejecting unrepresentable values. Do not silently round real data.
2. Start with company/paddock/activity/material and MP/DP grouping fixtures; add schema and conversion tests.
3. Add QC lifecycle and Actual linkage contract including qcactual_ ID and audit semantics in demo only, with fresh candidate Rules and regression cases.
4. Extend authorization, photo staging and offline transport only after domain tests pass. Keep all network paths loopback and hosted UAT OFF.

## Source references

- [Demo contract](../src/qcUatDomainContract.mjs)
- [Operational types](../src/types.ts)
- [Monthly entry](../src/MonthlyPlanWebEntryPanel.tsx) and [list](../src/MonthlyPlanListPanel.tsx)
- [Daily row and grouping](../src/dailyPlanWorkspaceTypes.ts)
- [Actual row](../src/actualPlanWorkspaceTypes.ts)
- [Master mapping](../src/qcMasterDataMapping.mjs)
- [Actual eligibility and ID](../src/firestoreStore.ts)
- [Atomic commit](../src/qcAtomicCommit.mjs) and [Firestore adapter](../src/qcAtomicFirestoreAdapter.ts)
- [Access catalog](../src/accessControl.ts)
- [Inventory script](../scripts/audit-qc-operational-inventory.mjs)
- [Photo schema audit](../scripts/QC_PHOTO_PRODUCTION_SCHEMA_AUDIT.md)

This inventory is preliminary: full write payloads, historical aliases, form-specific field validation, indexes, current deployed rules, data shape coverage and browser behavior of the real portal still require verification.
