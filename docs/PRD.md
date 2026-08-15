# PRD — ens-v2-subgraph

**Status:** Implemented and verified (2026-08-15). This documents what was
built, why each decision was made, and the verified outcomes, so downstream
readers can understand what came out of this work and reproduce it
(step-by-step: `docs/REPRODUCTION.md`).

---

## 1. Problem

ENSv2 shipped to Sepolia public beta on 2026-08-12 with **no GraphQL data
path**. The legacy v1 subgraph — the interface every ensjs/GraphQL-shaped ENS
integration is built against — cannot see v2 names by design. ENS's own docs
point at the legacy subgraph; the third-party alternatives (ENSNode, Big
Name) had no hosted offering at the time this was built (ENSNode's entire
hosted fleet 404s; Big Name is stopped mid-rewrite). The ecosystem's most
compatible read interface (the v1 subgraph schema) therefore has no
implementation over v2 data.

## 2. Product goal

**One subgraph, indexing the ENSv2 Sepolia beta, exposing the v1 ENS subgraph
schema byte-for-byte** — a drop-in read path for existing consumers, and the
v2 building block for a later cross-chain proxy (graph-client/Cloudflare
Worker composing v1+v2 subgraphs into one virtual interface — explicitly a
separate milestone).

Non-goals: indexing v1 Sepolia contracts (compositional, not duplicated);
resolution (CCIP-Read is not a subgraph concern); mainnet (no v2 deployment
yet).

## 3. Requirements

