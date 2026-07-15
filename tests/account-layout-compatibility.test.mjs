import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { snapshotAccountLayouts } from '../scripts/account-layout-snapshot.mjs';

const SOURCE = new URL('../programs/toothfairy-escrow/src/lib.rs', import.meta.url);

test('keeps every deployed SOL account field in its original order', async () => {
  const source = await readFile(SOURCE, 'utf8');

  assert.deepEqual(snapshotAccountLayouts(source), {
    Config: ['authority', 'paused', 'bump'],
    ChildProfile: [
      'guardian',
      'child_wallet',
      'child_name',
      'milestone_count',
      'total_deposited',
      'total_claimed',
      'deposit_count',
      'status',
      'bump',
    ],
    Milestone: [
      'child_profile',
      'tooth_type',
      'metadata_uri',
      'deposit_lamports',
      'total_deposits',
      'deposit_count',
      'claimed',
      'created_at',
      'claimed_at',
      'milestone_index',
      'bump',
    ],
    Deposit: [
      'milestone',
      'depositor',
      'depositor_name',
      'amount_lamports',
      'lock_until',
      'claimed',
      'created_at',
      'claimed_at',
      'deposit_index',
      'bump',
    ],
    Treasury: ['authority', 'total_collected', 'bump'],
  });
});
