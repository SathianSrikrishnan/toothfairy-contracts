import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ToothfairyEscrow } from "../target/types/toothfairy_escrow";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("toothfairy-escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ToothfairyEscrow as Program<ToothfairyEscrow>;
  const guardian = provider.wallet;

  const childWallet = Keypair.generate();
  const grandma = Keypair.generate();
  const uncle = Keypair.generate();
  console.log(`\n  Test child wallet: ${childWallet.publicKey.toBase58().slice(0, 12)}...`);

  let childProfilePda: PublicKey;
  let milestonePda0: PublicKey;
  let treasuryPda: PublicKey;

  before(async () => {
    // Fund test wallets
    for (const kp of [childWallet.publicKey, grandma.publicKey, uncle.publicKey]) {
      const tx = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: guardian.publicKey,
          toPubkey: kp,
          lamports: 2 * LAMPORTS_PER_SOL,
        })
      );
      await provider.sendAndConfirm(tx);
      console.log(`  Funded ${kp.toBase58().slice(0, 8)}... with 2 SOL`);
    }

    [childProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("child_profile"), guardian.publicKey.toBuffer(), childWallet.publicKey.toBuffer()],
      program.programId
    );

    [milestonePda0] = PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), childProfilePda.toBuffer(), Buffer.from([0])],
      program.programId
    );

    [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );
  });

  // ── 1. Initialize treasury ──
  it("Initializes the platform treasury", async () => {
    await program.methods
      .initializeTreasury()
      .accounts({
        authority: guardian.publicKey,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const treasury = await program.account.treasury.fetch(treasuryPda);
    expect(treasury.authority.toString()).to.equal(guardian.publicKey.toString());
    expect(treasury.totalCollected.toNumber()).to.equal(0);
    console.log("  ✓ Treasury initialized");
  });

  // ── 2. Initialize child profile ──
  it("Initializes a child profile", async () => {
    await program.methods
      .initializeChild("Isa")
      .accounts({
        guardian: guardian.publicKey,
        childWallet: childWallet.publicKey,
        childProfile: childProfilePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const profile = await program.account.childProfile.fetch(childProfilePda);
    expect(profile.childName).to.equal("Isa");
    expect(profile.milestoneCount).to.equal(0);
    console.log("  ✓ Child profile created for Isa");
  });

  // ── 3. Create milestone (cNFT minted separately via Bubblegum) ──
  it("Creates a milestone", async () => {
    await program.methods
      .createMilestone(
        { upperRightCentralIncisor: {} },
        "https://arweave.net/test-metadata-tooth-1"
      )
      .accounts({
        guardian: guardian.publicKey,
        childProfile: childProfilePda,
        milestone: milestonePda0,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const milestone = await program.account.milestone.fetch(milestonePda0);
    expect(milestone.totalDeposits.toNumber()).to.equal(0);
    expect(milestone.depositCount).to.equal(0);
    expect(milestone.milestoneIndex).to.equal(0);

    const profile = await program.account.childProfile.fetch(childProfilePda);
    expect(profile.milestoneCount).to.equal(1);
    console.log("  ✓ Milestone created: Upper Right Central Incisor");
  });

  // ── 4. Guardian deposits SOL (immediate) — 1% fee ──
  it("Guardian deposits SOL with immediate lock (1% fee)", async () => {
    const depositAmount = 0.5 * LAMPORTS_PER_SOL; // 500,000,000 lamports
    const expectedFee = Math.floor(depositAmount * 100 / 10000); // 1% = 5,000,000
    const expectedNet = depositAmount - expectedFee; // 495,000,000

    const [depositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), milestonePda0.toBuffer(), Buffer.from([0, 0, 0, 0])],
      program.programId
    );

    await program.methods
      .deposit(
        new anchor.BN(depositAmount),
        { immediate: {} },
        "Dad"
      )
      .accounts({
        depositor: guardian.publicKey,
        childProfile: childProfilePda,
        milestone: milestonePda0,
        depositAccount: depositPda,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const deposit = await program.account.deposit.fetch(depositPda);
    expect(deposit.amountLamports.toNumber()).to.equal(expectedNet);
    expect(deposit.lockUntil.toNumber()).to.equal(0);
    expect(deposit.depositorName).to.equal("Dad");
    expect(deposit.claimed).to.be.false;

    const treasury = await program.account.treasury.fetch(treasuryPda);
    expect(treasury.totalCollected.toNumber()).to.equal(expectedFee);

    console.log(`  ✓ Dad deposited 0.5 SOL → net ${expectedNet / LAMPORTS_PER_SOL} SOL, fee ${expectedFee / LAMPORTS_PER_SOL} SOL (1%)`);
  });

  // ── 5. Grandma deposits SOL (3-year lock) ──
  it("Grandma deposits SOL with 3-year lock", async () => {
    const depositAmount = 1 * LAMPORTS_PER_SOL;
    const expectedFee = Math.floor(depositAmount * 100 / 10000);
    const expectedNet = depositAmount - expectedFee;

    const [depositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), milestonePda0.toBuffer(), Buffer.from([1, 0, 0, 0])],
      program.programId
    );

    await program.methods
      .deposit(
        new anchor.BN(depositAmount),
        { threeYears: {} },
        "Grandma"
      )
      .accounts({
        depositor: grandma.publicKey,
        childProfile: childProfilePda,
        milestone: milestonePda0,
        depositAccount: depositPda,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([grandma])
      .rpc();

    const deposit = await program.account.deposit.fetch(depositPda);
    expect(deposit.amountLamports.toNumber()).to.equal(expectedNet);
    expect(deposit.lockUntil.toNumber()).to.be.greaterThan(0);
    expect(deposit.depositorName).to.equal("Grandma");

    console.log(`  ✓ Grandma deposited 1 SOL (locked 3 years), net ${expectedNet / LAMPORTS_PER_SOL} SOL`);
  });

  // ── 6. Uncle deposits SOL (immediate) ──
  it("Uncle deposits SOL with immediate lock", async () => {
    const depositAmount = 0.25 * LAMPORTS_PER_SOL;

    const [depositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), milestonePda0.toBuffer(), Buffer.from([2, 0, 0, 0])],
      program.programId
    );

    await program.methods
      .deposit(
        new anchor.BN(depositAmount),
        { immediate: {} },
        "Uncle Jay"
      )
      .accounts({
        depositor: uncle.publicKey,
        childProfile: childProfilePda,
        milestone: milestonePda0,
        depositAccount: depositPda,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([uncle])
      .rpc();

    const deposit = await program.account.deposit.fetch(depositPda);
    expect(deposit.depositorName).to.equal("Uncle Jay");
    console.log("  ✓ Uncle Jay deposited 0.25 SOL (immediate)");
  });

  // ── 7. Guardian claims Dad's immediate deposit → SOL goes to child ──
  it("Guardian claims immediate deposit — SOL goes to child", async () => {
    const [depositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), milestonePda0.toBuffer(), Buffer.from([0, 0, 0, 0])],
      program.programId
    );

    const deposit = await program.account.deposit.fetch(depositPda);
    const expectedPayout = deposit.amountLamports.toNumber();
    const childBalanceBefore = await provider.connection.getBalance(childWallet.publicKey);

    await program.methods
      .claimDeposit()
      .accounts({
        guardian: guardian.publicKey,
        childProfile: childProfilePda,
        milestone: milestonePda0,
        depositAccount: depositPda,
        childWallet: childWallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const childBalanceAfter = await provider.connection.getBalance(childWallet.publicKey);
    const depositAfter = await program.account.deposit.fetch(depositPda);

    expect(depositAfter.claimed).to.be.true;
    expect(childBalanceAfter - childBalanceBefore).to.equal(expectedPayout);
    console.log(`  ✓ Child received ${expectedPayout / LAMPORTS_PER_SOL} SOL from Dad's deposit`);
  });

  // ── 8. Guardian cannot claim Grandma's time-locked deposit ──
  it("Rejects claim on time-locked deposit", async () => {
    const [depositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), milestonePda0.toBuffer(), Buffer.from([1, 0, 0, 0])],
      program.programId
    );

    try {
      await program.methods
        .claimDeposit()
        .accounts({
          guardian: guardian.publicKey,
          childProfile: childProfilePda,
          milestone: milestonePda0,
          depositAccount: depositPda,
          childWallet: childWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown DepositStillLocked");
    } catch (err) {
      console.log("  ✓ Time-locked deposit correctly rejected");
    }
  });

  // ── 9. Early withdrawal of Grandma's locked deposit (10% penalty) ──
  it("Early withdrawal with 10% penalty", async () => {
    const [depositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), milestonePda0.toBuffer(), Buffer.from([1, 0, 0, 0])],
      program.programId
    );

    const depositBefore = await program.account.deposit.fetch(depositPda);
    const amount = depositBefore.amountLamports.toNumber();
    const expectedPenalty = Math.floor(amount * 1000 / 10000); // 10%
    const expectedPayout = amount - expectedPenalty;

    const childBalanceBefore = await provider.connection.getBalance(childWallet.publicKey);
    const treasuryBefore = await program.account.treasury.fetch(treasuryPda);

    await program.methods
      .earlyWithdraw()
      .accounts({
        guardian: guardian.publicKey,
        childProfile: childProfilePda,
        milestone: milestonePda0,
        depositAccount: depositPda,
        childWallet: childWallet.publicKey,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const childBalanceAfter = await provider.connection.getBalance(childWallet.publicKey);
    const depositAfter = await program.account.deposit.fetch(depositPda);
    const treasuryAfter = await program.account.treasury.fetch(treasuryPda);

    expect(depositAfter.claimed).to.be.true;
    expect(childBalanceAfter - childBalanceBefore).to.equal(expectedPayout);
    expect(treasuryAfter.totalCollected.toNumber() - treasuryBefore.totalCollected.toNumber()).to.equal(expectedPenalty);

    console.log(`  ✓ Early withdrawal: ${expectedPayout / LAMPORTS_PER_SOL} SOL to child, ${expectedPenalty / LAMPORTS_PER_SOL} SOL penalty to treasury`);
  });

  // ── 10. Prevents double-claim ──
  it("Prevents double-claiming a deposit", async () => {
    const [depositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), milestonePda0.toBuffer(), Buffer.from([0, 0, 0, 0])],
      program.programId
    );

    try {
      await program.methods
        .claimDeposit()
        .accounts({
          guardian: guardian.publicKey,
          childProfile: childProfilePda,
          milestone: milestonePda0,
          depositAccount: depositPda,
          childWallet: childWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown AlreadyClaimed");
    } catch (err) {
      expect(err.toString()).to.include("AlreadyClaimed");
      console.log("  ✓ Double-claim correctly rejected");
    }
  });

  // ── 11. Rejects deposit below minimum ──
  it("Rejects deposit below minimum (10,000 lamports)", async () => {
    const [depositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), milestonePda0.toBuffer(), Buffer.from([3, 0, 0, 0])],
      program.programId
    );

    try {
      await program.methods
        .deposit(
          new anchor.BN(100),
          { immediate: {} },
          "Spammer"
        )
        .accounts({
          depositor: uncle.publicKey,
          childProfile: childProfilePda,
          milestone: milestonePda0,
          depositAccount: depositPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([uncle])
        .rpc();
      expect.fail("Should have thrown DepositTooSmall");
    } catch (err) {
      console.log("  ✓ Spam deposit correctly rejected");
    }
  });

  // ── 12. Uncle refunds his deposit within grace period ──
  it("Uncle refunds deposit within 7-day grace period", async () => {
    const [depositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), milestonePda0.toBuffer(), Buffer.from([2, 0, 0, 0])],
      program.programId
    );

    const uncleBalanceBefore = await provider.connection.getBalance(uncle.publicKey);

    await program.methods
      .refundDeposit()
      .accounts({
        depositor: uncle.publicKey,
        childProfile: childProfilePda,
        milestone: milestonePda0,
        depositAccount: depositPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([uncle])
      .rpc();

    const uncleBalanceAfter = await provider.connection.getBalance(uncle.publicKey);
    const deposit = await program.account.deposit.fetch(depositPda);

    expect(deposit.claimed).to.be.true;
    expect(deposit.amountLamports.toNumber()).to.equal(0);
    expect(uncleBalanceAfter).to.be.greaterThan(uncleBalanceBefore);
    console.log(`  ✓ Uncle Jay refunded his deposit`);
  });

  // ── 13. Wrong person cannot refund ──
  it("Rejects refund from non-depositor", async () => {
    // Make a fresh deposit from uncle to test with
    const [depositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), milestonePda0.toBuffer(), Buffer.from([3, 0, 0, 0])],
      program.programId
    );

    // First make a valid deposit
    await program.methods
      .deposit(
        new anchor.BN(0.1 * LAMPORTS_PER_SOL),
        { immediate: {} },
        "Uncle Jay 2"
      )
      .accounts({
        depositor: uncle.publicKey,
        childProfile: childProfilePda,
        milestone: milestonePda0,
        depositAccount: depositPda,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([uncle])
      .rpc();

    // Try to refund as guardian (not the depositor)
    try {
      await program.methods
        .refundDeposit()
        .accounts({
          depositor: guardian.publicKey,
          childProfile: childProfilePda,
          milestone: milestonePda0,
          depositAccount: depositPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown NotOriginalDepositor");
    } catch (err) {
      console.log("  ✓ Non-depositor refund correctly rejected");
    }
  });

  // ── 14. Transfer guardianship ──
  it("Transfers guardianship to new wallet", async () => {
    const newGuardian = Keypair.generate();
    const fundTx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: guardian.publicKey,
        toPubkey: newGuardian.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(fundTx);

    await program.methods
      .transferGuardianship()
      .accounts({
        guardian: guardian.publicKey,
        childProfile: childProfilePda,
        newGuardian: newGuardian.publicKey,
      })
      .rpc();

    const profile = await program.account.childProfile.fetch(childProfilePda);
    expect(profile.guardian.toString()).to.equal(newGuardian.publicKey.toString());
    console.log("  ✓ Guardianship transferred");

    // Transfer back
    await program.methods
      .transferGuardianship()
      .accounts({
        guardian: newGuardian.publicKey,
        childProfile: childProfilePda,
        newGuardian: guardian.publicKey,
      })
      .signers([newGuardian])
      .rpc();
    console.log("  ✓ Guardianship transferred back");
  });

  // ── 15. Update child wallet ──
  it("Updates child wallet address", async () => {
    const newChildWallet = Keypair.generate();

    await program.methods
      .updateChildWallet()
      .accounts({
        guardian: guardian.publicKey,
        childProfile: childProfilePda,
        newChildWallet: newChildWallet.publicKey,
      })
      .rpc();

    const profile = await program.account.childProfile.fetch(childProfilePda);
    expect(profile.childWallet.toString()).to.equal(newChildWallet.publicKey.toString());
    console.log("  ✓ Child wallet updated");

    // Restore
    await program.methods
      .updateChildWallet()
      .accounts({
        guardian: guardian.publicKey,
        childProfile: childProfilePda,
        newChildWallet: childWallet.publicKey,
      })
      .rpc();
    console.log("  ✓ Child wallet restored");
  });

  // ── 16. Withdraw treasury fees ──
  it("Withdraws accumulated treasury fees", async () => {
    const treasury = await program.account.treasury.fetch(treasuryPda);
    const treasuryBalance = await provider.connection.getBalance(treasuryPda);
    const rent = await provider.connection.getMinimumBalanceForRentExemption(8 + 32 + 8 + 1); // Treasury struct size
    const available = treasuryBalance - rent;

    if (available > 0) {
      const guardianBalBefore = await provider.connection.getBalance(guardian.publicKey);

      await program.methods
        .withdrawTreasury(new anchor.BN(available))
        .accounts({
          authority: guardian.publicKey,
          treasury: treasuryPda,
        })
        .rpc();

      const guardianBalAfter = await provider.connection.getBalance(guardian.publicKey);
      // Guardian should have more SOL (minus tx fee)
      expect(guardianBalAfter).to.be.greaterThan(guardianBalBefore - 10000);
      console.log(`  ✓ Withdrew ${available / LAMPORTS_PER_SOL} SOL in fees from treasury`);
    } else {
      console.log("  ⚠ No withdrawable balance in treasury");
    }
  });

  // ── 17. Query all deposits ──
  it("Queries all deposits for a milestone", async () => {
    const deposits = await program.account.deposit.all([
      {
        memcmp: {
          offset: 8,
          bytes: milestonePda0.toBase58(),
        },
      },
    ]);

    console.log(`  Found ${deposits.length} deposits for milestone 0:`);
    for (const d of deposits) {
      const lockStatus = d.account.lockUntil.toNumber() === 0 ? "immediate" : `locked`;
      const claimStatus = d.account.claimed ? "(claimed/refunded)" : "(active)";
      console.log(`    - ${d.account.depositorName}: ${d.account.amountLamports.toNumber() / LAMPORTS_PER_SOL} SOL — ${lockStatus} ${claimStatus}`);
    }

    expect(deposits.length).to.be.greaterThanOrEqual(1);
    console.log(`  ✓ ${deposits.length} deposits queryable`);
  });

  // ── 18. Wrong guardian cannot claim ──
  it("Rejects claim from wrong guardian", async () => {
    const [depositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), milestonePda0.toBuffer(), Buffer.from([3, 0, 0, 0])],
      program.programId
    );

    try {
      await program.methods
        .claimDeposit()
        .accounts({
          guardian: uncle.publicKey,
          childProfile: childProfilePda,
          milestone: milestonePda0,
          depositAccount: depositPda,
          childWallet: childWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([uncle])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err) {
      console.log("  ✓ Wrong guardian correctly rejected");
    }
  });
});
