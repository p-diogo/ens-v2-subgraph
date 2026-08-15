// M4b: RC SharedResolver unit coverage.
//
// NOTE: matchstick 0.6 cannot faithfully mock uint256 params of node
// magnitude (>= 2^64 values come back mangled from Value.fromUnsignedBigInt),
// so the RC record handlers cannot be event-mocked reliably. Their behavioral
// verification runs against the real RC devnet (E2E_WORKTREE=
// .reference/contracts-v2-pr354 bash scripts/e2e-chain.sh up), where the
// production decode path is exercised end to end. Here we pin the
// recordId->node conversion semantics instead.

import { describe, test, assert } from "matchstick-as/assembly/index";
import { BigInt } from "@graphprotocol/graph-ts";
import { recordNodeForTest } from "../src/resolverRC";

describe("RC recordNode conversion", () => {
  test("small recordId pads to 32 bytes", () => {
    assert.assertTrue(
      recordNodeForTest(BigInt.fromI32(1)) ==
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      "small recordId must zero-pad to 32 bytes",
    );
  });
  test("mid-range recordId keeps width", () => {
    const v = BigInt.fromI64(2158789329584249706); // arbitrary 62-bit value
    const got = recordNodeForTest(v);
    assert.assertTrue(got.length == 66, `expected 66-char hex, got ${got.length}`);
    assert.assertTrue(got.startsWith("0x00000000000000"), "high bytes zero-padded");
  });
});
