// M4a unit tests: live-generation PermissionedResolver events + ResolverUpdated.

import { describe, test, assert, newMockEvent } from "matchstick-as/assembly/index";
import { Address, BigInt, ByteArray, Bytes, crypto, ethereum } from "@graphprotocol/graph-ts";

import {
  LabelRegistered as ETHLabelRegistered,
  ResolverUpdated,
} from "../generated/ETHRegistry/PermissionedRegistry";
import {
  AddrChanged,
  AddressChanged,
  TextChanged,
  ContenthashChanged,
  VersionChanged,
} from "../generated/templates/ResolverLive/PermissionedResolver";
import { handleLabelRegistered, handleResolverUpdated } from "../src/registry";
import {
  handleAddrChanged,
  handleAddressChanged,
  handleTextChanged,
  handleContenthashChanged,
  handleVersionChanged,
} from "../src/resolverLive";
import { byteArrayFromHex, concat, ETH_NODE } from "../src/utils";

const ETH_REGISTRY = "0xDEDB92913A25abE1f7BCDD85D8A344a43B398B67";
const REGISTRAR = "0x8c2E866B439358c41AE05De9cbE8A00BFEFafFcA";
const OWNER = "0x0000000000000000000000000000000000000001";
const RESOLVER = "0x9794eb37f93ff7f8c5904f18f16796b8521f0f69";
const ADDR2 = "0x0000000000000000000000000000000000000003";

function keccakStr(s: string): ByteArray {
  return crypto.keccak256(ByteArray.fromUTF8(s));
}

function namehashOf(label: string): string {
  return crypto
    .keccak256(concat(byteArrayFromHex(ETH_NODE.slice(2)), keccakStr(label)))
    .toHexString();
}

const TS = 1780000000;

function labelRegisteredEvent(tokenId: i32, label: string, owner: string): ETHLabelRegistered {
  let event = changetype<ETHLabelRegistered>(newMockEvent());
  event.block.timestamp = BigInt.fromI64(TS);
  event.address = Address.fromString(ETH_REGISTRY);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))));
  event.parameters.push(new ethereum.EventParam("labelHash", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(keccakStr(label)))));
  event.parameters.push(new ethereum.EventParam("label", ethereum.Value.fromString(label)));
  event.parameters.push(new ethereum.EventParam("owner", ethereum.Value.fromAddress(Address.fromString(owner))));
  event.parameters.push(new ethereum.EventParam("expiry", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(TS + 31536000))));
  event.parameters.push(new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(REGISTRAR))));
  return event;
}

function resolverUpdatedEvent(tokenId: i32, resolver: string): ResolverUpdated {
  let event = changetype<ResolverUpdated>(newMockEvent());
  event.block.timestamp = BigInt.fromI64(TS);
  event.address = Address.fromString(ETH_REGISTRY);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))));
  event.parameters.push(new ethereum.EventParam("resolver", ethereum.Value.fromAddress(Address.fromString(resolver))));
  event.parameters.push(new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(OWNER))));
  return event;
}

function addrChangedEvent(node: string, a: string): AddrChanged {
  let event = changetype<AddrChanged>(newMockEvent());
  event.address = Address.fromString(RESOLVER);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("node", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(byteArrayFromHex(node.slice(2))))));
  event.parameters.push(new ethereum.EventParam("a", ethereum.Value.fromAddress(Address.fromString(a))));
  return event;
}

function addressChangedEvent(node: string, coinType: i32, addrHex: string, blockNum: i32): AddressChanged {
  let event = changetype<AddressChanged>(newMockEvent());
  event.block.number = BigInt.fromI32(blockNum);
  event.address = Address.fromString(RESOLVER);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("node", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(byteArrayFromHex(node.slice(2))))));
  event.parameters.push(new ethereum.EventParam("coinType", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(coinType))));
  event.parameters.push(new ethereum.EventParam("newAddress", ethereum.Value.fromBytes(Bytes.fromHexString(addrHex))));
  return event;
}

function textChangedEvent(node: string, key: string, value: string, blockNum: i32): TextChanged {
  let event = changetype<TextChanged>(newMockEvent());
  event.block.number = BigInt.fromI32(blockNum);
  event.address = Address.fromString(RESOLVER);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("node", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(byteArrayFromHex(node.slice(2))))));
  event.parameters.push(new ethereum.EventParam("indexedKey", ethereum.Value.fromString(key)));
  event.parameters.push(new ethereum.EventParam("key", ethereum.Value.fromString(key)));
  event.parameters.push(new ethereum.EventParam("value", ethereum.Value.fromString(value)));
  return event;
}

function contenthashChangedEvent(node: string, hashHex: string): ContenthashChanged {
  let event = changetype<ContenthashChanged>(newMockEvent());
  event.address = Address.fromString(RESOLVER);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("node", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(byteArrayFromHex(node.slice(2))))));
  event.parameters.push(new ethereum.EventParam("hash", ethereum.Value.fromBytes(Bytes.fromHexString(hashHex))));
  return event;
}

