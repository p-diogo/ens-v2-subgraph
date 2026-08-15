# ENSv2 Subgraph on Sepolia Beta — v1-RetroCompatible, TDD-Verified, RC-Proof

> **Key reference — Makoto's gist (breaking changes, live Sepolia vs next RC):**
> https://gist.github.com/makoto/37d1e78c03c6f608a6bd280a181695d0
> (anchor: `#-indexer-breaking-resolver-event-model-replaced-pr-354`)

## TL;DR / Executive Summary

**What we build**: `ens-v2-subgraph` — ONE subgraph (one codebase, one exposed schema) indexing the **ENSv2 Sepolia public-beta deployment (live Aug 12, 2026)** with a GraphQL schema that is **byte-for-byte the v1 ENS subgraph schema** (`ensdomains/ens-subgraph`) — a drop-in read interface for every ensjs/GraphQL-shaped consumer, covering the v2 data the legacy subgraph will never see. Local dev/test on **gnd**. **Mappings are purely event-sourced — zero eth_calls in the subgraph** (deterministic, reorg-safe, no archive-RPC dependency for indexing; eth_calls remain only in the external parity harness). Long-term (next session): a graph-client/Cloudflare-Worker proxy composes N subgraphs × M chains into one virtual interface.

**How the implementation respects [Makoto's gist](https://gist.github.com/makoto/37d1e78c03c6f608a6bd280a181695d0)** (the confirmed breaking changes between live Sepolia and the next RC):
1. **Resolver event model replaced (PR #354) → dual-generation resolver layer.** We index *both* event generations in the same manifest, keyed by contract address: `ResolverLive` (today's `PermissionedResolver`: `AddressChanged`/`TextChanged`/`Named*`/`AliasChanged` — what's on Sepolia now) and `ResolverRC` (the `SharedResolver` `recordId` model: `AddressUpdated`/`TextUpdated`/`ContentHashUpdated`/`Linked`/`Cleared`/…). Handlers converge on the same entity writes, so when the RC lands the swap is a `networks.json` re-pin + regression re-run, not a rewrite.
2. **`Linked` replaces the alias mechanism → `_RecordLink` internals.** recordId→node binding is built from `Linked` events (authoritative; no on-chain reverse getter is needed or used). Versioning (`recordVersions`) is treated as dropped, exactly per the gist.
3. **Branch-pinned ABIs via `forge inspect`** — the gist's own recommended machine-readable handoff: `abis/live` from `deploy/sepolia-migration-20260731` (PR #388), `abis/rc` from the integration branch. Registrar ABI already includes RC `renewBatch()`.
4. **"The diff will drift" → the TDD regression suite is the absorber.** Every handler has Matchstick tests + e2e fixtures + parity checks; re-extracting ABIs and re-running is the documented RC-swap runbook. RC-only items that don't affect indexing (UniversalResolver slimming/`UniversalHelper`, on-chain IENSIP15 normalization, `ApprovedUpgradeGate` removal) are explicitly non-goals for the subgraph.
5. **RC-branch testing happens pre-deploy** on a local `anvil` chain running the integration-branch deployment (same local-fork discipline the Immunefi competition requires), so the RC adapter is proven before the RC ever hits Sepolia.

**Verification (TTD)**: L0 schema byte-diff + v1 query corpus → L1 Matchstick per handler → L2 forge-driven fixtures (MockUSDC has permissionless `mint()`) → L3 parity: exhaustive snapshot-diff vs **ENSNode v2-Sepolia** (behavioral oracle, self-host fallback — its TLS cert is currently broken) and **on-chain `cast` ground truth in the external harness** (always available), with an explicit known-divergence ledger.

**Persistence**: this plan is saved verbatim as `docs/PLAN.md` in the new repo at M0; the spec decisions built along the way (semantic mappings, divergence ledger, RC-swap runbook) land in `docs/` + README so plan and spec travel with the code.

---

## Timeline — how it actually works

**We are NOT building different versions of a subgraph over time.** We build one subgraph once. What changes over time is *which contract generation is live on Sepolia*, and our code absorbs that via an adapter layer, not rebuilds:

- **Today (live)**: ENSv2 contracts deployed Jul 31 (`deploy/sepolia-migration-20260731`). The beta app uses them now.
- **Later (RC)**: ENS will redeploy fresh contracts to Sepolia (post-audit, ≥ mid-Sep) containing ~10 merged PRs incl. the resolver event-model replacement. Each Sepolia redeploy starts a **fresh registry** (alpha names didn't survive into beta), so there is **no data migration** — we re-index from the new deployment block (days of testnet data, tiny range).
- **Our subgraph** exposes a fixed schema (v1) and ships **both resolver handler generations compiled in**, selected by contract address in the manifest. When the RC lands: update `networks.json` (addresses + start blocks), re-run the full regression suite. Hours, not a rewrite.
- **We test the RC before ENS deploys it** by deploying the RC branch ourselves on a local `anvil` chain and running the same e2e fixtures (M4b).
- **If further iterations land** (the gist warns "the diff will drift"): same loop — `forge inspect` re-extract ABIs, adjust the affected handler, re-run suite. Repeats until contracts freeze for mainnet; the same subgraph then points at the mainnet deployment. Sepolia is the proving ground, mainnet is the production target.

**Calendar**:
- **Days 1–3 (~Aug 14–17)**: M0–M3 — schema-verified, registry+registrar indexing **live Sepolia**, on-chain parity. Demoable on gnd for the Aug 19 kick-off.
- **~Aug 21**: M4a + M5 — full **live-contract** coverage (resolvers, subdomains, migrations).
- **~Aug 28**: M6 — complete parity harness + divergence ledger; M4b RC adapter proven on anvil.
- **RC lands on Sepolia (during/after audit window Aug 18–Sep 14)**: re-pin + full regression re-run — hours.
- Framing for the call: the TDD harness is the deliverable that makes ENS's confirmed event churn cheap to absorb.

---

## Context (verified this session)

- **The beta**: ENS App + Explorer public beta on Ethereum Sepolia Aug 12, 2026 (blog: https://ens.domains/blog/post/ensv2-beta-public-testing; fresh v2 registry, v1-upgrade flow for eligible Sepolia v1 names, MockUSDC payments with permissionless `mint()`). Immunefi audit competition Aug 18–Sep 14; mainnet only after.
- **Moving target**: live Sepolia = `deploy/sepolia-migration-20260731` (PR #388); ten merged PRs not yet deployed; [gist diff](https://gist.github.com/makoto/37d1e78c03c6f608a6bd280a181695d0) = 64 files in `contracts/src`.
- **Mappings CAN make static eth_calls** (graph-ts `Contract.bind()` + `try_` variants, resolved at the event's block) — but **we choose not to use them in mappings**. Every v1-schema datum is event-sourced; the deploy-ordering blind spot is closed by factory-watching instead (see Decisions). Benefits: determinism, reorg-safety, no revert-detection variance across RPC clients, no archive-grade RPC needed for indexing. Caveat kept for the harness: ENSv2 expired-name views mask state (`getOwner/getResolver/ownerOf` return zeros when expired), so the external parity verifier compares only raw-returning getters (`getExpiry/getTokenId`) plus log-derived truth.
- **Sepolia v2 deployments (live)**: `ETHRegistry 0xDEDB92913A25abE1f7BCDD85D8A344a43B398B67`, `ETHRegistrar 0x8c2E866B439358c41AE05De9cbE8A00BFEFafFcA`, `VerifiableFactory 0xD2a632D8a8b67c2c4398c255CbD7aF8dd7236198`, `PermissionedResolverImpl 0xdcE5205A…`, `UserRegistryImpl 0x0F99e7Ea…`, migration controllers `0xF91c34ED…` (locked) / `0x056138Ef…` (unlocked). Start blocks unpublished — pin via Etherscan first-tx (beta began Aug 12; tiny ranges).
- **Indexing model** (official "Indexing ENSv2" page): hierarchical registries; `LabelRegistered(tokenId, labelHash, label, owner, expiry, sender)` canonical; ERC1155 `TransferSingle/Batch` for ownership; mutable token IDs (never key by tokenId); `SubregistryUpdated` authoritative parent→child link; proxies discovered via `VerifiableFactory.ProxyDeployed` (deploy-tx log order: `Upgraded → RegistryCreated → EACRolesChanged → ProxyDeployed` — spawning templates at `ProxyDeployed` captures all later record events; the pre-`ProxyDeployed` logs map to no v1 entity); migrations arrive as registry `LabelRegistered` with `sender` = migration controller.
- **v1 schema target** (`ensdomains/ens-subgraph/schema.graphql`): `Domain`, `Account`, `Resolver`, `Registration`, `WrappedDomain` + ~22 event entities; `Domain.id` = namehash; resolver records via dynamic templates (same pattern we need).
- **Parity oracles today**: ENSNode `api.v2-sepolia.ensnode.io` (ENSv1+v2, experimental) — TLS cert currently invalid; Big Name hosted = 502 (stopped mid-rewrite). On-chain reads always available (harness-side).
- **Local env (verified installed)**: `gnd` (graph-cli compat 0.98.1), `graph` 0.98.1, docker+compose, foundry 1.4.4 (`forge`/`cast`/`anvil`), node 22, pnpm, bun.

## Decisions (defaults — override on approval if desired)

1. **Parity**: ENSNode v2-Sepolia (behavioral; self-host ENSIndexer fallback if TLS stays broken) + cast/RPC on-chain ground truth in the harness. Big Name = optional best-effort flag.
2. **Schema**: **verbatim v1** `schema.graphql`; additive v2 fields deferred.
3. **Scope**: **ENSv2 contracts only** (beta deployment). v1-on-Sepolia stays with the existing v1 subgraph; the future proxy composes.
4. **Testing**: full TDD pyramid — Matchstick unit + forge fixtures e2e + block-pinned parity snapshots.
5. **Moving-target strategy**: dual-generation resolver support (M4a live / M4b RC-on-anvil), both in the manifest keyed by contract address.
6. **Pure event-sourcing — zero eth_calls in mappings.** The `VerifiableFactory` fixed data source is load-bearing: templates spawn at `ProxyDeployed` (last log of a proxy's deploy tx), capturing every record event from deploy onward. Lazy spawning from `SubregistryUpdated`/`ResolverUpdated` remains the fallback. Known, documented gap: exotic custom registries/resolvers deployed outside the canonical factory may miss records set before their first linking event (divergence ledger). No self-healing — handler bugs = fix + re-index (minutes on a days-old testnet).

## Deliverable: `ens-v2-subgraph` at `/Users/pdiogo/Documents/code/ens/ens-v2-subgraph`

```
ens-v2-subgraph/
├── subgraph.yaml          # network: sepolia; conservative specVersion; templates
├── networks.json          # live-branch addresses + pinned startBlocks (re-pin on RC)
├── schema.graphql         # VERBATIM copy from ens-subgraph
├── abis/
│   ├── live/              # forge inspect @ deploy/sepolia-migration-20260731
│   └── rc/                # forge inspect @ integration branch (SharedResolver…)
├── src/
│   ├── registry.ts        # registry events → Domain tree + v1 event entities
│   ├── registrar.ts       # CommitmentMade/NameRegistered/NameRenewed (+renewBatch ABI) → Registration
│   ├── resolverLive.ts    # M4a: AddressChanged/TextChanged/Named*/AliasChanged handlers
│   ├── resolverRC.ts      # M4b: *Updated/Linked/Cleared handlers (recordId model + staging buffer)
│   ├── factory.ts         # ProxyDeployed → classify + spawn correct resolver/subregistry template
│   └── internals.ts       # _RegistryAnchor(registryAddr→parentName), _TokenResource, _RecordLink(recordId→node), _PendingRecord staging
├── tests/
│   ├── schema/            # L0: byte-diff vs v1 + v1 query-corpus validation
│   ├── unit/              # L1: matchstick per handler (both resolver generations)
│   ├── e2e/               # L2: forge fixtures on live Sepolia AND on local anvil RC chain
│   └── parity/            # L3: on-chain verifier (cast, external) + ENSNode adapter (+ Big Name flag)
├── docs/                  # PLAN.md (this plan, saved at M0), spec decisions, RC-swap runbook
├── scripts/               # dev.sh, pin-blocks.sh, fixtures.sh, rc-anvil.sh, parity.sh
└── package.json           # npm (matches totalreclaw convention)
```

### Data sources
- **VerifiableFactory** (fixed, **load-bearing**): `ProxyDeployed(sender, proxy, salt, implementation)` — classify proxy by comparing `implementation` against known impls (per branch) and spawn templates immediately; deploy-tx log order guarantees subsequent record events are captured.
- **ETHRegistry** (fixed): `LabelRegistered`, `LabelReserved`, `LabelUnregistered`, `ExpiryUpdated`, `SubregistryUpdated`, `ResolverUpdated`, `TokenRegenerated`, `TokenResource`, `RegistryCreated`, `TransferSingle`, `TransferBatch`, `EACRolesChanged`.
- **ETHRegistrar** (fixed): `CommitmentMade`, `NameRegistered`, `NameRenewed` (ABI includes RC `renewBatch`).
- **Templates**: `Subregistry` (PermissionedRegistry), `ResolverLive` (PermissionedResolver), `ResolverRC` (SharedResolver) — plus lazy spawning from `SubregistryUpdated`/`ResolverUpdated` for non-factory contracts.
- RootRegistry address: pin at M0 via one-time `cast call ETHRegistry.getParent()` + docs `llms-full.txt` + Etherscan (setup tooling only, not runtime mappings).

### Key semantic mappings (README + tests)
| v1 field | v2 source | Notes |
|---|---|---|
| `Domain.id` | namehash(name) via `_RegistryAnchor` | NEVER tokenId (mutable) |
| `Domain.name/labelName` | `label` + parent name | v1 unnormalized-label semantics |
| `Domain.owner/registrant` | ERC1155 `TransferSingle/Batch` | mint from=0, burn to=0 |
| `Domain.expiryDate` | `ExpiryUpdated` + registrar events | populated for ALL names (superset) |
| `Domain.isMigrated` | `LabelRegistered.sender ∈ {migration controllers}` | repurposed: v1→v2 migrated = true |
| `Resolver.*` | live: `*Changed`/`Named*` · RC: `*Updated` via `_RecordLink` from `Linked`, with `_PendingRecord` staging when a record update precedes its `Linked` event | both converge on same writes; `texts`/`coinTypes` arrays like v1 |
| `Registration.cost` | registrar `base + premium` (paymentToken units) | documented divergence vs v1 ETH wei |
| `WrappedDomain`/`fuses`/`wrappedOwner` | — (no NameWrapper in v2) | permanently null — documented |
| aliases (RC) | `Linked` → resolver-level only; indexed records = stored state | mirrors official "aliases shadow records" caveat |

## TDD milestones (red→green each)

- **M0 Scaffold + pin + persist plan**: git init; scaffold; **save this plan verbatim as `docs/PLAN.md`** (including the gist link); clone `ens-subgraph` → `.reference/`; clone ENSv2 contracts repo at both branches → `forge inspect` ABIs into `abis/live` + `abis/rc`; pin addresses + start blocks (Etherscan first-tx; `cast` verify); `gnd dev --ethereum-rpc sepolia:$SEPOLIA_RPC` smoke (no archive needed for indexing); `scripts/rc-anvil.sh` = anvil chain + RC-branch deploy for M4b e2e.
- **M1 L0 schema contract (RED→GREEN)**: schema byte-diff test vs v1 → copy verbatim; v1 query corpus (docs.ens.domains/web/subgraph + ensjs subgraph queries) validates offline.
- **M2 Core registry**: matchstick RED for `LabelRegistered` (namehash id/name/owner/expiry/parent) and `TransferSingle`; GREEN `registry.ts`; e2e: register fresh `.eth` on Sepolia (forge + MockUSDC mint) → assert on gnd GraphQL.
- **M3 Registrations + migration**: registrar → `Registration`/`registrant`/`expiryDate`; migration-controller sender classification → `isMigrated=true`; e2e: renew + upgrade a v1 Sepolia name via beta flow.
- **M4a Live resolvers**: RED tests for `AddressChanged`/`TextChanged`/`ContenthashChanged`/`Named*`/`AliasChanged` + `ProxyDeployed` spawning; e2e on Sepolia: set records (incl. same-tx-as-deploy), create subname via subregistry, assert `Resolver.texts`, `Domain.resolvedAddress`, subdomain tree.
- **M4b RC resolvers (parallel track)**: RED tests for `*Updated` + `Linked`/`Cleared` (recordId model, `_RecordLink` + `_PendingRecord` ordering buffer); e2e on local anvil RC chain. Swappable the day the RC deploys.
- **M5 Edge cases**: `TokenRegenerated` id-stability, `LabelUnregistered`, shared subregistries, `TransferBatch`, burn/re-register, grace-period semantics (client-side, match v1), factory blind-spot tests (same-tx post-deploy records captured; custom non-factory gap documented in ledger).
- **M6 L3 parity**: on-chain verifier (sample N domains → `cast call` raw-returning getters vs subgraph at same block — always-on, zero third-party deps, external to the subgraph); ENSNode adapter (paginated walks of `domains/accounts/registrations/resolvers` at pinned block vs `api.v2-sepolia.ensnode.io/subgraph`, v2-subset filtered; self-host ENSIndexer fallback if TLS broken; never silently pass); Big Name optional flag; known-divergence ledger (cost units, wrapped fields, isMigrated semantics, subdomain expiryDate, custom non-factory pre-link records) — only ledgered diffs suppressed.
- **M7 Polish**: README + `docs/` spec (semantic decisions, divergence ledger, RC-swap runbook linking the gist), re-runnable parity. Stretch: `.graphclientrc.yml` composing [v1 Sepolia subgraph, our v2 subgraph] + `graphclient serve-dev` smoke (validates the proxy thesis; CF Worker = next session).

## Timeline (for the Aug 19 kick-off call)

- **Days 1–3** (~Aug 14–17): M0–M3 — schema-verified, registry+registrar live on Sepolia with on-chain parity. Demoable on gnd.
- **~Aug 21**: M4a + M5 — full live-contract coverage (resolvers, subdomains, migrations).
- **~Aug 28**: M6 — complete parity harness + divergence ledger; M4b RC adapter proven on anvil.
- **RC lands on Sepolia (during/after audit window)**: re-pin + full regression re-run — hours, not days.
- Framing: the TDD harness is the deliverable that makes ENS's confirmed event churn cheap to absorb.

## Risks / open items
- **RC churn continues** ("the diff will drift" — per the gist): dual-generation abstraction + `forge inspect` re-extraction + regression suite absorb it.
- **Custom non-factory contracts** may miss pre-linking records (events-only trade-off) — documented in divergence ledger; canonical beta flows unaffected.
- **ENSNode v2-Sepolia TLS** invalid today — on-chain oracle covers truth regardless; self-host fallback specced.
- **Archive RPC** needed only by the parity verifier (Alchemy/QuickNode/dRPC); indexing itself needs a plain Sepolia RPC.
- **Start blocks unpublished / addresses may redeploy** — pinned empirically; `networks.json` single source of truth.
- **RootRegistry address unknown** — resolved M0.
- Small beta dataset — parity is exhaustive now; harness re-runs as activity grows.

## Out of scope (this session)
- v1 Sepolia contracts in this subgraph (proxy composes later).
- Cloudflare Worker deployment of the graph-client proxy (next session; stretch = local serve-dev smoke).
- Mainnet ENSv2 (doesn't exist yet).
