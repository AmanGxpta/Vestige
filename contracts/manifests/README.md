# Approved v0 artifacts

These are schemas, not deployment receipts or live manifests. No live infrastructure
or treasury manifest has been fabricated. Required canonical creation provenance
must be supplied from genuine operator-reviewed chain records.

- `InfrastructureManifestV1.schema.json`: registry, setup, canonical Safe singleton/
  factory and token/implementation. No placeholder Safe, Guard, venture or owners.
- `DeploymentManifestV1.schema.json`: complete approved treasury shape, including
  original initializer hash, source commit, approval time and Safe creation block.
- `../abi/index.json`: exact ABI file paths and SHA-256 of the published file bytes.
  Hashes are lowercase hex without `0x`; EVM hashes use `0x` bytes32.

Regenerate ABI files from reviewed source with `node script/treasury/export-abis.mjs`.
Do not reformat or substitute ABI bytes after recording a manifest's hashes.
`src/modules/treasury/manifest.d.mts` publishes the exact approved types.
The server-side pure adapter maps the nested schema to relayer configuration;
the loader validates ABI bytes and confined paths. C2 consumes the public nested
manifest and ABIs through its own public hosting/UI ownership zone.

Readbacks verify receipt confirmation/canonical block hashes, original factory/setup
parameters and current code/domain/owner/Guard/seat state. H's review of canonical
creation records remains a trust anchor; a matching code hash alone is not proof of
who created a contract. Missing or inconsistent provenance fails closed.

Source qualifiers remain separate from evidence labels. A chain-confirmed seat
attested from staging is TESTED_IN_SIMULATOR, not proof of a real distinct human.
Local fork artifacts or unsigned plans never qualify as these deployment manifests.
