import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createAccount,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import { ToothfairyEscrow } from "../target/types/toothfairy_escrow";

// Per-mint asset rails: cbBTC-style 8-decimal assets beside the untouched USDC rail.
// Runs after the SOL and USDC suites and never touches the ["token_config"] singleton.
describe("asset rails (per-mint allowlist)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ToothfairyEscrow as Program<ToothfairyEscrow>;
  const payer = (provider.wallet as unknown as { payer: Keypair }).payer;
  const authority = provider.wallet.publicKey;
  const guardian = Keypair.generate();
  const aunt = Keypair.generate();
  const outsider = Keypair.generate();
  const childWallet = Keypair.generate().publicKey;

  const derive = (...seeds: Buffer[]) =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  const le4 = (n: number) => new anchor.BN(n).toArrayLike(Buffer, "le", 4);

  const configPda = derive(Buffer.from("config"));
  const profilePda = derive(Buffer.from("child_profile"), childWallet.toBuffer());
  const milestonePda = derive(Buffer.from("milestone"), profilePda.toBuffer(), Buffer.from([0]));

  const assetConfigPda = (mint: PublicKey) => derive(Buffer.from("asset_config"), mint.toBuffer());
  const assetMilestonePda = (mint: PublicKey) =>
    derive(Buffer.from("asset_milestone"), milestonePda.toBuffer(), mint.toBuffer());
  const assetDepositPda = (mint: PublicKey, index: number) =>
    derive(Buffer.from("asset_deposit"), milestonePda.toBuffer(), mint.toBuffer(), le4(index));

  let btc: PublicKey; // 8 decimals, like cbBTC
  let usd2: PublicKey; // a second 6-decimal asset
  let auntBtc: PublicKey;
  let auntUsd2: PublicKey;
  let childBtc: PublicKey;
  let authorityBtc: PublicKey;
  let btcTreasury: PublicKey;
  let usd2Treasury: PublicKey;

  const fund = async (to: PublicKey, lamports = 200_000_000) =>
    provider.sendAndConfirm(
      new Transaction().add(SystemProgram.transfer({ fromPubkey: authority, toPubkey: to, lamports })),
    );
  const ata = async (mint: PublicKey, owner: PublicKey, offCurve = false) =>
    (await getOrCreateAssociatedTokenAccount(provider.connection, payer, mint, owner, offCurve)).address;
  const balance = async (account: PublicKey) =>
    Number((await getAccount(provider.connection, account)).amount);

  async function expectError(promise: Promise<unknown>, code: string) {
    try {
      await promise;
    } catch (error) {
      expect(String(error)).to.include(code);
      return;
    }
    expect.fail(`Expected ${code}`);
  }

  async function depositAccounts(mint: PublicKey, index: number, source: PublicKey, treasury: PublicKey) {
    const deposit = assetDepositPda(mint, index);
    return {
      depositor: aunt.publicKey,
      milestone: milestonePda,
      config: configPda,
      assetConfig: assetConfigPda(mint),
      tokenMint: mint,
      depositorTokenAccount: source,
      assetMilestone: assetMilestonePda(mint),
      assetDeposit: deposit,
      depositVault: await ata(mint, deposit, true),
      assetTreasuryVault: treasury,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };
  }

  const deposit = (accounts: Awaited<ReturnType<typeof depositAccounts>>, amount: number, lock: object, name = "Aunt") =>
    program.methods
      .depositAsset(new anchor.BN(amount), lock as never, name)
      .accounts(accounts)
      .signers([aunt])
      .rpc();

  const guardianAccounts = (mint: PublicKey, index: number, vault: PublicKey, destination: PublicKey, who: PublicKey) => ({
    guardian: who,
    childProfile: profilePda,
    milestone: milestonePda,
    config: configPda,
    tokenMint: mint,
    assetMilestone: assetMilestonePda(mint),
    assetDeposit: assetDepositPda(mint, index),
    depositVault: vault,
    childTokenAccount: destination,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  before(async () => {
    if (!["localhost", "127.0.0.1"].includes(new URL(provider.connection.rpcEndpoint).hostname)) {
      throw Error("Local validator only");
    }
    const existing = await program.account.config.fetchNullable(configPda);
    if (existing) {
      expect(existing.authority.equals(authority)).to.equal(true);
    } else {
      await program.methods
        .initializeConfig()
        .accounts({ authority, config: configPda, systemProgram: SystemProgram.programId })
        .rpc();
    }

    await Promise.all([fund(guardian.publicKey), fund(aunt.publicKey), fund(outsider.publicKey)]);

    btc = await createMint(provider.connection, payer, authority, null, 8);
    usd2 = await createMint(provider.connection, payer, authority, null, 6);

    await program.methods
      .initializeChild("Asset Rail Test")
      .accounts({
        guardian: guardian.publicKey,
        childWallet,
        childProfile: profilePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([guardian])
      .rpc();
    await program.methods
      .createMilestone({ upperLeftCentralIncisor: {} }, "https://example.test/asset-rail.json")
      .accounts({
        guardian: guardian.publicKey,
        childProfile: profilePda,
        milestone: milestonePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([guardian])
      .rpc();

    auntBtc = await ata(btc, aunt.publicKey);
    auntUsd2 = await ata(usd2, aunt.publicKey);
    childBtc = await ata(btc, childWallet);
    authorityBtc = await ata(btc, authority);
    btcTreasury = await ata(btc, assetConfigPda(btc), true);
    usd2Treasury = await ata(usd2, assetConfigPda(usd2), true);
    await mintTo(provider.connection, payer, btc, auntBtc, payer, 1_000_000);
    await mintTo(provider.connection, payer, usd2, auntUsd2, payer, 50_000_000);
  });

  it("lets only the config authority allowlist an asset", async () => {
    await expectError(
      program.methods
        .initializeAssetConfig(new anchor.BN(1_000), 200)
        .accounts({
          authority: outsider.publicKey,
          config: configPda,
          assetConfig: assetConfigPda(btc),
          tokenMint: btc,
          systemProgram: SystemProgram.programId,
        })
        .signers([outsider])
        .rpc(),
      "NotConfigAuthority",
    );
  });

  it("refuses a fee above two percent", async () => {
    await expectError(
      program.methods
        .initializeAssetConfig(new anchor.BN(1_000), 201)
        .accounts({
          authority,
          config: configPda,
          assetConfig: assetConfigPda(btc),
          tokenMint: btc,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      "AssetFeeTooHigh",
    );
  });

  it("refuses Token-2022 mints", async () => {
    const t22 = await createMint(provider.connection, payer, authority, null, 8, undefined, undefined, TOKEN_2022_PROGRAM_ID);
    await expectError(
      program.methods
        .initializeAssetConfig(new anchor.BN(1_000), 0)
        .accounts({
          authority,
          config: configPda,
          assetConfig: assetConfigPda(t22),
          tokenMint: t22,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      "AccountOwnedByWrongProgram",
    );
  });

  it("allowlists an 8-decimal asset and a second 6-decimal asset", async () => {
    for (const [mint, min, fee] of [
      [btc, 1_000, 200],
      [usd2, 10_000, 0],
    ] as const) {
      await program.methods
        .initializeAssetConfig(new anchor.BN(min), fee)
        .accounts({
          authority,
          config: configPda,
          assetConfig: assetConfigPda(mint),
          tokenMint: mint,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
    const cfg = await program.account.assetConfig.fetch(assetConfigPda(btc));
    expect(cfg.decimals).to.equal(8);
    expect(cfg.feeBps).to.equal(200);
    expect(cfg.enabled).to.equal(true);
    expect(cfg.minDepositUnits.toNumber()).to.equal(1_000);
  });

  it("deposits $10 of BTC: exact fee to the asset treasury, net locked for the child", async () => {
    const accounts = await depositAccounts(btc, 0, auntBtc, btcTreasury);
    await deposit(accounts, 11_911, { fiveYears: {} });

    expect(await balance(accounts.depositVault)).to.equal(11_673);
    expect(await balance(btcTreasury)).to.equal(238);
    const receipt = await program.account.tokenDeposit.fetch(accounts.assetDeposit);
    expect(receipt.mint.equals(btc)).to.equal(true);
    expect(receipt.depositorName).to.equal("Aunt");
    expect(receipt.amountUnits.toNumber()).to.equal(11_673);
    expect(receipt.lockUntil.toNumber()).to.be.greaterThan(0);
    const aggregate = await program.account.assetMilestone.fetch(assetMilestonePda(btc));
    expect(aggregate.depositCount).to.equal(1);
    expect(aggregate.totalDeposited.toNumber()).to.equal(11_673);
  });

  it("keeps each asset's totals separate within one tooth", async () => {
    const accounts = await depositAccounts(usd2, 0, auntUsd2, usd2Treasury);
    await deposit(accounts, 10_000_000, { immediate: {} }, "Grandma");

    expect(await balance(accounts.depositVault)).to.equal(10_000_000);
    expect(await balance(usd2Treasury)).to.equal(0);
    const usdAgg = await program.account.assetMilestone.fetch(assetMilestonePda(usd2));
    const btcAgg = await program.account.assetMilestone.fetch(assetMilestonePda(btc));
    expect(usdAgg.totalDeposited.toNumber()).to.equal(10_000_000);
    expect(btcAgg.totalDeposited.toNumber()).to.equal(11_673);
  });

  it("rejects an asset that is not allowlisted", async () => {
    const stray = await createMint(provider.connection, payer, authority, null, 8);
    const straySource = await ata(stray, aunt.publicKey);
    await mintTo(provider.connection, payer, stray, straySource, payer, 100_000);
    const strayTreasury = await ata(stray, assetConfigPda(stray), true);
    await expectError(deposit(await depositAccounts(stray, 0, straySource, strayTreasury), 50_000, { immediate: {} }), "AccountNotInitialized");
  });

  it("rejects one asset's rule applied to another mint", async () => {
    const accounts = await depositAccounts(usd2, 1, auntUsd2, usd2Treasury);
    await expectError(deposit({ ...accounts, assetConfig: assetConfigPda(btc) }, 10_000_000, { immediate: {} }), "ConstraintSeeds");
  });

  it("rejects a deposit below the asset's minimum", async () => {
    const accounts = await depositAccounts(btc, 1, auntBtc, btcTreasury);
    await expectError(deposit(accounts, 999, { immediate: {} }), "AssetDepositTooSmall");
    expect(await provider.connection.getAccountInfo(accounts.assetDeposit)).to.equal(null);
  });

  it("rejects a vault that is not the deposit's canonical token account", async () => {
    const accounts = await depositAccounts(btc, 1, auntBtc, btcTreasury);
    const rogue = await createAccount(provider.connection, payer, btc, accounts.assetDeposit, Keypair.generate());
    await expectError(deposit({ ...accounts, depositVault: rogue }, 5_000, { immediate: {} }), "WrongTokenVault");
  });

  it("rejects deposits while the global emergency pause is active", async () => {
    const accounts = await depositAccounts(btc, 1, auntBtc, btcTreasury);
    await program.methods.pause().accounts({ authority, config: configPda }).rpc();
    try {
      await expectError(deposit(accounts, 5_000, { immediate: {} }), "ContractPaused");
    } finally {
      await program.methods.unpause().accounts({ authority, config: configPda }).rpc();
    }
  });

  it("refuses release before the opening date and to anyone but the guardian", async () => {
    const vault = (await depositAccounts(btc, 0, auntBtc, btcTreasury)).depositVault;
    await expectError(
      program.methods.claimAssetDeposit().accounts(guardianAccounts(btc, 0, vault, childBtc, guardian.publicKey)).signers([guardian]).rpc(),
      "DepositStillLocked",
    );
    await expectError(
      program.methods.earlyWithdrawAssetDeposit().accounts(guardianAccounts(btc, 0, vault, childBtc, outsider.publicKey)).signers([outsider]).rpc(),
      "ConstraintHasOne",
    );
  });

  it("refuses release into an account that is not the child's", async () => {
    const vault = (await depositAccounts(btc, 0, auntBtc, btcTreasury)).depositVault;
    const outsiderBtc = await ata(btc, outsider.publicKey);
    await expectError(
      program.methods.earlyWithdrawAssetDeposit().accounts(guardianAccounts(btc, 0, vault, outsiderBtc, guardian.publicKey)).signers([guardian]).rpc(),
      "WrongChildWallet",
    );
  });

  it("switching an asset off stops new deposits but never traps existing ones", async () => {
    await program.methods
      .updateAssetConfig(new anchor.BN(10_000), 0, false)
      .accounts({ authority, config: configPda, assetConfig: assetConfigPda(usd2) })
      .rpc();

    const next = await depositAccounts(usd2, 1, auntUsd2, usd2Treasury);
    await expectError(deposit(next, 10_000_000, { immediate: {} }), "AssetDisabled");

    const vault = (await depositAccounts(usd2, 0, auntUsd2, usd2Treasury)).depositVault;
    const childUsd2 = await ata(usd2, childWallet);
    await program.methods.claimAssetDeposit().accounts(guardianAccounts(usd2, 0, vault, childUsd2, guardian.publicKey)).signers([guardian]).rpc();
    expect(await balance(childUsd2)).to.equal(10_000_000);
    expect(await balance(vault)).to.equal(0);
    expect((await program.account.tokenDeposit.fetch(assetDepositPda(usd2, 0))).state).to.equal(1);

    await expectError(
      program.methods.claimAssetDeposit().accounts(guardianAccounts(usd2, 0, vault, childUsd2, guardian.publicKey)).signers([guardian]).rpc(),
      "AlreadyClaimed",
    );
  });

  it("lets only the original depositor refund inside the grace period", async () => {
    const accounts = await depositAccounts(btc, 1, auntBtc, btcTreasury);
    await deposit(accounts, 5_000, { fiveYears: {} }, "Uncle");
    const refundAccounts = (who: PublicKey, destination: PublicKey) => ({
      depositor: who,
      config: configPda,
      tokenMint: btc,
      assetMilestone: assetMilestonePda(btc),
      assetDeposit: accounts.assetDeposit,
      depositVault: accounts.depositVault,
      depositorTokenAccount: destination,
      tokenProgram: TOKEN_PROGRAM_ID,
    });

    await expectError(
      program.methods.refundAssetDeposit().accounts(refundAccounts(outsider.publicKey, await ata(btc, outsider.publicKey))).signers([outsider]).rpc(),
      "NotOriginalDepositor",
    );
    const before = await balance(auntBtc);
    await program.methods.refundAssetDeposit().accounts(refundAccounts(aunt.publicKey, auntBtc)).signers([aunt]).rpc();
    expect((await balance(auntBtc)) - before).to.equal(4_900);
    expect((await program.account.tokenDeposit.fetch(accounts.assetDeposit)).state).to.equal(2);
  });

  it("hands the vault to a new guardian, who alone can release to the new wallet", async () => {
    const nextGuardian = Keypair.generate();
    await fund(nextGuardian.publicKey);
    const destination = await ata(btc, nextGuardian.publicKey);

    await program.methods
      .updateChildWallet()
      .accounts({ guardian: guardian.publicKey, childProfile: profilePda, newChildWallet: nextGuardian.publicKey })
      .signers([guardian])
      .rpc();
    await program.methods
      .transferGuardianship()
      .accounts({ guardian: guardian.publicKey, childProfile: profilePda, newGuardian: nextGuardian.publicKey, config: configPda })
      .signers([guardian])
      .rpc();

    const vault = (await depositAccounts(btc, 0, auntBtc, btcTreasury)).depositVault;
    await expectError(
      program.methods.earlyWithdrawAssetDeposit().accounts(guardianAccounts(btc, 0, vault, destination, guardian.publicKey)).signers([guardian]).rpc(),
      "ConstraintHasOne",
    );
    await program.methods
      .earlyWithdrawAssetDeposit()
      .accounts(guardianAccounts(btc, 0, vault, destination, nextGuardian.publicKey))
      .signers([nextGuardian])
      .rpc();

    expect(await balance(destination)).to.equal(11_673);
    expect(await balance(vault)).to.equal(0);
    expect((await program.account.tokenDeposit.fetch(assetDepositPda(btc, 0))).state).to.equal(3);
    const aggregate = await program.account.assetMilestone.fetch(assetMilestonePda(btc));
    expect(aggregate.totalSettled.toNumber()).to.equal(11_673 + 4_900);
  });

  it("lets only the config authority withdraw an asset's fees", async () => {
    const withdraw = (who: PublicKey, destination: PublicKey) =>
      program.methods.withdrawAssetTreasury(new anchor.BN(238)).accounts({
        authority: who,
        config: configPda,
        assetConfig: assetConfigPda(btc),
        tokenMint: btc,
        assetTreasuryVault: btcTreasury,
        authorityTokenAccount: destination,
        tokenProgram: TOKEN_PROGRAM_ID,
      });

    await expectError(withdraw(outsider.publicKey, await ata(btc, outsider.publicKey)).signers([outsider]).rpc(), "NotConfigAuthority");
    const treasuryBefore = await balance(btcTreasury);
    await withdraw(authority, authorityBtc).rpc();
    expect(await balance(authorityBtc)).to.equal(238);
    expect(treasuryBefore - (await balance(btcTreasury))).to.equal(238);
  });
});
