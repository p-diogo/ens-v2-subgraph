// L3 parity: self-hosted ENSNode (Namehash ENSIndexer) as the behavioral
// oracle, v4 — against the unigraph CORE tables.
//
// Key discovery from v1/v2 of this harness: ENSIndexer's `subgraph` plugin
// never materializes ENSv2 names (their hosted v2-sepolia /subgraph API is
// composed at the API layer from these core tables by the separate ensapi
// app, which we don't run). The oracle surface for v2 is:
//   domains        (node = ENSIP-1 namehash, canonical_name, owner_id, label_hash)
//   registrations  (start, expiry, grace_period, registrant_id, registrar_address)
//   labels         (label_hash -> interpreted)
//
// Compares every .eth 2LD of ours (registrar-scoped, beta deployment) against
// the oracle: name, labelName, owner, registrant, registrationDate,
// Registration.expiryDate. Suppressed (divergence ledger):
//   - Domain.expiryDate: we apply v1's +90d grace constant; the oracle leaves
//     grace_period NULL for v2 registrations.
//   - isMigrated: no oracle equivalent (our migration-controller semantics).
//
// Env: GND_GRAPHQL (default :8000). Oracle read via docker psql.
// Unreachable oracle fails the run unless ENSNODE_OPTIONAL=1.

import { execFileSync } from 'node:child_process'
import { createChecker, ETH_NODE, gql, type DomainRow } from './lib'

// lowercase: registrar_address is stored lowercase and PG compares case-sensitively
const BETA_REGISTRAR = '0x8c2e866b439358c41ae05de9cbe8a00bfefaffca'
// psql output buffer headroom for wide oracle result sets
const MAX_BUFFER_BYTES = 64 * 1024 * 1024

interface DomainWithReg extends DomainRow {}
interface DomainsReply {
  domains: DomainWithReg[] | null
}
interface MetaReply {
  _meta: { hasIndexingErrors: boolean; block: { number: number } }
}
type OracleRow = [
  labelHash: string,
  canonicalName: string,
  ownerId: string,
  interpretedLabel: string,
  start: string,
  expiry: string,
  gracePeriod: string,
  registrantId: string,
]

function psql(sql: string): string[][] {
  const out = execFileSync(
    'docker',
    ['exec', 'ensindexer-pg', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql],
    { encoding: 'utf8', maxBuffer: MAX_BUFFER_BYTES },
  ).trim()
  if (!out) return []
  return out.split('\n').map((line) => line.split('|'))
}

async function main(): Promise<void> {
  const check = createChecker()
  console.log('L3 ENSNode parity (self-hosted ENSIndexer, unigraph core tables)\n')

  // oracle reachability
  try {
    psql('SELECT 1 FROM ensindexer_parity._ponder_checkpoint LIMIT 1')
  } catch (e) {
    const msg = `oracle unreachable: ${String(e).slice(0, 120)}`
    if (process.env.ENSNODE_OPTIONAL === '1') {
      console.warn(`  ⚠︎ SKIPPED (${msg}); ENSNODE_OPTIONAL=1`)
      process.exit(0)
    }
    console.error(`  ✖ ${msg}`)
    process.exit(1)
  }

  const ours = await gql<DomainsReply>(`{
    domains(first: 100, where: { parent: "${ETH_NODE}" }) {
      id name labelhash labelName owner { id } registrant { id }
      registration { registrationDate expiryDate labelName }
    }
  }`)
  const oursList = ours.domains ?? []
  check.info(`(our .eth 2LDs: ${oursList.length})`)

  const ids = oursList.map((d: DomainRow) => "'" + d.labelhash.toLowerCase() + "'").join(',')
  const rows = psql(
    `SELECT d.label_hash, coalesce(d.canonical_name,''), coalesce(d.owner_id,''), ` +
      `coalesce(l.interpreted,''), r.start::text, r.expiry::text, ` +
      `coalesce(r.grace_period::text,''), coalesce(r.registrant_id,'') ` +
      `FROM ensindexer_parity.domains d ` +
      `LEFT JOIN ensindexer_parity.labels l ON l.label_hash = d.label_hash ` +
      `LEFT JOIN LATERAL (` +
      `  SELECT start, expiry, grace_period, registrant_id ` +
      `  FROM ensindexer_parity.registrations r2 ` +
      `  WHERE r2.domain_id = d.id AND r2.registrar_address = '${BETA_REGISTRAR}' ` +
      `  ORDER BY r2.registration_index DESC LIMIT 1) r ON true ` +
      `WHERE lower(d.label_hash) IN (${ids}) AND d.registry_id = '11155111-0xdedb92913a25abe1f7bcdd85d8a344a43b398b67'`,
  )
  const theirs = new Map<string, OracleRow>(rows.map((r: string[]) => [r[0].toLowerCase(), r as OracleRow]))
  check.info(`(oracle rows matched by labelhash: ${rows.length})`)

  for (const d of oursList) {
    const t = theirs.get((d.labelhash ?? '').toLowerCase())
    if (!t) {
      check(`${d.name ?? d.id} present in oracle`, false, '(no row)')
      continue
    }
    const diffs: string[] = []
    if (t[1] !== d.name) diffs.push(`name '${t[1]}' != '${d.name}'`)
    if (t[2].toLowerCase() !== (d.owner?.id ?? '').toLowerCase()) diffs.push(`owner ${t[2]} != ${d.owner?.id}`)
    if (t[3] !== (d.labelName ?? '')) diffs.push(`labelName '${t[3]}' != '${d.labelName ?? ''}'`)
    if (d.registration) {
      if (t[4] !== d.registration.registrationDate) diffs.push(`reg.start ${t[4]} != ${d.registration.registrationDate}`)
      if (t[5] !== d.registration.expiryDate) diffs.push(`reg.expiry ${t[5]} != ${d.registration.expiryDate}`)
      if (t[7].toLowerCase() !== (d.registrant?.id ?? '').toLowerCase()) diffs.push(`registrant ${t[7]} != ${d.registrant?.id}`)
    } else if (t[4]) {
      diffs.push('oracle has registrar registration, we do not')
    }
    if (diffs.length > 0) check(`${d.name ?? d.id}`, false, diffs.join('; '))
    else check(`${d.name ?? d.id} matches oracle (name/label/owner/registrant/dates)`, true)
  }

  // reverse: oracle beta-registrar 2LDs we lack
  const oracleNames = new Set(
    psql(
      `SELECT coalesce(d.canonical_name,'') FROM ensindexer_parity.registrations r ` +
        `JOIN ensindexer_parity.domains d ON d.id = r.domain_id ` +
        `WHERE r.registrar_address = '${BETA_REGISTRAR}'`,
    ).map((r) => r[0]),
  )
  const oursNames = new Set(oursList.map((d: DomainRow) => d.name))
  const extra = [...oracleNames].filter((n) => n && n.endsWith('.eth') && !oursNames.has(n))
  check.info(`(oracle beta-registrar registrations: ${oracleNames.size}; ours: ${oursList.length})`)
  for (const n of extra.slice(0, 12)) {
    check.info(`ℹ︎ oracle-only .eth 2LD (pre-beta June window, out of our scope): ${n}`)
  }

  check.report()
}

await main()
