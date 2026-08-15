// Live-generation PermissionedResolver events -> v1 schema Resolver entities.
// Record setters emit classic node-keyed events identical in shape to the v1
// PublicResolver; the mapping ports the v1 resolver logic. Filled in M4a.

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
} from '../generated/templates/ResolverLive/PermissionedResolver'

export function handleAddrChanged(event: AddrChanged): void {}

export function handleAddressChanged(event: AddressChanged): void {}

export function handleTextChanged(event: TextChanged): void {}

export function handleContenthashChanged(event: ContenthashChanged): void {}

export function handleABIChanged(event: ABIChanged): void {}

export function handleInterfaceChanged(event: InterfaceChanged): void {}

export function handlePubkeyChanged(event: PubkeyChanged): void {}

export function handleNameChanged(event: NameChanged): void {}

export function handleVersionChanged(event: VersionChanged): void {}
