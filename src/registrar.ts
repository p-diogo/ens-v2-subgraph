// ENSv2 ETHRegistrar events -> v1 schema Registration entities.
// Filled in M3 (see docs/PLAN.md). Stubs keep the manifest buildable.

import {
  NameRegistered,
  NameRenewed,
} from '../generated/ETHRegistrar/ETHRegistrar'

export function handleRegistrarNameRegistered(event: NameRegistered): void {}

export function handleRegistrarNameRenewed(event: NameRenewed): void {}
