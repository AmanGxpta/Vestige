// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "../../test/TestBase.sol";
import "../../contracts/SafeSetup.sol";

/// @notice Human only: run without --broadcast first. Never provide a founder signer.
contract DeployInfrastructure is TestBase {
    address constant SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    address constant FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;

    function run() external returns (SeatRegistry registry, SafeSetup helper) {
        require(block.chainid == 1874, "TESTNET_1874_ONLY");
        require(
            SINGLETON.codehash == 0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff,
            "SINGLETON_CHANGED"
        );
        require(
            FACTORY.codehash == 0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317, "FACTORY_CHANGED"
        );
        address attester = vm.envAddress("ATTESTER_ADDRESS");
        vm.startBroadcast();
        registry = new SeatRegistry(attester);
        helper = new SafeSetup(SINGLETON);
        vm.stopBroadcast();
    }
}
