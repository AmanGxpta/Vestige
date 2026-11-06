// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Backend attestation is a trust assumption; this does not verify World proofs.
contract SeatRegistry {
    address public immutable attester;
    mapping(bytes32 => mapping(address => bool)) public isSeat;
    mapping(bytes32 => mapping(bytes32 => bool)) private usedNullifiers;
    event SeatAttested(bytes32 indexed ventureId, address indexed wallet, bytes32 nullifierHash);

    constructor(address attester_) {
        require(attester_ != address(0), "ZERO_ATTESTER");
        attester = attester_;
    }

    function attestSeat(bytes32 ventureId, address wallet, bytes32 nullifierHash) external {
        require(ventureId != bytes32(0) && wallet != address(0) && nullifierHash != bytes32(0), "ZERO_INPUT");
        require(msg.sender == attester, "ATTESTER_ONLY");
        require(!isSeat[ventureId][wallet], "WALLET_USED");
        require(!usedNullifiers[ventureId][nullifierHash], "NULLIFIER_USED");
        usedNullifiers[ventureId][nullifierHash] = true;
        isSeat[ventureId][wallet] = true;
        emit SeatAttested(ventureId, wallet, nullifierHash);
    }
}
