import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = new URL('../supabase/migrations/001_lean_sync.sql', import.meta.url);
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const payload = JSON.stringify({version:1,records:null,quotes:null,problems:[]});

test('local PostgreSQL: owner-only RLS, no direct writes, CAS, prior snapshot and limits', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      grant usage on schema auth to anon, authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      grant execute on function auth.uid() to anon, authenticated;`);
    await db.exec(await readFile(migration,'utf8'));
    await db.query('insert into auth.users values ($1), ($2)', [owner,other]);
    await db.query('insert into public.lean_sync_workspace(owner_id) values ($1)', [owner]);
    const read = () => db.query('select revision, payload, previous_payload from public.lean_sync_workspace');
    const write = (id, at, data) => db.query('select public.lean_sync_write($1,$2,$3) as result',[id,at,data]);
    await db.exec('set role anon');
    await assert.rejects(read(), /permission denied/);
    await assert.rejects(write(owner,0,payload), /permission denied/);
    await db.exec('set role authenticated');
    const login = uid => db.query("select set_config('test.uid',$1,false)",[uid]);
    await login(other);
    assert.deepEqual((await read()).rows, []);
    await assert.rejects(write(owner,0,payload), /denied/i);
    await assert.rejects(write(other,0,payload), /denied/i);
    await login(owner);
    await assert.rejects(db.exec('update public.lean_sync_workspace set revision=99'), /permission denied/);
    await assert.rejects(db.exec('delete from public.lean_sync_workspace'), /permission denied/);
    await assert.rejects(write(owner,0,'x'.repeat(8*1024*1024+1)), /size/i);
    await assert.rejects(write(owner,0,'[]'), /format/i);
    assert.equal((await write(owner,0,payload)).rows[0].result,1);
    assert.equal((await write(owner,0,payload)).rows[0].result,null);
    await assert.rejects(write(owner,1,payload.replace('[]', '[{}]')), /format/i);
    await assert.rejects(write(owner,1,JSON.stringify({version:1,records:'not JSON',quotes:null,problems:[]})), /json/i);
    const next = JSON.stringify({version:1,records:JSON.stringify({version:1,records:[]}),quotes:null,problems:[]});
    assert.equal((await write(owner,1,next)).rows[0].result,2);
    assert.deepEqual((await read()).rows,[{revision:2,payload:next,previous_payload:payload}]);

    // Stand-in for an unreadable pre-validation snapshot. Keep the good backup.
    await db.exec('reset role');
    await db.query('update public.lean_sync_workspace set payload=$1 where revision=2', ['unreadable fixture']);
    const repair = (id, at, data) => db.query('select public.lean_sync_repair($1,$2,$3) as result',[id,at,data]);
    await db.exec('set role anon');
    await assert.rejects(repair(owner,2,payload), /permission denied/);
    await db.exec('set role authenticated');
    await login(other);
    await assert.rejects(repair(owner,2,payload), /denied/i);
    await login(owner);
    assert.equal((await repair(owner,1,payload)).rows[0].result,null);
    await assert.rejects(repair(owner,2,payload.replace('[]', '[{}]')), /format/i);
    assert.deepEqual((await read()).rows,[{revision:2,payload:'unreadable fixture',previous_payload:payload}]);
    await assert.rejects(write(owner,2,next), /repair/i);
    assert.equal((await repair(owner,2,next)).rows[0].result,3);
    assert.deepEqual((await read()).rows,[{revision:3,payload:next,previous_payload:payload}]);
  } finally { await db.close(); }
});
