# ENSv2 drift monitoring — what we run, how to read it, how to run it anywhere

This document is the shareable spec of the automated drift checks that guard
`ens-v2-subgraph` while the ENS v2 contracts move toward the next RC. It has
three parts: **what a drift run does** (and how it decides whether ENS-side
changes affect us), **the exact scheduled prompt** (paste-ready for any AI
harness or scheduler), and **how to schedule it** on each harness.

---

## 1. Why this exists

Our subgraph pins the **live Sepolia beta deployment** (`deploy/sepolia-migration-20260731`)
and pre-implements the **next RC's** resolver model (`feat/public-resolver`, PR #354).
Both are moving targets: ENS merges PRs continuously, has announced breaking
changes ([Makoto's gist](https://gist.github.com/makoto/37d1e78c03c6f608a6bd280a181695d0)),
and will redeploy fresh contracts to Sepolia before mainnet. A change on
their side can silently invalidate our ABIs, event handlers, or pinned
addresses. The drift runs exist so that never happens silently.

## 2. What each run checks (five signals)

| # | Signal | Where | Current baseline |
|---|--------|-------|------------------|
| 1 | Remote heads of the four tracked branches | `git ls-remote` on `ensdomains/contracts-v2` | `deploy/sepolia-migration-20260731` = `6cd460ba` (moved 2026-08-17, run 14), `post-audit-2` = `80f6d90f`, `feat/public-resolver` = `52beb140`, `main` = `48b3e2d3` |
| 1b | New branches matching deploy/rc/audit/resolver/migration | same | count = **54** (a *count* delta alone is not drift — branches must be date-checked, see run 9's false lead) |
| 2 | Event-surface diff on the contracts we index | `git diff <old>..<new> -- contracts/src/{registry,resolver,registrar,registry/interfaces}` | only compare **event declarations** |
| 3 | Open PRs on `ensdomains/contracts-v2` | `gh pr list` | detail-view PRs touching resolver/registry/registrar/events/indexing, or by makoto, or stacked on `post-audit-2`/`feat/public-resolver`; **a patch with no event-declaration changes is informational** (e.g. run 9's #415 `ROLE_CAN_USE`) |
| 4 | Makoto's indexer-breaking gist | gist API `updated_at` | last active **2026-08-13 12:49**; breaking list baseline: PR #354 + merged-not-deployed #374, #389–392, #402–403, #405, #407, #410 |
| 5 | ENSNode hosted fleet (parity oracle) | `curl api.v2-sepolia.ensnode.io/subgraph` | still down (Railway wildcard-cert TLS mismatch); self-hosted ENSIndexer in Docker is the parity oracle meanwhile |

## 3. How a run decides whether ENS-side movement affects us

The classification is deliberately narrow — **only the event surface we
index can make a change "relevant"**, because the mappings are purely
event-sourced (no eth_calls):

- **(a) Impacts us** — a *new* event on a contract we index, or a *changed
  signature* of an event we index. Action: re-extract the ABI
  (`forge inspect` from the `.reference` worktree), update `subgraph.yaml`
  `eventHandlers` + the handler in `src/`, `npx graph test` must pass,
  `npx graph build`.
- **(b) Impacts us (redeploy class)** — a new RC deploy branch or new
  addresses in their deploy artifacts. Action: RC-swap runbook (README §RC
  swap) — re-pin `networks.json` **and** the `src/utils.ts` controller
  constants (`npm run test:pins` fails until they match).
- **(c) Informational** — everything else: non-event changes (pragma pins,
  functions, roles), changes to contracts we don't index (HCA, reverse
  registrar, Graveyard, DNS, ApprovedUpgradeGate), PR activity without
  event changes, branch-count deltas that turn out to be old branches.

**Worked example (run 14, 2026-08-17):** the *live* branch moved
`be6cf898 → 6cd460ba` merging `feat/verifiable-reverse-adapters` and seven
gist-baseline PRs. Diff showed: our four indexed contracts changed by a
one-line pragma pin each (PR #391); the only event change anywhere was
`ImplementationApprovalChanged` **removed** from `ApprovedUpgradeGate.sol`
(which we don't index); no new addresses in deploy artifacts. Verdict:
informational, no adaptation, detailed log entry + push. If a redeploy had
been in the diff, it would have been class (b).

Every run appends a dated verdict to `docs/DRIFT-LOG.md`. No-drift runs
append locally **and never commit** (no commit noise); drift runs write a
detailed entry, implement or open an issue, then commit and push everything
including the queued no-drift entries.

### Hard rules for any runner
- Read-only toward the chain; never push to `ensdomains/*`; never
  `git pull`/`merge` in `.reference/` — the clones carry local patches
  marked `PATCHED` in-file. Read remote state with `git ls-remote`,
  `git show <sha>:<path>`, `git diff <old> <new>` only.
- After any run that observes movement, **update the baselines** in
  whichever copy of the scheduled prompt you run (§4 embeds the current
  ones), or the next run re-flags the same movement.

## 4. The scheduled prompt (paste into any harness's scheduler)

This is the verbatim prompt; it assumes the runner has the repo checked out
at `/Users/pdiogo/Documents/code/ens/ens-v2-subgraph` (adjust the path), a
GitHub token with access to the private repo (`gh auth` as the repo owner's
account), and `git`/`gh`/`curl` available. Full text:

```
Every-6-hours ENSv2 contract-drift check for the ens-v2-subgraph project
(repo: /Users/pdiogo/Documents/code/ens/ens-v2-subgraph, GitHub remote:
https://github.com/p-diogo/ens-v2-subgraph, private). The ENS v2 contracts
are a moving target ahead of the next RC; our subgraph must not drift.

1. In <repo>/.reference/contracts-v2 (clone of ensdomains/contracts-v2), run:
   git fetch origin --quiet. Compare remote heads (git ls-remote origin
   refs/heads/<name> — the clone is shallow) for the branches we track:
   deploy/sepolia-migration-20260731 (live, last known 6cd460ba),
   post-audit-2 (RC base, 80f6d90f), feat/public-resolver (PR #354,
   52beb140 — classified informational: event surface verified identical
   emit-by-emit), main (48b3e2d3). Also list new remote branches whose
   names contain deploy, rc, audit, resolver, or migration. Baseline:
   branch-pattern count is 54; count deltas must be date-checked via gh api
   before counting as movement — old branches renamed/re-counted are not
   drift.

2. If tracked branches moved: for changed .sol files under
   contracts/src/{registry,resolver,registrar,registry/interfaces}, extract
   event declarations (lines starting with "event " through the closing
   paren) and compare against the events we index (subgraph.yaml
   eventHandlers, ABIs in abis/live/ and abis/rc/). Classify:
   (a) NEW events on contracts we index -> impacts us; (b) changed
   signatures of events we index -> impacts us; (c) non-event changes or
   non-indexed contracts -> informational. Use git show <remote-sha>:<path>
   to read files without merging; the clones contain local patches marked
   PATCHED in-file — never lose them, never pull/merge.

3. Check PRs on ensdomains/contracts-v2 (gh pr list -R ensdomains/contracts-v2
   --state open --json number,title,headRefName,author,updatedAt --limit 30;
   detail-view PRs whose titles mention resolver/registry/registrar/events/
   indexing, or authored by makoto, or stacked on post-audit-2/
   feat/public-resolver; patches with no event-declaration changes are
   informational).

4. Fetch Makoto's gist (https://gist.github.com/makoto/37d1e78c03c6f608a6bd280a181695d0)
   — compare its last-active date (last known 2026-08-13 12:49) and
   "Indexer breaking" section (baseline: PR #354 + merged-not-deployed
   #374, #389-392, #402-403, #405, #407, #410) against docs/PLAN.md.

5. Check whether the ENSNode hosted fleet came back:
   curl -s -m 10 https://api.v2-sepolia.ensnode.io/subgraph -X POST
   -H 'Content-Type: application/json'
   --data '{"query":"{ _meta { block { number } } }"}' — a JSON GraphQL
   response (not a TLS error, not "Application not found") means it's back.

Then ACT on findings:
- NOTHING relevant changed: append a one-line dated entry "no drift" to
  docs/DRIFT-LOG.md (local file only) and stop. Do NOT commit, do NOT push;
  accumulated no-drift entries ride along in the next drift commit.
- RELEVANT changes exist (new/changed events on indexed contracts, gist
  updated with indexer-breaking notes, a new RC deploy branch, or the fleet
  came back): (1) append a detailed dated entry to docs/DRIFT-LOG.md with
  the impact classification; (2) if the adaptation is unambiguous and
  self-contained, implement it — re-extract ABIs with forge inspect into
  abis/live/ or abis/rc/ (the .reference worktrees have submodules
  installed and build with forge build), update subgraph.yaml eventHandlers
  and the affected handler in src/, run npx graph test (must pass) and
  npx graph build; (3) for ambiguous/product-level changes, open a GitHub
  issue in the private repo instead AND cross-reference it from the
  DRIFT-LOG entry. Drift runs commit and push everything (including
  accumulated no-drift entries) via git push origin main. After a run that
  observed movement, update the "last known" values in this scheduled
  prompt so the next run doesn't re-flag it. Never leave a relevant change
  without either an implemented adaptation or an issue.

Notes: gh is authenticated with a private-repo token; keep the run
read-only toward the chain; never push to ensdomains repos; pushing to the
private repo is expected on drift-detection runs only.
```

## 5. How it's scheduled — and how to run it on any harness

The check itself is harness-agnostic: it is a *prompt* plus repo-local
state (`docs/DRIFT-LOG.md` holds the history; the prompt holds the
baselines). Anything that can (a) wake on a cron and (b) hand the prompt to
an agent with shell + `gh` + `git` access to the repo can run it.

**There is no separate spec-and-dispatch step, by design.** A fired run is
itself the implementation agent: when the classification says "impacts us"
and the adaptation is unambiguous, the *same run* re-extracts the ABI,
edits `subgraph.yaml` + the handler, runs `npx graph test` as a gate,
builds, commits, and pushes. The only path that emits a spec instead of
code is the deliberate one for ambiguous/product-level changes (GitHub
issue with context, proposed approach, acceptance criteria) — a spec for a
human or a later session, not a dispatch queue. A scheduler that only
performs a one-shot model call without tools would degrade this to
analysis-only; use a harness/CLI mode that gives the run an agentic
session (that is the default for the options below except the Actions
fallback).

- **Any harness with a built-in scheduler** (scheduled tasks / cron
  feature): create a task with cron `0 */6 * * *` whose prompt is the §4
  text. History and baselines live in the repo, not in the scheduler, so
  the automation is disposable — recreating it anywhere is just pasting the
  §4 prompt into that harness's scheduler with the same cron.
- **Claude Code / Codex / Cursor / any agent harness with scheduled
  prompts:** create a scheduled task with cron `0 */6 * * *` whose prompt is
  the §4 text. If the harness has no native scheduler, run it under plain
  `cron`/`launchd` by invoking the harness's headless CLI on the prompt
  file (every major harness has one), e.g. drop the prompt into
  `scripts/drift-prompt.txt` and cron
  `<harness-cli> --prompt "$(cat scripts/drift-prompt.txt)"`.
- **Fully harness-free fallback (detection only):** steps 1, 4 and 5 are
  plain shell (`git ls-remote`, gist API, `curl`) and can run as a GitHub
  Actions scheduled workflow on the private repo, opening an issue on
  movement. That covers detection when nobody's machine is awake; the
  event-diff classification (steps 2–3) and any adaptation still want an
  agent, so keep at least one scheduled agent runner as well.
- **One runner at a time:** the log is append-only and runs are
  idempotent-ish, but concurrent runners would double-append — stagger
  cron schedules (e.g. offset by 1h) or agree on a single primary runner
  per timezone window.

### What colleagues need to reproduce a run
1. Clone the private repo (incl. gitignored `.reference/contracts-v2`,
   re-cloned from `ensdomains/contracts-v2` — the run only reads it).
2. `gh auth login` with an account that can read the private repo.
3. Run the §4 prompt manually once (no scheduler needed) — the output is
   the same: a `docs/DRIFT-LOG.md` verdict plus, on drift, an adaptation or
   an issue.

See `docs/DRIFT-LOG.md` for the full run history (runs 1–14 at time of
writing) and `docs/DIVERGENCES.md` for the semantic ledger the runs
protect.
