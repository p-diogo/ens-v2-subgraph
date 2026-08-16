// ENSv2 ETHRegistrar events -> v1 schema Registration entities.
//
// Ports ensdomains/ens-subgraph/src/ethRegistrar.ts semantics:
// - Registration.id = labelhash (keccak of the label string; v1 used the
//   BaseRegistrar token id which IS the labelhash)
// - Registration.expiryDate = raw expiry; Domain.expiryDate = expiry + 90d
//   grace (v1 constant 7776000)
// - cost = base + premium (v1 equivalent came from controller events; units
//   are paymentToken (MockUSDC, 6 decimals) instead of ETH wei - divergence
//   ledger)
// Event ordering per ENSv2 docs: registry events (LabelRegistered, mint
// TransferSingle) fire before the registrar's NameRegistered.

import { ByteArray, crypto, log } from "@graphprotocol/graph-ts";
import {
  NameRegistered,
  NameRenewed,
} from "../generated/ETHRegistrar/ETHRegistrar";
import {
  Domain,
  NameRegistered as NameRegisteredEntity,
  NameRenewed as NameRenewedEntity,
  Registration,
} from "../generated/schema";
import {
  byteArrayFromHex,
  checkValidLabel,
  createEventID,
  createOrLoadAccount,
  ETH_NODE,
  GRACE_PERIOD_SECONDS,
  subnodeHash,
} from "./utils";

function labelHashOf(label: string): ByteArray {
  return crypto.keccak256(ByteArray.fromUTF8(label));
}

function nodeOf(labelHash: ByteArray): string {
  return subnodeHash(
    byteArrayFromHex(ETH_NODE.slice(2)),
    labelHash,
  ).toHexString();
}

export function handleRegistrarNameRegistered(event: NameRegistered): void {
  const label = event.params.label;
  const labelHash = labelHashOf(label);
  const labelHashHex = labelHash.toHexString();
  const node = nodeOf(labelHash);

  const ownerHex = event.params.owner.toHexString();
  createOrLoadAccount(ownerHex);

  const expiry = event.block.timestamp.plus(event.params.duration);

  let registration = Registration.load(labelHashHex);
  if (registration == null) {
    registration = new Registration(labelHashHex);
  }
  registration.domain = node;
  registration.registrationDate = event.block.timestamp;
  registration.expiryDate = expiry;
  registration.registrant = ownerHex;
  if (checkValidLabel(label)) {
    registration.labelName = label;
  }
  // v1 filled cost from controller events (base + premium); the v2 registrar
  // carries pricing directly.
  registration.cost = event.params.base.plus(event.params.premium);
  registration.save();

  const domain = Domain.load(node);
  if (domain == null) {
    // registry LabelRegistered fires first in the same tx (header contract);
    // a missing domain means that ordering broke
    log.warning("NameRegistered for known label {} but missing domain {}", [
      label,
      node,
    ]);
    return;
  }
  domain.registrant = ownerHex;
  domain.expiryDate = expiry.plus(GRACE_PERIOD_SECONDS);
  domain.save();

  let registrationEvent = new NameRegisteredEntity(
    createEventID(event.block.number, event.logIndex),
  );
  registrationEvent.registration = labelHashHex;
  registrationEvent.blockNumber = event.block.number.toI32();
  registrationEvent.transactionID = event.transaction.hash;
  registrationEvent.registrant = ownerHex;
  registrationEvent.expiryDate = expiry;
  registrationEvent.save();
}

export function handleRegistrarNameRenewed(event: NameRenewed): void {
  const labelHashHex = labelHashOf(event.params.label).toHexString();

  const registration = Registration.load(labelHashHex);
  if (registration == null) {
    log.warning("NameRenewed for unknown registration {}", [labelHashHex]);
    return;
  }
  registration.expiryDate = event.params.newExpiry;
  registration.save();

  const domain = Domain.load(registration.domain!);
  if (domain == null) {
    log.warning("NameRenewed for known label {} but missing domain {}", [
      event.params.label,
      registration.domain!,
    ]);
    return;
  }
  domain.expiryDate = event.params.newExpiry.plus(GRACE_PERIOD_SECONDS);
  domain.save();

  let registrationEvent = new NameRenewedEntity(
    createEventID(event.block.number, event.logIndex),
  );
  registrationEvent.registration = labelHashHex;
  registrationEvent.blockNumber = event.block.number.toI32();
  registrationEvent.transactionID = event.transaction.hash;
  registrationEvent.expiryDate = event.params.newExpiry;
  registrationEvent.save();
}
