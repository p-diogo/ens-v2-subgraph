// M2 unit tests: ENSv2 registry events -> v1 schema Domain tree.

import {
  clearStore,
  describe,
  test,
  assert,
  newMockEvent,
} from "matchstick-as/assembly/index";
import { Address, BigInt, ByteArray, Bytes, crypto, ethereum } from "@graphprotocol/graph-ts";

import {
  LabelRegistered as ETHLabelRegistered,
  LabelUnregistered,
  ExpiryUpdated,
  ResolverUpdated,
  TokenRegenerated,
  TransferSingle,
  TransferBatch,
} from "../generated/ETHRegistry/PermissionedRegistry";
import {
  LabelRegistered as RootLabelRegistered,
} from "../generated/RootRegistry/PermissionedRegistry";
import {
  handleLabelRegistered,
  handleLabelUnregistered,
  handleExpiryUpdated,
  handleResolverUpdated,
  handleTokenRegenerated,
  handleTransferSingle,
  handleTransferBatch,
  handleRootLabelRegistered,
} from "../src/registry";
import {
  byteArrayFromHex,
  ETH_NODE,
  EMPTY_ADDRESS,
  ROOT_NODE,
  subnodeHash,
} from "../src/utils";

export const ETH_REGISTRY = "0xDEDB92913A25abE1f7BCDD85D8A344a43B398B67";
export const ROOT_REGISTRY = "0xc960F7217d3643B525Ef36Bec8Adf86953CD9aB8";
export const REGISTRAR = "0x8c2E866B439358c41AE05De9cbE8A00BFEFafFcA";
export const LOCKED_MIGRATION_CONTROLLER = "0xF91c34ED840889Ed96F806f882fD50506A336Edb";
export const OWNER = "0x0000000000000000000000000000000000000001";
export const OWNER2 = "0x0000000000000000000000000000000000000002";

// Canonical test helpers: keccakStr for label hashes, subnodeOf/namehashOf
// for ENSIP-1 derivation via the production subnodeHash helper.
export function keccakStr(s: string): ByteArray {
  return crypto.keccak256(ByteArray.fromUTF8(s));
}

export function subnodeOf(parentHex: string, labelHash: ByteArray): string {
  return subnodeHash(byteArrayFromHex(parentHex.slice(2)), labelHash).toHexString();
}

export function namehashOf(label: string): string {
  return subnodeOf(ETH_NODE, keccakStr(label));
}

export function labelRegisteredEvent(
  tokenId: i32,
  label: string,
  owner: string,
  expiry: i64,
  sender: string,
  address: string,
): ETHLabelRegistered {
  let event = changetype<ETHLabelRegistered>(newMockEvent());
  event.address = Address.fromString(address);
  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))),
  );
  event.parameters.push(
    new ethereum.EventParam("labelHash", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(keccakStr(label)))),
  );
  event.parameters.push(
    new ethereum.EventParam("label", ethereum.Value.fromString(label)),
  );
  event.parameters.push(
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(Address.fromString(owner))),
  );
  event.parameters.push(
    new ethereum.EventParam("expiry", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(expiry))),
  );
  event.parameters.push(
    new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(sender))),
  );
  return event;
}

export function transferSingleEvent(
  from: string,
  to: string,
  tokenId: i32,
  address: string,
): TransferSingle {
  let event = changetype<TransferSingle>(newMockEvent());
  event.address = Address.fromString(address);
  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("operator", ethereum.Value.fromAddress(Address.fromString(from))),
  );
  event.parameters.push(
    new ethereum.EventParam("from", ethereum.Value.fromAddress(Address.fromString(from))),
  );
  event.parameters.push(
    new ethereum.EventParam("to", ethereum.Value.fromAddress(Address.fromString(to))),
  );
  event.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))),
  );
  event.parameters.push(
    new ethereum.EventParam("value", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
  );
  return event;
}

export const EXPIRY = 1824000000; // fixed timestamp

