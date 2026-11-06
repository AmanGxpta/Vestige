// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "./TestBase.sol";
import "../contracts/SeatRegistry.sol";

contract SeatRegistryTest is TestBase {
    SeatRegistry registry;
    bytes32 constant V = keccak256("venture");

    function setUp() public {
        registry = new SeatRegistry(address(this));
    }

    function testOnlyAttester() public {
        vm.prank(address(99));
        vm.expectRevert();
        registry.attestSeat(V, address(1), bytes32(uint256(1)));
        assertTrue(!registry.isSeat(V, address(1)));
    }

    function testNullifierCannotTakeSecondSeat() public {
        registry.attestSeat(V, address(1), bytes32(uint256(7)));
        vm.expectRevert();
        registry.attestSeat(V, address(2), bytes32(uint256(7)));
    }

    function testWalletCannotAcquireAnotherNullifier() public {
        registry.attestSeat(V, address(1), bytes32(uint256(7)));
        vm.expectRevert();
        registry.attestSeat(V, address(1), bytes32(uint256(8)));
    }

    function testSameHumanDifferentVenture() public {
        registry.attestSeat(V, address(1), bytes32(uint256(7)));
        bytes32 other = keccak256("other");
        registry.attestSeat(other, address(2), bytes32(uint256(7)));
        assertTrue(registry.isSeat(V, address(1)) && registry.isSeat(other, address(2)));
    }

    function testRejectZeroInputs() public {
        vm.expectRevert();
        registry.attestSeat(bytes32(0), address(1), bytes32(uint256(1)));
        vm.expectRevert();
        registry.attestSeat(V, address(0), bytes32(uint256(1)));
        vm.expectRevert();
        registry.attestSeat(V, address(1), bytes32(0));
        vm.expectRevert(bytes("ZERO_ATTESTER"));
        this.newRegistry(address(0));
    }

    function newRegistry(address target) external returns (SeatRegistry) {
        return new SeatRegistry(target);
    }
}
