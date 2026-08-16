// M4b: RC SharedResolver unit coverage.
//
// matchstick 0.6 cannot faithfully mock uint256 params of node magnitude
// (>= 2^64 values come back mangled from Value.fromUnsignedBigInt), so the
// handler tests below use small recordIds (whose nodes we seed as explicit
// Domain entities) instead of real namehash-magnitude ids. Full-magnitude
// verification runs against the real RC devnet (E2E_WORKTREE=
// .reference/contracts-v2-pr354 bash scripts/e2e-chain.sh up), where the
// production decode path is exercised end to end.

import {
  clearStore,
  describe,
  test,
  assert,
  newMockEvent,
} from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";

import {
  AddressUpdated,
  TextUpdated,
  Cleared,
} from "../generated/templates/ResolverRC/SharedResolver";
import { Domain } from "../generated/schema";
import {
  handleRCAddressUpdated,
  handleRCTextUpdated,
  handleRCCleared,
  recordNode,
} from "../src/resolverRC";
import { resolverId } from "../src/utils";
import { keccakStr } from "./registry.test";

const RESOLVER = "0x9794eb37f93ff7f8c5904f18f16796b8521f0f69";
const ADDR = "0x0000000000000000000000000000000000000003";
const ETH_ADDR_BYTES = "0x0000000000000000000000000000000000000003"; // 20 bytes
const BTC_ADDR_BYTES = "0x76a914662f6cce130dfc3a33f7b1a7e557b2e6d1f4a1ac88ac"; // 25 bytes

function addressUpdatedEvent(recordId: i32, coinType: i32, addrHex: string, len: i32): AddressUpdated {
  let event = changetype<AddressUpdated>(newMockEvent());
  event.address = Address.fromString(RESOLVER);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("recordId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(recordId))));
  event.parameters.push(new ethereum.EventParam("coinType", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(coinType))));
  // hex-slice so callers control the byte length (20 = ETH address, else multicoin)
  const bytes = Bytes.fromHexString(addrHex.slice(0, 2 + len * 2));
  event.parameters.push(new ethereum.EventParam("addressBytes", ethereum.Value.fromBytes(bytes)));
  return event;
}