| # | Requirement | Verification |
|---|---|---|
| R1 | Schema identical to `ensdomains/ens-subgraph` master | L0: byte-diff + v1 query corpus validated against the served introspection |
| R2 | v1 consumer queries work unchanged | L0 corpus incl. the subgraph README's own example |
| R3 | All v1 entities populated for v2 data | L1 matchstick per handler; L2 devnet e2e |
| R4 | Correct against chain truth | L3 on-chain parity (`findExpiry` etc.) |
| R5 | Comparable to an independent v2 indexer | L3 ENSNode parity (self-hosted ENSIndexer) |
| R6 | Survives the RC redeploy (Makoto's gist) with address-only changes | L2 RC-devnet e2e with the same wasm |
| R7 | Deterministic, dependency-light indexing | Pure event-sourcing, zero `eth_call` |

## 4. What was built

### 4.1 Scope of indexing

The official beta deployment (docs table addresses, verified on-chain via
`eth_getCode`; RootRegistry discovered via `ETHRegistry.getParent()`):

| Contract | Address | startBlock (pinned empirically) |
|---|---|---|
| ETHRegistry | 0xDEDB92913A25abE1f7BCDD85D8A344a43B398B67 | 11465480 (first log 11465484, 2026-08-11) |
| RootRegistry | 0xc960F7217d3643B525Ef36Bec8Adf86953CD9aB8 | 11465480 (silent so far) |
| ETHRegistrar | 0x8c2E866B439358c41AE05De9cbE8A00BFEFafFcA | 11479218 (first log 11479222, 2026-08-13) |
| VerifiableFactory | 0xD2a632D8a8b67c2c4398c255CbD7aF8dd7236198 | 11465480 (active since June — alpha era) |

Plus dynamic templates: `Subregistry` (UserRegistry proxies),
`ResolverLive` (PermissionedResolver), `ResolverRC` (SharedResolver — the PR
#354 model). Discovery is lazy-first: `ResolverUpdated`/`SubregistryUpdated`
spawn templates; `ProxyDeployed` pre-spawns both resolver generations for
factory-deployed proxies (deploy-tx log order makes that race-free).

### 4.2 Mapping architecture (v1 semantics, v2 events)

- `Domain.id` = ENSIP-1 namehash (never v2's mutable tokenId). Namehash
  derivation uses registry anchors: constants for root/eth;
  `_RegistryAnchor` entities for dynamically linked subregistries
  (`SubregistryUpdated` is authoritative); `_TokenId` maps
  `(registry, tokenId) → node` and survives `TokenRegenerated`.
- v1 `ensRegistry.ts` semantics ported exactly: load-or-create, first-parent
  `subdomainCount` increments, `recurseDomainDelete` pruning, `[labelhash]`
  name fallback for invalid labels, event-entity ids `blockNumber-logIndex`.
- Registrar → `Registration` (id = labelhash) with v1's `Domain.expiryDate =
  expiry + 90d grace` (verified on-chain to the second).
- Resolver record events (both generations) → shared v1 `Resolver` entities
  (`id = <address>-<node>`; `texts`/`coinTypes` arrays; `VersionChanged`/
  `Cleared` wipe semantics; `AddrChanged` mirrors `Domain.resolvedAddress`).
- `isMigrated` repurposed: true iff `LabelRegistered.sender` is a migration
  controller.

### 4.3 RC-proofing (respects Makoto's gist)

The gist's indexer-breaking change (PR #354: resolver event model replaced by
`SharedResolver`, recordId-keyed) is handled by indexing **both generations
side by side**: every discovered resolver gets both templates; only one
emits. In the actual PR implementation `recordId == uint256(namehash)`, so
the RC adapter is a near-1:1 rename mapping — no `_RecordLink` staging was
needed (Linked is resolution-time aliasing only). **Proven**: the identical
compiled wasm passed the full e2e suite against local devnets of BOTH the
live branch (`deploy/sepolia-migration-20260731`) and `feat/public-resolver`
(PR #354). When the RC lands, the swap is `networks.json` address/startBlock
re-pin + test re-run (runbook in README).

### 4.4 Verification pyramid (TTD)

| Level | What | Result (2026-08-15) |
|---|---|---|
| L0 schema | byte-diff + live-introspection corpus | green (corpus includes the README example, fixed for its own staleness) |
| L1 unit | 17 matchstick tests, red→green per handler | green |
| L2 e2e | contracts-v2 devnet (`--testNames`) → gnd → 30+ assertions | green on live branch AND pr354 branch |
| L3 on-chain | `findExpiry(label)` vs Registration/Domain expiry, every 2LD | 10/10 green on the live beta |
| L3 ENSNode | self-hosted ENSIndexer (sepolia-v2, SUBGRAPH_COMPAT) record-level diff | see §6 |

## 5. Key decisions (and their one-line rationales)

1. **Verbatim v1 schema** (vs superset) — strictest retrocompat; internal
   bookkeeping lives in an invisible `_`-prefixed block (graph-node hides
   underscore entities from the API).
2. **v2-only scope** (vs also indexing v1 Sepolia) — each subgraph is narrow;
   the future proxy composes.
3. **Pure event-sourcing, zero eth_calls** — deterministic, reorg-safe,
   no archive RPC; the factory/lazy-spawn design closes the discovery blind
   spot without backfill (v1 itself was event-only, so behavior is
   v1-faithful, not degraded).
4. **Both resolver generations compiled in** — the RC swap becomes a re-pin.
5. **Oracles: on-chain first** — chain truth is always available; ENSNode's
   hosted fleet was down (all instances 404), so a self-hosted ENSIndexer is
   the behavioral oracle.
6. **gnd for local dev** — one-command graph-node with embedded Postgres
   (needs `initdb` on PATH: `/opt/homebrew/opt/postgresql@16/bin`).

## 6. Self-hosted ENSNode parity (the behavioral oracle)

Setup (reproduced in `docs/REPRODUCTION.md`): Namehash's archived monorepo
(`namehash/ensnode`), `pnpm install`, `apps/ensindexer` run with
`NAMESPACE=sepolia-v2`, `SUBGRAPH_COMPAT=true`, a local Postgres, and a
not-found ENSRainbow mock (healing is hard-required; unhealed labels are fine
for parity scope because beta labels are event-carried). Their sepolia-v2
datasource pins the same official beta addresses we index, making it a valid
oracle. Local patches (documented in the reference clone): startBlocks
raised to the beta window to skip 7.7M blocks of v1 test-deployment history
that our v2-only subgraph intentionally doesn't index.

Comparison semantics: for every .eth 2LD present in our subgraph, compare
`name`, `labelName`, `owner`, `registration.expiryDate`,
`registration.labelName` against ENSIndexer's subgraph-compat API at its
indexed head; only `docs/DIVERGENCES.md` ledgered differences are suppressed.

## 7. Outcomes & artifacts

- `ens-v2-subgraph` repo (this one): manifest, mappings, ABIs (live + RC),
  networks.json (pinned, RC-swap source of truth), test pyramid, harnesses,
  docs (PLAN, DIVERGENCES, PRD, REPRODUCTION).
- Live indexing of the beta verified with zero indexing errors and exact
  on-chain expiry parity (10/10 names).
- Findings that shape the ecosystem conversation: ENSNode's hosted fleet is
  fully down while docs advertise it; the beta has no user resolvers yet;
  resolver deployment does not use VerifiableFactory; 2LDs cannot be
  unregistered in v2; ENS's own testNames reregister flow breaks on the
  90-day grace period.
- Drift monitoring: hourly check of `ensdomains/contracts-v2` (commits, PRs,
  Makoto's gist) with implement-or-log escalation — see README §Monitoring.

## 8. Future work

1. graph-client/Cloudflare-Worker proxy composing v1+v2 subgraphs (next
   milestone).
2. Deploy the subgraph to a hosted graph-node or The Graph Studio when a
   stable RC lands; mainnet at v2 launch (re-pin).
3. Snapshot-equivalency at scale once beta activity grows (the harness is
   re-runnable; today's dataset is exhaustive).
