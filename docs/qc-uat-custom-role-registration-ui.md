# 11D.4e.2 — Isolated Custom Role Registration UI and Owner Approval

Baseline: 11D.4e.1 passed in Cloud Shell screenshots on 20 Nov 2026: 45 offline/typecheck, 15 registration emulator, 29 Owner HTTP and 11 Owner browser regression (100 total). The backend baseline is 2be9bdc.

Boundary: fixed demo-qc-uat-owner-http, Firestore emulator 9485, Auth emulator 10299, loopback HTTP 4497. Applicant is an already provisioned, email-verified, UAT-claim-bearing synthetic Firebase Auth user. Browser cannot create Firebase Auth users, set claims, verify emails or write Firestore. Real emulator Firebase Auth tokens live in memory only; no local/session storage or inferred permission fallback. Owner panel appears only with a validated current Owner session.

Owner inbox endpoint POST /uat/owner/registration/inbox with empty JSON object: capped to 100 canonical, fully validated rows; Owner claim and active marker/production collision checks. No passwords or real identities. Applicant sees only custom role id/name.

Applicant requests catalog role with no marker. Owner chooses approved role separately and approves/rejects expected revision 0. Applicant activates the approved role; existing server revalidates catalog, absence of production profile/marker, token claim, email verification and atomic audits. No self approval, stale replay or browser Firestore access. UI discards in-flight results after identity switch, blocks on failed mutation until refresh, and does not infer pending status from a failed response.

New source and test will be isolated from production App, NativeUsersAccess, Rules and Supabase. No public signup, email enrollment, hosted deployment, scalability/pagination or rate limiting. Test candidate must be verified through Cloud Shell emulator before any further rollout.
