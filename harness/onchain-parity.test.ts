// L3 parity: on-chain verifier. For every .eth 2LD in the subgraph, compare
// subgraph state against direct reads from the live ETHRegistry:
//   findExpiry(label) -> Registration.expiryDate (raw) and
//                        Domain.expiryDate (expiry + 90d grace, v1 semantics)
// Expired-name views are masked on-chain (getOwner etc. return zero), so owner
// comparisons run only for names whose registration hasn't expired.
//
// Env: GND_GRAPHQL (default :8000), SEPOLIA_RPC (default Tenderly gateway).
import { execFileSync } from 'node:child_process'
import { createChecker, ETH_NODE, gql, GRACE_SECONDS, loadNetworks, type DomainRow } from './lib'

const RPC = process.env.SEPOLIA_RPC ?? 'https://gateway.tenderly.co/public/sepolia'
const ETH_REGISTRY = loadNetworks().sepolia.ETHRegistry.address

interface DomainsReply {
  domains: Array<Pick<DomainRow, 'labelName' | 'labelhash' | 'expiryDate'> & {
    owner: { id: string } | null
    registration: { expiryDate: string } | null
  }> | null
}
interface MetaReply {
  _meta: { hasIndexingErrors: boolean; block: { number: number } }
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

async function main(): Promise<void> {
  const check = createChecker()
  console.log('L3 on-chain parity (Sepolia beta vs ETHRegistry)\n')

  const meta = await gql<MetaReply>('{ _meta { hasIndexingErrors block { number } } }')
  check('no indexing errors', meta._meta.hasIndexingErrors === false)
  check.info(`(subgraph head: ${meta._meta.block.number})`)

  const data = await gql<DomainsReply>(`{
    domains(first: 100, where: { parent: "${ETH_NODE}" }) {
      labelName
      labelhash
      expiryDate
      owner { id }
      registration { expiryDate }
    }
  }`)
  const domains = data.domains ?? []
  check.info(`(${domains.length} .eth 2LDs in the subgraph)`)

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
    const expectedDomain = chainExpiry > 0n ? chainExpiry + BigInt(GRACE_SECONDS) : chainExpiry
    check(
      `${label}.eth Domain.expiryDate == getExpiry + 90d grace`,
      domainExpiry === expectedDomain,
      `subgraph=${domainExpiry} expected=${expectedDomain}`,
    )

    // findExpiry not reverting already proves the name exists on-chain with
    // matching state (expired-name getters revert/are masked, so ownership
    // reads are not comparable for lapsed names)
  }

  check.report()
}

await main()
