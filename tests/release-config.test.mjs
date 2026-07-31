import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('defaults contract tooling to the matching Anchor version and localnet', async () => {
  const config = await readFile(new URL('../Anchor.toml', import.meta.url), 'utf8');

  assert.match(config, /anchor_version\s*=\s*"0\.30\.1"/);
  assert.match(config, /\[provider\][\s\S]*?cluster\s*=\s*"localnet"/);
  assert.match(
    config,
    /\[test\.validator\][\s\S]*?bind_address\s*=\s*"127\.0\.0\.1"/,
    'the local validator must not bind gossip to an unspecified address',
  );
});

test('pins the proc-macro API required by the Anchor 0.30 IDL builder', async () => {
  const lockfile = await readFile(new URL('../Cargo.lock', import.meta.url), 'utf8');
  assert.match(lockfile, /name = "proc-macro2"\nversion = "1\.0\.94"/);
  assert.match(lockfile, /name = "serde_json"\nversion = "1\.0\.140"/);
  assert.doesNotMatch(lockfile, /name = "zmij"/);
});

test('classic USDC support excludes Anchor SPL default and Token-2022 features', async () => {
  const manifest = await readFile(
    new URL('../programs/toothfairy-escrow/Cargo.toml', import.meta.url),
    'utf8',
  );

  assert.match(
    manifest,
    /anchor-spl\s*=\s*\{[^}]*default-features\s*=\s*false[^}]*features\s*=\s*\["token"\][^}]*\}/,
  );
  assert.doesNotMatch(manifest, /features\s*=\s*\[[^\]]*"associated_token"/);
  assert.doesNotMatch(manifest, /features\s*=\s*\[[^\]]*"token_2022"/);
  assert.match(
    manifest,
    /idl-build\s*=\s*\["anchor-lang\/idl-build", "anchor-spl\/idl-build", "anchor-spl\/token_2022"\]/,
  );
});

test('release regression rebuilds the deployable artifact with audited size features', async () => {
  const releaseScript = await readFile(
    new URL('../scripts/run-release-regression.sh', import.meta.url),
    'utf8',
  );
  const workspaceManifest = await readFile(
    new URL('../Cargo.toml', import.meta.url),
    'utf8',
  );

  assert.match(workspaceManifest, /opt-level\s*=\s*"z"/);
  assert.match(
    releaseScript,
    /cargo build-sbf[\s\S]*--features no-idl,no-log-ix-name[\s\S]*--sbf-out-dir target\/deploy/,
  );
  assert.match(releaseScript, /node --test tests\/release-config\.test\.mjs/);
});

test('release artifact stays within the audited classic-SPL size budget', async () => {
  const { stat } = await import('node:fs/promises');
  const artifact = new URL(
    '../target/deploy/toothfairy_escrow.so',
    import.meta.url,
  );
  const { size } = await stat(artifact);

  assert.ok(
    size <= 450_000,
    `release artifact is ${size} bytes; expected no more than 450000`,
  );
});
