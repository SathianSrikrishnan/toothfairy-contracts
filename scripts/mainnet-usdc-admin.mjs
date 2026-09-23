import anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const { AnchorProvider, Program, Wallet } = anchor;

const PROGRAM_ID = 'FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC';
const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
const CURRENT_SINGLE_AUTHORITY = '5piptchcKR5qbJKqVJCjTo2rq1TouvpeAeH3XQuEYsXq';
const SQUADS_VAULT = 'Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko';
const EXECUTION_ACK = 'I_UNDERSTAND';

function parseAction(argv) {
  const index = argv.indexOf('--action');
  const action = index >= 0 ? argv[index + 1] : null;
  if (!['pause', 'migrate-authorities'].includes(action)) {
    throw new Error('Supported actions: --action pause | migrate-authorities');
  }
  return action;
}

function deriveAdminAccounts() {
  const programId = new PublicKey(PROGRAM_ID);
  return {
    config: PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      programId,
    )[0],
    treasury: PublicKey.findProgramAddressSync(
      [Buffer.from('treasury')],
      programId,
    )[0],
  };
}

async function executePause() {
  const rpcUrl = process.env.TFN_MAINNET_RPC_URL || MAINNET_RPC;
  const keypairPath = process.env.DEPLOY_KEYPAIR_PATH
    || path.join(os.homedir(), '.config', 'solana', 'id.json');
  const secret = JSON.parse(await readFile(keypairPath, 'utf8'));
  const authority = Keypair.fromSecretKey(Uint8Array.from(secret));
  if (authority.publicKey.toBase58() !== CURRENT_SINGLE_AUTHORITY) {
    throw new Error(`Release authority mismatch: ${authority.publicKey.toBase58()}`);
  }

  const connection = new Connection(rpcUrl, 'finalized');
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== MAINNET_GENESIS_HASH) {
    throw new Error(`Mainnet genesis mismatch: ${genesisHash}`);
  }

  const idl = JSON.parse(await readFile(
    path.resolve('target', 'idl', 'toothfairy_escrow.json'),
    'utf8',
  ));
  if (idl.address !== PROGRAM_ID) throw new Error(`IDL program mismatch: ${idl.address}`);

  const provider = new AnchorProvider(connection, new Wallet(authority), {
    commitment: 'finalized',
    preflightCommitment: 'finalized',
  });
  const program = new Program(idl, provider);
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    new PublicKey(PROGRAM_ID),
  );
  const before = await program.account.config.fetch(config);
  if (before.authority.toBase58() !== CURRENT_SINGLE_AUTHORITY) {
    throw new Error(`Config authority mismatch: ${before.authority.toBase58()}`);
  }
  if (before.paused) {
    return {
      mode: 'mainnet-execution',
      action: 'pause',
      programId: PROGRAM_ID,
      authority: CURRENT_SINGLE_AUTHORITY,
      config: config.toBase58(),
      status: 'already-paused',
      signature: null,
    };
  }

  await program.methods.pause().accounts({
    authority: authority.publicKey,
    config,
  }).simulate();
  const signature = await program.methods.pause().accounts({
    authority: authority.publicKey,
    config,
  }).rpc();
  await connection.confirmTransaction(signature, 'finalized');

  const after = await program.account.config.fetch(config);
  if (!after.paused) throw new Error('Pause transaction finalized but config is not paused');

  return {
    mode: 'mainnet-execution',
    action: 'pause',
    programId: PROGRAM_ID,
    authority: CURRENT_SINGLE_AUTHORITY,
    config: config.toBase58(),
    status: 'paused',
    signature,
  };
}

