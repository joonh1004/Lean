import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const url = 'https://fixture-project.supabase.co';
const key = 'sb_publishable_fixture_only';
const run = (u, k, outDir) => spawnSync(process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', '--base=/Lean/', '--mode=lean-contract', '--outDir', outDir], {
    cwd:root, encoding:'utf8', env:{...process.env, DEBUG:'vite:env,vite:config', VITE_SUPABASE_URL:u, VITE_SUPABASE_PUBLISHABLE_KEY:k},
  });

function withOutput(test, runTest) {
  const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'lean-build-'));
  test.after(() => rmSync(dir, {recursive:true, force:true}));
  runTest(dir);
}

test('build rejects incomplete, invalid and non-public sync settings without reporting values', t => withOutput(t, dir => {
  for (const [u,k] of [[url,''], ['',key], ['http://fixture.invalid',key], ['https://-.supabase.co',key], [url,'sb_secret_fixture_only'], [url,'fixture.jwt.placeholder']]) {
    const result = run(u,k,dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid Lean sync configuration/);
    for (const value of [u,k].filter(Boolean)) assert.ok(!result.stderr.includes(value) && !result.stdout.includes(value));
  }
  assert.equal(readdirSync(dir).length, 0);
}));

test('build accepts both blank or two valid public settings and only includes configured values', t => withOutput(t, dir => {
  for (const enabled of [false,true]) {
    const result = run(enabled ? url : '', enabled ? key : '', dir);
    assert.equal(result.status, 0);
    for (const value of [url,key]) assert.ok(!result.stderr.includes(value) && !result.stdout.includes(value));
    const assets = join(dir, 'assets');
    const source = readdirSync(assets).filter(f => f.endsWith('.js')).map(f => readFileSync(join(assets, f), 'utf8')).join('\n');
    assert.equal(source.includes(url), enabled);
    assert.equal(source.includes(key), enabled);
  }
}));
