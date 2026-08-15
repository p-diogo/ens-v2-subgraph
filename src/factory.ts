// VerifiableFactory ProxyDeployed -> spawn Subregistry/ResolverLive templates.
// Filled in M4a. Note: on the 2026-08-11 beta deployment the observed resolvers
// were not deployed through this factory, so lazy spawning from
// ResolverUpdated/SubregistryUpdated is the primary discovery path; the factory
// covers flows that do use it (deploy-tx log order makes it race-free).

import { ProxyDeployed } from '../generated/VerifiableFactory/VerifiableFactory'

export function handleProxyDeployed(event: ProxyDeployed): void {}
