# Drift Log

Standing record of ENS contracts-v2 changes that could impact this subgraph,
maintained by the 3-hourly drift automation (created 2026-08-15). Entries are
either "no drift" one-liners, detailed drift analyses, or ACTION-NEEDED items
(file a GitHub issue for those — the repo lives at
https://github.com/p-diogo/ens-v2-subgraph since 2026-08-15).

## 2026-08-15 (baseline)

- Baseline captured: live branch `deploy/sepolia-migration-20260731` (HEAD
  be6cf89), RC base `post-audit-2` + `feat/public-resolver` (PR #354,
  34e3cbc), Makoto's gist as of 2026-08-13. Both generations indexed and
  verified (see docs/PRD.md §6).
- ENSNode hosted fleet: still 404 ("Application not found") behind broken
  TLS on all five documented instances. Self-hosted oracle is canonical.

## 2026-08-15 (run 1)

- `feat/public-resolver` (PR #354 head) moved 34e3cbc → 52beb14 (2 commits:
  "remove clear, ROLE_MANAGER to LINK, fix bits again", "fix ts roles").
  Event surface verified IDENTICAL emit-by-emit at the new head (SharedResolver
  unchanged; only change is a removed `emit Linked` in PermissionedResolver —
  Linked is deliberately unindexed per DIVERGENCES S4). Class (c)
  informational; no action. Our verified pin remains 34e3cbc; re-verify the
  RC devnet against 52beb14 when convenient.
- post-audit-2 SAME (80f6d90). Live branch SAME (be6cf89).
- Open PRs reviewed: #415 (ROLE_CAN_USE, stacked on feat/public-resolver,
  role-bit only, no new events), #406 (AliasResolver, out of scope per S4).
- `update-resolver-update-event` branch = PR #95, CLOSED 2025 — dead.
- Makoto's gist unchanged (last active 2026-08-13; same PR list as baseline).
- ENSNode hosted fleet: still down (TLS mismatch persists).

Verdict: no drift.

## 2026-08-15T11:01Z (run 2)

- No movement since run 1: live/post-audit-2 SAME; feat/public-resolver still
  at 52beb14 (already classified informational in run 1). No new relevant
  branches. 17 open PRs, none updated since run 1. Gist last active
  2026-08-13 12:49 (unchanged). ENSNode fleet still down (TLS mismatch).

Verdict: no drift.

## 2026-08-15T14:01Z (run 3)

- No movement since run 2: live/post-audit-2 SAME; feat/public-resolver
  unchanged at 52beb140 (classified informational in run 1); remote main
  unchanged at 48b3e2d3. No new relevant branches. 17 open PRs, none updated
  since run 2. Gist last active 2026-08-13 12:49 (unchanged). ENSNode fleet
  still down (TLS mismatch).

Verdict: no drift.

## 2026-08-15T20:01Z (run 4)

- No movement: live be6cf89 / post-audit-2 80f6d90 / feat/public-resolver
  52beb14 (all previously classified) / main 48b3e2d3 unchanged. No new
  relevant branches. 17 open PRs, none updated. Gist unchanged
  (2026-08-13 12:49). ENSNode fleet still down (TLS mismatch).

Verdict: no drift.

## 2026-08-15T23:01Z (run 5)