function textUpdatedEvent(recordId: i32, key: string, value: string): TextUpdated {
  let event = changetype<TextUpdated>(newMockEvent());
  event.address = Address.fromString(RESOLVER);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("recordId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(recordId))));
  event.parameters.push(new ethereum.EventParam("keyHash", ethereum.Value.fromString(keccakStr(key).toHexString())));
  event.parameters.push(new ethereum.EventParam("key", ethereum.Value.fromString(key)));
  event.parameters.push(new ethereum.EventParam("value", ethereum.Value.fromString(value)));
  return event;
}

function clearedEvent(recordId: i32): Cleared {
  let event = changetype<Cleared>(newMockEvent());
  event.address = Address.fromString(RESOLVER);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("recordId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(recordId))));
  return event;
}

// Seed a Domain for a small recordId whose node is recordNode(recordId), with
// the resolver linked so the resolvedAddress mirror is exercised.
function seedLinkedDomain(recordId: i32): string {
  const node = recordNode(BigInt.fromI32(recordId));
  let domain = new Domain(node);
  domain.owner = "0x0000000000000000000000000000000000000001";
  domain.parent = "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae";
  domain.subdomainCount = 0;
  domain.isMigrated = false;
  domain.createdAt = BigInt.fromI32(1);
  domain.resolver = resolverId(Address.fromString(RESOLVER), node);
  domain.save();
  return node;
}

describe("RC recordNode conversion", () => {
  test("small recordId pads to 32 bytes", () => {
    clearStore();
    assert.assertTrue(
      recordNode(BigInt.fromI32(1)) ==
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      "small recordId must zero-pad to 32 bytes",
    );
  });
  test("mid-range recordId keeps width", () => {
    clearStore();
    const v = BigInt.fromI64(2158789329584249706); // arbitrary 62-bit value
    const got = recordNode(v);
    assert.assertTrue(got.length == 66, `expected 66-char hex, got ${got.length}`);
    assert.assertTrue(got.startsWith("0x00000000000000"), "high bytes zero-padded");
  });
});

describe("RC AddressUpdated", () => {
  test("coin-60/20-byte mirrors v1 AddrChanged incl. domain.resolvedAddress", () => {
    clearStore();
    const node = seedLinkedDomain(1);
    const id = resolverId(Address.fromString(RESOLVER), node);

    handleRCAddressUpdated(addressUpdatedEvent(1, 60, ETH_ADDR_BYTES, 20));

    assert.fieldEquals("Resolver", id, "addr", ADDR);
    assert.fieldEquals("Domain", node, "resolvedAddress", ADDR);
    assert.fieldEquals("Resolver", id, "coinTypes", "[60]");
    // one entity per event: the coin-60 case emits AddrChanged, not multicoin
    assert.entityCount("AddrChanged", 1);
    assert.entityCount("MulticoinAddrChanged", 0);
  });

  test("non-60 coinType maps to MulticoinAddrChanged and leaves addr untouched", () => {
    clearStore();
    const node = seedLinkedDomain(2);
    const id = resolverId(Address.fromString(RESOLVER), node);

    // set addr via a coin-60 record first, then add a multicoin record
    handleRCAddressUpdated(addressUpdatedEvent(2, 60, ETH_ADDR_BYTES, 20));
    handleRCAddressUpdated(addressUpdatedEvent(2, 0, BTC_ADDR_BYTES, 25));

    // the multicoin path neither sets nor clears the ETH addr mirror
    assert.fieldEquals("Resolver", id, "addr", ADDR);
    assert.fieldEquals("Resolver", id, "coinTypes", "[60, 0]");
    assert.fieldEquals("Domain", node, "resolvedAddress", ADDR);
    assert.entityCount("AddrChanged", 1);
    assert.entityCount("MulticoinAddrChanged", 1);
  });
});

describe("RC TextUpdated", () => {
  test("accumulates text keys", () => {
    clearStore();
    const node = seedLinkedDomain(3);
    const id = resolverId(Address.fromString(RESOLVER), node);

    const first = textUpdatedEvent(3, "com.twitter", "@ens");
    first.block.number = BigInt.fromI32(10);
    const second = textUpdatedEvent(3, "url", "https://ens.domains");
    second.block.number = BigInt.fromI32(11);
    handleRCTextUpdated(first);
    handleRCTextUpdated(second);

    assert.fieldEquals("Resolver", id, "texts", "[com.twitter, url]");
    assert.entityCount("TextChanged", 2);
  });
});

describe("RC Cleared", () => {
  test("wipes records, clears the mirror, synthesizes VersionChanged(0)", () => {
    clearStore();
    const node = seedLinkedDomain(4);
    const id = resolverId(Address.fromString(RESOLVER), node);

    handleRCAddressUpdated(addressUpdatedEvent(4, 60, ETH_ADDR_BYTES, 20));
    handleRCTextUpdated(textUpdatedEvent(4, "url", "https://ens.domains"));
    const cleared = clearedEvent(4);
    cleared.block.number = BigInt.fromI32(7);
    cleared.logIndex = BigInt.fromI32(3);
    handleRCCleared(cleared);

    assert.fieldEquals("Resolver", id, "addr", "null");
    assert.fieldEquals("Resolver", id, "texts", "null");
    assert.fieldEquals("Resolver", id, "coinTypes", "null");
    assert.fieldEquals("Domain", node, "resolvedAddress", "null");
    // Cleared maps onto v1's VersionChanged clearing semantics (version 0)
    assert.entityCount("VersionChanged", 1);
    assert.fieldEquals("VersionChanged", "7-3", "version", "0");
  });
});
