// Helpers ported from ensdomains/ens-subgraph/src/utils.ts (v1 semantics)
// plus ENSv2 namehash derivation utilities.

import { Address, BigInt, ByteArray, crypto, log } from "@graphprotocol/graph-ts";
import { Account, Resolver } from "../generated/schema";

export function createEventID(blockNumber: BigInt, logIndex: BigInt): string {
  return blockNumber.toString().concat("-").concat(logIndex.toString());
}

export const ETH_NODE =
  "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae";
export const ROOT_NODE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";

// Migration controllers register names directly on ETHRegistry; their address
// as LabelRegistered.sender classifies a v1->v2 migrated name.
// Re-pin on RC redeploy (networks.json is the source of truth; the pins
// harness asserts the two stay in sync). Devnet has no migration flow (fresh
// registrations only), so no devnet controllers are listed here.
export const LOCKED_MIGRATION_CONTROLLER = "0xf91c34ed840889ed96f806f882fd50506a336edb";
export const UNLOCKED_MIGRATION_CONTROLLER = "0x056138ef5660f7113a3b0adc08ac3683310e7fbc";

// v1's 90-day grace period added to raw expiry when writing Domain.expiryDate
// from registrar events (registrations keep the raw expiry).
export const GRACE_PERIOD_SECONDS = BigInt.fromI32(7776000);

// Helper for concatenating two byte arrays
export function concat(a: ByteArray, b: ByteArray): ByteArray {
  let out = new Uint8Array(a.length + b.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i];
  }
  for (let j = 0; j < b.length; j++) {
    out[a.length + j] = b[j];
  }
  return changetype<ByteArray>(out);
}

export function byteArrayFromHex(s: string): ByteArray {
  // Throws on odd-length hex: callers only feed internal constants
  // (ETH_NODE and node hex produced by Bytes.toHexString).
  if (s.length % 2 !== 0) {
    throw new TypeError("Hex string must have an even number of characters");
  }
  let out = new Uint8Array(s.length / 2);
  for (let i = 0; i < s.length; i += 2) {
    out[i / 2] = parseInt(s.substring(i, i + 2), 16) as u32;
  }
  return changetype<ByteArray>(out);
}

// ENSIP-1 namehash of a single label under a parent node. This derives the
// Domain entity primary key — the single home for the derivation.
export function subnodeHash(parentNode: ByteArray, labelhash: ByteArray): ByteArray {
  return crypto.keccak256(concat(parentNode, labelhash));
}

// Resolver entity id: "<resolverAddress>-<node>" (v1 format, DIVERGENCES S5).
// Both resolver generations and the registry join Domain.resolver == Resolver.id
// on this exact string, so it has exactly one definition here.
export function resolverId(resolverAddress: Address, node: string): string {
  return resolverAddress.toHexString() + "-" + node;
}

// Load-or-create a Resolver for (address, node). saveOnNew=false is for
// handlers that mutate record fields and save afterwards; true persists the
// entity immediately so a ResolverEvent can reference it.
export function createOrLoadResolver(
  address: Address,
  node: string,
  saveOnNew: boolean,
): Resolver {
  let id = resolverId(address, node);
  let resolver = Resolver.load(id);
  if (resolver == null) {
    resolver = new Resolver(id);
    resolver.domain = node;
    resolver.address = address;
    if (saveOnNew) {
      resolver.save();
    }
  }
  return resolver!;
}

// Append coinType to resolver.coinTypes if absent; returns true when the
// list changed (caller saves). Shared by both resolver generations.
export function trackCoinType(resolver: Resolver, coinType: BigInt): boolean {
  if (resolver.coinTypes == null) {
    resolver.coinTypes = [coinType];
    return true;
  }
  let coinTypes = resolver.coinTypes!;
  if (!coinTypes.includes(coinType)) {
    coinTypes.push(coinType);
    resolver.coinTypes = coinTypes;
    return true;
  }
  return false;
}

// Text-record key twin of trackCoinType.
export function trackTextKey(resolver: Resolver, key: string): boolean {
  if (resolver.texts == null) {
    resolver.texts = [key];
    return true;
  }
  let texts = resolver.texts!;
  if (!texts.includes(key)) {
    texts.push(key);
    resolver.texts = texts;
    return true;
  }
  return false;
}

// v1 clearRecords semantics (VersionChanged / RC Cleared): wipe all record
// state on the Resolver entity (shared by both generations).
export function clearResolverRecords(resolver: Resolver): void {
  resolver.addr = null;
  resolver.contentHash = null;
  resolver.texts = null;
  resolver.coinTypes = null;
  resolver.save();
}

export function createOrLoadAccount(address: string): Account {
  let account = Account.load(address);
  if (account == null) {
    account = new Account(address);
    account.save();
  }
  return account;
}

export function checkValidLabel(name: string | null): boolean {
  if (name == null) {
    return false;
  }
  name = name!;
  for (let i = 0; i < name.length; i++) {
    let charCode = name.charCodeAt(i);
    if (charCode === 0) {
      // 0 = null byte
      log.warning("Invalid label '{}' contained null byte. Skipping.", [name]);
      return false;
    } else if (charCode === 46) {
      // 46 = .
      log.warning("Invalid label '{}' contained separator char '.'. Skipping.", [name]);
      return false;
    } else if (charCode === 91) {
      // 91 = [
      log.warning("Invalid label '{}' contained char '['. Skipping.", [name]);
      return false;
    } else if (charCode === 93) {
      // 93 = ]
      log.warning("Invalid label '{}' contained char ']'. Skipping.", [name]);
      return false;
    }
  }
  return true;
}

