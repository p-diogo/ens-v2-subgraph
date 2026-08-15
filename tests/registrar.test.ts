// M3 unit tests: ENSv2 ETHRegistrar events -> v1 schema Registration.

import { describe, test, assert, newMockEvent } from "matchstick-as/assembly/index";
import { Address, BigInt, ByteArray, Bytes, crypto, ethereum } from "@graphprotocol/graph-ts";

import {
  LabelRegistered as ETHLabelRegistered,
  TransferSingle,
} from "../generated/ETHRegistry/PermissionedRegistry";
import {
  NameRegistered,
  NameRenewed,
} from "../generated/ETHRegistrar/ETHRegistrar";
import { handleLabelRegistered, handleTransferSingle } from "../src/registry";
import {
  handleRegistrarNameRegistered,
  handleRegistrarNameRenewed,
} from "../src/registrar";
import { byteArrayFromHex, concat, ETH_NODE } from "../src/utils";

const ETH_REGISTRY = "0xDEDB92913A25abE1f7BCDD85D8A344a43B398B67";
const REGISTRAR = "0x8c2E866B439358c41AE05De9cbE8A00BFEFafFcA";
const OWNER = "0x0000000000000000000000000000000000000001";
const OWNER2 = "0x0000000000000000000000000000000000000002";
const USDC = "0xBA11ebdB3f9a2c5946D8629517f06364E53A2E10";

function keccakStr(s: string): ByteArray {
  return crypto.keccak256(ByteArray.fromUTF8(s));
}

function namehashOf(label: string): string {
  return crypto
    .keccak256(concat(byteArrayFromHex(ETH_NODE.slice(2)), keccakStr(label)))
    .toHexString();
}

function labelRegisteredEvent(tokenId: i32, label: string, owner: string, expiry: i64): ETHLabelRegistered {
  let event = changetype<ETHLabelRegistered>(newMockEvent());
  event.block.timestamp = BigInt.fromI64(REG_TS);
  event.address = Address.fromString(ETH_REGISTRY);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))));
  event.parameters.push(new ethereum.EventParam("labelHash", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(keccakStr(label)))));
  event.parameters.push(new ethereum.EventParam("label", ethereum.Value.fromString(label)));
  event.parameters.push(new ethereum.EventParam("owner", ethereum.Value.fromAddress(Address.fromString(owner))));
  event.parameters.push(new ethereum.EventParam("expiry", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(expiry))));
  event.parameters.push(new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(REGISTRAR))));
  return event;
}

function registrarNameRegisteredEvent(label: string, owner: string, duration: i64, base: i64): NameRegistered {
  let event = changetype<NameRegistered>(newMockEvent());
  event.block.timestamp = BigInt.fromI64(REG_TS);
  event.address = Address.fromString(REGISTRAR);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(7))));
  event.parameters.push(new ethereum.EventParam("label", ethereum.Value.fromString(label)));
  event.parameters.push(new ethereum.EventParam("owner", ethereum.Value.fromAddress(Address.fromString(owner))));
  event.parameters.push(new ethereum.EventParam("subregistry", ethereum.Value.fromAddress(Address.zero())));
  event.parameters.push(new ethereum.EventParam("resolver", ethereum.Value.fromAddress(Address.zero())));
  event.parameters.push(new ethereum.EventParam("duration", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(duration))));
  event.parameters.push(new ethereum.EventParam("paymentToken", ethereum.Value.fromAddress(Address.fromString(USDC))));
  event.parameters.push(new ethereum.EventParam("referrer", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(new ByteArray(32)))));
  event.parameters.push(new ethereum.EventParam("base", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(base))));
  event.parameters.push(new ethereum.EventParam("premium", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(0))));
  return event;
}

