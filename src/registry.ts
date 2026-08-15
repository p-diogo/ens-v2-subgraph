import { Address, BigInt, Bytes, crypto, log } from "@graphprotocol/graph-ts";
import {
  LabelRegistered as ETHLabelRegistered,
  LabelReserved,
  LabelUnregistered,
  ExpiryUpdated,
  SubregistryUpdated,
  ResolverUpdated,
  TokenRegenerated,
  TokenResource,
  RegistryCreated,
  TransferSingle,
  TransferBatch,
  EACRolesChanged,
} from "../generated/ETHRegistry/PermissionedRegistry";
import {
  LabelRegistered as RootLabelRegistered,
  SubregistryUpdated as RootSubregistryUpdatedEvent,
  TransferSingle as RootTransferSingleEvent,
} from "../generated/RootRegistry/PermissionedRegistry";
import {
  LabelRegistered as SubLabelRegistered,
  LabelUnregistered as SubLabelUnregistered,
  ExpiryUpdated as SubExpiryUpdated,
  SubregistryUpdated as SubSubregistryUpdated,
  ResolverUpdated as SubResolverUpdated,
  TokenRegenerated as SubTokenRegenerated,
  TokenResource as SubTokenResource,
  TransferSingle as SubTransferSingle,
  TransferBatch as SubTransferBatch,
} from "../generated/templates/Subregistry/UserRegistry";
import { Subregistry as SubregistryTemplate } from "../generated/templates";
import { Domain, ExpiryExtended, NameTransferred, NewOwner, Registration, Transfer } from "../generated/schema";
import {
  byteArrayFromHex,
  checkValidLabel,
  concat,
  createEventID,
  createOrLoadAccount,
  EMPTY_ADDRESS,
  ETH_NODE,
  LOCKED_MIGRATION_CONTROLLER,
  ROOT_NODE,
  UNLOCKED_MIGRATION_CONTROLLER,
} from "./utils";
import {
  anchorSubregistry,
  ensureRootAndEthDomains,
  loadAnchorParentNode,
  loadNodeForToken,
  saveTokenId,
} from "./internals";

export function handleLabelRegistered(event: ETHLabelRegistered): void {
  ensureRootAndEthDomains(event.block.timestamp);
  labelRegisteredCore(
    event.address,
    event.params.tokenId,
    event.params.labelHash,
    event.params.label,
    event.params.owner,
    event.params.expiry,
    event.params.sender,
    ETH_NODE,
    event.block.timestamp,
    event.block.number,
    event.logIndex,
    event.transaction.hash,
  );
}

function recurseDomainDelete(domain: Domain): string | null {
  if (
    (domain.resolver == null ||
      domain.resolver!.split("-")[0] == EMPTY_ADDRESS) &&
    domain.owner == EMPTY_ADDRESS &&
    domain.subdomainCount == 0
  ) {
    const parentDomain = Domain.load(domain.parent!);
    if (parentDomain != null) {
      parentDomain.subdomainCount = parentDomain.subdomainCount - 1;
      parentDomain.save();
      return recurseDomainDelete(parentDomain);
    }
    return null;
  }
  return domain.id;
}

function saveDomain(domain: Domain): void {
  recurseDomainDelete(domain);
  domain.save();
}

function isMigrationController(sender: Address): boolean {
  const s = sender.toHexString();
  return s == LOCKED_MIGRATION_CONTROLLER || s == UNLOCKED_MIGRATION_CONTROLLER;
}


function labelRegisteredCore(
  registry: Address,
  tokenId: BigInt,
  labelHash: Bytes,
  label: string,
  owner: Address,
  expiry: BigInt,
  sender: Address,
  parentNodeHex: string,
  blockTimestamp: BigInt,
  blockNumber: BigInt,
  logIndex: BigInt,
  txHash: Bytes,
): void {
  const ownerHex = owner.toHexString();
  createOrLoadAccount(ownerHex);

  const parentNode = byteArrayFromHex(parentNodeHex.slice(2));
  const subnode = crypto
    .keccak256(concat(parentNode, labelHash))
    .toHexString();
  let domain = Domain.load(subnode);
  if (domain == null) {
    domain = new Domain(subnode);
    domain.createdAt = blockTimestamp;
    domain.subdomainCount = 0;
  }
  let parent = Domain.load(parentNodeHex);

  if (domain.parent == null && parent != null) {
    parent.subdomainCount = parent.subdomainCount + 1;
    parent.save();
  }

  if (domain.name == null) {
    let labelText = label;
    if (checkValidLabel(labelText)) {
      domain.labelName = labelText;
    } else {
      labelText = "[" + labelHash.toHexString().slice(2) + "]";
    }
    if (parentNodeHex == ROOT_NODE) {
      domain.name = labelText;
    } else if (parent != null) {
      let parentName = parent.name;
      if (parentName != null) {
        domain.name = labelText + "." + parentName!;
      }
    }
  }

  domain.owner = ownerHex;
  domain.parent = parentNodeHex;
  domain.labelhash = labelHash;
  domain.isMigrated = isMigrationController(sender);
  domain.expiryDate = expiry;
  domain.registrant = ownerHex;
  saveDomain(domain);

  saveTokenId(registry, tokenId, subnode);

  let domainEvent = new NewOwner(createEventID(blockNumber, logIndex));
  domainEvent.blockNumber = blockNumber.toI32();
  domainEvent.transactionID = txHash;
  domainEvent.parentDomain = parentNodeHex;
  domainEvent.domain = subnode;
  domainEvent.owner = ownerHex;
  domainEvent.save();
}


