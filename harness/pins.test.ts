// Guard against the address-pin drift flagged in the RC-swap runbook: the
// migration-controller constants compiled into src/utils.ts must equal the
// networks.json sepolia entries (networks.json is the documented source of
// truth; graph-ts cannot read config at runtime, so the constants are a
// hand-maintained copy this test keeps honest).

import { readFileSync } from 'node:fs'
import { createChecker, loadNetworks } from './lib'

const check = createChecker()
console.log('pin sync: src/utils.ts controllers == networks.json sepolia\n')

const utilsSource = readFileSync(new URL('../src/utils.ts', import.meta.url), 'utf8')
function pinnedConst(name: string): string | null {
  const m = utilsSource.match(new RegExp(`export const ${name} = "(0x[0-9a-fA-F]{40})"`))
  return m ? m[1].toLowerCase() : null
}

const pins = loadNetworks()
const sepolia = pins.sepolia as unknown as Record<string, string | { address: string }>

function networkPin(key: string): string | null {
  const v = sepolia[key]
  if (typeof v === 'string') return v.toLowerCase()
  if (v && typeof v === 'object' && 'address' in v) return v.address.toLowerCase()
  return null
}

const locked = pinnedConst('LOCKED_MIGRATION_CONTROLLER')
const unlocked = pinnedConst('UNLOCKED_MIGRATION_CONTROLLER')
check('utils.ts pins LOCKED_MIGRATION_CONTROLLER', locked !== null)
check('utils.ts pins UNLOCKED_MIGRATION_CONTROLLER', unlocked !== null)
check(
  'LOCKED controller == networks.json sepolia',
  locked === networkPin('LockedMigrationController'),
  `utils=${locked} networks=${networkPin('LockedMigrationController')}`,
)
check(
  'UNLOCKED controller == networks.json sepolia',
  unlocked === networkPin('UnlockedMigrationController'),
  `utils=${unlocked} networks=${networkPin('UnlockedMigrationController')}`,
)

check.report()