describe("registry: LabelRegistered on ETHRegistry", () => {
  test("seeds root and eth domains, creates the 2LD with v1 semantics", () => {
    clearStore();
    const node = namehashOf("asteria");

    handleLabelRegistered(
      labelRegisteredEvent(1, "asteria", OWNER, EXPIRY, REGISTRAR, ETH_REGISTRY),
    );

    // seeds
    assert.fieldEquals("Domain", ROOT_NODE, "isMigrated", "true");
    assert.fieldEquals("Domain", ETH_NODE, "name", "eth");
    assert.fieldEquals("Domain", ETH_NODE, "parent", ROOT_NODE);

    // the registered 2LD
    assert.fieldEquals("Domain", node, "name", "asteria.eth");
    assert.fieldEquals("Domain", node, "labelName", "asteria");
    assert.fieldEquals("Domain", node, "labelhash", keccakStr("asteria").toHexString());
    assert.fieldEquals("Domain", node, "owner", OWNER);
    assert.fieldEquals("Domain", node, "parent", ETH_NODE);
    assert.fieldEquals("Domain", node, "expiryDate", EXPIRY.toString());
    assert.fieldEquals("Domain", node, "isMigrated", "false");
    assert.fieldEquals("Domain", node, "registrant", OWNER);

    // parent bookkeeping
    assert.fieldEquals("Domain", ETH_NODE, "subdomainCount", "1");

    // accounts (seeded zero-account + owner) + event entity
    assert.entityCount("Account", 2);
    assert.entityCount("NewOwner", 1);

    // tokenId -> node mapping
    assert.fieldEquals(
      "_TokenId",
      ETH_REGISTRY.toLowerCase() + "-1",
      "node",
      node,
    );
  });

  test("migration controller sender sets isMigrated=true", () => {
    clearStore();
    const node = namehashOf("migratedname");
    handleLabelRegistered(
      labelRegisteredEvent(2, "migratedname", OWNER, EXPIRY, LOCKED_MIGRATION_CONTROLLER, ETH_REGISTRY),
    );
    assert.fieldEquals("Domain", node, "isMigrated", "true");
  });

  test("invalid label falls back to [labelhash] name without labelName", () => {
    clearStore();
    const labelHash = keccakStr("bad.label");
    const node = subnodeOf(ETH_NODE, labelHash);
    handleLabelRegistered(
      labelRegisteredEvent(3, "bad.label", OWNER, EXPIRY, REGISTRAR, ETH_REGISTRY),
    );
    const expectedName = "[" + labelHash.toHexString().slice(2) + "]" + ".eth";
    assert.fieldEquals("Domain", node, "name", expectedName);
  });
});

describe("registry: LabelRegistered on RootRegistry (TLD names)", () => {
  test("registers a bare TLD name under the root node", () => {
    clearStore();
    const node = subnodeOf(ROOT_NODE, keccakStr("box"));

    let event = changetype<RootLabelRegistered>(newMockEvent());
    event.address = Address.fromString(ROOT_REGISTRY);
    event.parameters = new Array();
    event.parameters.push(
      new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(9))),
    );
    event.parameters.push(
      new ethereum.EventParam("labelHash", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(keccakStr("box")))),
    );
    event.parameters.push(
      new ethereum.EventParam("label", ethereum.Value.fromString("box")),
    );
    event.parameters.push(
      new ethereum.EventParam("owner", ethereum.Value.fromAddress(Address.fromString(OWNER))),
    );
    event.parameters.push(
      new ethereum.EventParam("expiry", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(EXPIRY))),
    );
    event.parameters.push(
      new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(REGISTRAR))),
    );
    handleRootLabelRegistered(event);

    // TLD names get the bare label (no parent-name suffix)
    assert.fieldEquals("Domain", node, "name", "box");
    assert.fieldEquals("Domain", node, "labelName", "box");
    assert.fieldEquals("Domain", node, "parent", ROOT_NODE);
    assert.fieldEquals("Domain", ROOT_NODE, "subdomainCount", "1");
  });
});

