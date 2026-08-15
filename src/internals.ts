// Internal bookkeeping for the ENSv2 -> v1 mapping:
// - root/eth domain seeding (the .eth TLD link predates our start block and
//   emits no logs we can observe)
// - _RegistryAnchor: dynamically linked subregistries -> the parent node whose
//   children they manage (written on SubregistryUpdated, read by the
//   Subregistry template handlers)
// - _TokenId: (registry, tokenId) -> domain node, surviving TokenRegenerated

import { Address, BigInt, ByteArray, Bytes, crypto } from "@graphprotocol/graph-ts";
import { _RegistryAnchor, _TokenId, Domain } from "../generated/schema";
import {
  byteArrayFromHex,
  concat,
  createOrLoadAccount,
  EMPTY_ADDRESS,
  ETH_NODE,
  ROOT_NODE,
} from "./utils";

export function tokenIdKey(registry: Address, tokenId: BigInt): string {
  return registry.toHexString().concat("-").concat(tokenId.toString());
}

export function ensureRootAndEthDomains(createdAt: BigInt): Domain {
  // The empty account backs seeded domains whose real owner predates our
  // start block (v1 shows the same for its lazily-created root node).
  createOrLoadAccount(EMPTY_ADDRESS);
  // root
  let root = Domain.load(ROOT_NODE);
  if (root == null) {
    root = new Domain(ROOT_NODE);
    root.owner = EMPTY_ADDRESS;
    root.isMigrated = true;
    root.createdAt = createdAt;
    root.subdomainCount = 0;
    root.save();
  }
  // eth TLD (linked to the root before our start block; owner unknown -> empty)
  let eth = Domain.load(ETH_NODE);
  if (eth == null) {
    eth = new Domain(ETH_NODE);
    eth.name = "eth";
    eth.labelName = "eth";
    eth.labelhash = Bytes.fromByteArray(crypto.keccak256(ByteArray.fromUTF8("eth")));
    eth.parent = ROOT_NODE;
    eth.owner = EMPTY_ADDRESS;
    eth.isMigrated = true;
    eth.createdAt = createdAt;
    eth.subdomainCount = 0;
    eth.save();
  }
  return eth;
}

// Record (or move) the tokenId -> node mapping.
export function saveTokenId(registry: Address, tokenId: BigInt, node: string): void {
  let t = _TokenId.load(tokenIdKey(registry, tokenId));
  if (t == null) {
    t = new _TokenId(tokenIdKey(registry, tokenId));
  }
  t.node = node;
  t.save();
}

export function loadNodeForToken(registry: Address, tokenId: BigInt): string {
  let t = _TokenId.load(tokenIdKey(registry, tokenId));
  return t == null ? "" : t.node;
}

// Anchor a subregistry under the node of the parent label it was linked to.
export function anchorSubregistry(subregistry: Address, parentNode: string): void {
  if (subregistry.toHexString() == "0x0000000000000000000000000000000000000000") {
    return; // unlink
  }
  let anchor = _RegistryAnchor.load(subregistry);
  if (anchor == null) {
    anchor = new _RegistryAnchor(subregistry);
  }
  anchor.parentNode = Bytes.fromByteArray(byteArrayFromHex(parentNode.slice(2)));
  let parent = Domain.load(parentNode);
  let parentName = parent != null && parent.name != null ? parent.name : "";
  anchor.parentName = parentName == null ? "" : parentName!;
  anchor.save();
}

export function loadAnchorParentNode(registry: Address): ByteArray | null {
  let anchor = _RegistryAnchor.load(registry);
  return anchor == null ? null : anchor.parentNode;
}
