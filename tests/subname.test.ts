// Repro: subname registration through a dynamically linked subregistry must
// produce the ENSIP-1 namehash of the full name.

import {
  clearStore,
  describe,
  test,
  assert,
  newMockEvent,
} from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";

import {
  LabelRegistered as ETHLabelRegistered,
  SubregistryUpdated,
} from "../generated/ETHRegistry/PermissionedRegistry";
import {
  LabelRegistered as SubLabelRegistered,
} from "../generated/templates/Subregistry/UserRegistry";
import {
  handleLabelRegistered,
  handleSubregistryUpdated,
  handleSubregistryLabelRegistered,
} from "../src/registry";
import { keccakStr, namehashOf, subnodeOf } from "./registry.test";

// devnet-era deployment addresses (this repro mirrors a devnet fixture; the
// anchor math only needs self-consistent addresses, not the sepolia pins)
const DEVNET_ETH_REGISTRY = "0x36c02da8a0983159322a80ffe9f24b1acff8b570";
const DEVNET_REGISTRAR = "0x36b58f5c1969b7b6591d752ea6f5486d069010ab";
const OWNER = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const SUBREGISTRY = "0x12e783C0FbbFD07143E9d4B90173a1F6C0990FF5";

const TS = 1780000000;
const ONE_DAY = 86400;

function ethLabelRegisteredEvent(tokenId: i32, label: string): ETHLabelRegistered {
  let event = changetype<ETHLabelRegistered>(newMockEvent());
  event.block.timestamp = BigInt.fromI64(TS);
  event.address = Address.fromString(DEVNET_ETH_REGISTRY);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))));
  event.parameters.push(new ethereum.EventParam("labelHash", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(keccakStr(label)))));
  event.parameters.push(new ethereum.EventParam("label", ethereum.Value.fromString(label)));
  event.parameters.push(new ethereum.EventParam("owner", ethereum.Value.fromAddress(Address.fromString(OWNER))));
  event.parameters.push(new ethereum.EventParam("expiry", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(TS + 28 * ONE_DAY))));
  event.parameters.push(new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(DEVNET_REGISTRAR))));
  return event;
}

function subregistryUpdatedEvent(tokenId: i32, sub: string): SubregistryUpdated {
  let event = changetype<SubregistryUpdated>(newMockEvent());
  event.block.timestamp = BigInt.fromI64(TS);
  event.address = Address.fromString(DEVNET_ETH_REGISTRY);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))));
  event.parameters.push(new ethereum.EventParam("subregistry", ethereum.Value.fromAddress(Address.fromString(sub))));
  event.parameters.push(new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(OWNER))));
  return event;
}

function subLabelRegistered(label: string, tokenIdHex: string): SubLabelRegistered {
  let event = changetype<SubLabelRegistered>(newMockEvent());
  event.block.timestamp = BigInt.fromI64(TS);
  event.address = Address.fromString(SUBREGISTRY);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromUnsignedBytes(Bytes.fromHexString(tokenIdHex) as Bytes))));
  event.parameters.push(new ethereum.EventParam("labelHash", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(keccakStr(label)))));
  event.parameters.push(new ethereum.EventParam("label", ethereum.Value.fromString(label)));
  event.parameters.push(new ethereum.EventParam("owner", ethereum.Value.fromAddress(Address.fromString(OWNER))));
  event.parameters.push(new ethereum.EventParam("expiry", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(18446744073709551615))));
  event.parameters.push(new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(OWNER))));
  return event;
}

describe("subname through subregistry", () => {
  test("sub.unregistered.eth lands on its ENSIP-1 namehash", () => {
    clearStore();

    handleLabelRegistered(ethLabelRegisteredEvent(1, "unregistered"));
    handleSubregistryUpdated(subregistryUpdatedEvent(1, SUBREGISTRY));

    // subname labelHash from chain: keccak("sub") in the high bytes with a
    // version suffix in the low bytes (v2-style subname tokenId)
    handleSubregistryLabelRegistered(
      subLabelRegistered("sub", "0xfa1ea47215815692a5f1391cff19abbaf694c82fb2151a4c351b6c0e00000000"),
    );

    const unregNode = namehashOf("unregistered");
    const expected = subnodeOf(unregNode, keccakStr("sub"));
    assert.fieldEquals("Domain", expected, "name", "sub.unregistered.eth");
    assert.fieldEquals("Domain", expected, "parent", unregNode);
  });
});