describe("registry: TransferSingle on ETHRegistry", () => {
  test("updates domain owner and records a Transfer event", () => {
    clearStore();
    handleLabelRegistered(
      labelRegisteredEvent(1, "asteria", OWNER, EXPIRY, REGISTRAR, ETH_REGISTRY),
    );
    const node = namehashOf("asteria");

    handleTransferSingle(transferSingleEvent(OWNER, OWNER2, 1, ETH_REGISTRY));

    assert.fieldEquals("Domain", node, "owner", OWNER2);
    assert.entityCount("Transfer", 1);
  });
});

describe("registry: TransferBatch on ETHRegistry", () => {
  test("persists one Transfer entity per token (no id collision)", () => {
    clearStore();
    handleLabelRegistered(
      labelRegisteredEvent(1, "batchone", OWNER, EXPIRY, REGISTRAR, ETH_REGISTRY),
    );
    handleLabelRegistered(
      labelRegisteredEvent(2, "batchtwo", OWNER, EXPIRY, REGISTRAR, ETH_REGISTRY),
    );

    let event = changetype<TransferBatch>(newMockEvent());
    event.address = Address.fromString(ETH_REGISTRY);
    event.parameters = new Array();
    event.parameters.push(
      new ethereum.EventParam("operator", ethereum.Value.fromAddress(Address.fromString(OWNER))),
    );
    event.parameters.push(
      new ethereum.EventParam("from", ethereum.Value.fromAddress(Address.fromString(OWNER))),
    );
    event.parameters.push(
      new ethereum.EventParam("to", ethereum.Value.fromAddress(Address.fromString(OWNER2))),
    );
    event.parameters.push(
      new ethereum.EventParam(
        "ids",
        ethereum.Value.fromUnsignedBigIntArray([BigInt.fromI32(1), BigInt.fromI32(2)]),
      ),
    );
    event.parameters.push(
      new ethereum.EventParam(
        "values",
        ethereum.Value.fromUnsignedBigIntArray([BigInt.fromI32(1), BigInt.fromI32(1)]),
      ),
    );
    handleTransferBatch(event);

    // regression: without the per-item id suffix the two Transfers collide
    // and only one survives (graph-node upserts by id)
    assert.entityCount("Transfer", 2);
    assert.fieldEquals("Domain", namehashOf("batchone"), "owner", OWNER2);
    assert.fieldEquals("Domain", namehashOf("batchtwo"), "owner", OWNER2);
  });
});

describe("registry: ExpiryUpdated", () => {
  test("sets domain expiry (raw) and emits ExpiryExtended", () => {
    clearStore();
    handleLabelRegistered(
      labelRegisteredEvent(1, "asteria", OWNER, EXPIRY, REGISTRAR, ETH_REGISTRY),
    );

    let event = changetype<ExpiryUpdated>(newMockEvent());
    event.address = Address.fromString(ETH_REGISTRY);
    event.parameters = new Array();
    event.parameters.push(
      new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    );
    event.parameters.push(
      new ethereum.EventParam("newExpiry", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(EXPIRY + 1000))),
    );
    event.parameters.push(
      new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(REGISTRAR))),
    );
    handleExpiryUpdated(event);

    assert.fieldEquals("Domain", namehashOf("asteria"), "expiryDate", (EXPIRY + 1000).toString());
    assert.entityCount("ExpiryExtended", 1);
  });
});

