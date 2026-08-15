// Live-generation PermissionedResolver events -> v1 schema Resolver entities.
// Port of ensdomains/ens-subgraph/src/resolver.ts: resolver id is
// "<resolverAddress>-<node>"; texts/coinTypes accumulate keys; AddrChanged
// mirrors into Domain.resolvedAddress while the resolver is the domain's
// current one; VersionChanged (v2 clearRecords) wipes record state.

import { Address, Bytes } from "@graphprotocol/graph-ts";
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
  Resolver,
  TextChanged as TextChangedEntity,
  VersionChanged as VersionChangedEntity,
} from "../generated/schema";
import { createEventID, createOrLoadAccount } from "./utils";

export function createResolverID(node: Bytes, resolver: Address): string {
  return resolver.toHexString() + "-" + node.toHexString();
}

function getOrCreateResolver(
  node: Bytes,
  address: Address,
  saveOnNew: boolean,
): Resolver {
  let id = createResolverID(node, address);
  let resolver = Resolver.load(id);
  if (resolver == null) {
    resolver = new Resolver(id);
    resolver.domain = node.toHexString();
    resolver.address = address;
    if (saveOnNew) {
      resolver.save();
    }
  }
  return resolver!;
}

export function handleAddrChanged(event: AddrChanged): void {
  const addrHex = event.params.a.toHexString();
  createOrLoadAccount(addrHex);

  let resolver = getOrCreateResolver(event.params.node, event.address, true);
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
  let resolver = getOrCreateResolver(event.params.node, event.address, false);

  const coinType = event.params.coinType;
  if (resolver.coinTypes == null) {
    resolver.coinTypes = [coinType];
    resolver.save();
  } else {
    let coinTypes = resolver.coinTypes!;
    if (!coinTypes.includes(coinType)) {
      coinTypes.push(coinType);
      resolver.coinTypes = coinTypes;
      resolver.save();
    }
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
  let resolver = getOrCreateResolver(event.params.node, event.address, false);

  const key = event.params.key;
  if (resolver.texts == null) {
    resolver.texts = [key];
    resolver.save();
  } else {
    let texts = resolver.texts!;
    if (!texts.includes(key)) {
      texts.push(key);
      resolver.texts = texts;
      resolver.save();
    }
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
  let resolver = getOrCreateResolver(event.params.node, event.address, false);
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
  const resolver = getOrCreateResolver(event.params.node, event.address, true);

  let resolverEvent = new AbiChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.contentType = event.params.contentType;
  resolverEvent.save();
}

export function handleInterfaceChanged(event: InterfaceChanged): void {
  const resolver = getOrCreateResolver(event.params.node, event.address, true);

  let resolverEvent = new InterfaceChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.interfaceID = event.params.interfaceID;
  resolverEvent.implementer = event.params.implementer;
  resolverEvent.save();
}

export function handlePubkeyChanged(event: PubkeyChanged): void {
  const resolver = getOrCreateResolver(event.params.node, event.address, true);

  let resolverEvent = new PubkeyChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.x = event.params.x;
  resolverEvent.y = event.params.y;
  resolverEvent.save();
}

export function handleNameChanged(event: NameChanged): void {
  if (event.params.name.indexOf("\u0000") != -1) return;

  const resolver = getOrCreateResolver(event.params.node, event.address, true);

  let resolverEvent = new NameChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.resolver = resolver.id;
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.name = event.params.name;
  resolverEvent.save();
}

export function handleVersionChanged(event: VersionChanged): void {
  let resolverEvent = new VersionChangedEntity(createEventID(event.block.number, event.logIndex));
  resolverEvent.blockNumber = event.block.number.toI32();
  resolverEvent.transactionID = event.transaction.hash;
  resolverEvent.resolver = createResolverID(event.params.node, event.address);
  resolverEvent.version = event.params.newVersion;
  resolverEvent.save();

  let domain = Domain.load(event.params.node.toHexString());
  if (domain != null && domain.resolver == resolverEvent.resolver) {
    domain.resolvedAddress = null;
    domain.save();
  }

  let resolver = getOrCreateResolver(event.params.node, event.address, false);
  resolver.addr = null;
  resolver.contentHash = null;
  resolver.texts = null;
  resolver.coinTypes = null;
  resolver.save();
}
