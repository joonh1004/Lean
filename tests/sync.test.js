import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { encodeSnapshot, decodeSnapshot, syncStatus, createSyncRemote, syncConfig } from '../src/syncProtocol.js';

const local = { records: JSON.stringify({version:1, records:[], folders:[]}), quotes:null, problems:[] };

test('preserves both images byte-for-byte, file identity and metadata', async () => {
  const photo = new File([Uint8Array.of(255, 216, 255, 5)], '문제.jpg', {type:'image/jpeg', lastModified:42});
  const result = await encodeSnapshot({...local, problems:[{id:'p', title:'문제', subject:'수학', savedAt:'2026-11-22', originalName:photo.name, original:photo, cleaned:new Blob([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)], {type:'image/png'}), edits:{marks:[{x:1}]}}]});
  const restored = decodeSnapshot(result).problems[0];
  assert.equal(restored.original.name, '문제.jpg');
  assert.equal(restored.original.lastModified, 42);
  assert.deepEqual(restored.edits, {marks:[{x:1}]});
  assert.deepEqual(new Uint8Array(await restored.original.arrayBuffer()), new Uint8Array(await photo.arrayBuffer()));
  assert.deepEqual(new Uint8Array(await restored.cleaned.arrayBuffer()), Uint8Array.of(137,80,78,71,13,10,26,10));
});

test('rejects oversized images, corrupt envelopes and malformed records', async () => {
  const big = new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], {type:'image/png'});
  await assert.rejects(encodeSnapshot({...local, problems:[{id:'p', original:big, cleaned:big}]}), /2 MiB/);
  assert.throws(() => decodeSnapshot(JSON.stringify({...local, version:2})), /버전/);
  await assert.rejects(encodeSnapshot({...local, records:'broken'}));
  await assert.rejects(encodeSnapshot({...local, quotes:' '.repeat(8 * 1024 * 1024 + 1)}), /8 MiB/);
});

test('unknown local and remote copies never become an implicit overwrite', () => {
  assert.equal(syncStatus(null, {revision:0, payload:null}, 'local'), 'empty');
  assert.equal(syncStatus(null, {revision:3, payload:'remote'}, 'local'), 'conflict');
  assert.equal(syncStatus({revision:2, payload:'base'}, {revision:3, payload:'remote'}, 'local'), 'conflict');
  assert.equal(syncStatus({revision:2, payload:'base'}, {revision:3, payload:'remote'}, 'base'), 'cloud');
  assert.equal(syncStatus({revision:2, payload:'base'}, {revision:2, payload:'base'}, 'local'), 'local');
  assert.equal(syncStatus(null, {revision:3, payload:'same'}, 'same'), 'same');
});

test('transport binds writes to the inspected account and revision; stale and failed writes do not report success', async () => {
  let args;
  const remote = createSyncRemote({rpc: async (name, params) => {args = [name, params]; return {data:null};}});
  const payload = await encodeSnapshot(local);
  await assert.rejects(remote.write('owner-a', 7, 'unreadable fixture'));
  assert.equal(args, undefined);
  assert.equal(await remote.write('owner-a', 7, payload), null);
  assert.deepEqual(args, ['lean_sync_write', {expected_owner:'owner-a', expected_revision:7, next_payload:payload}]);
  assert.equal(await remote.repair('owner-a', 7, payload), null);
  assert.deepEqual(args, ['lean_sync_repair', {expected_owner:'owner-a', expected_revision:7, next_payload:payload}]);
  await assert.rejects(remote.repair('owner-a', 8, 'unreadable fixture'));
  assert.equal(args[1].expected_revision,7);
  const failed = createSyncRemote({rpc: async () => ({error:new Error('offline')})});
  await assert.rejects(failed.write('owner-a', 7, payload), /offline/);
});

test('only a hosted HTTPS project and Supabase publishable key are accepted', () => {
  const key = 'sb_publishable_example';
  assert.equal(syncConfig('https://project.supabase.co',key)?.key,key);
  for (const url of ['http://project.supabase.co','https://fake.test','https://project.supabase.co/data','https://project.supabase.co@fake.test']) assert.equal(syncConfig(url,key),null);
  assert.equal(syncConfig('https://project.supabase.co','sb_secret_example'),null);
});
