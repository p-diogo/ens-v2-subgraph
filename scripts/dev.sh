#!/usr/bin/env bash
# Local dev: build + run the subgraph on gnd (graph-node dev) against Sepolia.
#
# Usage:
#   bash scripts/dev.sh              # build once, then run
#   bash scripts/dev.sh --watch      # rebuild + redeploy on changes
#
# Env:
#   SEPOLIA_RPC  — Ethereum Sepolia RPC (default: Tenderly public gateway).
#                  Note: publicnode's LB intermittently returns partial
#                  eth_getLogs results; Tenderly has been reliable.
#
# gnd needs initdb on PATH (embedded postgres). Homebrew's postgresql@16/17
# provide it but are keg-only, so we add them here.
set -euo pipefail
cd "$(dirname "$0")/.."

for pg in postgresql@16 postgresql@17 postgresql@15; do
  if [ -d "/opt/homebrew/opt/$pg/bin" ]; then
    export PATH="/opt/homebrew/opt/$pg/bin:$PATH"
    break
  fi
done

SEPOLIA_RPC="${SEPOLIA_RPC:-https://gateway.tenderly.co/public/sepolia}"

npx graph codegen
npx graph build
mkdir -p .gnd-data
exec gnd dev \
  --ethereum-rpc "sepolia:${SEPOLIA_RPC}" \
  --database-dir ./.gnd-data \
  "$@"

# GraphQL: http://localhost:8000/subgraphs/name/subgraph-0
