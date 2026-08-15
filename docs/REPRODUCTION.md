# Reproduction Guide — ens-v2-subgraph

Everything needed to reproduce this implementation and its verification from
scratch. Machine assumptions: macOS, Homebrew, docker, node 22+, pnpm, bun,
foundry, and a normal (non-archive) Sepolia RPC. Tool versions used:
graph-cli 0.98.1, graph-ts 0.38.2, matchstick-as 0.6.0, gnd (graph-node dev,
graph-cli compat 0.98.1), foundry 1.4.4.

## 0. Get the repo

```bash
git clone <this-repo> && cd ens-v2-subgraph
npm install
```

Reference clones (gitignored, re-acquire as follows):

```bash
mkdir -p .reference && cd .reference
git clone --depth 1 https://github.com/ensdomains/ens-subgraph.git
git clone --depth 1 --branch deploy/sepolia-migration-20260731 \
  https://github.com/ensdomains/contracts-v2.git
cd contracts-v2
git fetch --depth 1 origin post-audit-2:post-audit-2
git fetch --depth 1 origin feat/public-resolver:feat/public-resolver   # PR #354
git worktree add ../contracts-v2-rc post-audit-2
git worktree add ../contracts-v2-pr354 feat/public-resolver
git clone --depth 1 https://github.com/ensdomains/verifiable-factory.git
git clone --depth 1 https://github.com/namehash/ensnode.git            # archived ENSIndexer monorepo
cd ..
```

Reference patches applied locally (all marked `PATCHED` in-file):

1. `contracts-v2/contracts/script/testNames/registrar.ts` — reregister warp
   extended past the 90-day .eth grace (their bug: expired ≠ available).
2. `ensnode/packages/datasources/src/sepolia-v2.ts` — startBlocks raised to
   the beta window (11465480) so the parity oracle indexes only what our
   v2-only subgraph indexes.

## 1. Verify the schema contract (L0)

```bash
bash scripts/dev.sh &        # gnd on :8000 (needs postgresql@16 initdb on PATH; script adds it)
sleep 120
npm run test:schema          # byte-diff vs v1 + query corpus vs served introspection
```

## 2. Unit tests (L1)

```bash
npx graph test               # 17 matchstick tests
```

## 3. Local devnet e2e (L2) — both contract generations

```bash
bash scripts/e2e-chain.sh up     # anvil devnet :8545 + gnd :8001 (needs :8000 free)
bash scripts/e2e-chain.sh test   # 30+ assertions through the v1 surface
bash scripts/e2e-chain.sh down

# RC generation (PR #354 resolver model):
E2E_WORKTREE=.reference/contracts-v2-pr354 bash scripts/e2e-chain.sh up
bash scripts/e2e-chain.sh test
bash scripts/e2e-chain.sh down
```

First run of each worktree: `cd $E2E_WORKTREE/contracts && git submodule
update --init --recursive && bun install` (the script assumes bun install is
done; the pr354 worktree needs the recursive submodules).

## 4. Live Sepolia indexing + on-chain parity (L3)

```bash
bash scripts/dev.sh &                          # indexes the real beta
sleep 180
GND_GRAPHQL=http://localhost:8000/subgraphs/name/subgraph-0 \
  npx tsx harness/onchain-parity.test.ts       # 10/10 names, expiry-exact
```

## 5. Self-hosted ENSNode and record-level parity (L3, behavioral oracle)

```bash
# postgres for ponder
docker run -d --name ensindexer-pg -p 5434:5432 \
  -e POSTGRES_PASSWORD=password -e POSTGRES_DB=postgres postgres:16

# ENSRainbow not-found mock (healing degrades to unhealed labels - fine for
# parity: beta labels are event-carried)
node scripts/rainbow-mock.cjs &                # :3223

# ENSIndexer (sepolia-v2, subgraph-compat) from the archived monorepo
cd .reference/ensnode && pnpm install --ignore-scripts && cd apps/ensindexer
cat > .env.local <<'EOF'
ENSINDEXER_SCHEMA_NAME=ensindexer_parity
NAMESPACE=sepolia-v2
SUBGRAPH_COMPAT=true
RPC_URL_11155111=https://gateway.tenderly.co/public/sepolia
ENSDB_URL=postgresql://postgres:password@localhost:5434/postgres
ENSRAINBOW_URL=http://localhost:3223
PONDER_TELEMETRY_DISABLED=true
EOF
PATH="$(pwd)/../../node_modules/.bin:$PATH" pnpm run start   # backfills ~3-5 min
```

Ponder serves its GraphQL where the subgraph plugin's entities are queryable
(check the startup log for the port, default 42069). Run the comparison with
the oracle pointed at it:

```bash
GND_GRAPHQL=http://localhost:8000/subgraphs/name/subgraph-0 \
  ENSNODE_URL=http://localhost:42069/graphql \
  npx tsx harness/ensnode-parity.test.ts
```

Notes: ENSIndexer is a pnpm monorepo (bun install fails on `catalog:`).
If ponder refuses to start with "schema was previously used", `docker exec
ensindexer-pg psql -U postgres -c 'DROP SCHEMA ensindexer_parity CASCADE;'`.
Public-RPC rate limits (-32005) are retried automatically; a paid RPC speeds
up the initial backfill.

## 6. RC-swap rehearsal (when ENS redeploys Sepolia)

1. Update `networks.json` sepolia addresses/startBlocks (Etherscan first-tx
   or the contracts repo addresses doc).
2. Mirror the addresses into `subgraph.yaml` (hardcoded — see the graph-cli
   `--network` write-back caveat in README).
3. `npx graph build && npx graph test`.
4. Re-run §1, §4. If event ABIs drifted, re-extract via `forge inspect` from
   the new branch into `abis/{live,rc}/` and adjust handlers first.
5. Full rehearsal against the new branch's devnet (§3 with `E2E_WORKTREE`).

## 7. Hosted deployment (The Graph Studio) — shareable endpoint

Studio hosts the subgraph 24/7 with its own Sepolia indexing infrastructure
(no RPC key needed on our side for indexing):

1. Create the subgraph at thegraph.com/studio (ours is slug `ens-v-2-sepolia`)
   and authenticate once with the deploy key: `graph auth <DEPLOY_KEY>`
   (graph-cli 0.98 stores it in `~/.graph-cli.json`; the old `--studio` deploy
   flag is gone — Studio is inferred from the stored auth).
2. Deploy: `npm run deploy:studio`
   (= `graph deploy ens-v-2-sepolia --version-label v0.1.0-sepolia-beta`)
3. Live endpoint (verified 2026-08-15: synced, zero indexing errors, all three
   harnesses green against it — schema corpus, on-chain parity, ENSNode
   record parity):
   `https://api.studio.thegraph.com/query/41768/ens-v-2-sepolia/v0.1.0-sepolia-beta`
4. RC redeploy = edit networks.json + subgraph.yaml addresses, redeploy with a
   new version label. NOTE: Studio indexes with its own Sepolia RPC — the
   private RPC key is only needed for the local ENSIndexer oracle.
