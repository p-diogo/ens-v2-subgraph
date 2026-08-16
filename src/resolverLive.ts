// Live-generation PermissionedResolver events -> v1 schema Resolver entities.
// Port of ensdomains/ens-subgraph/src/resolver.ts: resolver id is
// "<resolverAddress>-<node>"; texts/coinTypes accumulate keys; AddrChanged
// mirrors into Domain.resolvedAddress while the resolver is the domain's
// current one; VersionChanged (v2 clearRecords) wipes record state.

import { log } from "@graphprotocol/graph-ts";
import {
  AddrChanged,
  AddressChanged,
  TextChanged,
  ContenthashChanged,
  ABIChanged,
  InterfaceChanged,
  PubkeyChanged,
  NameChanged,
  VersionChanged,
} from "../generated/templates/ResolverLive/PermissionedResolver";
import {
  AbiChanged as AbiChangedEntity,
  AddrChanged as AddrChangedEntity,
  ContenthashChanged as ContenthashChangedEntity,
  Domain,
  InterfaceChanged as InterfaceChangedEntity,
  MulticoinAddrChanged,
  NameChanged as NameChangedEntity,
  PubkeyChanged as PubkeyChangedEntity,
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

export function handleAddrChanged(event: AddrChanged): void {
  const addrHex = event.params.a.toHexString();
  createOrLoadAccount(addrHex);

  let resolver = createOrLoadResolver(event.address, event.params.node.toHexString(), true);
  resolver.addr = addrHex;
  resolver.save();

  let domain = Domain.load(event.params.node.toHexString());
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
}

export function handleAddressChanged(event: AddressChanged): void {
  let resolver = createOrLoadResolver(event.address, event.params.node.toHexString(), false);

  const coinType = event.params.coinType;
  if (trackCoinType(resolver, coinType)) {
    resolver.save();
  }

  let resolverEvent = new MulticoinAddrChanged(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.coinType = coinType;
  resolverEvent.addr = event.params.newAddress;
  resolverEvent.save();
}

export function handleTextChanged(event: TextChanged): void {
  let resolver = createOrLoadResolver(event.address, event.params.node.toHexString(), false);

  const key = event.params.key;
  if (trackTextKey(resolver, key)) {
    resolver.save();
  }

  let resolverEvent = new TextChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.key = event.params.key;
  resolverEvent.value = event.params.value;
  resolverEvent.save();
}

export function handleContenthashChanged(event: ContenthashChanged): void {
  let resolver = createOrLoadResolver(event.address, event.params.node.toHexString(), false);
  resolver.contentHash = event.params.hash;
  resolver.save();

  let resolverEvent = new ContenthashChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.hash = event.params.hash;
  resolverEvent.save();
}

export function handleABIChanged(event: ABIChanged): void {
  const resolver = createOrLoadResolver(event.address, event.params.node.toHexString(), true);

  let resolverEvent = new AbiChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.contentType = event.params.contentType;
  resolverEvent.save();
}

export function handleInterfaceChanged(event: InterfaceChanged): void {
  const resolver = createOrLoadResolver(event.address, event.params.node.toHexString(), true);

  let resolverEvent = new InterfaceChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.interfaceID = event.params.interfaceID;
  resolverEvent.implementer = event.params.implementer;
  resolverEvent.save();
}

export function handlePubkeyChanged(event: PubkeyChanged): void {
  const resolver = createOrLoadResolver(event.address, event.params.node.toHexString(), true);

  let resolverEvent = new PubkeyChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.x = event.params.x;
  resolverEvent.y = event.params.y;
  resolverEvent.save();
}

export function handleNameChanged(event: NameChanged): void {
  if (event.params.name.indexOf("\u0000") != -1) {
    log.warning("NameChanged contained null byte on resolver {}, skipping", [
      event.address.toHexString(),
    ]);
    return;
  }

  const resolver = createOrLoadResolver(event.address, event.params.node.toHexString(), true);

  let resolverEvent = new NameChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.name = event.params.name;
  resolverEvent.save();
}

export function handleVersionChanged(event: VersionChanged): void {
  const node = event.params.node.toHexString();
  const id = resolverId(event.address, node);

  let resolverEvent = new VersionChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.resolver = id;
  resolverEvent.version = event.params.newVersion;
  resolverEvent.save();

  let domain = Domain.load(node);
  if (domain != null && domain.resolver == id) {
    domain.resolvedAddress = null;
    domain.save();
  }

  clearResolverRecords(createOrLoadResolver(event.address, node, false));
}