async function executeAuthorityMigration() {
  const rpcUrl = process.env.TFN_MAINNET_RPC_URL || MAINNET_RPC;
  const keypairPath = process.env.DEPLOY_KEYPAIR_PATH
    || path.join(os.homedir(), '.config', 'solana', 'id.json');
  const secret = JSON.parse(await readFile(keypairPath, 'utf8'));
  const authority = Keypair.fromSecretKey(Uint8Array.from(secret));
  if (authority.publicKey.toBase58() !== CURRENT_SINGLE_AUTHORITY) {
    throw new Error(`Release authority mismatch: ${authority.publicKey.toBase58()}`);
  }

  const connection = new Connection(rpcUrl, 'finalized');
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== MAINNET_GENESIS_HASH) {
    throw new Error(`Mainnet genesis mismatch: ${genesisHash}`);
  }

  const idl = JSON.parse(await readFile(
    path.resolve('target', 'idl', 'toothfairy_escrow.json'),
    'utf8',
  ));
  if (idl.address !== PROGRAM_ID) throw new Error(`IDL program mismatch: ${idl.address}`);

  const provider = new AnchorProvider(connection, new Wallet(authority), {
    commitment: 'finalized',
    preflightCommitment: 'finalized',
  });
  const program = new Program(idl, provider);
  const accounts = deriveAdminAccounts();
  const [configBefore, treasuryBefore] = await Promise.all([
    program.account.config.fetch(accounts.config),
    program.account.treasury.fetch(accounts.treasury),
  ]);
  if (!configBefore.paused) throw new Error('Authority migration refused because the program is not paused');

  const allowedAuthorities = new Set([CURRENT_SINGLE_AUTHORITY, SQUADS_VAULT]);
  const configAuthority = configBefore.authority.toBase58();
  const treasuryAuthority = treasuryBefore.authority.toBase58();
  if (!allowedAuthorities.has(configAuthority)) {
    throw new Error(`Unexpected config authority: ${configAuthority}`);
  }
  if (!allowedAuthorities.has(treasuryAuthority)) {
    throw new Error(`Unexpected treasury authority: ${treasuryAuthority}`);
  }
  if (configAuthority === SQUADS_VAULT && treasuryAuthority === SQUADS_VAULT) {
    return {
      mode: 'mainnet-execution',
      action: 'migrate-authorities',
      newAuthority: SQUADS_VAULT,
      status: 'already-migrated',
      signature: null,
    };
  }

  const transaction = new Transaction();
  const newAuthority = new PublicKey(SQUADS_VAULT);
  if (configAuthority === CURRENT_SINGLE_AUTHORITY) {
    transaction.add(await program.methods
      .transferConfigAuthority(newAuthority)
      .accounts({ authority: authority.publicKey, config: accounts.config })
      .instruction());
  }
  if (treasuryAuthority === CURRENT_SINGLE_AUTHORITY) {
    transaction.add(await program.methods
      .transferTreasuryAuthority(newAuthority)
      .accounts({ authority: authority.publicKey, treasury: accounts.treasury })
      .instruction());
  }

  const latest = await connection.getLatestBlockhash('finalized');
  transaction.feePayer = authority.publicKey;
  transaction.recentBlockhash = latest.blockhash;
  const simulation = await connection.simulateTransaction(transaction, [authority]);
  if (simulation.value.err) {
    throw new Error(`Authority migration simulation failed: ${JSON.stringify(simulation.value.err)}`);
  }
  const signature = await connection.sendTransaction(transaction, [authority], {
    preflightCommitment: 'finalized',
  });
  await connection.confirmTransaction({ signature, ...latest }, 'finalized');

  const [configAfter, treasuryAfter] = await Promise.all([
    program.account.config.fetch(accounts.config),
    program.account.treasury.fetch(accounts.treasury),
  ]);
  if (configAfter.authority.toBase58() !== SQUADS_VAULT) {
    throw new Error('Config authority did not migrate to the Squads vault');
  }
  if (treasuryAfter.authority.toBase58() !== SQUADS_VAULT) {
    throw new Error('Treasury authority did not migrate to the Squads vault');
  }

  return {
    mode: 'mainnet-execution',
    action: 'migrate-authorities',
    newAuthority: SQUADS_VAULT,
    accounts: {
      config: accounts.config.toBase58(),
      treasury: accounts.treasury.toBase58(),
    },
    status: 'migrated',
    signature,
  };
}

async function main() {
  const action = parseAction(process.argv.slice(2));
  const execute = process.argv.includes('--execute');
  if (!execute) {
    const accounts = deriveAdminAccounts();
    console.log(JSON.stringify({
      mode: 'dry-run',
      action,
      programId: PROGRAM_ID,
      authority: CURRENT_SINGLE_AUTHORITY,
      rpc: MAINNET_RPC,
      ...(action === 'migrate-authorities' ? {
        newAuthority: SQUADS_VAULT,
        accounts: {
          config: accounts.config.toBase58(),
          treasury: accounts.treasury.toBase58(),
        },
      } : {}),
    }));
    return;
  }
  if (process.env.TFN_MAINNET_EXECUTE !== EXECUTION_ACK) {
    throw new Error('Execution requires TFN_MAINNET_EXECUTE=I_UNDERSTAND');
  }
  console.log(JSON.stringify(
    action === 'pause'
      ? await executePause()
      : await executeAuthorityMigration(),
  ));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