function registrarNameRenewedEvent(label: string, newExpiryTs: i64): NameRenewed {
  let event = changetype<NameRenewed>(newMockEvent());
  event.block.timestamp = BigInt.fromI64(REG_TS + 100);
  event.address = Address.fromString(REGISTRAR);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(7))));
  event.parameters.push(new ethereum.EventParam("label", ethereum.Value.fromString(label)));
  event.parameters.push(new ethereum.EventParam("duration", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(31536000))));
  event.parameters.push(new ethereum.EventParam("newExpiry", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(newExpiryTs))));
  event.parameters.push(new ethereum.EventParam("paymentToken", ethereum.Value.fromAddress(Address.fromString(USDC))));
  event.parameters.push(new ethereum.EventParam("referrer", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(new ByteArray(32)))));
  event.parameters.push(new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(5))));
  return event;
}

function transferSingleEvent(to: string, tokenId: i32): TransferSingle {
  let event = changetype<TransferSingle>(newMockEvent());
  event.address = Address.fromString(ETH_REGISTRY);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("operator", ethereum.Value.fromAddress(Address.fromString(OWNER))));
  event.parameters.push(new ethereum.EventParam("from", ethereum.Value.fromAddress(Address.fromString(OWNER))));
  event.parameters.push(new ethereum.EventParam("to", ethereum.Value.fromAddress(Address.fromString(to))));
  event.parameters.push(new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))));
  event.parameters.push(new ethereum.EventParam("value", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))));
  return event;
}

const REG_TS = 1780000000; // registration block timestamp base
const GRACE = 7776000; // 90 days, v1 constant

describe("registrar: NameRegistered", () => {
  test("creates Registration with v1 semantics incl. grace period on domain", () => {
    const label = "regtest";
    const expiryTs = REG_TS + 31536000; // 1 year
    // registry LabelRegistered fires first in the same tx
    handleLabelRegistered(labelRegisteredEvent(7, label, OWNER, expiryTs));
    // then the registrar's NameRegistered
    handleRegistrarNameRegistered(registrarNameRegisteredEvent(label, OWNER, 31536000, 5000000));

    const labelHash = keccakStr(label).toHexString();
    const node = namehashOf(label);

    assert.fieldEquals("Registration", labelHash, "domain", node);
    assert.fieldEquals("Registration", labelHash, "labelName", label);
    assert.fieldEquals("Registration", labelHash, "registrant", OWNER);
    assert.fieldEquals("Registration", labelHash, "cost", "5000000");
    assert.fieldEquals("Registration", labelHash, "expiryDate", expiryTs.toString());

    // v1: domain.expiryDate includes the 90-day grace period
    assert.fieldEquals("Domain", node, "expiryDate", (expiryTs + GRACE).toString());
    assert.fieldEquals("Domain", node, "registrant", OWNER);

    assert.entityCount("NameRegistered", 1);
  });
});

describe("registrar: NameRenewed", () => {
  test("extends registration and domain expiry (+grace)", () => {
    const label = "regtest";
    handleLabelRegistered(labelRegisteredEvent(7, label, OWNER, REG_TS + 31536000));
    handleRegistrarNameRegistered(registrarNameRegisteredEvent(label, OWNER, 31536000, 5000000));

    const newExpiry = REG_TS + 2 * 31536000;
    handleRegistrarNameRenewed(registrarNameRenewedEvent(label, newExpiry));

    const labelHash = keccakStr(label).toHexString();
    assert.fieldEquals("Registration", labelHash, "expiryDate", newExpiry.toString());
    assert.fieldEquals("Domain", namehashOf(label), "expiryDate", (newExpiry + GRACE).toString());
    assert.entityCount("NameRenewed", 1);
  });
});

describe("registrar: token transfer syncs registrant", () => {
  test("ERC1155 transfer updates Registration.registrant + NameTransferred", () => {
    const label = "regtest";
    handleLabelRegistered(labelRegisteredEvent(7, label, OWNER, REG_TS + 31536000));
    handleRegistrarNameRegistered(registrarNameRegisteredEvent(label, OWNER, 31536000, 5000000));

    handleTransferSingle(transferSingleEvent(OWNER2, 7));

    const labelHash = keccakStr(label).toHexString();
    assert.fieldEquals("Registration", labelHash, "registrant", OWNER2);
    assert.fieldEquals("Domain", namehashOf(label), "registrant", OWNER2);
    assert.entityCount("NameTransferred", 1);
  });
});
