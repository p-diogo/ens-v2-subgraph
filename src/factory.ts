// VerifiableFactory ProxyDeployed -> pre-spawn templates.
//
// Spawns the Subregistry and both resolver-generation (ResolverLive,
// ResolverRC) templates for every deployed proxy (network-agnostic, no
// implementation allowlist): like the v1 subgraph, which spawned a Resolver
// template for any resolver address a NewResolver event pointed at, handlers
// tolerate nodes they don't know about. Watching the factory captures every
// event after a proxy's deploy tx (ProxyDeployed is the last log of the
// deploy tx), making factory-based flows race-free.
//
// On the 2026-08-11 beta deployment the observed resolvers were not deployed
// through this factory, so lazy spawning from ResolverUpdated/SubregistryUpdated
// remains the primary discovery path.

import { ProxyDeployed } from "../generated/VerifiableFactory/VerifiableFactory";
import {
  ResolverLive as ResolverLiveTemplate,
  ResolverRC as ResolverRCTemplate,
  Subregistry as SubregistryTemplate,
} from "../generated/templates";

export function handleProxyDeployed(event: ProxyDeployed): void {
  ResolverLiveTemplate.create(event.params.proxyAddress);
  ResolverRCTemplate.create(event.params.proxyAddress);
  SubregistryTemplate.create(event.params.proxyAddress);
}
