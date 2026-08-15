// VerifiableFactory ProxyDeployed -> pre-spawn templates by implementation.
//
// On the 2026-08-11 beta deployment, observed resolvers were NOT deployed
// through this factory (zero factory logs since the beta batch), so lazy
// spawning from ResolverUpdated/SubregistryUpdated is the primary discovery
// path. Watching the factory additionally captures every event after a
// proxy's deploy tx (ProxyDeployed is the last log of the deploy tx), which
// makes factory-based flows race-free. Custom implementations outside the
// known pair are not spawned here (divergence ledger).

import { ProxyDeployed } from "../generated/VerifiableFactory/VerifiableFactory";
import {
  ResolverLive as ResolverLiveTemplate,
  Subregistry as SubregistryTemplate,
} from "../generated/templates";
import { PERMISSIONED_RESOLVER_IMPL, USER_REGISTRY_IMPL } from "./utils";

export function handleProxyDeployed(event: ProxyDeployed): void {
  const impl = event.params.implementation.toHexString();
  if (impl == PERMISSIONED_RESOLVER_IMPL) {
    ResolverLiveTemplate.create(event.params.proxyAddress);
  } else if (impl == USER_REGISTRY_IMPL) {
    SubregistryTemplate.create(event.params.proxyAddress);
  }
}
