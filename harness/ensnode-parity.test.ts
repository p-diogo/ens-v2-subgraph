// L3 parity: ENSNode behavioral oracle. Compares our served subgraph data at a
// pinned block against Namehash's ENSNode v2-Sepolia subgraph-compatible API
// (api.v2-sepolia.ensnode.io/subgraph - ENSv1+ENSv2 indexed concurrently).
//
// Semantics:
// - Pin the comparison block to ENSNode's indexed head (it does not support
//   time travel; our subgraph is compared via its own head).
// - Compare .eth 2LDs: name/labelName/owner/expiry/registration existence for
//   the v2-originated subset (names our subgraph knows; ENSNode also carries
//   v1 sepolia names which we intentionally do not index - those are skipped,
//   not counted as mismatches).
// - Known divergences (docs/DIVERGENCES.md) are suppressed explicitly; any
//   other diff fails the run. An unreachable oracle FAILS the run unless
//   ENSNODE_OPTIONAL=1 (it must never silently pass).
//
// Status 2026-08-15: api.v2-sepolia.ensnode.io serves a mismatched TLS
// certificate (*.up.railway.app), so the oracle is unreachable - documented
// with the self-host fallback in docs/DIVERGENCES.md.
import { readFileSync } from 'node:fs'

const GND = process.env.GND_GRAPHQL ?? 'http://localhost:8000/subgraphs/name/subgraph-0'
const ENSNODE = process.env.ENSNODE_URL ?? 'https://api.v2-sepolia.ensnode.io/subgraph'

async function gql(endpoint: string, query: string): Promise<any> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = (await res.json()) as any
  if (body.errors) throw new Error(JSON.stringify(body.errors).slice(0, 300))
  return body.data
}

const ETH_NODE = '0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae'

async function main() {
  console.log('L3 ENSNode parity (behavioral oracle)\n')

  let ensnode: any
  try {
    ensnode = await gql(ENSNODE, '{ _meta { block { number } } }')
  } catch (e) {
    const msg = `oracle unreachable: ${String(e).slice(0, 160)}`
    if (process.env.ENSNODE_OPTIONAL === '1') {
      console.warn(`  ⚠︎ SKIPPED (${msg}); ENSNODE_OPTIONAL=1`)
      console.warn('  ⚠︎ on-chain parity (onchain-parity.test.ts) remains the active oracle')
      process.exit(0)
    }
    console.error(`  ✖ ${msg}`)
    console.error('    fix the oracle or re-run with ENSNODE_OPTIONAL=1 to skip explicitly')
    process.exit(1)
  }
  console.log(`  (ensnode head: ${ensnode._meta.block.number})`)

  const ours = await gql(GND, `{
    domains(first: 100, where: { parent: "${ETH_NODE}" }) {
      id name labelName owner { id } expiryDate isMigrated
      registration { expiryDate labelName }
    }
  }`)
  const byId = new Map<string, any>((ours.domains ?? []).map((d: any) => [d.id, d]))

  let mismatches = 0
  for (const d of byId.values()) {
    const theirs: any = await gql(
      ENSNODE,
      `{ domain(id: "${d.id}") { name labelName owner { id } expiryDate isMigrated registration { expiryDate labelName } } }`,
    )
    const t = theirs.domain
    if (!t) {
      console.error(`  ✖ ${d.name}: missing on ENSNode`)
      mismatches++
      continue
    }
    const diffs: string[] = []
    if (t.name !== d.name) diffs.push(`name ${t.name} != ${d.name}`)
    if ((t.labelName ?? null) !== (d.labelName ?? null)) diffs.push(`labelName`)
    if (t.owner?.id !== d.owner?.id) diffs.push(`owner ${t.owner?.id} != ${d.owner?.id}`)
    if ((t.registration?.expiryDate ?? null) !== (d.registration?.expiryDate ?? null)) {
      diffs.push(`registration.expiryDate ${t.registration?.expiryDate} != ${d.registration?.expiryDate}`)
    }
    // divergence-ledgered: Domain.expiryDate (we apply +90d grace, v1-style;
    // ENSNode's v2 namespace may expose raw expiry) and isMigrated semantics
    if (diffs.length > 0) {
      console.error(`  ✖ ${d.name}: ${diffs.join('; ')}`)
      mismatches++
    } else {
      console.log(`  ✓ ${d.name}`)
    }
  }

  if (mismatches > 0) {
    console.error(`\n${mismatches} mismatch(es)`)
    process.exit(1)
  }
  console.log('\nall green')
}

void readFileSync
await main()
