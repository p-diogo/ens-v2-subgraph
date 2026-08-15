#!/usr/bin/env python3
"""Generate the devnet section of networks.json from contracts-v2 devnet
deployment artifacts (deployments/devnet-<chainId>/*.json)."""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEPLOYMENTS = REPO / ".reference" / "contracts-v2" / "contracts" / "deployments"

WANTED = {
    "RootRegistry": 0,
    "ETHRegistry": 0,
    "ETHRegistrar": 0,
    "VerifiableFactory": 0,
    "MockUSDC": 0,
    "LockedMigrationController": 0,
    "UnlockedMigrationController": 0,
}


def main() -> int:
    dirs = sorted(DEPLOYMENTS.glob("devnet-*"))
    if not dirs:
        print("no devnet-* deployment dir found; run the devnet first", file=sys.stderr)
        return 1
    dep_dir = dirs[-1]
    networks = json.loads((REPO / "networks.json").read_text())
    devnet = {
        "_comment": f"auto-generated from {dep_dir.name} by scripts/gen-devnet-networks.py"
    }
    for name, start_block in WANTED.items():
        f = dep_dir / f"{name}.json"
        if not f.exists():
            print(f"warning: {name} not deployed", file=sys.stderr)
            continue
        devnet[name] = {
            "address": json.loads(f.read_text())["address"],
            "startBlock": start_block,
        }
    networks["devnet"] = devnet
    (REPO / "networks.json").write_text(json.dumps(networks, indent=2) + "\n")
    print(f"wrote devnet section ({dep_dir.name}):")
    for name in WANTED:
        if name in devnet:
            print(f"  {name:30s} {devnet[name]['address']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
