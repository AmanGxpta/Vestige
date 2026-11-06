// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "./SeatRegistry.sol";
import "./vendor/safe/contracts/Safe.sol";

/// @notice Exactly two attested seats, no modules/handler/delegatecalls, verified-seat swaps only.
/// @dev Interface and restrictions are proposed pending H acceptance. No recovery/admin escape.
contract VestigeGuard is BaseGuard {
    Safe public immutable safe;
    SeatRegistry public immutable registry;
    bytes32 public immutable ventureId;
    uint256 private constant GUARD_SLOT = uint256(keccak256("guard_manager.guard.address"));
    uint256 private constant HANDLER_SLOT = uint256(keccak256("fallback_manager.handler.address"));

    constructor(Safe safe_, SeatRegistry registry_, bytes32 ventureId_) {
        require(
            address(safe_).code.length != 0 && address(registry_).code.length != 0 && ventureId_ != 0, "INVALID_BINDING"
        );
        safe = safe_;
        registry = registry_;
        ventureId = ventureId_;
        assertConfiguration(false);
    }

    function checkTransaction(
        address to,
        uint256,
        bytes memory data,
        Enum.Operation operation,
        uint256,
        uint256,
        uint256,
        address,
        address payable,
        bytes memory,
        address
    ) external view override {
        require(msg.sender == address(safe), "SAFE_ONLY");
        assertConfiguration(true);
        require(operation == Enum.Operation.Call, "DELEGATECALL_FORBIDDEN");
        if (to == address(safe)) {
            require(data.length == 100, "SELF_CALL_FORBIDDEN");
            bytes4 selector;
            address newOwner;
            assembly {
                selector := mload(add(data, 32))
                newOwner := mload(add(data, 100))
            }
            require(selector == OwnerManager.swapOwner.selector, "SELF_CALL_FORBIDDEN");
            require(registry.isSeat(ventureId, newOwner), "UNVERIFIED_OWNER");
        }
    }

    function checkAfterExecution(bytes32, bool) external view override {
        require(msg.sender == address(safe), "SAFE_ONLY");
        assertConfiguration(true);
    }

    function assertConfiguration(bool requireAttached) private view {
        require(safe.getThreshold() == 2, "TWO_SIGNATURES_REQUIRED");
        address[] memory owners = safe.getOwners();
        require(
            owners.length == 2 && registry.isSeat(ventureId, owners[0]) && registry.isSeat(ventureId, owners[1]),
            "TWO_SEATS_REQUIRED"
        );
        (address[] memory modules, address next) = safe.getModulesPaginated(address(1), 1);
        require(modules.length == 0 && next == address(1), "MODULES_FORBIDDEN");
        require(abi.decode(safe.getStorageAt(HANDLER_SLOT, 1), (address)) == address(0), "HANDLER_FORBIDDEN");
        if (requireAttached) {
            require(abi.decode(safe.getStorageAt(GUARD_SLOT, 1), (address)) == address(this), "WRONG_GUARD");
        }
    }
}
