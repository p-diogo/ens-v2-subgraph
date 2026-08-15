#!/usr/bin/env bash
# L2 e2e: run the ENSv2 contracts on a local anvil devnet (contracts-v2
# `bun run devnet -- --testNames`), build the subgraph against it and serve it
# on gnd at http://localhost:8001. Assertions live in harness/e2e.test.ts.
#
# Usage:
#   bash scripts/e2e-chain.sh up     # start devnet + gnd (background)
#   bash scripts/e2e-chain.sh down    # stop both
#   bash scripts/e2e-chain.sh test    # run harness/e2e.test.ts against :8001
#
# Env:
#   E2E_WORKTREE — contracts worktree to run (default: live branch clone).
#                  Point at .reference/contracts-v2-rc / -pr354 for RC testing.
set -euo pipefail
cd "$(dirname "$0")/.."

DEVNET_LOG=/tmp/ens2-devnet.log
GND_LOG=/tmp/ens2-gnd-devnet.log
E2E_WORKTREE="${E2E_WORKTREE:-.reference/contracts-v2}"
DEVNET_DIR="$E2E_WORKTREE/contracts"

for pg in postgresql@16 postgresql@17 postgresql@15; do
  if [ -d "/opt/homebrew/opt/$pg/bin" ]; then
    export PATH="/opt/homebrew/opt/$pg/bin:$PATH"
    break
  fi
done

case "${1:-up}" in
up)
  if curl -s -m 2 -X POST http://localhost:8545 -H 'Content-Type: application/json' \
       --data-binary '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | grep -q result; then
    echo "devnet already running on :8545"
  else
    echo "starting devnet (this registers test names; takes a few minutes)..."
    (cd "$DEVNET_DIR" && nohup bun run devnet -- --testNames > "$DEVNET_LOG" 2>&1 &)
    for i in $(seq 1 120); do
      sleep 5
      if curl -s -m 2 -X POST http://localhost:8545 -H 'Content-Type: application/json' \
           --data-binary '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | grep -q result; then
        echo "devnet RPC up"
        break
      fi
      if [ "$i" = 120 ]; then echo "devnet did not start; see $DEVNET_LOG"; exit 1; fi
    done
    # wait until deployments are saved (registration done)
    for i in $(seq 1 120); do
      sleep 5
      if grep -q "Starting testNames\|Gas Tracking\|devnet" "$DEVNET_LOG" 2>/dev/null && \
         ls "$DEVNET_DIR"/deployments/devnet-*/ETHRegistrar.json >/dev/null 2>&1; then
        echo "deployments saved"
        break
      fi
      if [ "$i" = 120 ]; then echo "deployments never appeared; see $DEVNET_LOG"; exit 1; fi
    done
  fi

  python3 scripts/gen-devnet-networks.py

  # devnet manifest: same as sepolia but network: devnet (templates resolved
  # by graph-cli --network devnet)
  sed 's/network: sepolia/network: devnet/g' subgraph.yaml > subgraph.devnet.yaml
  npx graph build subgraph.devnet.yaml --network devnet

  mkdir -p .gnd-devnet
  nohup gnd dev \
    --manifest ./subgraph.devnet.yaml \
    --ethereum-rpc devnet:http://localhost:8545 \
    --database-dir ./.gnd-devnet \
    --http-port 8001 \
    > "$GND_LOG" 2>&1 &
  echo "gnd starting on :8001 (log: $GND_LOG)"
  ;;

down)
  pkill -9 -f "gnd dev.*8001" 2>/dev/null || true
  pkill -9 -f "gnd dev.*gnd-devnet" 2>/dev/null || true
  pkill -f "runDevnet" 2>/dev/null || true
  sleep 1
  pkill -9 -f "anvil" 2>/dev/null || true
  echo "stopped"
  ;;

test)
  GND_GRAPHQL=http://localhost:8001/subgraphs/name/subgraph-0 npx tsx harness/e2e.test.ts
  ;;

*)
  echo "usage: $0 up|down|test" >&2
  exit 2
  ;;
esac
