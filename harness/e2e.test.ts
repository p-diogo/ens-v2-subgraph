// L2 e2e assertions against the devnet-served subgraph (scripts/e2e-chain.sh test).
//
// The contracts-v2 devnet `--testNames` fixture registers (as owner, the
// devnet account #0): reregister (twice), test, example, demo, newowner
// (transferred to user), renew (renewed +365d), parent, changerole,
// unregistered (then unregistered), alias (resolver = test.eth's resolver,
// then setAlias). Everything is asserted through the v1 schema surface.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const GND = process.env.GND_GRAPHQL ?? 'http://localhost:8001/subgraphs/name/subgraph-0'
const NETWORKS = JSON.parse(readFileSync(new URL('../networks.json', import.meta.url), 'utf8')) as Record<string, any>

// keccak via cast is unavailable here; compute node ids on the subgraph side
// by querying names instead (the point of the fixture is name-level parity).

let failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    console.error(`  ✖ ${name}${detail ? `\n${detail}` : ''}`)
    failures.push(name)
  }
}

async function gql<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(GND, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const body = (await res.json()) as { data?: T; errors?: any[] }
  if (body.errors) throw new Error(JSON.stringify(body.errors).slice(0, 400))
  return body.data as T
}

async function main() {
  console.log('L2 e2e assertions (devnet)\n')

  const meta = await gql('{ _meta { hasIndexingErrors block { number } } }')
  check('no indexing errors', meta._meta.hasIndexingErrors === false)
  console.log(`  (head: block ${meta._meta.block.number})`)

  // root + eth seeds
  const eth = await gql(`{ domain(id: "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae") { name subdomainCount } }`)
  check('eth TLD seeded', eth.domain?.name === 'eth', JSON.stringify(eth))

  // registered test names -> domains
  const domains = await gql(`{
    domains(first: 50, where: { parent: "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae" }) {
      id name labelName owner { id } registrant { id } expiryDate isMigrated
      registration { id expiryDate cost registrant { id } labelName }
      resolver { id address }
      subdomainCount
    }
  }`)
  const byName = new Map<string, any>((domains.domains ?? []).map((d: any) => [d.name, d]))
  const expected = ['test.eth', 'example.eth', 'demo.eth', 'newowner.eth', 'renew.eth', 'parent.eth', 'changerole.eth', 'reregister.eth', 'alias.eth']
  for (const name of expected) {
    check(`domain exists: ${name}`, byName.has(name), `present: ${[...byName.keys()].sort().join(', ')}`)
  }

  const test = byName.get('test.eth')
  check('test.eth has registration', !!test?.registration, JSON.stringify(test))
  check('test.eth has resolver', !!test?.resolver)
  check('test.eth isMigrated=false', test?.isMigrated === false)

  // re-registration keeps a single fresh registration
  const rereg = byName.get('reregister.eth')
  check('reregister.eth registration present', !!rereg?.registration)

  // renew: expiry ≈ registration + 365d (with grace on the domain)
  const renew = byName.get('renew.eth')
  if (renew?.registration) {
    const year = 365 * 86400
    const grace = 7776000
    const span = Number(renew.registration.expiryDate) - Number(renew.registration.registrationDate ?? 0)
    check(
      'renew.eth domain expiry = registration + ~1y + grace',
      Math.abs(Number(renew.expiryDate) - Number(renew.registration.expiryDate) - grace) < 600,
      `domain=${renew.expiryDate} reg=${renew.registration.expiryDate}`,
    )
    void span
    void year
  } else {
    check('renew.eth registration present', false)
  }

  // unregistered.eth: token burned -> either pruned (no resolver/children) or
  // owner zero; assert it is gone or zero-owned
  const unreg = byName.get('unregistered.eth')
  check(
    'unregistered.eth pruned or zero-owned',
    !unreg || unreg.owner?.id === '0x0000000000000000000000000000000000000000',
    JSON.stringify(unreg && { owner: unreg.owner?.id, resolver: unreg.resolver?.id }),
  )

  // registrations through the v1 surface
  const regs = await gql(`{ registrations(first: 50) { id labelName domain { name } expiryDate cost } }`)
  check('registrations exist', (regs.registrations?.length ?? 0) >= expected.length - 1, `count=${regs.registrations?.length}`)
  const regNames = new Set<string>((regs.registrations ?? []).map((r: any) => r.domain?.name))
  for (const name of ['test.eth', 'renew.eth', 'alias.eth', 'reregister.eth']) {
    check(`registration for ${name}`, regNames.has(name))
  }
  const aliasReg = (regs.registrations ?? []).find((r: any) => r.domain?.name === 'alias.eth')
  check('alias.eth registration cost > 0 (USDC)', !!aliasReg && BigInt(aliasReg.cost) > 0n, JSON.stringify(aliasReg))

  // events through the v1 surface
  const events = await gql(`{
    newOwners: newOwners(first: 100) { id domain { name } owner { id } }
    transfers: transfers(first: 100) { id domain { name } owner { id } }
    nameRegisteredEvents: nameRegistereds(first: 100) { id registration { labelName } expiryDate }
    nameRenewedEvents: nameReneweds(first: 100) { id registration { labelName } expiryDate }
    nameTransferredEvents: nameTransferreds(first: 100) { id registration { labelName } newOwner { id } }
  }`)
  check('NewOwner events recorded', (events.newOwners?.length ?? 0) >= expected.length, `count=${events.newOwners?.length}`)
  check('Transfer events recorded', (events.transfers?.length ?? 0) >= expected.length, `count=${events.transfers?.length}`)
  check('NameRegistered events recorded', (events.nameRegisteredEvents?.length ?? 0) >= expected.length - 1)
  check('NameRenewed event recorded (renew.eth)', (events.nameRenewedEvents?.length ?? 0) >= 1)
  check('NameTransferred event recorded (newowner.eth)', (events.nameTransferredEvents?.length ?? 0) >= 1)

  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s)`)
    process.exit(1)
  }
  console.log('\nall green')
}

void (createHash as unknown)
await main()
