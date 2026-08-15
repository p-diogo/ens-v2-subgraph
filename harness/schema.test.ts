// L0 schema contract tests.
//
// A. Our schema.graphql must be byte-identical to the v1 ENS subgraph schema
//    (ensdomains/ens-subgraph master). Any drift fails the build.
// B. Every query in the v1 consumer corpus must validate against the schema
//    ACTUALLY SERVED by our local graph-node (gnd) — i.e. the synthesized
//    Query type, filters, enums and all — not just the SDL. This is what a
//    real consumer sees. Requires gnd running (scripts/dev.sh).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildClientSchema, getIntrospectionQuery, parse, validate, type DocumentNode } from 'graphql'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')

const ours = readFileSync(join(repoRoot, 'schema.graphql'), 'utf8')
const reference = readFileSync(
  join(repoRoot, '.reference', 'ens-subgraph', 'schema.graphql'),
  'utf8',
)

let failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${name}`)
  } else {
    console.error(`  ✖ ${name}${detail ? `\n${detail}` : ''}`)
    failures.push(name)
  }
}

function diffSummary(a: string[], b: string[]): string {
  const max = Math.max(a.length, b.length)
  const lines: string[] = []
  let shown = 0
  for (let i = 0; i < max && shown < 20; i++) {
    if (a[i] !== b[i]) {
      lines.push(
        `    line ${i + 1}:\n      ours:      ${a[i] ?? '<eof>'}\n      reference: ${b[i] ?? '<eof>'}`,
      )
      shown++
    }
  }
  return lines.join('\n')
}

async function introspectServed(): Promise<ReturnType<typeof buildClientSchema> | null> {
  const gnd = process.env.GND_GRAPHQL ?? 'http://localhost:8000/subgraphs/name/subgraph-0'
  try {
    const res = await fetch(gnd, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: getIntrospectionQuery() }),
    })
    const body = (await res.json()) as { data?: unknown; errors?: unknown }
    if (body.errors || !body.data) throw new Error(JSON.stringify(body.errors).slice(0, 300))
    return buildClientSchema(body.data as never)
  } catch (e) {
    check(
      'gnd is serving our subgraph (introspection ok)',
      false,
      `    could not introspect ${gnd}: ${String(e).slice(0, 200)}\n    start it with: bash scripts/dev.sh`,
    )
    return null
  }
}

// The ONLY permitted deviation from the v1 schema: this exact block appended
// at the end (internal entities for registry anchoring / tokenId mapping).
// Purely additive — no v1 consumer query can see it.
const INTERNAL_BLOCK = `

# ── internal entities (appended by ens-v2-subgraph, NOT part of the v1 consumer contract) ──
# These power namehash anchoring across ENSv2's hierarchical registries and
# tokenId remapping across regenerations. They are purely additive to the v1
# schema; no v1 consumer query touches them. The schema test asserts that
# schema.graphql is the v1 schema verbatim followed by exactly this block.

# registry contract address -> parent name/node anchor for namehash derivation
type _RegistryAnchor @entity(immutable: false) {
  id: Bytes! # registry contract address
  parentName: String! # "" for root-level registries
  parentNode: Bytes! # namehash of parentName
}

# (registry address, tokenId) -> domain node; survives TokenRegenerated moves
type _TokenId @entity(immutable: false) {
  id: String! # "<registryAddress>-<tokenId>"
  node: String! # domain node (namehash)
}
`

async function main() {
  console.log('L0 schema contract tests\n')

  // --- A. schema = v1 verbatim + internal block -------------------------------
  check(
    'schema.graphql is v1 verbatim + exactly the internal block',
    ours === reference + INTERNAL_BLOCK,
    ours === reference + INTERNAL_BLOCK
      ? undefined
      : ours.startsWith(reference)
        ? '    v1 prefix ok, but the appended block differs from the whitelisted INTERNAL_BLOCK'
        : diffSummary(ours.split('\n'), reference.split('\n')),
  )

  // --- B. corpus validates against the served schema -------------------------
  const servedSchema = await introspectServed()
  if (servedSchema) {
    check('gnd is serving our subgraph (introspection ok)', true)

    const corpusRaw = readFileSync(join(here, 'corpus.graphql'), 'utf8')
    const queries: Array<[string, DocumentNode]> = []
    for (const block of corpusRaw.split(/\n(?=# --- query:)/)) {
      const m = block.match(/# --- query: ([^\n]+)/)
      if (!m) continue
      const name = m[1].trim()
      try {
        queries.push([name, parse(block.replace(/^#[^\n]*\n/gm, ''))])
      } catch (e) {
        check(`corpus query parses: ${name}`, false, String(e))
      }
    }
    check('corpus has queries', queries.length >= 5, `found ${queries.length}`)

    for (const [name, doc] of queries) {
      const errors = validate(servedSchema, doc)
      check(
        `validates against served schema: ${name}`,
        errors.length === 0,
        errors.map((e) => `    ${e.message}`).join('\n'),
      )
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s)`)
    process.exit(1)
  }
  console.log('\nall green')
}

await main()
