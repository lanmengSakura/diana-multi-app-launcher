import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { exportPackages } from './export-windows-packages.mjs';

// Byte fixtures only: the exporter must never run an executable or publish it.
test('portable export preserves exact bytes and writes verifiable checksums', () => {
  const root = mkdtempSync(join(tmpdir(), 'diana-export-test-'));
  try {
    const binary = join(root, 'launcher.exe'), setup = join(root, 'setup.exe');
    writeFileSync(binary, 'MZ-fixture-portable'); writeFileSync(setup, 'MZ-fixture-installer');
    const out = join(root, 'output');
    const result = exportPackages({ binary, setup, out, version: '0.1.0-beta.4-rc.3' });
    assert.equal(result.packages.length, 2);
    for (const item of result.packages) {
      const bytes = readFileSync(join(out, item.name));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
      assert.ok(readFileSync(join(out, 'SHA256SUMS.txt'), 'utf8').includes(`${item.sha256}  ${item.name}\n`));
    }
    assert.deepEqual(readFileSync(join(out, result.packages[0].name)), readFileSync(binary));
    assert.throws(() => exportPackages({ binary, setup, out, version: '0.1.0-beta.4-rc.3' }), /already exists/);
    assert.equal(readFileSync(binary, 'utf8'), 'MZ-fixture-portable');
  } finally { rmSync(root, { recursive: true }); }
});

test('invalid inputs fail before creating any output', () => {
  const root = mkdtempSync(join(tmpdir(), 'diana-export-test-'));
  try {
    const binary = join(root, 'not-an-exe.txt'), out = join(root, 'output');
    writeFileSync(binary, 'not executable');
    assert.throws(() => exportPackages({ binary, out, version: '0.1.0' }), /Not a Windows executable/);
    assert.throws(() => exportPackages({ binary, out, version: '../bad' }), /Invalid version/);
    assert.ok(!existsSync(out));
  } finally { rmSync(root, { recursive: true }); }
});
