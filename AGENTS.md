# AGENTS.md — working instructions for coding agents in this repo

One-paragraph orientation: this is an ENSv2 (Sepolia beta) subgraph exposing
the **v1 ENS subgraph schema byte-for-byte** so legacy ensjs/GraphQL
consumers keep working. Mappings are purely **event-sourced (zero
eth_calls)**. Two resolver generations are indexed side by side (live
`PermissionedResolver` + RC `SharedResolver`, PR #354) so the RC swap is a
re-pin, not a rewrite. Read `docs/PLAN.md` for the why, `docs/DIVERGENCES.md`
before comparing data against anything, and `docs/DRIFT-MONITORING.md` for
the ENS-side drift checks.

## Commands

```bash
npm run codegen        # graph codegen (after ABI/manifest changes)
npm run build          # graph build — must pass before any deploy
npm run test           # graph test — 88 matchstick tests; must be green
npm run typecheck      # tsc (strict) over harness/ — the node-side TS
npm run test:pins      # src/utils.ts controller pins == networks.json
npm run test:schema    # L0: schema byte-diff + query corpus (needs gnd up)
npm run dev            # builds + runs gnd on :8000 (scripts/dev.sh)
npm run deploy:studio  # graph deploy (auth lives in ~/.graph-cli.json)
npx tsx harness/onchain-parity.test.ts   # L3: vs live ETHRegistry reads
npx tsx harness/ensnode-parity.test.ts   # L3: vs self-hosted ENSIndexer
```

"Done" means the whole pyramid: `build` + `test` + `typecheck` + `pins` +
(schema corpus and parity harnesses when the relevant stack is up).

## Hard rules

- **`schema.graphql` is v1-verbatim.** Do not modify it except the
  whitelisted `_`-prefixed internal block; `harness/schema.test.ts`
  byte-diffs against the v1 reference and will fail anything else.
- **No eth_calls in mappings.** Everything derives from events; the
  factory/template spawning exists precisely to avoid needing calls.
- **v1-parity porting:** deliberate quirks stay (e.g. `EMPTY_ADDRESS`
  written into the non-null `NewResolver.resolver` FK, grace-period
  convention). Any intentional divergence must land in `docs/DIVERGENCES.md`
  at the same time as the code.
- **`.reference/` is read-only-ish**: gitignored clones of upstream repos
  carrying local patches marked `PATCHED` in-file. Never `git pull`/merge
  there; read remote state via `git ls-remote` / `git show <sha>:<path>`.
  It also contains `apps/ensindexer/.env.local` with a private RPC key —
  never commit, never paste keys into chats or issues.
- **Never push to `ensdomains/*` repos.** Our remote is `p-diogo/ens-v2-subgraph`
  (private) — that's the only push target.
- **RC swap** (ENS redeploys Sepolia): update `networks.json` AND the
  `LOCKED/UNLOCKED_MIGRATION_CONTROLLER` constants in `src/utils.ts`
  (`test:pins` fails until they match), then re-run the pyramid. Full
  runbook in README §RC-swap.

## Toolchain gotchas (all verified the hard way)

- **AssemblyScript compiler crashes** on null-equality (`==`/`!=`) and
  ternaries over nullable `Bytes/ByteArray` — use truthiness or `== null`,
  and `x!` assertions after guards (`name = name!` is the standard string
  narrowing idiom, not a no-op).
- **matchstick build cache**: if test names/asserts look stale,
  `rm -rf tests/.bin` before rerunning.
- **graph-cli 0.98 `--network` build** writes resolved templates back into
  the source manifest — `subgraph.yaml` stays hardcoded; devnet variants
  are generated as `subgraph.devnet.yaml` by `scripts/gen-devnet-networks.py`.
- **AS `new Array(x)` is capacity**, not element-init: build params with
  `new Array()` + `push`.

## Drift monitoring

An automated check (every 6h) watches ENS's contracts repo, the breaking
changes gist, PRs, and the ENSNode fleet; history is `docs/DRIFT-LOG.md`,
spec is `docs/DRIFT-MONITORING.md`. If you are running one of those checks:
classify strictly by the **event surface we index** (only new/changed events
on indexed contracts, or new deploy addresses, require adaptation), commit
only on detected drift, and update the prompt baselines after movement.

## Conventions

- Handlers: `handle<Source><Event>(event: X): void` delegating to private
  `*Core` functions whose tail params are `(blockNumber, logIndex, txHash)`.
- Shared identity helpers live once in `src/utils.ts` (`resolverId`,
  `subnodeHash`, `createOrLoadResolver`, `trackCoinType/trackTextKey`,
  `clearResolverRecords`, `GRACE_PERIOD_SECONDS`) — never re-inline them.
- Miss convention: `null` returns from internals loaders, callers null-check;
  unknown-tokenId/domain guards `log.warning` (event name, id, address) then
  return — mappings never throw.
- Tests: `clearStore()` at the top of every test; fixtures shared from
  `tests/registry.test.ts` (`keccakStr`, `subnodeOf`, `namehashOf`, event
  factories). New coverage mirrors existing describe blocks per handler.
