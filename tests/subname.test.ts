// Repro: subname registration through a dynamically linked subregistry must
// produce the ENSIP-1 namehash of the full name.

import { describe, test, assert, newMockEvent } from "matchstick-as/assembly/index";
import { Address, BigInt, ByteArray, Bytes, crypto, ethereum } from "@graphprotocol/graph-ts";

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
import { byteArrayFromHex, concat, ETH_NODE } from "../src/utils";

const ETH_REGISTRY = "0x36c02da8a0983159322a80ffe9f24b1acff8b570";
const REGISTRAR = "0x36b58f5c1969b7b6591d752ea6f5486d069010ab";
const OWNER = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const SUBREGISTRY = "0x12e783C0FbbFD07143E9d4B90173a1F6C0990FF5";

function keccakStr(s: string): ByteArray {
  return crypto.keccak256(ByteArray.fromUTF8(s));
}

function nh(parentHex: string, label: string): string {
  return crypto
    .keccak256(concat(byteArrayFromHex(parentHex.slice(2)), keccakStr(label)))
    .toHexString();
}

const TS = 1780000000;

function labelRegisteredETH(tokenId: i64, label: string): ETHLabelRegistered {
  let event = changetype<ETHLabelRegistered>(newMockEvent());
  event.block.timestamp = BigInt.fromI64(TS);
  event.address = Address.fromString(ETH_REGISTRY);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(tokenId))));
  event.parameters.push(new ethereum.EventParam("labelHash", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(keccakStr(label)))));
  event.parameters.push(new ethereum.EventParam("label", ethereum.Value.fromString(label)));
  event.parameters.push(new ethereum.EventParam("owner", ethereum.Value.fromAddress(Address.fromString(OWNER))));
  event.parameters.push(new ethereum.EventParam("expiry", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(TS + 28 * 86400))));
  event.parameters.push(new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(REGISTRAR))));
  return event;
}

function subregistryUpdated(tokenId: i64, sub: string): SubregistryUpdated {
  let event = changetype<SubregistryUpdated>(newMockEvent());
  event.block.timestamp = BigInt.fromI64(TS);
  event.address = Address.fromString(ETH_REGISTRY);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(tokenId))));
  event.parameters.push(new ethereum.EventParam("subregistry", ethereum.Value.fromAddress(Address.fromString(sub))));
  event.parameters.push(new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(OWNER))));
  return event;
}

// v2-style subname tokenId: labelHash with a version suffix in the low bytes
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
    // real devnet values
    const T_UNREG = "0x64d13a8d09a1a75586d3687b64c5c76f5358aae9eb1f8f6fca63c68a02bfc800"; // placeholder; replaced below by real topic
    void T_UNREG;

    handleLabelRegistered(labelRegisteredETH(45365345383263673131329035681400107173894574979410367037783032753372163735552 % 1000000, "unregistered"));
    // ^ tokenId shrunk for i64 safety; anchor + node math is what matters
    handleSubregistryUpdated(subregistryUpdated(45365345383263673131329035681400107173894574979410367037783032753372163735552 % 1000000, SUBREGISTRY));

    // subname labelHash from chain: keccak("sub")
    handleSubregistryLabelRegistered(
      subLabelRegistered("sub", "0xfa1ea47215815692a5f1391cff19abbaf694c82fb2151a4c351b6c0e00000000"),
    );

    const unregNode = nh(ETH_NODE, "unregistered");
    const expected = nh(unregNode, "sub");
    assert.fieldEquals("Domain", expected, "name", "sub.unregistered.eth");
    assert.fieldEquals("Domain", expected, "parent", unregNode);
  });
});
