// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "./TestBase.sol";
import "../contracts/SafeSetup.sol";
import "../contracts/vendor/safe/contracts/SafeL2.sol";
import "../contracts/vendor/safe/contracts/proxies/SafeProxyFactory.sol";

contract SafeSetupTest is TestBase {
    SeatRegistry registry;
    SafeL2 singleton;
    SafeProxyFactory factory;
    SafeSetup helper;
    bytes32 constant V = keccak256("setup-venture");
    bytes32 constant GUARD_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;
    function setUp() public {
        registry = new SeatRegistry(address(this));
        registry.attestSeat(V, address(11), bytes32(uint256(1)));
        registry.attestSeat(V, address(22), bytes32(uint256(2)));
        singleton = new SafeL2(); factory = new SafeProxyFactory(); helper = new SafeSetup(address(singleton));
    }
    function create(address ownerB, uint256 threshold, address handler) internal returns (Safe) {
        address[] memory owners = new address[](2); owners[0] = address(11); owners[1] = ownerB;
        bytes memory setup = abi.encodeCall(singleton.setup, (owners, threshold, address(helper),
            abi.encodeCall(helper.install, (registry, V)), handler, address(0), 0, payable(address(0))));
        return Safe(payable(address(factory.createProxyWithNonce(address(singleton), setup, 42))));
    }
    function testAtomicSetupAttachesBoundGuard() public {
        Safe safe = create(address(22), 2, address(0));
        address guardAddress = abi.decode(safe.getStorageAt(uint256(GUARD_SLOT), 1), (address));
        assertTrue(guardAddress != address(0));
        VestigeGuard guard = VestigeGuard(guardAddress);
        assertEq(address(guard.safe()), address(safe));
        assertEq(address(guard.registry()), address(registry));
        assertTrue(guard.ventureId() == V);
        assertEq(safe.getThreshold(), 2);
        assertEq(safe.getOwners().length, 2);
        (address[] memory modules, address next) = safe.getModulesPaginated(address(1), 1);
        assertEq(modules.length, 0); assertEq(next, address(1));
    }
    function testSetupRejectsUnverifiedOwner() public { vm.expectRevert(); create(address(33), 2, address(0)); }
    function testSetupRejectsThresholdOne() public { vm.expectRevert(); create(address(22), 1, address(0)); }
    function testSetupRejectsFallbackHandler() public { vm.expectRevert(); create(address(22), 2, address(77)); }
    function testHelperRejectsWrongSingleton() public {
        singleton = new SafeL2();
        vm.expectRevert(); create(address(22), 2, address(0));
    }
    function testHelperCannotBeCalledDirectly() public {
        vm.expectRevert(); helper.install(registry, V);
    }
}