- No movement: live be6cf89 / post-audit-2 80f6d90 / feat/public-resolver
  52beb14 (classified) / main 48b3e2d3. No new relevant branches (the devin/*
  and feat/* resolver branches in the filter are all pre-existing). 17 open
  PRs, none updated. Gist unchanged (2026-08-13 12:49). ENSNode fleet still
  down. Repo now public on GitHub (history rewritten to drop 44MB of
  accidentally-committed .gnd-data postgres files; upstream SHAs in this log
  unaffected).

Verdict: no drift.

## 2026-08-16T02:01Z (run 6)

- No movement: all tracked branches at known heads, branch-name count 47
  (unchanged), 17 open PRs with none updated, gist unchanged (2026-08-13
  12:49), ENSNode fleet still down.

Verdict: no drift.

## 2026-08-16T05:02Z (run 7)

- No movement: tracked branches at known heads, branch count 47, 17 open
  PRs (none updated), gist unchanged (2026-08-13 12:49), fleet still down.

Verdict: no drift.

## 2026-08-16T08:01Z (run 8)

- No movement: tracked branches at known heads, branch count 47, 17 open
  PRs (none updated), gist unchanged (2026-08-13 12:49), fleet still down.

Verdict: no drift.

## 2026-08-16T13:55Z (run 9)

- No movement: tracked heads unchanged (be6cf898/80f6d90f/52beb140/48b3e2d3),
  gist unchanged (2026-08-13 12:49), fleet still down (same Railway TLS
  mismatch). PRs: none updated since run 8. Baseline note: branch-pattern
  count is 54 not 47 — grep-baseline artifact; all delta branches are old
  (newest commit 2026-07-01). PR #415 (ROLE_CAN_USE on PermissionedResolver,
  Aug 15) touches roles/functions only, zero event declarations —
  informational (we index events only).

Verdict: no drift.

## 2026-08-16T17:02Z (run 10)

- No movement: tracked heads unchanged, branch count 54 (run-9 baseline),
  no PR updates since Aug 15, gist unchanged (2026-08-13 12:49), fleet
  still down.

Verdict: no drift.

## 2026-08-16T20:00Z (run 11)

- No movement: tracked heads unchanged, branch count 54 (baseline), no PR
  updates since Aug 15, gist unchanged (2026-08-13 12:49), fleet still down.
  (First run on 6h cadence; per new policy, no commit for no-drift runs.)

Verdict: no drift.

## 2026-08-17T02:00Z (run 12)

- No movement: tracked heads unchanged, branch count 54 (baseline), no PR
  updates since Aug 15, gist unchanged (2026-08-13 12:49), fleet still down.

Verdict: no drift.

## 2026-08-17T08:00Z (run 13)

- No movement: tracked heads unchanged, branch count 54 (baseline), no PR
  updates since Aug 15, gist unchanged (2026-08-13 12:49), fleet still down.

Verdict: no drift.

## 2026-08-17T14:00Z (run 14) — LIVE BRANCH MOVED (informational, no adaptation needed)

- deploy/sepolia-migration-20260731 moved be6cf898 -> 6cd460ba (merge of
  feat/verifiable-reverse-adapters + gist-baseline PRs #390, #391, #392,
  #402, #410, #411, #413). post-audit-2 / feat/public-resolver / main
  unchanged; no new RC deploy branch; gist unchanged; fleet still down.
- Event-surface diff (git diff be6cf898..6cd460ba over contracts/src):
  - Indexed contracts (PermissionedRegistry, UserRegistry,
    PermissionedResolver, ETHRegistrar): 1-line pragma pins only
    (>=0.8.13 -> 0.8.25, PR #391) — ZERO event/function changes. Our
    eventHandlers and abis/live|rc remain exactly correct.
  - Sole event change in the entire diff: ImplementationApprovalChanged
    REMOVED from ApprovedUpgradeGate.sol — a contract we do not index (the
    gist's announced ApprovedUpgradeGate removal landing).
  - HCA, reverse-registrar, migration/Graveyard, DNS files: not indexed.
- No new address strings in deploy scripts/docs -> no redeployment
  recorded; the branch move is RC-convergence onto the live recipe, not a
  new deployment. If a redeploy follows, addresses will change -> RC-swap
  runbook + test:pins tripwire.

Verdict: drift detected on the live branch; classification informational
(verified no impact on indexed event surface). Includes queued no-drift
runs 11-13.

## 2026-08-17T20:00Z (run 15) — LIVE BRANCH MOVED (informational, no adaptation needed)

- deploy/sepolia-migration-20260731 moved 6cd460ba -> 7c6be3bb: a single
  commit (style: solgrid-format Graveyard.t.sol, a TEST file). Zero
  changes under contracts/src, zero event-declaration changes, zero new
  deploy addresses -> class (c) informational. Other tracked heads,
  branch count (54), gist (2026-08-13 12:49), and fleet (TLS down)
  unchanged.
- PR timestamp churn on Aug 17 (#388 makoto's deploy PR, #415, #354, #337):
  no new comments on #388; #354's head unchanged (52beb140, event surface
  classification stands); #415 already informational (run 9).

Verdict: drift detected on the live branch; classification informational
(test-file formatting only). Baseline updated to 7c6be3bb.

## 2026-08-18T02:00Z (run 16) — RC BASE MOVED (informational, no adaptation needed)

- post-audit-2 moved 80f6d90f -> 2c810c0b (first movement on the RC base):
  a single commit, PR #414 "Add IPermissionedRegistry.getURI()" — a view
  function on PermissionedRegistry + its interfaces. Zero event-declaration
  changes, zero new deploy addresses -> class (c) informational (we index
  events only; the function lands in the ABI at the next RC re-extract per
  the runbook).
- deploy/sepolia-migration-20260731 at 7c6be3bb (matches run 15's
  classification — no new movement); feat/public-resolver and main
  unchanged; branch count 54 (baseline); PRs quiet since Aug 17 11:29;
  gist unchanged (2026-08-13 12:49); fleet still down.

Verdict: drift detected on the RC base; classification informational
(view-function addition, event surface unchanged). Baselines updated:
post-audit-2 = 2c810c0b, live = 7c6be3bb.

## 2026-08-18T08:40Z (run 17) — REDEPLOY-CLASS SIGNAL (ambiguous; issue #1 opened)

- Both tracked branches moved again: live 7c6be3bb -> 892311a7 (merge of
  post-audit-2: #337 reverse adapters, #414 getURI, #405, #403, #407
  renewBatch), RC base 2c810c0b -> 67829cf3 (#376 UR slimming, #337).
  Event surfaces of ALL contracts we index remain byte-identical in both
  diffs (the 6 event-decl changes live exclusively in non-indexed HCA
  contracts; ImplementationApprovalChanged moved from the removed
  ApprovedUpgradeGate to StandaloneHCAFactory).
- Addresses docs diverged: live-branch head records ETHRegistry 0xbdc8…,
  RootRegistry 0x8115…, ETHRegistrar 0xa885…, VerifiableFactory 0x10dc…,
  controllers 0x5c39/0x2fcf; RC base records a third set (0x67b7… + HCA
  contracts at 0x1915/0xaff1/0x67a4/0x1b78 + DefaultReverseRegistrarHCA
  adapter). None match our pins.
- On-chain census (raw eth_getLogs): OUR pinned 0xDEDB registry = 10
  LabelRegistered lifetime (last 11479252), quiet since; 0xbdc8 = 1,410
  LabelRegistered from block 11416357, CONTINUOUSLY active to the chain
  head; 0x67b7 = deployed but dormant. So activity flows through a
  longer-lived parallel generation, NOT a redeploy of ours - and which
  generation is canonical is a product question (gist unchanged, no
  announcement, no new deploy branch).
- Classification: class (b)-adjacent but AMBIGUOUS -> issue opened:
  https://github.com/p-diogo/ens-v2-subgraph/issues/1 (re-pin vs wait vs
  dual-index, with the oracle's 874-vs-10 registrar coverage wrinkle).
- PRs: #398, #388 (makoto), #354 updated today - metadata churn; gist
  unchanged (2026-08-13 12:49); fleet still down. Also noted: `cast logs`
  CLI address+topic filtering silently returns empty on this gateway -
  use raw eth_getLogs (as the harness does).

Verdict: drift detected (redeploy-class signal, ambiguous). Baselines
updated: live = 892311a7, post-audit-2 = 67829cf3. Action: issue #1.

## 2026-08-18T14:00Z (run 18)

- No movement: tracked heads match run 17 baselines (892311a7 / 67829cf3 /
  52beb140 / 48b3e2d3), branch count 54, gist unchanged (2026-08-13 12:49),
  fleet still down. #354 updatedAt bump = metadata churn (head unchanged,
  no new comments). Issue #1 (canonical-generation decision) still open,
  no new evidence this run to advance it.

Verdict: no drift.

## 2026-08-19T02:00Z (run 19) — RC RESOLVER BRANCH MOVED (informational, no adaptation needed)

- feat/public-resolver (PR #354) moved 52beb140 -> 5ef36f1e: merge of
  post-audit-2 + "fix hca, add SharedResolver deploy" + "pin
  SharedResolver". SharedResolver.sol itself changed by a PRAGMA PIN ONLY
  (^0.8.13 -> 0.8.25); PermissionedResolver.sol likewise (via the merge) -
  ZERO event-declaration changes on either resolver, so abis/rc and the
  ResolverRC handler remain exact. The 6 event changes in the diff are the
  known non-indexed HCA set (inherited); the 15 new address lines are the
  SAME HCA/reverse-adapter set catalogued in run 17 (inherited via merge,
  not new deployments). New SharedResolver deploy script = RC-prep signal
  (resolver deploy tooling now exists); no new deploy branch, no
  announcement. Issue #1 remains open; the "pin" commit strengthens the
  RC-imminent read.
- Other tracked heads, branch count (54), gist (2026-08-13 12:49), fleet
  (down) all unchanged.

Verdict: drift detected on the RC resolver branch; classification
informational (pragma pin + deploy-script prep, event surface unchanged).
Baseline updated: feat/public-resolver = 5ef36f1e.