function transferSingleCore(
  registry: Address,
  to: Address,
  tokenId: BigInt,
  txHash: Bytes,
  blockNumber: BigInt,
  logIndex: BigInt,
): void {
  const node = loadNodeForToken(registry, tokenId);
  if (!node) {
    log.warning("TransferSingle for unknown tokenId {} on {}", [
      tokenId.toString(),
      registry.toHexString(),
    ]);
    return;
  }

  const ownerHex = to.toHexString();
  createOrLoadAccount(ownerHex);

  const domain = Domain.load(node);
  if (domain == null) {
    return;
  }
  domain.owner = ownerHex;
  saveDomain(domain);

  let domainEvent = new Transfer(createEventID(blockNumber, logIndex));
  domainEvent.blockNumber = blockNumber.toI32();
  domainEvent.transactionID = txHash;
  domainEvent.domain = node;
  domainEvent.owner = ownerHex;
  domainEvent.save();

  // v1 NameTransferred came from BaseRegistrar ERC721 transfers; in v2 the
  // registry token IS the registrar token, so ERC1155 transfers of a 2LD sync
  // the registrant. (Mints precede the registrar's NameRegistered, so no
  // NameTransferred entity is emitted at mint - divergence ledger.)
  let labelHashHex = domain.labelhash ? domain.labelhash!.toHexString() : "";
  if (labelHashHex != "") {
    let registration = Registration.load(labelHashHex);
    if (registration != null) {
      domain.registrant = ownerHex;
      domain.save();
      registration.registrant = ownerHex;
      registration.save();
      let transferEvent = new NameTransferred(createEventID(blockNumber, logIndex));
      transferEvent.registration = labelHashHex;
      transferEvent.blockNumber = blockNumber.toI32();
      transferEvent.transactionID = txHash;
      transferEvent.newOwner = ownerHex;
      transferEvent.save();
    }
  }
}

function subregistryUpdatedCore(
  registry: Address,
  tokenId: BigInt,
  subregistry: Address,
): void {
  const node = loadNodeForToken(registry, tokenId);
  if (!node) {
    log.warning("SubregistryUpdated for unknown tokenId {} on {}", [
      tokenId.toString(),
      registry.toHexString(),
    ]);
    return;
  }
  anchorSubregistry(subregistry, node);
  if (subregistry != Address.zero()) {
    SubregistryTemplate.create(subregistry);
  }
}


function labelUnregisteredCore(
  registry: Address,
  tokenId: BigInt,
  blockTimestamp: BigInt,
): void {
  const node = loadNodeForToken(registry, tokenId);
  if (!node) return;
  const domain = Domain.load(node);
  if (domain == null) return;
  domain.expiryDate = blockTimestamp;
  saveDomain(domain);
}

function expiryUpdatedCore(
  registry: Address,
  tokenId: BigInt,
  newExpiry: BigInt,
  blockNumber: BigInt,
  logIndex: BigInt,
  txHash: Bytes,
): void {
  const node = loadNodeForToken(registry, tokenId);
  if (!node) return;
  const domain = Domain.load(node);
  if (domain == null) return;
  domain.expiryDate = newExpiry;
  saveDomain(domain);

  let domainEvent = new ExpiryExtended(createEventID(blockNumber, logIndex));
  domainEvent.blockNumber = blockNumber.toI32();
  domainEvent.transactionID = txHash;
  domainEvent.domain = node;
  domainEvent.expiryDate = newExpiry;
  domainEvent.save();
}

function tokenRegeneratedCore(
  registry: Address,
  oldTokenId: BigInt,
  newTokenId: BigInt,
): void {
  const node = loadNodeForToken(registry, oldTokenId);
  if (!node) return;
  saveTokenId(registry, newTokenId, node);
}

