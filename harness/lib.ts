// Shared harness utilities for the node-side suites (e2e, parity checks).
// One gql client, one typed check collector, one set of constants — so the
// three harness scripts differ only in what they assert.

import { readFileSync } from 'node:fs'

export interface GraphQLError {
  message: string
  [key: string]: unknown
}

export interface GraphQLResponse<T> {
  data?: T
  errors?: GraphQLError[]
}

export const ETH_NODE = '0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae'
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
// v1 grace convention: Domain.expiryDate = raw expiry + 90d (7776000s)
export const GRACE_SECONDS = 7776000

export interface NetworksPin {
  address: string
  startBlock: number
}

export interface NetworksFile {
  sepolia: Record<string, NetworksPin> & {
    LockedMigrationController?: string
    UnlockedMigrationController?: string
  }
  devnet?: Record<string, NetworksPin>
}

export function loadNetworks(): NetworksFile {
  const raw = readFileSync(new URL('../networks.json', import.meta.url), 'utf8')
  try {
    return JSON.parse(raw) as NetworksFile
  } catch (e) {
    throw new Error(`networks.json is not valid JSON: ${(e as Error).message}`)
  }
}

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const endpoint = process.env.GND_GRAPHQL ?? 'http://localhost:8000/subgraphs/name/subgraph-0'
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const body = (await res.json()) as GraphQLResponse<T>
  if (body.errors) throw new Error(JSON.stringify(body.errors).slice(0, 400))
  return body.data as T
}

// Collects pass/fail checks; report() prints failures and exits non-zero.
export interface CheckFn {
  (name: string, ok: boolean, detail?: string): boolean
  info(message: string): void
  report(): never
}

export function createChecker(): CheckFn {
  const checker = new Checker()
  const check = (name: string, ok: boolean, detail?: string): boolean =>
    checker.check(name, ok, detail)
  check.info = (message: string) => checker.info(message)
  check.report = () => checker.report()
  return check
}

export class Checker {
  private failures: string[] = []

  check(name: string, ok: boolean, detail?: string): boolean {
    if (ok) console.log(`  ✓ ${name}`)
    else {
      console.log(`  ✖ ${name}${detail ? `\n${detail}` : ''}`)
      this.failures.push(name)
    }
    return ok
  }

  info(message: string): void {
    console.log(`  ${message}`)
  }

  report(): never {
    if (this.failures.length > 0) {
      console.error(`\n${this.failures.length} failure(s)`)
      process.exit(1)
    }
    console.log('\nall green')
    process.exit(0)
  }
}

// --- typed views over the v1 schema surface used by the harnesses ---

export interface DomainRow {
  id: string
  name: string | null
  labelName: string | null
  labelhash: string
  owner: { id: string } | null
  registrant: { id: string } | null
  expiryDate: string
  isMigrated: boolean
  subdomainCount: number
  parent: { name: string | null } | null
  resolver: { id: string; address: string } | null
  registration: RegistrationRow | null
}

export interface RegistrationRow {
  id: string
  labelName: string | null
  domain: { name: string | null } | null
  registrationDate: string
  expiryDate: string
  cost: string
  registrant: { id: string } | null
}
