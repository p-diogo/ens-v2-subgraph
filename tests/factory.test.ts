// M4a: VerifiableFactory ProxyDeployed template pre-spawn smoke test.
//
// matchstick cannot assert dynamic-data-source creation, so this pins the
// handler's execution (decode + three template spawns must not throw); the
// behavioral spawn path is exercised on the RC devnet via e2e-chain.sh.

import { describe, test, assert, newMockEvent } from "matchstick-as/assembly/index";
import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";

import { ProxyDeployed } from "../generated/VerifiableFactory/VerifiableFactory";
import { handleProxyDeployed } from "../src/factory";

const FACTORY = "0xD2a632D8a8b67c2c4398c255CbD7aF8dd7236198";
const PROXY = "0x1234567890abcdef1234567890abcdef12345678";

describe("factory: ProxyDeployed", () => {
  test("spawns all three templates without throwing", () => {
    let event = changetype<ProxyDeployed>(newMockEvent());
    event.address = Address.fromString(FACTORY);
    event.parameters = new Array();
    event.parameters.push(
      new ethereum.EventParam("sender", ethereum.Value.fromAddress(Address.fromString(FACTORY))),
    );
    event.parameters.push(
      new ethereum.EventParam("proxyAddress", ethereum.Value.fromAddress(Address.fromString(PROXY))),
    );
    event.parameters.push(
      new ethereum.EventParam("salt", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))),
    );
    event.parameters.push(
      new ethereum.EventParam("implementation", ethereum.Value.fromAddress(Address.fromString(PROXY))),
    );

    handleProxyDeployed(event);

    // no template-state assertion is possible in matchstick; reaching here
    // means decode + all three Template.create calls executed cleanly
    assert.assertTrue(true);
  });
});