describe("registry: TokenRegenerated", () => {
  test("moves the tokenId -> node mapping (id stability)", () => {
    clearStore();
    handleLabelRegistered(
      labelRegisteredEvent(1, "asteria", OWNER, EXPIRY, REGISTRAR, ETH_REGISTRY),
    );
    const node = namehashOf("asteria");

    let event = changetype<TokenRegenerated>(newMockEvent());
    event.address = Address.fromString(ETH_REGISTRY);
    event.parameters = new Array();
    event.parameters.push(
      new ethereum.EventParam("oldTokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    );
    event.parameters.push(
      new ethereum.EventParam("newTokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(42))),
    );
    handleTokenRegenerated(event);

    // the new tokenId resolves to the SAME node (this mapping is what the
    // _TokenId entity exists for)
    assert.fieldEquals("_TokenId", ETH_REGISTRY.toLowerCase() + "-42", "node", node);
    // and events keyed by the new tokenId still reach the domain
    handleTransferSingle(transferSingleEvent(OWNER, OWNER2, 42, ETH_REGISTRY));
    assert.fieldEquals("Domain", node, "owner", OWNER2);
  });
});

describe("registry: LabelUnregistered + burn prune", () => {
  test("lapses expiry, keeps the entity, and prunes parent subdomainCount on burn", () => {
    clearStore();
    handleLabelRegistered(
      labelRegisteredEvent(1, "asteria", OWNER, EXPIRY, REGISTRAR, ETH_REGISTRY),
    );
    const node = namehashOf("asteria");

    let event = changetype<LabelUnregistered>(newMockEvent());
    event.address = Address.fromString(ETH_REGISTRY);
    event.parameters = new Array();
    event.parameters.push(
      new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    );
    event.parameters.push(
      new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(REGISTRAR))),
    );
    handleLabelUnregistered(event);

    // expiry lapses to the unregister timestamp (raw, no grace: name is dead)
    assert.fieldEquals("Domain", node, "expiryDate", event.block.timestamp.toString());

    // burning the token empties the domain; v1 keeps the entity but prunes
    // the parent's subdomainCount via the (logical-only) delete recursion
    handleTransferSingle(transferSingleEvent(OWNER, EMPTY_ADDRESS, 1, ETH_REGISTRY));
    assert.fieldEquals("Domain", node, "owner", EMPTY_ADDRESS);
    assert.fieldEquals("Domain", ETH_NODE, "subdomainCount", "0");
    // entity survives (v1 pruning never removes rows)
    assert.entityCount("Domain", 3); // root + eth + asteria
  });
});


describe("registry: guard paths (unknown tokenIds are warn-and-skip)", () => {
  test("TransferSingle for an unminted tokenId writes nothing", () => {
    clearStore();
    handleLabelRegistered(
      labelRegisteredEvent(1, "asteria", OWNER, EXPIRY, REGISTRAR, ETH_REGISTRY),
    );
    const node = namehashOf("asteria");

    handleTransferSingle(transferSingleEvent(OWNER, OWNER2, 999, ETH_REGISTRY));

    assert.entityCount("Transfer", 0);
    assert.fieldEquals("Domain", node, "owner", OWNER); // untouched
  });

  test("ResolverUpdated for an unminted tokenId writes nothing", () => {
    clearStore();
    let event = changetype<ResolverUpdated>(newMockEvent());
    event.address = Address.fromString(ETH_REGISTRY);
    event.parameters = new Array();
    event.parameters.push(new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(999))));
    event.parameters.push(new ethereum.EventParam("resolver", ethereum.Value.fromAddress(Address.fromString("0x9794eb37f93ff7f8c5904f18f16796b8521f0f69"))));
    event.parameters.push(new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(OWNER))));
    handleResolverUpdated(event);
    assert.entityCount("NewResolver", 0);
  });

  test("bracket-char labels fall back to [labelhash] names", () => {
    clearStore();
    // '[' is rejected by checkValidLabel (null bytes don't survive mock string
    // marshalling; the null-byte NAME paths are covered in the resolver tests)
    const labelHash = keccakStr("bad[label");
    const node = subnodeOf(ETH_NODE, labelHash);
    handleLabelRegistered(
      labelRegisteredEvent(4, "bad[label", OWNER, EXPIRY, REGISTRAR, ETH_REGISTRY),
    );
    // invalid label -> no labelName ever set; name falls back to [labelhash]
    assert.fieldEquals("Domain", node, "name", "[" + labelHash.toHexString().slice(2) + "]" + ".eth");
  });
});
