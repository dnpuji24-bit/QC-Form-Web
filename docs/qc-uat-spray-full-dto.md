# 11C.2A.4a — full-shape Spray DTO validation candidate

Operator screenshot at 48d6fc3 confirms 15 daily source progress and 28 monthly progress checks passed. Previous 22 actual SprayForm browser checks passed. Actual form currently emits full record including source metadata, actual executor, material calculation, timing and photo fields; previous strict emulator receipt and Rules accept a narrower DTO and require DP shift/foreman equal actual executor. They cannot be reused unchanged for carryover.

This isolated validator covers the exact fresh SprayForm DTO field set plus testOnly marker and synthetic fixture IDs. It independently compares source DP metadata and material quantities, actual area consistency, own or same-date 1-to-2 carryover, overnight timing, HOLD overlap and productivity. Actual area is not capped by source area. Draft validation permits incomplete timing. Deliberately restrictive synthetic IDs, normalized source fixture shift/kind, exact hold fields, and decimal checks are lab constraints, NOT production admission policy. Fresh form fixture reconstructed from inspected source, not raw browser captured bytes. No legacy imported records or full finalize DTO yet. Photo fields are shape-checked only; immutable photo transport and binary stripping are separate existing tests. No authentication or server commit performed here. 21 checks executed in authoring JavaScript runtime, Node rerun pending.

Next: actual captured DTO adapter, trusted server transaction with current Owner permissions and authoritative source DP, real buildQcActualPayload and QC/Actual/Audit, full photo manifest binding, replay and failure tests in dedicated emulator. Do not change or deploy existing Rules. No production source touched, hosted UAT remains OFF.

Run: node scripts/test-qc-uat-spray-full-dto.mjs

### Actual mapper and atomic core regression

Added 8 scenarios using the actual function bodies from firestoreStore.ts, selected by TypeScript AST and compiled with only fixture firebaseAuth/serverTimestamp dependencies, plus the actual commitQcAndActual core and photo stripping helper. No Firebase initialization or network calls. The transaction and audit writer are in-memory substitutes; test is not an emulator or real server authorization test. Actual mapping preserves source IDs, actual executor, metadata/materials, overage, correction identity and absence of inline photo bytes. No change to original mapper. Script authored and source-reviewed, Node execution pending. Run: node scripts/test-qc-uat-spray-actual-mapper.mjs

### Mapper runner compatibility correction

Operator screenshot at 035f70b: full-shape DTO 21/21 PASS in Node, mapper runner failed before its first scenario at ts.ScriptTarget.Latest (undefined compiler API). Remaining regression commands were not reached. Root package declares typescript latest; installed version not confirmed. Replace compiler AST/transpile dependency with Node native stripTypeScriptTypes (mode strip, supported on operator Node 26.13.0). Exact unique source boundaries, ordered mapper declarations, dependency guard, and export guard preserve the source-derived test without loading Firestore SDK or production modules. All eight scenarios unchanged. No dependency or production source changes. Node execution pending.

Operator verification at `aa36830`: 72/72 checks passed (21 DTO, 8 actual mapper/mock atomic, 15 daily, 28 monthly). Node experimental warning only. Next: [trusted full Spray server gate](qc-uat-spray-full-server.md).
