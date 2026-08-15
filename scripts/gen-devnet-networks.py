#!/usr/bin/env python3
"""Generate the devnet section of networks.json from contracts-v2 devnet
deployment artifacts, and write subgraph.devnet.yaml by patching the hardcoded
sepolia addresses/startBlocks in subgraph.yaml.

(graph-cli 0.98's --network build resolves mustache templates back INTO the
source manifest, so we keep subgraph.yaml hardcoded for sepolia and patch a
copy instead.)"""
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WORKTREE = os.environ.get("E2E_WORKTREE", ".reference/contracts-v2")
DEPLOYMENTS = REPO / WORKTREE / "contracts" / "deployments"

WANTED = ["RootRegistry", "ETHRegistry", "ETHRegistrar", "VerifiableFactory",
          "MockUSDC", "LockedMigrationController", "UnlockedMigrationController"]


def main() -> int:
    dirs = sorted(DEPLOYMENTS.glob("devnet-*"))
    if not dirs:
        print("no devnet-* deployment dir found; run the devnet first", file=sys.stderr)
        return 1
    dep_dir = dirs[-1]
    networks = json.loads((REPO / "networks.json").read_text())
    sepolia = networks["sepolia"]
    devnet = {"_comment": f"auto-generated from {dep_dir.name} ({WORKTREE})"}
    for name in WANTED:
        f = dep_dir / f"{name}.json"
        if not f.exists():
            print(f"warning: {name} not deployed", file=sys.stderr)
            continue
        devnet[name] = {"address": json.loads(f.read_text())["address"], "startBlock": 0}
    networks["devnet"] = devnet
    (REPO / "networks.json").write_text(json.dumps(networks, indent=2) + "\n")
    print(f"wrote devnet section ({dep_dir.name})")

    manifest = (REPO / "subgraph.yaml").read_text()
    for name in ["RootRegistry", "ETHRegistry", "ETHRegistrar", "VerifiableFactory"]:
        old_addr = sepolia[name]["address"]
        new_addr = devnet[name]["address"]
        if old_addr not in manifest:
            print(f"error: sepolia address for {name} not found in subgraph.yaml", file=sys.stderr)
            return 1
        manifest = manifest.replace(f'"{old_addr}"', f'"{new_addr}"')
        manifest = manifest.replace(f"startBlock: {sepolia[name]['startBlock']}", "startBlock: 0")
    manifest = manifest.replace("network: sepolia", "network: devnet")
    (REPO / "subgraph.devnet.yaml").write_text(manifest)
    print("wrote subgraph.devnet.yaml (devnet addresses, startBlock 0)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
