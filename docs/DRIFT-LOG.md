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
