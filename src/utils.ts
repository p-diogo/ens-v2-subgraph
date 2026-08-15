// Helpers ported from ensdomains/ens-subgraph/src/utils.ts (v1 semantics)
// plus ENSv2 namehash derivation utilities.

import { BigInt, ByteArray, crypto, log } from "@graphprotocol/graph-ts";
import { Account } from "../generated/schema";

export function createEventID(blockNumber: BigInt, logIndex: BigInt): string {
  return blockNumber.toString().concat("-").concat(logIndex.toString());
}

export const ETH_NODE =
  "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae";
export const ROOT_NODE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
export const EMPTY_ADDRESS_BYTEARRAY = new ByteArray(20);

// The .eth TLD registry (ETHRegistry data source) - parent anchor for 2LDs.
export const ETH_REGISTRY = "0xdedb92913a25abe1f7bcdd85d8a344a43b398b67";
// Root registry (RootRegistry data source) - parent anchor for TLDs.
export const ROOT_REGISTRY = "0xc960f7217d3643b525ef36bec8adf86953cd9ab8";
// Migration controllers register names directly on ETHRegistry; their address
// as LabelRegistered.sender classifies a v1->v2 migrated name.
// Re-pin on RC redeploy (networks.json is the source of truth).
export const LOCKED_MIGRATION_CONTROLLER = "0xf91c34ed840889ed96f806f882fd50506a336edb";
export const UNLOCKED_MIGRATION_CONTROLLER = "0x056138ef5660f7113a3b0adc08ac3683310e7fbc";

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
  if (s.length % 2 !== 0) {
    throw new TypeError("Hex string must have an even number of characters");
  }
  let out = new Uint8Array(s.length / 2);
  for (let i = 0; i < s.length; i += 2) {
    out[i / 2] = parseInt(s.substring(i, i + 2), 16) as u32;
  }
  return changetype<ByteArray>(out);
}

// ENSIP-1 namehash of a single label under a parent node.
export function subnodeHash(parentNode: ByteArray, labelhash: ByteArray): ByteArray {
  return crypto.keccak256(concat(parentNode, labelhash));
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

