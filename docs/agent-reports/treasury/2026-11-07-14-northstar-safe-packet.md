# Step 2 packet — northstar Safe creation (written BEFORE sending)
Pre-approved by H sequence step 2. Seats: SeatAttested + isSeat(ventureId,wallet)==true, receipts success:
- 0xfc2e2350DbE6cC7281C8A0412dd65cCE56519f3E tx 0x4c123b4f9e3e4d93fb25b9abeaadb69a94a1ad1aa6c37f508bcc5bb00e29cec2 block 12418426
- 0x1711c70699d3D2040861677A277C365C9C283454 tx 0x2d1859763c7b5b621fc251e37b3d60c81b1242bdc7cb5411118be2045a7728de block 12418471
ventureId 0xe68b1b43989080cfe7581731204a977009d67e3b3660062d24157562cc93e3ff (northstar.vestige.eth per C1 evidence)

Tx: from deployer 0x10d8C1d6359F0694203924182d3da83843a4e052, nonce 2, to SafeProxyFactory 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67,
value 0, selector createProxyWithNonce, calldata keccak 0x11e5b8ff7de0d9ff976cfa7b2c08f7ecd2e44b88f427d7198e375edb7033b033 (file: -calldata.hex)
singleton 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762; salt keccak("vestige:northstar.vestige.eth:treasury:1")=0x924eaa304a463c0470f4bded7fee47d7cbf0a919d0eff3a34ac15ec2ed2d609a
setup: owners [0xfc2e…9f3E, 0x1711…3454], threshold 2, to SafeSetup 0x153406cd…1558, install(registry 0xe91B…bcBA, ventureId),
fallbackHandler/paymentToken/receiver 0x0, payment 0. initializerHash 0x32909ef6c6238ba6d6e9c893c53b0a9ca89c9b611648f27e05d4165a48f0086b
Predicted: Safe 0xE707e3e99Da85B0D8F3814a640976b3B08A123A2, Guard 0x3255A0C5d39167FC55b6dE917DCf6F014F6efa6B
Gas limit 1597206 (simulation, includes 1.3x) ≤ ceiling 2000000; maxFee 10.000000001 gwei, tip 1 wei; worst case 0.016 WBT (deployer 0.790 WBT).
Note: the API POST /deploy route is preparation-only by design (no deployer transport in the server); creation is this operator tx.