function versionChangedEvent(node: string): VersionChanged {
  let event = changetype<VersionChanged>(newMockEvent());
  event.address = Address.fromString(RESOLVER);
  event.parameters = new Array();
  event.parameters.push(new ethereum.EventParam("node", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(byteArrayFromHex(node.slice(2))))));
  event.parameters.push(new ethereum.EventParam("newVersion", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(2))));
  return event;
}

const NODE = namehashOf("resolvedemo");
const RESOLVER_ID = RESOLVER + "-" + NODE;

describe("resolver: ResolverUpdated links resolver (v1 NewResolver semantics)", () => {
  test("sets Domain.resolver, creates Resolver entity, emits NewResolver", () => {
    handleLabelRegistered(labelRegisteredEvent(3, "resolvedemo", OWNER));
    handleResolverUpdated(resolverUpdatedEvent(3, RESOLVER));

    assert.fieldEquals("Domain", NODE, "resolver", RESOLVER_ID);
    assert.fieldEquals("Resolver", RESOLVER_ID, "address", RESOLVER);
    assert.fieldEquals("Resolver", RESOLVER_ID, "domain", NODE);
    assert.entityCount("NewResolver", 1);
  });

  test("zero resolver clears the link", () => {
    handleLabelRegistered(labelRegisteredEvent(4, "clearres", OWNER));
    const node = namehashOf("clearres");
    handleResolverUpdated(resolverUpdatedEvent(4, RESOLVER));
    assert.fieldEquals("Domain", node, "resolver", RESOLVER + "-" + node);
    handleResolverUpdated(resolverUpdatedEvent(4, "0x0000000000000000000000000000000000000000"));
    assert.fieldEquals("Domain", node, "resolver", "null");
  });
});

describe("resolver: record events", () => {
  test("AddrChanged sets resolver.addr and domain.resolvedAddress", () => {
    handleLabelRegistered(labelRegisteredEvent(3, "resolvedemo", OWNER));
    handleResolverUpdated(resolverUpdatedEvent(3, RESOLVER));

    handleAddrChanged(addrChangedEvent(NODE, ADDR2));

    assert.fieldEquals("Resolver", RESOLVER_ID, "addr", ADDR2);
    assert.fieldEquals("Domain", NODE, "resolvedAddress", ADDR2);
    assert.entityCount("AddrChanged", 1);
    assert.entityCount("Account", 3); // zero-account + owner + addr target
  });

  test("TextChanged accumulates keys and stores value", () => {
    handleLabelRegistered(labelRegisteredEvent(3, "resolvedemo", OWNER));
    handleResolverUpdated(resolverUpdatedEvent(3, RESOLVER));

    handleTextChanged(textChangedEvent(NODE, "com.twitter", "@ens", 10));
    handleTextChanged(textChangedEvent(NODE, "url", "https://ens.domains", 11));

    assert.fieldEquals("Resolver", RESOLVER_ID, "texts", "[com.twitter, url]");
    assert.entityCount("TextChanged", 2);
  });

  test("AddressChanged tracks coinTypes", () => {
    handleLabelRegistered(labelRegisteredEvent(3, "resolvedemo", OWNER));
    handleResolverUpdated(resolverUpdatedEvent(3, RESOLVER));

    handleAddressChanged(addressChangedEvent(NODE, 60, "0x0000000000000000000000000000000000000003", 12));
    handleAddressChanged(addressChangedEvent(NODE, 1, "0xd8da6bf26964af9d7eed9e03e53415d37aa96045", 13));

    assert.fieldEquals("Resolver", RESOLVER_ID, "coinTypes", "[60, 1]");
    assert.entityCount("MulticoinAddrChanged", 2);
  });

  test("ContenthashChanged sets contentHash", () => {
    handleLabelRegistered(labelRegisteredEvent(3, "resolvedemo", OWNER));
    handleResolverUpdated(resolverUpdatedEvent(3, RESOLVER));

    const hash = "0xe30101701220" + "9c22ff5f42f0ac1b2db25becbb9c9d0a1c1f4ad2eb4a1b7e5f4e5f4e5f4e5f4e";
    handleContenthashChanged(contenthashChangedEvent(NODE, hash));
    assert.fieldEquals("Resolver", RESOLVER_ID, "contentHash", hash.toLowerCase());
    assert.entityCount("ContenthashChanged", 1);
  });

  test("VersionChanged clears records and resolvedAddress (v1 semantics)", () => {
    handleLabelRegistered(labelRegisteredEvent(3, "resolvedemo", OWNER));
    handleResolverUpdated(resolverUpdatedEvent(3, RESOLVER));
    handleAddrChanged(addrChangedEvent(NODE, ADDR2));
    handleTextChanged(textChangedEvent(NODE, "url", "https://ens.domains", 11));

    handleVersionChanged(versionChangedEvent(NODE));

    assert.fieldEquals("Resolver", RESOLVER_ID, "addr", "null");
    assert.fieldEquals("Resolver", RESOLVER_ID, "texts", "null");
    assert.fieldEquals("Domain", NODE, "resolvedAddress", "null");
    assert.entityCount("VersionChanged", 1);
  });
});
