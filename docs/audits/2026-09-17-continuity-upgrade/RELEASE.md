# Guardian payout continuity — proposed mainnet upgrade

## Exact candidate

- Program: `FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC`.
- Candidate: `candidate.so`, 436736 bytes, SHA256 `a21e633835be8c8f1fc686068ccfa9ebc92e8e07e82cc850efa18937236765c0`.
- Deployed baseline preserved as `mainnet-baseline.so`, 437768 bytes, SHA256 `04cc06a3f9b6795b472a3de6e8a2c5b15b0f8d71135f1a5f4034f735e743d1e0`.
- Change: stop deriving an existing ChildProfile address from its mutable payout field when adding a milestone. Keep Anchor ownership/type and current-guardian checks; preserve account layouts and initialization seeds. No fee, lock, mint, authority or withdrawal-rule change.
- Evidence: 31 local-validator tests pass, including new guardian continuity and old guardian rejection; account compatibility passes; five release checks pass. Local candidate only, no claim of external audit.

## Authority and costs, freshly checked September17

Live upgrade authority remains Squads vault `Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko`; multisig `1P8a83j4SK28JCSTMpv5w7HS92ko5Ki5xGcyfy68uz5`, two of three signatures. Owner confirms access to a second signer; exact second account still to verify.

Existing deployment wallet `5piptchcKR5qbJKqVJCjTo2rq1TouvpeAeH3XQuEYsXq` had 3.108269506SOL; WSL configured public signer matches it. No secret was displayed. It can cover the 2.21945708SOL temporary buffer rent. Existing program allocation is large enough: zero permanent ProgramData top-up quoted. Owner explicitly approved the upload and maximum0.02SOL network fees in this session. Do not use child deposits or convert gift USDC.

Source fix committed locally as `ef6bf5d7e4c68f368ca50d398a81db2349ff4f69`; no remote publication claimed. Squads registered TFN Escrow and verified the already-existing authority after owner completed authentication. Existing temporary buffer `AFGaUWV1Jy1cSSodegu9f5kGD4MFEs56khUxv7Bn93br` holds2.219497720SOL (CLI allocation includes40,640lamports over the bare rent quote). Public RPC bulk writes failed; resume uses the same buffer and existing configured Helius RPC, never a new buffer. A bounded exact-byte chunk uploader is completing missing data within the original fee limit. Treat `upload.json` status as authoritative; no upgrade proposal or live-code replacement yet.

Use the deployment wallet as spill/refund address so the temporary balance returns to its source on successful upgrade. Refund amount must be reconciled from chain, not assumed. On cancellation before authority handoff, prepare buffer reclamation; after authority handoff, reclamation needs Squads approval. Do not close unrelated buffers or accounts.

## Execution sequence

### Latest handoff, September17 13:35UTC

Upload finished; finalized buffer bytes match the candidate hash exactly. Temporary balance2.21949772SOL, cumulative deployment-wallet network fees0.003444SOL after buffer-authority handoff, below approved0.02SOL. Squads now owns the verified buffer; authority handoff transaction `5SVdK2qYdQxWruAaX8XNztVBreySRKnw3kLPsPdBHFdJJe3C4cj28LyDu86FWt5chJdhhHtFCNJiXaWsvKUwepG4`. `handoff.json` and `upload.json` hold evidence (upload receipt authority describes the earlier pre-handoff state).

Squads UI has registered the program and staged upgrade “Guardian payout continuity — ef6bf5d.” Actual Upgrade dialog shows exact program, ProgramData, buffer, Squads authority, and spill/refund deployment wallet. User asked to click Upgrade and complete Phantom prompt with5fWR…dYq9 to create the proposal, then report back before switching wallet or executing. No on-chain proposal creation or vote is yet claimed. Mainnet program unchanged; six reserve gifts still unfunded. Browser tab2059825338 is marked for handoff.

Next: read exact on-chain proposal after user creation, verify instructions/accounts/hash against this package; hand off second authorized signer approval; inspect execution readiness; user executes; verify deployed bytes, unchanged sample deposit hashes and actual refund. No additional crypto deposit is needed from the user for this staged upgrade.

1. Confirm owner upload/fee authorization and second signer. Connect Phantom in official https://app.squads.so . A connection is not approval of a financial transaction.
2. Hash-check exact candidate again. Use a dedicated locally stored buffer signer so CLI failure cannot print a generated recovery phrase. Upload only to that buffer; retain stdout/stderr privately and report sanitized public receipt. Never auto-deploy from write-buffer.
3. Read buffer bytes/authority from finalized mainnet; compare every candidate byte/hash. Create one exact Squads program-upgrade proposal with same program, buffer and deployment-wallet refund address. Follow the actual Squads authority instruction; do not guess a program-specific authority PDA.
4. Hand off proposal creation/approval/signing to the user on the browser surface. Verify both signer addresses and the exact transaction before execution. Do not request approvals for an absent/unverified buffer.
5. After execution, read deployed ProgramData bytes, accounting for allocation padding, and compare exact candidate bytes; require zero-only padding. Confirm unchanged upgrade authority. Rerun read-only continuity simulation and verify existing Miles/Maya deposits unchanged.
6. Reconcile rent refund and actual network costs. Only then continue reserve inventory preparation; the separate neutral identity, assignment date and cancellation logic remain required before funding all six gifts.

## Rollback and stop conditions

Keep both binary snapshots. If upgraded code fails verification, stop reserve funding and public rollout. Prepare a Squads rollback to the preserved baseline using the same explicit two-signer flow and verified buffer; do not execute it automatically or claim rollback is instantaneous. The old code reintroduces the continuity defect, so it cannot unblock the new reserve flow. No destructive state migration is part of this change.

Stop on changed binary, wrong network/authority/signers, unexpected instruction or refund destination, unclear transaction result, insufficient funds, or fees above the approved limit. Reconcile an ambiguous upload/proposal instead of creating another one.

Official procedure: https://docs.squads.so/main/navigating-your-squad/developers-assets/programs
