// M2 unit tests: ENSv2 registry events -> v1 schema Domain tree.
// RED first: handlers are no-ops until src/registry.ts is implemented.

import { describe, test, assert, newMockEvent } from "matchstick-as/assembly/index";
import { Address, BigInt, ByteArray, Bytes, crypto, ethereum } from "@graphprotocol/graph-ts";

import {
  LabelRegistered as ETHLabelRegistered,
  TransferSingle,
} from "../generated/ETHRegistry/PermissionedRegistry";
import {
  handleLabelRegistered,
  handleTransferSingle,
} from "../src/registry";
import { byteArrayFromHex, concat, ETH_NODE, ROOT_NODE } from "../src/utils";

const ETH_REGISTRY = "0xDEDB92913A25abE1f7BCDD85D8A344a43B398B67";
const REGISTRAR = "0x8c2E866B439358c41AE05De9cbE8A00BFEFafFcA";
const LOCKED_MIGRATION_CONTROLLER = "0xF91c34ED840889Ed96F806f882fD50506A336Edb";
const OWNER = "0x0000000000000000000000000000000000000001";
const OWNER2 = "0x0000000000000000000000000000000000000002";

function keccak(s: string): ByteArray {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) as u8;
  return crypto.keccak256(changetype<ByteArray>(bytes));
}

function namehash(parentHex: string, labelhash: ByteArray): string {
  return crypto
    .keccak256(concat(byteArrayFromHex(parentHex.slice(2)), labelhash))
    .toHexString();
}

function labelRegisteredEvent(
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
    new ethereum.EventParam("labelHash", ethereum.Value.fromFixedBytes(Bytes.fromByteArray(keccak(label)))),
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

function transferSingleEvent(
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

const EXPIRY = 1824000000; // fixed timestamp

describe("registry: LabelRegistered on ETHRegistry", () => {
  test("seeds root and eth domains, creates the 2LD with v1 semantics", () => {
    const node = namehash(ETH_NODE, keccak("asteria"));

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
    assert.fieldEquals("Domain", node, "labelhash", keccak("asteria").toHexString());
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
    const node = namehash(ETH_NODE, keccak("migratedname"));
    handleLabelRegistered(
      labelRegisteredEvent(2, "migratedname", OWNER, EXPIRY, LOCKED_MIGRATION_CONTROLLER, ETH_REGISTRY),
    );
    assert.fieldEquals("Domain", node, "isMigrated", "true");
  });

  test("invalid label falls back to [labelhash] name without labelName", () => {
    const labelHash = keccak("bad.label");
    const node = namehash(ETH_NODE, labelHash);
    handleLabelRegistered(
      labelRegisteredEvent(3, "bad.label", OWNER, EXPIRY, REGISTRAR, ETH_REGISTRY),
    );
    const expectedName = "[" + labelHash.toHexString().slice(2) + "]" + ".eth";
    assert.fieldEquals("Domain", node, "name", expectedName);
  });
});

describe("registry: TransferSingle on ETHRegistry", () => {
  test("updates domain owner and records a Transfer event", () => {
    handleLabelRegistered(
      labelRegisteredEvent(1, "asteria", OWNER, EXPIRY, REGISTRAR, ETH_REGISTRY),
    );
    const node = namehash(ETH_NODE, keccak("asteria"));

    handleTransferSingle(transferSingleEvent(OWNER, OWNER2, 1, ETH_REGISTRY));

    assert.fieldEquals("Domain", node, "owner", OWNER2);
    assert.entityCount("Transfer", 1);
  });
});
