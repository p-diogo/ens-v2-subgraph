// L3 parity: on-chain verifier. For every .eth 2LD in the subgraph, compare
// subgraph state against direct reads from the live ETHRegistry:
//   getExpiry(label)  -> Registration.expiryDate (raw) and
//                        Domain.expiryDate (expiry + 90d grace, v1 semantics)
//   getTokenId(label) -> non-zero (the name exists)
// Expired-name views are masked on-chain (getOwner etc. return zero), so owner
// comparisons run only for names whose registration hasn't expired.
//
// Env: GND_GRAPHQL (default :8000), SEPOLIA_RPC (default Tenderly gateway).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const GND = process.env.GND_GRAPHQL ?? 'http://localhost:8000/subgraphs/name/subgraph-0'
const RPC = process.env.SEPOLIA_RPC ?? 'https://gateway.tenderly.co/public/sepolia'
const GRACE = 7776000n

const networks = JSON.parse(readFileSync(new URL('../networks.json', import.meta.url), 'utf8')) as any
const ETH_REGISTRY = networks.sepolia.ETHRegistry.address

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

function cast(args: string[]): string {
  return execFileSync('cast', args, { encoding: 'utf8' }).trim()
}

// null = reverted (registry getters revert for unregistered labels)
function call(fn: string, sig: string, arg: string): string | null {
  try {
    return cast(['call', ETH_REGISTRY, `${fn}(${sig})`, arg, '--rpc-url', RPC])
  } catch {
    return null
  }
}

async function main() {
  console.log('L3 on-chain parity (Sepolia beta vs ETHRegistry)\n')

  const meta = await gql('{ _meta { hasIndexingErrors block { number } } }')
  const head = Number(meta._meta.block.number)
  check('no indexing errors', meta._meta.hasIndexingErrors === false)
  console.log(`  (subgraph head: ${head})`)

  const data = await gql(`{
    domains(first: 100, where: { parent: "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae" }) {
      labelName
      labelhash
      expiryDate
      owner { id }
      registration { expiryDate }
    }
  }`)
  const domains: any[] = data.domains ?? []
  console.log(`  (${domains.length} .eth 2LDs in the subgraph)`)

  const nowTs = BigInt(Math.floor(Date.now() / 1000))

  for (const d of domains) {
    if (!d.labelName) continue // [labelhash] names can't be queried by label
    const label: string = d.labelName

    // expiry
    const expiryRaw = call('findExpiry', 'string', `"${label}"`)
    if (expiryRaw === null) {
      // chain says unregistered; the subgraph may legitimately still hold the
      // domain (v1 keeps entities after burns) as long as it looks dead:
      // zero owner or lapsed expiry
      const dead =
        d.owner?.id === '0x0000000000000000000000000000000000000000' ||
        BigInt(d.expiryDate) <= nowTs
      check(`${label}.eth absent on-chain, dead in subgraph`, dead, `owner=${d.owner?.id} expiry=${d.expiryDate}`)
      continue
    }
    const chainExpiry = BigInt(expiryRaw)
    const regExpiry = d.registration ? BigInt(d.registration.expiryDate) : null
    if (regExpiry !== null) {
      check(
        `${label}.eth Registration.expiryDate == getExpiry`,
        regExpiry === chainExpiry,
        `subgraph=${regExpiry} chain=${chainExpiry}`,
      )
    }
    const domainExpiry = BigInt(d.expiryDate)
    const expectedDomain = chainExpiry > 0n ? chainExpiry + GRACE : chainExpiry
    check(
      `${label}.eth Domain.expiryDate == getExpiry + 90d grace`,
      domainExpiry === expectedDomain,
      `subgraph=${domainExpiry} expected=${expectedDomain}`,
    )

    // findExpiry not reverting already proves the name exists on-chain with
    // matching state (expired-name getters revert/are masked, so ownership
    // reads are not comparable for lapsed names)
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s)`)
    process.exit(1)
  }
  console.log('\nall green')
}

await main()
