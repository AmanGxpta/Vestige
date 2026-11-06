// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "./TestBase.sol";
import "../contracts/vendor/safe/contracts/libraries/MultiSend.sol";
import "../contracts/VestigeGuard.sol";
import "../contracts/vendor/safe/contracts/SafeL2.sol";
import "../contracts/vendor/safe/contracts/proxies/SafeProxyFactory.sol";

contract Payee { uint256 public calls; function pay() external { calls++; } }
contract StorageAttack { function attack() external { assembly { sstore(0, 0) } } }

contract VestigeGuardTest is TestBase {
    SafeL2 internal safe;
    SeatRegistry internal registry;
    VestigeGuard internal guard;
    Payee internal payee;
    bytes32 internal constant V = keccak256("venture");
    // Public test identities only, never used for live broadcasting.
    uint256 internal constant KEY_A = 0xA11CE;
    uint256 internal constant KEY_B = 0xB0B;
    address internal a;
    address internal b;
    function setUp() public {
        a = vm.addr(KEY_A); b = vm.addr(KEY_B);
        registry = new SeatRegistry(address(this));
        registry.attestSeat(V, a, bytes32(uint256(1)));
        registry.attestSeat(V, b, bytes32(uint256(2)));
        SafeL2 singleton = new SafeL2();
        SafeProxyFactory factory = new SafeProxyFactory();
        safe = SafeL2(payable(address(factory.createProxyWithNonce(address(singleton), "", 1))));
        address[] memory owners = new address[](2); owners[0] = a; owners[1] = b;
        safe.setup(owners, 2, address(0), "", address(0), address(0), 0, payable(address(0)));
        guard = new VestigeGuard(Safe(payable(address(safe))), registry, V);
        execute(address(safe), abi.encodeCall(safe.setGuard, (address(guard))), Enum.Operation.Call);
        payee = new Payee();
    }
    function signature(uint256 key, bytes32 digest) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
    function signatures(address to, bytes memory data, Enum.Operation op) internal returns (bytes memory) {
        bytes32 digest = safe.getTransactionHash(to, 0, data, op, 0, 0, 0, address(0), address(0), safe.nonce());
        bytes memory sa = signature(KEY_A, digest); bytes memory sb = signature(KEY_B, digest);
        return a < b ? bytes.concat(sa, sb) : bytes.concat(sb, sa);
    }
    function execute(address to, bytes memory data, Enum.Operation op) internal returns (bool) {
        bytes memory sigs = signatures(to, data, op);
        return safe.execTransaction(to, 0, data, op, 0, 0, 0, address(0), payable(address(0)), sigs);
    }
    function deny(bytes memory data) internal {
        bytes memory sigs = signatures(address(safe), data, Enum.Operation.Call);
        vm.expectRevert();
        safe.execTransaction(address(safe), 0, data, Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), sigs);
    }
    function testTwoOwnersCanPay() public {
        assertTrue(execute(address(payee), abi.encodeCall(payee.pay, ()), Enum.Operation.Call));
        assertEq(payee.calls(), 1);
    }
    function testOneSignatureFailsGS020() public {
        bytes memory data = abi.encodeCall(payee.pay, ());
        bytes32 digest = safe.getTransactionHash(address(payee), 0, data, Enum.Operation.Call, 0, 0, 0, address(0), address(0), safe.nonce());
        bytes memory sig = signature(KEY_A, digest);
        vm.expectRevert(bytes("GS020"));
        safe.execTransaction(address(payee), 0, data, Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), sig);
        assertEq(payee.calls(), 0);
    }
    function testGuardCannotBeRemoved() public { deny(abi.encodeCall(safe.setGuard, (address(0)))); }
    function testThresholdCannotDrop() public { deny(abi.encodeCall(safe.changeThreshold, (1))); }
    function testRemoveOwnerCannotReduceThreshold() public { deny(abi.encodeCall(safe.removeOwner, (address(1), safe.getOwners()[0], 1))); }
    function testCannotAddUnverifiedOwner() public { deny(abi.encodeCall(safe.addOwnerWithThreshold, (address(999), 2))); }
    function testCannotSwapToUnverifiedOwner() public { deny(abi.encodeCall(safe.swapOwner, (address(1), safe.getOwners()[0], address(999)))); }
    function testCannotEnableModule() public { deny(abi.encodeCall(safe.enableModule, (address(this)))); }
    function testCannotChangeFallbackHandler() public { deny(abi.encodeCall(safe.setFallbackHandler, (address(payee)))); }
    function testDelegatecallCannotWriteSafeStorage() public {
        StorageAttack attack = new StorageAttack();
        bytes memory data = abi.encodeCall(attack.attack, ());
        bytes memory sigs = signatures(address(attack), data, Enum.Operation.DelegateCall);
        vm.expectRevert();
        safe.execTransaction(address(attack), 0, data, Enum.Operation.DelegateCall, 0, 0, 0, address(0), payable(address(0)), sigs);
    }
    function testSelfApproveHashForbidden() public { deny(abi.encodeCall(safe.approveHash, (bytes32(uint256(77))))); }
    function testEmptySelfCallForbidden() public { deny(""); }
    function testOnlyBoundSafeMayInvokeHooks() public {
        vm.expectRevert(); guard.checkAfterExecution(bytes32(0), true);
        vm.expectRevert(); guard.checkTransaction(address(payee), 0, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), "", address(this));
    }
    function unsafeSafe() internal returns (SafeL2 raw) {
        raw = SafeL2(payable(address(new SafeProxyFactory().createProxyWithNonce(address(new SafeL2()), "", 99))));
        address[] memory owners = new address[](2); owners[0] = a; owners[1] = b;
        raw.setup(owners, 2, address(0), "", address(0), address(0), 0, payable(address(0)));
    }
    function testRejectGuardForSafeWithPreexistingModule() public {
        SafeL2 raw = unsafeSafe();
        vm.prank(address(raw)); raw.enableModule(address(this));
        vm.expectRevert(); new VestigeGuard(Safe(payable(address(raw))), registry, V);
    }
    function testBaselineEnabledModuleBypassesTransactionGuard() public {
        SafeL2 raw = unsafeSafe();
        vm.prank(address(raw)); raw.enableModule(address(this));
        AlwaysRejectGuard rejecting = new AlwaysRejectGuard();
        vm.prank(address(raw)); raw.setGuard(address(rejecting));
        assertTrue(raw.execTransactionFromModule(address(raw), 0, abi.encodeCall(raw.changeThreshold, (1)), Enum.Operation.Call));
        assertEq(raw.getThreshold(), 1);
    }
    function testUnregisteredModuleCannotExecuteEitherEntryPoint() public {
        vm.expectRevert(bytes("GS104"));
        safe.execTransactionFromModule(address(payee), 0, abi.encodeCall(payee.pay, ()), Enum.Operation.Call);
        vm.expectRevert(bytes("GS104"));
        safe.execTransactionFromModuleReturnData(address(payee), 0, abi.encodeCall(payee.pay, ()), Enum.Operation.Call);
    }
    function testGuardReplacementBlocked() public { deny(abi.encodeCall(safe.setGuard, (address(new AlwaysRejectGuard())))); }
    function testVerifiedSeatSwapAllowed() public {
        registry.attestSeat(V, address(999), bytes32(uint256(3)));
        assertTrue(execute(address(safe), abi.encodeCall(safe.swapOwner, (address(1), safe.getOwners()[0], address(999))), Enum.Operation.Call));
        assertTrue(safe.isOwner(address(999))); assertEq(safe.getThreshold(), 2);
    }
    function testEvenVerifiedThirdOwnerCannotBeAdded() public {
        registry.attestSeat(V, address(999), bytes32(uint256(3)));
        deny(abi.encodeCall(safe.addOwnerWithThreshold, (address(999), 2)));
    }
    function testMultiSendCannotHideGuardRemoval() public {
        MultiSend multi = new MultiSend();
        bytes memory attack = abi.encodeCall(safe.setGuard, (address(0)));
        bytes memory packed = abi.encodePacked(uint8(0), address(safe), uint256(0), uint256(attack.length), attack);
        bytes memory data = abi.encodeCall(multi.multiSend, (packed));
        bytes memory sigs = signatures(address(multi), data, Enum.Operation.DelegateCall);
        vm.expectRevert(bytes("DELEGATECALL_FORBIDDEN"));
        safe.execTransaction(address(multi), 0, data, Enum.Operation.DelegateCall, 0, 0, 0, address(0), payable(address(0)), sigs);
    }
    function testFuzzSelfCallForbidden(bytes4 selector) public {
        if (selector == OwnerManager.swapOwner.selector) return;
        deny(abi.encodePacked(selector));
    }
}
contract AlwaysRejectGuard is BaseGuard {
    function checkTransaction(address,uint256,bytes memory,Enum.Operation,uint256,uint256,uint256,address,address payable,bytes memory,address) external pure override { revert("BLOCK_ALL"); }
    function checkAfterExecution(bytes32,bool) external pure override { revert("BLOCK_ALL"); }
}
