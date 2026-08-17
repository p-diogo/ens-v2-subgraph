# ens-v2-subgraph

An ENSv2 subgraph for the Sepolia public beta (deployed 2026-08-11) that
speaks the **v1 ENS subgraph schema byte-for-byte**: every ensjs/GraphQL-shaped
consumer keeps working against ENSv2 data by pointing at this subgraph.

- Schema: `ensdomains/ens-subgraph` `schema.graphql` verbatim + an invisible
  `_`-prefixed internal block (graph-node does not expose underscore entities).
  Enforced by `harness/schema.test.ts`.
- Mappings: pure event-sourcing, zero `eth_call`s — deterministic, reorg-safe,
  no archive-RPC dependency (rationale: Decision #6 in `docs/PLAN.md`).
- Both resolver generations indexed side by side: today's live
  `PermissionedResolver` events AND the RC `SharedResolver` model
  (PR #354, branch `feat/public-resolver`) — proven against both devnets with
  the same wasm.

## Quick start

```bash
bun --version 2>/dev/null || npm i -g bun   # for the contracts devnet
npm install

# local dev against live Sepolia (plain RPC is enough)
bash scripts/dev.sh            # builds + runs gnd on :8000
# -> http://localhost:8000/subgraphs/name/subgraph-0

# unit tests (matchstick, 62 tests incl. both resolver generations)
npm run test                   # = graph test

# harness suites (node-side)
npm run typecheck              # tsc over harness/ (strict)
npm run test:schema            # L0 schema byte-diff + corpus (needs gnd from dev.sh)
npm run test:pins              # src/utils.ts controller pins == networks.json

# other package scripts: codegen, build (graph build), deploy:studio

# L2 e2e on a local anvil devnet with real ENSv2 contracts
bash scripts/e2e-chain.sh up   # devnet :8545 + gnd :8001 (needs :8000 free)
bash scripts/e2e-chain.sh test
bash scripts/e2e-chain.sh down

# L3 parity
GND_GRAPHQL=http://localhost:8000/subgraphs/name/subgraph-0 \
  npx tsx harness/onchain-parity.test.ts          # on-chain ground truth
GND_GRAPHQL=... npx tsx harness/ensnode-parity.test.ts  # ENSNode oracle (self-host: docs/REPRODUCTION.md par5)
```

## Repository map

```
subgraph.yaml          hardcoded to the official beta deployment (sepolia)
networks.json          pinned addresses/startBlocks (source of truth; RC swap = edit here)
schema.graphql         v1 schema verbatim + internal block (see harness/schema.test.ts)
abis/live/             from contracts-v2 @ deploy/sepolia-migration-20260731
abis/rc/               from contracts-v2 @ feat/public-resolver (PR #354)
src/registry.ts        registry events -> Domain tree (v1 ensRegistry.ts semantics)
src/registrar.ts       ETHRegistrar events -> Registration (+90d grace, v1 constant)
src/resolverLive.ts    live PermissionedResolver record events -> Resolver
src/resolverRC.ts      RC SharedResolver recordId-keyed events -> Resolver
src/factory.ts         VerifiableFactory ProxyDeployed -> template pre-spawn
src/internals.ts       _RegistryAnchor / _TokenId / root+eth seeding
tests/*.test.ts        matchstick unit tests (red-green per handler)
harness/               node-side suites + shared lib (schema, e2e, parity, pins)
scripts/               dev.sh, e2e-chain.sh, gen-devnet-networks.py, rainbow-mock.cjs
docs/PLAN.md           the approved plan (context, decisions, timeline)
docs/DIVERGENCES.md    known-divergence ledger (read this before comparing data)
docs/DRIFT-MONITORING.md shareable spec of the automated drift checks (run it on any harness)
AGENTS.md             instructions for coding agents (commands, hard rules, gotchas)
.reference/            ens-subgraph + contracts-v2 clones (gitignored)
```

## The RC-swap runbook (when ENS redeploys Sepolia)

1. Update `networks.json` `sepolia` addresses/startBlocks from the new
   deployment (Etherscan first-tx or the contracts repo's addresses doc).
   ALSO re-pin the `LOCKED/UNLOCKED_MIGRATION_CONTROLLER` constants in
   `src/utils.ts` (graph-ts cannot read networks.json at runtime);
   `npm run test:pins` fails until the two match again.
2. `npx graph build` — addresses in `subgraph.yaml` must match networks.json
   (they are hardcoded; graph-cli 0.98's `--network` write-back makes
   mustache templates unusable).
3. If event ABIs drifted: re-extract with `forge inspect` from the new branch
   into `abis/live|rc/`, adjust the affected handler, `npm run test`.
4. Re-run the pyramid: unit -> `scripts/dev.sh` + `npm run test:schema` ->
   on-chain parity. Resolver generation flips automatically (both templates
   are already deployed by `ResolverUpdated`/`ProxyDeployed`).
5. Full dress rehearsal: `E2E_WORKTREE=<contracts checkout at the new branch>
   bash scripts/e2e-chain.sh up && bash scripts/e2e-chain.sh test`.

## Findings worth knowing (all verified on-chain)

- The beta deployment went live 2026-08-11 (ETHRegistry first log block
  11465484); the 10 initial names are ENS-internal setup registrations
  (senders are system addresses), registered via the registrar with
  MockUSDC pricing.
- The 3 observed `ResolverUpdated` events reference internal deployment
  tokens — no beta user name had a resolver as of 2026-08-15.
- The beta's resolvers were NOT deployed through VerifiableFactory (zero
  factory logs since the beta batch) — lazy template spawning from
  `ResolverUpdated` is the primary discovery path.
- ENSv2 2LDs cannot be unregistered; the fixture "unregistered" flow targets
  subnames. `sub.test.eth`-style names can exist as resolver-level aliases
  only (no Domain).
- contracts-v2's own `testNames` reregister flow assumed expired==available;
  the 90-day .eth grace period breaks that (patched in `.reference`, and a
  warning the official docs themselves make).
- graph-cli 0.98 toolchain quirks, all worked around and documented in code:
  AS compiler crash on null-equality with nullable `Bytes/ByteArray`
  (use truthiness), matchstick 0.6 mangling uint256-scale mock params, and
  the `--network` build writing templates back into the source manifest.

## Drift monitoring

An automated check runs every 6 hours against ENS's contracts repo (tracked
branch heads, event-surface diffs, PRs, the breaking-changes gist, and the
ENSNode fleet) and classifies anything that moved. Verdict history lives in
`docs/DRIFT-LOG.md`; the full spec is `docs/DRIFT-MONITORING.md`.

**How it runs (harness-agnostic by design).** The check is a prompt plus
repo-local state, so it is not tied to any single tool: schedule it on
whatever AI harness you use (scheduled tasks / cron features, or a headless
CLI under plain cron) — the paste-ready prompt and per-harness recipes are
in `docs/DRIFT-MONITORING.md` §4–5. A fired run is itself the implementation
agent: unambiguous drift is adapted inline in that run (ABI re-extract via
`forge inspect`, `subgraph.yaml` + handler updates, `npm run test` gate,
build, commit, push), ambiguous changes become a GitHub issue with a
proposed approach, and no-drift runs only append to the local log without
committing. A scheduler that makes bare one-shot model calls (no tools)
would degrade it to analysis-only — run it in an agentic session. Coding
agents working in this repo should read `AGENTS.md`.

## Status

Milestones M0–M7 of `docs/PLAN.md` are complete: schema contract enforced,
unit coverage across every handler family (registry incl. TransferBatch/
TokenRegenerated/Root flows, registrar, both resolver generations — the five
manifest-mandated no-op handlers have nothing to test by design, see
DIVERGENCES G2), live-Sepolia indexing verified with on-chain parity, and
both the live and RC contract generations proven on real local devnets. Next milestone (separate session): the graph-client/Cloudflare-Worker
proxy composing v1+v2 subgraphs into one virtual interface.
