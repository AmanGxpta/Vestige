// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "./VestigeGuard.sol";

/// @notice Trusted setup-only delegatecall target. Never allow it in later Safe transactions.
/// @dev Proposed local implementation pending H interface acceptance.
contract SafeSetup {
    address private immutable self = address(this);
    address public immutable singleton;

    constructor(address singleton_) {
        require(singleton_ != address(0) && singleton_.code.length != 0, "MISSING_SINGLETON_CODE");
        singleton = singleton_;
    }

    function install(SeatRegistry registry, bytes32 ventureId) external {
        require(address(this) != self, "DELEGATECALL_ONLY");
        require(abi.decode(Safe(payable(address(this))).getStorageAt(0, 1), (address)) == singleton, "WRONG_SINGLETON");
        VestigeGuard guard = new VestigeGuard(Safe(payable(address(this))), registry, ventureId);
        Safe(payable(address(this))).setGuard(address(guard));
    }
}
