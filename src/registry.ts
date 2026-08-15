// ENSv2 registry events -> v1 schema Domain tree.
// Filled in M2/M3/M5 (see docs/PLAN.md). Stubs keep the manifest buildable.

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
} from '../generated/ETHRegistry/PermissionedRegistry'
import {
  LabelRegistered as RootLabelRegistered,
  SubregistryUpdated as RootSubregistryUpdatedEvent,
  TransferSingle as RootTransferSingleEvent,
} from '../generated/RootRegistry/PermissionedRegistry'
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
} from '../generated/templates/Subregistry/UserRegistry'

// ETHRegistry (.eth TLD registry)

export function handleLabelRegistered(event: ETHLabelRegistered): void {}

export function handleLabelReserved(event: LabelReserved): void {}

export function handleLabelUnregistered(event: LabelUnregistered): void {}

export function handleExpiryUpdated(event: ExpiryUpdated): void {}

export function handleSubregistryUpdated(event: SubregistryUpdated): void {}

export function handleResolverUpdated(event: ResolverUpdated): void {}

export function handleTokenRegenerated(event: TokenRegenerated): void {}

export function handleTokenResource(event: TokenResource): void {}

export function handleRegistryCreated(event: RegistryCreated): void {}

export function handleTransferSingle(event: TransferSingle): void {}

export function handleTransferBatch(event: TransferBatch): void {}

export function handleEACRolesChanged(event: EACRolesChanged): void {}

// RootRegistry (root node / TLDs)

export function handleRootLabelRegistered(event: RootLabelRegistered): void {}

export function handleRootSubregistryUpdated(event: RootSubregistryUpdatedEvent): void {}

export function handleRootTransferSingle(event: RootTransferSingleEvent): void {}

// Subregistry template (UserRegistry proxies: subnames of a parent name)

export function handleSubregistryLabelRegistered(event: SubLabelRegistered): void {}

export function handleSubregistryLabelUnregistered(event: SubLabelUnregistered): void {}

export function handleSubregistryExpiryUpdated(event: SubExpiryUpdated): void {}

export function handleSubregistrySubregistryUpdated(event: SubSubregistryUpdated): void {}

export function handleSubregistryResolverUpdated(event: SubResolverUpdated): void {}

export function handleSubregistryTokenRegenerated(event: SubTokenRegenerated): void {}

export function handleSubregistryTokenResource(event: SubTokenResource): void {}

export function handleSubregistryTransferSingle(event: SubTransferSingle): void {}

export function handleSubregistryTransferBatch(event: SubTransferBatch): void {}
