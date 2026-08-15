# Drift Log

Standing record of ENS contracts-v2 changes that could impact this subgraph,
maintained by the hourly drift automation (created 2026-08-15). Entries are
either "no drift" one-liners, detailed drift analyses, or ACTION-NEEDED items
(tracking until the repo has a GitHub remote for real issues).

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
