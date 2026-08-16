// L2 e2e assertions against the devnet-served subgraph (scripts/e2e-chain.sh test).
//
// The contracts-v2 devnet `--testNames` fixture registers (as owner, the
// devnet account #0): reregister (twice), test, example, demo, newowner
// (transferred to user), renew (renewed +365d), parent, changerole,
// unregistered (then unregistered), alias (resolver = test.eth's resolver,
// then setAlias). Everything is asserted through the v1 schema surface.

import { keccak256 } from 'js-sha3'
import { createChecker, gql, GRACE_SECONDS, type DomainRow, type RegistrationRow } from './lib'

// ENSIP-1 namehash
function namehash(name: string): string {
  let node = '0'.repeat(64)
  if (name) {
    const labels = name.split('.')
    for (let i = labels.length - 1; i >= 0; i--) {
      node = keccak256(Uint8Array.from([...Buffer.from(node, 'hex'), ...Buffer.from(keccak256(labels[i]), 'hex')]))
    }
  }
  return '0x' + node
}

const YEAR_SECONDS = 365 * 86400
const GRACE_TOLERANCE_SECONDS = 600

const EXPECTED_NAMES = ['test.eth', 'example.eth', 'demo.eth', 'newowner.eth', 'renew.eth', 'parent.eth', 'changerole.eth', 'reregister.eth', 'alias.eth']

interface DomainsReply {
  domains: DomainRow[] | null
}

interface RegistrationsReply {
  registrations: RegistrationRow[] | null
}
interface EventsReply {
  newOwners: { id: string }[] | null
  transfers: { id: string }[] | null
  nameRegistereds: { id: string }[] | null
  nameReneweds: { id: string }[] | null
  nameTransferreds: { id: string }[] | null
}
interface MetaReply {
  _meta: { hasIndexingErrors: boolean; block: { number: number } }
}

async function main(): Promise<void> {
  const check = createChecker()
  console.log('L2 e2e assertions (devnet)\n')

  const meta = await gql<MetaReply>('{ _meta { hasIndexingErrors block { number } } }')
  check('no indexing errors', meta._meta.hasIndexingErrors === false)
  check.info(`(head: block ${meta._meta.block.number})`)

  // root + eth seeds
  const eth = await gql<{ domain: { name: string } | null }>(`{ domain(id: "${namehash('eth')}") { name subdomainCount } }`)
  check('eth TLD seeded', eth.domain?.name === 'eth', JSON.stringify(eth))

  // registered test names -> domains
  const domains = await gql<DomainsReply>(`{
    domains(first: 50, where: { parent: "${namehash('eth')}" }) {
      id name labelName owner { id } registrant { id } expiryDate isMigrated
      registration { id expiryDate cost registrant { id } labelName }
      resolver { id address }
      subdomainCount
    }
  }`)
  const byName = new Map<string, DomainRow>((domains.domains ?? []).map((d: DomainRow) => [d.name as string, d]))
  for (const name of EXPECTED_NAMES) {
    check(`domain exists: ${name}`, byName.has(name), `present: ${[...byName.keys()].sort().join(', ')}`)
  }

  const test = byName.get('test.eth')
  check('test.eth has registration', !!test?.registration)
  check('test.eth has resolver', !!test?.resolver)
  check('test.eth isMigrated=false', test?.isMigrated === false)

  // re-registration keeps a single fresh registration
  const rereg = byName.get('reregister.eth')
  check('reregister.eth registration present', !!rereg?.registration)

  // renew: domain expiry = registration expiry + grace
  const renew = byName.get('renew.eth')
  if (renew?.registration) {
    check(
      'renew.eth domain expiry = registration + ~1y + grace',
      Math.abs(Number(renew.expiryDate) - Number(renew.registration.expiryDate) - GRACE_SECONDS) < GRACE_TOLERANCE_SECONDS,
      `domain=${renew.expiryDate} reg=${renew.registration.expiryDate}`,
    )
  } else {
    check('renew.eth registration present', false)
  }

  // unregistered.eth the 2LD stays registered ("no one has permissions to
  // unregister an .eth 2LD" - contracts-v2 testNames); the unregister flow
  // targets the SUBNAME sub.unregistered.eth, which is burned but kept (it has
  // a resolver, so v1 pruning leaves it with a zero owner)
  const unreg2ld = byName.get('unregistered.eth')
  check('unregistered.eth 2LD still registered', !!unreg2ld?.registration)

  const subUnreg = await gql<{ domain: DomainRow | null }>(`{ domain(id: "${namehash('sub.unregistered.eth')}") { name owner { id } parent { name } labelName } }`)
  check('sub.unregistered.eth exists on ENSIP-1 namehash', subUnreg.domain?.name === 'sub.unregistered.eth', JSON.stringify(subUnreg))
  check(
    'sub.unregistered.eth zero-owned after burn (kept: has resolver)',
    subUnreg.domain?.owner?.id === '0x0000000000000000000000000000000000000000',
    JSON.stringify(subUnreg.domain?.owner),
  )

  // sub.test.eth exists only as a RESOLVER-LEVEL alias target (the fixture
  // aliases sub.alias.eth -> sub.test.eth); aliases are invisible to the
  // registry model, so no Domain exists - documented divergence
  const subTest = await gql<{ domain: { name: string } | null }>(`{ domain(id: "${namehash('sub.test.eth')}") { name } }`)
  check('sub.test.eth absent (resolver-level alias, not a registry name)', subTest.domain === null, JSON.stringify(subTest))

  // registrations through the v1 surface
  const regs = await gql<RegistrationsReply>(`{ registrations(first: 50) { id labelName domain { name } expiryDate cost } }`)
  check('registrations exist', (regs.registrations?.length ?? 0) >= EXPECTED_NAMES.length - 1, `count=${regs.registrations?.length}`)
  const regNames = new Set<string>((regs.registrations ?? []).map((r: RegistrationRow) => r.domain?.name ?? ''))
  for (const name of ['test.eth', 'renew.eth', 'alias.eth', 'reregister.eth']) {
    check(`registration for ${name}`, regNames.has(name))
  }
  const aliasReg = (regs.registrations ?? []).find((r: RegistrationRow) => r.domain?.name === 'alias.eth')
  check('alias.eth registration cost > 0 (USDC)', !!aliasReg && BigInt(aliasReg.cost) > 0n, JSON.stringify(aliasReg))

  // events through the v1 surface
  const events = await gql<EventsReply>(`{
    newOwners: newOwners(first: 100) { id }
    transfers: transfers(first: 100) { id }
    nameRegisteredEvents: nameRegistereds(first: 100) { id }
    nameRenewedEvents: nameReneweds(first: 100) { id }
    nameTransferredEvents: nameTransferreds(first: 100) { id }
  }`)
  check('NewOwner events recorded', (events.newOwners?.length ?? 0) >= EXPECTED_NAMES.length, `count=${events.newOwners?.length}`)
  check('Transfer events recorded', (events.transfers?.length ?? 0) >= EXPECTED_NAMES.length, `count=${events.transfers?.length}`)
  check('NameRegistered events recorded', (events.nameRegistereds?.length ?? 0) >= EXPECTED_NAMES.length - 1)
  check('NameRenewed event recorded (renew.eth)', (events.nameReneweds?.length ?? 0) >= 1)
  check('NameTransferred event recorded (newowner.eth)', (events.nameTransferreds?.length ?? 0) >= 1)

  check.report()
}

await main()
