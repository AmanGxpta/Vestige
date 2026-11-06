// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface Vm {
    function expectRevert() external;
    function expectRevert(bytes calldata) external;
    function prank(address) external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function deal(address, uint256) external;
    function warp(uint256) external;
    function createSelectFork(string calldata) external returns (uint256);
    function envOr(string calldata, string calldata) external returns (string memory);
    function envAddress(string calldata) external returns (address);
    function envBytes32(string calldata) external returns (bytes32);
    function startBroadcast() external;
    function stopBroadcast() external;
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    function assertTrue(bool value) internal pure { require(value, "assertTrue"); }
    function assertEq(uint256 a, uint256 b) internal pure { require(a == b, "assertEq uint"); }
    function assertEq(address a, address b) internal pure { require(a == b, "assertEq address"); }
}
