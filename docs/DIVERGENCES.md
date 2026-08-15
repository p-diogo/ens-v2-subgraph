# Divergence Ledger — ens-v2-subgraph vs the v1 ENS subgraph

Everything a v1 consumer can observe through the schema is either identical
(by construction: the schema is byte-identical plus invisible `_`-internal
entities) or covered by an entry below. The parity harness
(`harness/onchain-parity.test.ts`) suppresses ONLY entries listed here.

## Data-model (protocol-forced)

| # | Divergence | Why | Consumer impact |
|---|---|---|---|
| D1 | `Registration.cost` in paymentToken units (MockUSDC, 6 decimals), not ETH wei | v2 registrar prices in ERC20s | Value not comparable to v1 wei amounts |
| D2 | `WrappedDomain`, `Domain.fuses`, `Domain.wrappedOwner` permanently null/empty | ENSv2 has no NameWrapper | Queries return empty; filters still work |
| D3 | `Domain.ttl` permanently null | ENSv2 has no TTL concept | Same as unwrapped v1 names |
| D4 | `Domain.expiryDate` populated for ALL names (registration expiry + 90d grace on registrar events, raw expiry otherwise) | v2 exposes per-name expiry | Superset of v1 (v1 filled it only for registrations/wrapped names) |
| D5 | `Domain.registrant` mirrors the ERC1155 token owner | In v2 the registry token is the registrar token | Registrant == owner for 2LDs; can't diverge like v1 |

## Semantic choices (documented, tested)

| # | Divergence | Rationale |
|---|---|---|
| S1 | `Domain.isMigrated` = name arrived via a migration controller (`LabelRegistered.sender` ∈ {Locked, Unlocked}MigrationController) | Natural repurposing of the v1 migration flag; fresh v2 registrations are `false` |
| S2 | No `NameTransferred` event entity at mint | v2 mints (`TransferSingle` from 0x0) precede the registrar's `NameRegistered`; v1's BaseRegistrar emitted Transfer after registration. Later transfers DO emit `NameTransferred` |
| S3 | `VersionChanged(version=0)` synthesized from the RC `Cleared` event | RC dropped versioning; v1's VersionChanged semantics = records cleared |
| S4 | Resolver-level aliases (`AliasChanged` live / `Linked` RC) are NOT indexed | Aliases affect resolution only; we index stored state (official indexing doc concurs). Alias targets have no Domain |
| S5 | `Resolver.id = "<resolverAddress>-<node>"`, both resolver generations (live `PermissionedResolver` events and RC `SharedResolver` recordId-keyed events) write the same entities | Drop-in compatibility across the RC swap; recordId == uint256(namehash) in the RC implementation |
| S6 | 90-day grace constant (7776000) applied to `Domain.expiryDate` on registrar registration/renewal | v1 constant; v2's grace length is not event-visible (compute client-side per docs) |

## Known gaps (events-only trade-off, Decision #6 in PLAN.md)

| # | Gap | Blast radius |
|---|---|---|
| G1 | Records set on a resolver/registry deployed OUTSIDE VerifiableFactory before its first linking event are missed | Canonical beta flows unaffected (all discovery goes through `ResolverUpdated`/`SubregistryUpdated`) |
| G2 | `DataChanged`/`DataUpdated`, `ApprovalUpdated`, `Named*Resource`, `LabelReserved`, `EACRolesChanged`, `TokenResource`, `ParentUpdated`, `URI*` are not indexed | No v1 entity exists for any of them |
| G3 | `TransferBatch` shares a single event id per log; each id still yields one `Transfer` entity per token | Matches v1 one-entity-per-transfer; ids are per-log, not per-token (v1-identical shape) |

## Oracle notes

- **On-chain verifier** (`harness/onchain-parity.test.ts`): always-on ground
  truth. Compares `findExpiry(label)` (raw-returning, not expiry-masked)
  against `Registration.expiryDate` and `Domain.expiryDate` for every 2LD.
  2026-08-15: 10/10 names green on the live beta deployment.
- **ENSNode oracle** (`harness/ensnode-parity.test.ts`): hosted fleet fully
  down as of 2026-08-15 (all five documented instances return Railway
  "Application not found" 404s behind broken TLS while ensnode.io/docs still
  advertises them). Self-hosting Namehash's ENSIndexer (from the archived
  namehash/ensnode monorepo) as the oracle: **record-level parity VERIFIED
  2026-08-15 — all 10 beta .eth 2LDs match field-by-field** (name, labelName,
  owner, registrant, registrationDate, Registration.expiryDate) against the
  unigraph core tables (`domains`/`registrations`/`labels`). Notes from
  standing it up: the subgraph plugin never materializes ENSv2 names (their
  hosted /subgraph API composes from core tables in the separate ensapi app);
  v2 comparison joins on `label_hash` (their v2 domains carry no ENSIP-1
  node). Two upstream bugs found: their ExpiryUpdated handler crashes
  deterministically on expired-then-renewed names (patched locally, ref patch
  #3), and unigraph's hard dependency on protocol-acceleration pulls in
  Base/Linea/LUKSO chains for a sepolia-only parity run (patched locally,
  ref patch #4). Their grace_period is NULL for v2 registrations — our
  v1-style +90d Domain.expiryDate stays ledgered as a divergence.
- **Big Name**: hosted endpoint 502 (stopped mid-rewrite per the Aug 7
  analysis); no adapter until it returns.
