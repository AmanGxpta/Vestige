// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "../../test/TestBase.sol";
import "../../contracts/SafeSetup.sol";
import "../../contracts/vendor/safe/contracts/proxies/SafeProxyFactory.sol";

/// @notice Human only: deploy a fresh Safe using existing confirmed C1 attestations.
contract CreateTreasury is TestBase {
    address constant SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    SafeProxyFactory constant FACTORY = SafeProxyFactory(0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67);

    function run() external returns (Safe safe, VestigeGuard guard) {
        require(block.chainid == 1874, "TESTNET_1874_ONLY");
        require(
            SINGLETON.codehash == 0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff,
            "SINGLETON_CHANGED"
        );
        require(
            address(FACTORY).codehash == 0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317,
            "FACTORY_CHANGED"
        );
        SeatRegistry registry = SeatRegistry(vm.envAddress("SEAT_REGISTRY_ADDRESS"));
        SafeSetup helper = SafeSetup(vm.envAddress("SAFE_SETUP_ADDRESS"));
        require(address(registry).codehash == vm.envBytes32("EXPECTED_REGISTRY_CODEHASH"), "REGISTRY_CHANGED");
        require(address(helper).codehash == vm.envBytes32("EXPECTED_SETUP_CODEHASH"), "HELPER_CHANGED");
        require(helper.singleton() == SINGLETON, "WRONG_HELPER");
        bytes32 ventureId = vm.envBytes32("VENTURE_ID");
        address[] memory owners = new address[](2);
        owners[0] = vm.envAddress("FOUNDER_A_ADDRESS");
        owners[1] = vm.envAddress("FOUNDER_B_ADDRESS");
        require(
            owners[0] != owners[1] && registry.isSeat(ventureId, owners[0]) && registry.isSeat(ventureId, owners[1]),
            "TWO_CONFIRMED_SEATS"
        );
        bytes memory initializer = abi.encodeCall(
            Safe.setup,
            (
                owners,
                2,
                address(helper),
                abi.encodeCall(helper.install, (registry, ventureId)),
                address(0),
                address(0),
                0,
                payable(address(0))
            )
        );
        uint256 salt = uint256(vm.envBytes32("TREASURY_SALT"));
        vm.startBroadcast();
        safe = Safe(payable(address(FACTORY.createProxyWithNonce(SINGLETON, initializer, salt))));
        vm.stopBroadcast();
        guard = VestigeGuard(
            abi.decode(safe.getStorageAt(uint256(keccak256("guard_manager.guard.address")), 1), (address))
        );
        address[] memory actual = safe.getOwners();
        require(
            actual.length == 2 && safe.isOwner(owners[0]) && safe.isOwner(owners[1]) && safe.getThreshold() == 2,
            "SAFE_READBACK_FAILED"
        );
        require(
            address(guard.safe()) == address(safe) && address(guard.registry()) == address(registry)
                && guard.ventureId() == ventureId,
            "GUARD_READBACK_FAILED"
        );
    }
}
