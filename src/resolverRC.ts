// RC-generation SharedResolver events -> v1 schema Resolver entities.
// (PR #354 "Add SharedResolver and refactored PermissionedResolver", branch
// feat/public-resolver; indexes the recordId-keyed model before it deploys.)
//
// In this implementation recordId == uint256(namehash(name)) for the canonical
// flow (SharedResolver emits Linked(uint256(node), node, name)), so records map
// straight onto v1 nodes. Linked/DataUpdated/ApprovalUpdated have no v1
// representation and are not indexed (divergence ledger: aliases affect
// resolution-time only; we index stored state, per the official indexing doc).
// Cleared maps onto v1's VersionChanged clearing semantics (version 0).

import { BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import {
  ABIUpdated,
  AddressUpdated,
  TextUpdated,
  ContenthashUpdated,
  InterfaceUpdated,
  NameUpdated,
  Cleared,
} from "../generated/templates/ResolverRC/SharedResolver";
import {
  AbiChanged as AbiChangedEntity,
  AddrChanged as AddrChangedEntity,
  ContenthashChanged as ContenthashChangedEntity,
  Domain,
  InterfaceChanged as InterfaceChangedEntity,
  MulticoinAddrChanged,
  NameChanged as NameChangedEntity,
  TextChanged as TextChangedEntity,
  VersionChanged as VersionChangedEntity,
} from "../generated/schema";
import {
  clearResolverRecords,
  createEventID,
  createOrLoadAccount,
  createOrLoadResolver,
  resolverId,
  trackCoinType,
  trackTextKey,
} from "./utils";

const COIN_TYPE_ETH = 60;

// exported for unit tests (conversion semantics only)
export function recordNode(recordId: BigInt): string {
  // uint256 recordId -> 32-byte node hex (Bytes round-trip keeps the width)
  let hex = recordId.toHexString().slice(2).padStart(64, "0");
  return Bytes.fromHexString(hex).toHexString();
}

export function handleRCAddressUpdated(event: AddressUpdated): void {
  const node = recordNode(event.params.recordId);
  let resolver = createOrLoadResolver(event.address, node);

  const coinType = event.params.coinType;
  if (trackCoinType(resolver, coinType)) {
    resolver.save();
  }

  const isEthAddr =
    coinType == BigInt.fromI32(COIN_TYPE_ETH) && event.params.addressBytes.length == 20;

  // One entity per event: AddrChanged and MulticoinAddrChanged share the
  // ResolverEvent interface, so both under one event id would collide (found
  // by the RC devnet e2e). Coin-60/20-byte mirrors v1's AddrChanged; every
  // other coin maps to MulticoinAddrChanged like v1's multicoin path.
  if (isEthAddr) {
    const addrHex = "0x" + event.params.addressBytes.toHexString().slice(2).padStart(40, "0");
    createOrLoadAccount(addrHex);
    resolver.addr = addrHex;
    resolver.save();

    let domain = Domain.load(node);
    if (domain != null && domain.resolver == resolver.id) {
      domain.resolvedAddress = addrHex;
      domain.save();
    }

    let resolverEvent = new AddrChangedEntity(createEventID(event.block.number, event.logIndex));
    resolverEvent.resolver = resolver.id;
    resolverEvent.blockNumber = event.block.number.toI32();
    resolverEvent.transactionID = event.transaction.hash;
    resolverEvent.addr = addrHex;
    resolverEvent.save();
  } else {
    let resolverEvent = new MulticoinAddrChanged(createEventID(event.block.number, event.logIndex));
    resolverEvent.resolver = resolver.id;
    resolverEvent.blockNumber = event.block.number.toI32();
    resolverEvent.transactionID = event.transaction.hash;
    resolverEvent.coinType = coinType;
    resolverEvent.addr = event.params.addressBytes;
    resolverEvent.save();
  }
}

export function handleRCTextUpdated(event: TextUpdated): void {
  const node = recordNode(event.params.recordId);
  let resolver = createOrLoadResolver(event.address, node);

  const key = event.params.key;
  if (trackTextKey(resolver, key)) {
    resolver.save();
  }

  let resolverEvent = new TextChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.key = key;
  resolverEvent.value = event.params.value;
  resolverEvent.save();
}

export function handleRCContenthashUpdated(event: ContenthashUpdated): void {
  const node = recordNode(event.params.recordId);
  let resolver = createOrLoadResolver(event.address, node);
  resolver.contentHash = event.params.hash;
  resolver.save();

  let resolverEvent = new ContenthashChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.hash = event.params.hash;
  resolverEvent.save();
}

export function handleRCABIUpdated(event: ABIUpdated): void {
  const node = recordNode(event.params.recordId);
  const resolver = createOrLoadResolver(event.address, node);

  let resolverEvent = new AbiChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.contentType = event.params.contentType;
  resolverEvent.save();
}

export function handleRCInterfaceUpdated(event: InterfaceUpdated): void {
  const node = recordNode(event.params.recordId);
  const resolver = createOrLoadResolver(event.address, node);

  let resolverEvent = new InterfaceChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.interfaceID = event.params.interfaceId;
  resolverEvent.implementer = event.params.implementer;
  resolverEvent.save();
}

export function handleRCNameUpdated(event: NameUpdated): void {
  if (event.params.primaryName.indexOf("\u0000") != -1) {
    log.warning("NameUpdated contained null byte on resolver {}, skipping", [
      event.address.toHexString(),
    ]);
    return;
  }
  const node = recordNode(event.params.recordId);
  const resolver = createOrLoadResolver(event.address, node);

  let resolverEvent = new NameChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.name = event.params.primaryName;
  resolverEvent.save();
}

// Cleared = all records for the node wiped: v1's VersionChanged semantics.
export function handleRCCleared(event: Cleared): void {
  const node = recordNode(event.params.recordId);
  const id = resolverId(event.address, node);

  let resolverEvent = new VersionChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.resolver = id;
  resolverEvent.version = BigInt.fromI32(0);
  resolverEvent.save();

  let domain = Domain.load(node);
  if (domain != null && domain.resolver == id) {
    domain.resolvedAddress = null;
    domain.save();
  }

  clearResolverRecords(createOrLoadResolver(event.address, node));
}