export function handleLabelReserved(event: LabelReserved): void {}
export function handleLabelUnregistered(event: LabelUnregistered): void {
  labelUnregisteredCore(event.address, event.params.tokenId, event.block.timestamp);
}
export function handleExpiryUpdated(event: ExpiryUpdated): void {
  expiryUpdatedCore(
    event.address,
    event.params.tokenId,
    event.params.newExpiry,
    event.block.number,
    event.logIndex,
    event.transaction.hash,
  );
}
export function handleSubregistryUpdated(event: SubregistryUpdated): void {
  subregistryUpdatedCore(event.address, event.params.tokenId, event.params.subregistry);
}
export function handleResolverUpdated(event: ResolverUpdated): void {}
export function handleTokenRegenerated(event: TokenRegenerated): void {
  tokenRegeneratedCore(event.address, event.params.oldTokenId, event.params.newTokenId);
}
export function handleTokenResource(event: TokenResource): void {}
export function handleRegistryCreated(event: RegistryCreated): void {}
export function handleTransferSingle(event: TransferSingle): void {
  transferSingleCore(
    event.address,
    event.params.to,
    event.params.id,
    event.transaction.hash,
    event.block.number,
    event.logIndex,
  );
}
export function handleTransferBatch(event: TransferBatch): void {
  for (let i = 0; i < event.params.ids.length; i++) {
    transferSingleCore(
      event.address,
      event.params.to,
      event.params.ids[i],
      event.transaction.hash,
      event.block.number,
      event.logIndex,
    );
  }
}
export function handleEACRolesChanged(event: EACRolesChanged): void {}
export function handleRootLabelRegistered(event: RootLabelRegistered): void {
  ensureRootAndEthDomains(event.block.timestamp);
  labelRegisteredCore(
    event.address,
    event.params.tokenId,
    event.params.labelHash,
    event.params.label,
    event.params.owner,
    event.params.expiry,
    event.params.sender,
    ROOT_NODE,
    event.block.timestamp,
    event.block.number,
    event.logIndex,
    event.transaction.hash,
  );
}
export function handleRootSubregistryUpdated(event: RootSubregistryUpdatedEvent): void {
  subregistryUpdatedCore(event.address, event.params.tokenId, event.params.subregistry);
}
export function handleRootTransferSingle(event: RootTransferSingleEvent): void {
  transferSingleCore(
    event.address,
    event.params.to,
    event.params.id,
    event.transaction.hash,
    event.block.number,
    event.logIndex,
  );
}
export function handleSubregistryLabelRegistered(event: SubLabelRegistered): void {
  const anchor = loadAnchorParentNode(event.address);
  if (!anchor) {
    log.warning("LabelRegistered on unanchored subregistry {}", [
      event.address.toHexString(),
    ]);
    return;
  }
  labelRegisteredCore(
    event.address,
    event.params.tokenId,
    event.params.labelHash,
    event.params.label,
    event.params.owner,
    event.params.expiry,
    event.params.sender,
    anchor.toHexString(),
    event.block.timestamp,
    event.block.number,
    event.logIndex,
    event.transaction.hash,
  );
}
export function handleSubregistryLabelUnregistered(event: SubLabelUnregistered): void {
  labelUnregisteredCore(event.address, event.params.tokenId, event.block.timestamp);
}
export function handleSubregistryExpiryUpdated(event: SubExpiryUpdated): void {
  expiryUpdatedCore(
    event.address,
    event.params.tokenId,
    event.params.newExpiry,
    event.block.number,
    event.logIndex,
    event.transaction.hash,
  );
}
export function handleSubregistrySubregistryUpdated(event: SubSubregistryUpdated): void {
  subregistryUpdatedCore(event.address, event.params.tokenId, event.params.subregistry);
}
export function handleSubregistryResolverUpdated(event: SubResolverUpdated): void {}
export function handleSubregistryTokenRegenerated(event: SubTokenRegenerated): void {
  tokenRegeneratedCore(event.address, event.params.oldTokenId, event.params.newTokenId);
}
export function handleSubregistryTokenResource(event: SubTokenResource): void {}
export function handleSubregistryTransferSingle(event: SubTransferSingle): void {
  transferSingleCore(
    event.address,
    event.params.to,
    event.params.id,
    event.transaction.hash,
    event.block.number,
    event.logIndex,
  );
}
export function handleSubregistryTransferBatch(event: SubTransferBatch): void {
  for (let i = 0; i < event.params.ids.length; i++) {
    transferSingleCore(
      event.address,
      event.params.to,
      event.params.ids[i],
      event.transaction.hash,
      event.block.number,
      event.logIndex,
    );
  }
}
