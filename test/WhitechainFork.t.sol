// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "./TestBase.sol";
import "../contracts/SafeSetup.sol";
import "../contracts/vendor/safe/contracts/SafeL2.sol";
import "../contracts/vendor/safe/contracts/proxies/SafeProxyFactory.sol";

interface TestUSDT {
    function owner() external view returns (address);
    function mint(address, uint256) external;
    function decimals() external view returns (uint8);
    function name() external view returns (string memory);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function balanceOf(address) external view returns (uint256);
    function authorizationState(address, bytes32) external view returns (bool);
    function transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32) external;
    function receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32) external;
}

/// @notice Actual deployed bytecode in LOCAL fork; owner impersonation only seeds local test USDT.
/// No real mint/transfer/deployment; no mined testnet receipts are claimed.
contract WhitechainForkTest is TestBase {
    TestUSDT constant token = TestUSDT(0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7);
    address constant SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    SafeProxyFactory constant FACTORY = SafeProxyFactory(0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67);
    uint256 constant KEY = 0xF00D; // Public deterministic local-test identity, never broadcast.
    address payer;
    Safe safe;
    bytes32 constant V = keccak256("fork-venture");
    bytes32 constant NONCE = keccak256("local-only-auth");
    uint256 expires;
    function setUp() public {
        string memory rpc = vm.envOr("WHITECHAIN_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) { vm.skip(true); return; }
        vm.createSelectFork(rpc, 12353825);
        assertEq(block.chainid, 1874);
        SeatRegistry registry = new SeatRegistry(address(this));
        registry.attestSeat(V, address(11), bytes32(uint256(1)));
        registry.attestSeat(V, address(22), bytes32(uint256(2)));
        SafeSetup helper = new SafeSetup(SINGLETON);
        address[] memory owners = new address[](2); owners[0] = address(11); owners[1] = address(22);
        bytes memory initializer = abi.encodeCall(Safe.setup, (owners, 2, address(helper), abi.encodeCall(helper.install, (registry, V)), address(0), address(0), 0, payable(address(0))));
        safe = Safe(payable(address(FACTORY.createProxyWithNonce(SINGLETON, initializer, 1874))));
        payer = vm.addr(KEY);
        address issuer = token.owner();
        vm.prank(issuer); token.mint(payer, 10_000_000);
        expires = block.timestamp + 600;
    }
    function sign(bytes32 typeHash, address to, uint256 amount, uint256 after_, uint256 before_) internal returns (uint8,bytes32,bytes32) {
        bytes32 data = keccak256(abi.encode(typeHash, payer, to, amount, after_, before_, NONCE));
        return vm.sign(KEY, keccak256(abi.encodePacked(hex"1901", token.DOMAIN_SEPARATOR(), data)));
    }
    function transferHash() internal pure returns (bytes32) { return keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"); }
    function testDeployedSafeAndTokenDomain() public view {
        assertEq(safe.getThreshold(), 2); assertEq(safe.getOwners().length, 2);
        assertEq(token.decimals(), 6);
        bytes32 domain = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256(bytes("Tether USD")), keccak256(bytes("1")), uint256(1874), address(token)));
        assertTrue(domain == token.DOMAIN_SEPARATOR());
    }
    function testGaslessFundingAndReplay() public {
        (uint8 v, bytes32 r, bytes32 s) = sign(transferHash(), address(safe), 1_000_000, 0, expires);
        token.transferWithAuthorization(payer, address(safe), 1_000_000, 0, expires, NONCE, v, r, s);
        assertEq(token.balanceOf(address(safe)), 1_000_000);
        assertTrue(token.authorizationState(payer, NONCE));
        vm.expectRevert(bytes("TetherToken: auth invalid"));
        token.transferWithAuthorization(payer, address(safe), 1_000_000, 0, expires, NONCE, v, r, s);
    }
    function testExternalRelayerCannotReceiveForSafe() public {
        (uint8 v, bytes32 r, bytes32 s) = sign(keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"), address(safe), 1_000_000, 0, expires);
        vm.expectRevert(bytes("TetherToken: to != msg.sender"));
        token.receiveWithAuthorization(payer, address(safe), 1_000_000, 0, expires, NONCE, v, r, s);
    }
    function testCannotRedirectSignedFunding() public {
        (uint8 v, bytes32 r, bytes32 s) = sign(transferHash(), address(safe), 1_000_000, 0, expires);
        vm.expectRevert(bytes("TetherToken: invalid signature"));
        token.transferWithAuthorization(payer, address(999), 1_000_000, 0, expires, NONCE, v, r, s);
    }
    function testExpiredAuthorization() public {
        (uint8 v, bytes32 r, bytes32 s) = sign(transferHash(), address(safe), 1_000_000, 0, expires);
        vm.warp(expires);
        vm.expectRevert(bytes("TetherToken: auth expired"));
        token.transferWithAuthorization(payer, address(safe), 1_000_000, 0, expires, NONCE, v, r, s);
    }
}
