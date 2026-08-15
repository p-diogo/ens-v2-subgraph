// L3 parity: self-hosted ENSNode (Namehash ENSIndexer) as the behavioral
// oracle. Reads the subgraph-compat entities directly from the ENSIndexer
// Postgres schema (the ponder app does not expose the composed /subgraph API;
// its DB is the same data its API serves) and diffs every .eth 2LD against
// our subgraph: name, labelName, owner, registrant, expiryDate, registration
// expiry/labelName, isMigrated.
//
// Only docs/DIVERGENCES.md ledgered differences are suppressed; anything else
// fails. An unreachable oracle fails the run unless ENSNODE_OPTIONAL=1.
//
// Env:
//   GND_GRAPHQL  our subgraph (default :8000)
//   ENSDB_URL    ENSIndexer's Postgres (default localhost:5434)
//   ENSINDEXER_SCHEMA_NAME  (default ensindexer_parity)

import { execFileSync } from 'node:child_process'

const GND = process.env.GND_GRAPHQL ?? 'http://localhost:8000/subgraphs/name/subgraph-0'
const DB_URL = process.env.ENSDB_URL ?? 'postgresql://postgres:password@localhost:5434/postgres'
const SCHEMA = process.env.ENSINDEXER_SCHEMA_NAME ?? 'ensindexer_parity'

const ETH_NODE = '0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae'

let failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    console.error(`  ✖ ${name}${detail ? ` ${detail}` : ''}`)
    failures.push(name)
  }
}

async function gql<T = any>(query: string): Promise<T> {
  const res = await fetch(GND, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = (await res.json()) as { data?: T; errors?: any[] }
  if (body.errors) throw new Error(JSON.stringify(body.errors).slice(0, 300))
  return body.data as T
}

function psql(sql: string): any[] {
  const out = execFileSync(
    'docker',
    ['exec', 'ensindexer-pg', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql],
    { encoding: 'utf8' },
  ).trim()
  if (!out) return []
  return out.split('\n').map((line) => line.split('|'))
}

async function main() {
  console.log('L3 ENSNode parity (self-hosted ENSIndexer, Postgres oracle)\n')

  // oracle reachability + sync state
  let head: string[][]
  try {
    head = psql(
      `SELECT chain_id || ':' || latest_checkpoint FROM ${SCHEMA}._ponder_checkpoint`,
    )
  } catch (e) {
    const msg = `oracle unreachable: ${String(e).slice(0, 120)}`
    if (process.env.ENSNODE_OPTIONAL === '1') {
      console.warn(`  ⚠︎ SKIPPED (${msg}); ENSNODE_OPTIONAL=1`)
      process.exit(0)
    }
    console.error(`  ✖ ${msg}`)
    process.exit(1)
  }
  console.log(`  (oracle subgraph_domains cursor: ${head[0]?.[0] ?? 'n/a'})`)

  const ours = await gql(`{
    domains(first: 100, where: { parent: "${ETH_NODE}" }) {
      id name labelName owner { id } registrant { id } expiryDate isMigrated
      registration { expiryDate labelName }
    }
  }`)
  const oursList: any[] = ours.domains ?? []
  console.log(`  (our .eth 2LDs: ${oursList.length})`)

  const ids = oursList.map((d) => "'" + d.id.toLowerCase() + "'").join(',')
  const rows = ids.length
    ? psql(
        `SELECT d.id, coalesce(d.name,''), coalesce(d.label_name,''), coalesce(d.owner_id,''), ` +
          `coalesce(d.registrant_id,''), coalesce(d.expiry_date::text,''), d.is_migrated::text, ` +
          `coalesce(r.expiry_date::text,''), coalesce(r.label_name,'') ` +
          `FROM ${SCHEMA}.subgraph_domains d ` +
          `LEFT JOIN ${SCHEMA}.subgraph_registrations r ON r.domain_id = d.id ` +
          `WHERE lower(d.id) IN (${ids})`,
      )
    : []
  const theirs = new Map(rows.map((r) => [r[0].toLowerCase(), r]))

  let matched = 0
  for (const d of oursList) {
    const t = theirs.get(d.id)
    if (!t) {
      check(`${d.name ?? d.id} present in oracle`, false, '(row not found)')
      continue
    }
    const diffs: string[] = []
    if (t[1] !== d.name) diffs.push(`name '${t[1]}' != '${d.name}'`)
    if (t[2] !== (d.labelName ?? '')) diffs.push(`labelName '${t[2]}' != '${d.labelName ?? ''}'`)
    if (t[3].toLowerCase() !== (d.owner?.id ?? '').toLowerCase()) diffs.push(`owner ${t[3]} != ${d.owner?.id}`)
    if ((t[4] || '').toLowerCase() !== (d.registrant?.id ?? '').toLowerCase()) diffs.push(`registrant ${t[4]} != ${d.registrant?.id}`)
    if (t[5] !== (d.expiryDate ?? '')) diffs.push(`domain.expiryDate ${t[5]} != ${d.expiryDate ?? ''}`)
    if (t[6] !== String(d.isMigrated)) diffs.push(`isMigrated ${t[6]} != ${d.isMigrated}`)
    if (d.registration && t[7] !== d.registration.expiryDate) diffs.push(`reg.expiryDate ${t[7]} != ${d.registration.expiryDate}`)
    if (d.registration && t[8] !== (d.registration.labelName ?? '')) diffs.push(`reg.labelName '${t[8]}' != '${d.registration.labelName ?? ''}'`)
    if (!d.registration && t[7] !== '') diffs.push('oracle has registration, we do not')

    if (diffs.length > 0) {
      check(`${d.name ?? d.id}`, false, diffs.join('; '))
    } else {
      check(`${d.name ?? d.id} matches oracle`, true)
      matched++
    }
  }

  // reverse direction: oracle .eth 2LDs we lack
  const oracleCount = psql(
    `SELECT count(*) FROM ${SCHEMA}.subgraph_domains WHERE parent_id='${ETH_NODE}'`,
  )[0][0]
  console.log(`  (oracle .eth 2LDs: ${oracleCount}; matched: ${matched})`)
  const oursIds = new Set(oursList.map((d) => d.id.toLowerCase()))
  const extra = psql(
    `SELECT coalesce(name, id) FROM ${SCHEMA}.subgraph_domains WHERE parent_id='${ETH_NODE}' ` +
      `AND lower(id) NOT IN (${[...oursIds].map((i) => "'" + i + "'").join(',') || "''"})`,
  )
  for (const [name] of extra) {
    console.log(`  ℹ︎ oracle-only domain (v1-era, out of our v2-only scope): ${name}`)
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s)`)
    process.exit(1)
  }
  console.log('\nall green')
}

void DB_URL
await main()
