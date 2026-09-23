import { createHash } from 'node:crypto';
import bs58 from 'bs58';
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC');
const SQUADS_VAULT = new PublicKey('Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko');
const CANONICAL_USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const DISCRIMINATORS = {
  'initialize-usdc': [60, 14, 114, 86, 25, 84, 93, 149],
  pause: [211, 22, 221, 251, 74, 121, 193, 47],
  unpause: [169, 144, 4, 38, 10, 141, 188, 255],
};

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function derive(seed) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed)], PROGRAM_ID)[0];
}

function buildInstruction(action) {
  const config = derive('config');
  const tokenConfig = derive('token_config');
  const keys = action === 'initialize-usdc'
    ? [
      { pubkey: SQUADS_VAULT, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: tokenConfig, isSigner: false, isWritable: true },
      { pubkey: CANONICAL_USDC, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]
    : [
      { pubkey: SQUADS_VAULT, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
    ];
  return {
    config,
    tokenConfig,
    instruction: new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data: Buffer.from(DISCRIMINATORS[action]),
    }),
  };
}

async function main() {
  const action = argument('--action');
  if (!Object.hasOwn(DISCRIMINATORS, action)) {
    throw new Error('Supported actions: initialize-usdc | pause | unpause');
  }
  const rpcUrl = process.env.TFN_MAINNET_RPC_URL || MAINNET_RPC;
  const suppliedBlockhash = argument('--blockhash');
  const recentBlockhash = suppliedBlockhash
    || (await new Connection(rpcUrl, 'finalized').getLatestBlockhash('finalized')).blockhash;
  const { config, tokenConfig, instruction } = buildInstruction(action);
  const message = new TransactionMessage({
    payerKey: SQUADS_VAULT,
    recentBlockhash,
    instructions: [instruction],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  const bytes = transaction.serialize();

  console.log(JSON.stringify({
    mode: 'unsigned-squads-import',
    cluster: 'mainnet-beta',
    action,
    programId: PROGRAM_ID.toBase58(),
    vault: SQUADS_VAULT.toBase58(),
    config: config.toBase58(),
    ...(action === 'initialize-usdc' ? {
      tokenConfig: tokenConfig.toBase58(),
      allowedMint: CANONICAL_USDC.toBase58(),
      decimals: 6,
    } : {}),
    recentBlockhash,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    base58Transaction: bs58.encode(bytes),
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
