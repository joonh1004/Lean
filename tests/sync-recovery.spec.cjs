const { test, expect } = require('@playwright/test');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const fixtureOrigin = 'https://fixture-project.supabase.co';
const owner = '11111111-1111-4111-8111-111111111111';
const email = 'owner@example.invalid';
const backup = JSON.stringify({version:1, records:null, quotes:null, problems:[]});

test('unreadable cloud offers explicit repair only; a changed revision is rejected and backup stays intact', async ({context, page}) => {
  const { createServer } = await import('vite');
  const cacheDir = await mkdtemp(join(process.env.TMPDIR || tmpdir(), 'lean-vite-test-'));
  const settings = {VITE_SUPABASE_URL:fixtureOrigin, VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture_only'};
  const old = Object.keys(settings).map(name => [name, process.env[name]]);
  let server;
  try {
    Object.assign(process.env, settings);
    server = await createServer({cacheDir, server:{host:'127.0.0.1', port:5174, strictPort:true, hmr:false}});
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const workspace = {revision:2, payload:'unreadable snapshot fixture', previous_payload:backup};
    const writes = [];
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== fixtureOrigin) return route.abort();
      const response = (json, status = 200) => route.fulfill({status, json, headers:{'access-control-allow-origin':origin}});
      if (request.method() === 'OPTIONS') return route.fulfill({status:204, headers:{
        'access-control-allow-origin':origin,
        'access-control-allow-methods':'GET, POST, OPTIONS',
        'access-control-allow-headers':request.headers()['access-control-request-headers'] || '*',
      }});
      if (url.pathname === '/auth/v1/token') return response({
        access_token:'fixture-access', refresh_token:'fixture-refresh', token_type:'bearer', expires_in:3600,
        user:{id:owner, email, aud:'authenticated'},
      });
      if (url.pathname === '/rest/v1/lean_sync_workspace' && url.searchParams.get('owner_id') === `eq.${owner}`) {
        if (url.searchParams.get('select') === 'previous_payload') {
          if (url.searchParams.has('revision') && url.searchParams.get('revision') !== `eq.${workspace.revision}`) return response([]);
          return response([{previous_payload:workspace.previous_payload}]);
        }
        return response([{revision:workspace.revision, payload:workspace.payload}]);
      }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const payload = request.postDataJSON();
        writes.push({path:url.pathname, ...payload});
        if (url.pathname !== '/rest/v1/rpc/lean_sync_repair' || payload.expected_owner !== owner) return response({}, 403);
        if (payload.expected_revision !== workspace.revision) return response(null);
        workspace.payload = payload.next_payload;
        return response(++workspace.revision);
      }
      return route.abort();
    });
    await page.goto(origin);
    await page.getByRole('blockquote').waitFor();
    await page.getByRole('button',{name:'기기 동기화', exact:true}).click();
    const sync = page.getByRole('dialog',{name:'기기 동기화'});
    await sync.getByLabel('이메일').fill(email);
    await sync.getByLabel('비밀번호').fill('fixture-only-password');
    await sync.getByRole('button',{name:'로그인',exact:true}).click();
    const compare = sync.getByRole('button',{name:'저장된 복사본 비교'});
    const repair = sync.getByRole('button',{name:'이전 클라우드 백업으로 클라우드 복구'});
    await compare.click();
    await expect(sync).toContainText('현재 클라우드 복사본을 읽을 수 없어요');
    await expect(sync.getByRole('button',{name:'이 브라우저 복사본으로 클라우드 복구'})).toBeVisible();
    await expect(sync.getByRole('button',{name:'이 브라우저 백업 후 클라우드 복사본 열기'})).toHaveCount(0);
    await expect(sync.getByRole('button',{name:'이 브라우저 복사본을 클라우드에 저장'})).toHaveCount(0);
    await repair.click(); // Playwright dismisses the confirmation by default.
    expect(writes).toHaveLength(0);
    workspace.revision++;
    page.once('dialog', prompt => prompt.accept());
    await repair.click();
    await expect(sync.getByRole('alert')).toContainText('다른 기기가 먼저 저장했어요');
    expect(workspace).toEqual({revision:3,payload:'unreadable snapshot fixture',previous_payload:backup});
    await compare.click();
    page.once('dialog', prompt => prompt.accept());
    await repair.click();
    await expect(sync).toContainText('클라우드 버전 4 복구를 확인했어요');
    expect(workspace).toEqual({revision:4,payload:backup,previous_payload:backup});
    expect(writes.map(write => [write.path, write.expected_owner, write.expected_revision, write.next_payload])).toEqual(
      [2,3].map(revision => ['/rest/v1/rpc/lean_sync_repair', owner, revision, backup]));

    await test.step('matching copies record the baseline with the workspace lock held', async () => {
      workspace.payload = await page.evaluate(async () => {
        const {captureLocal} = await import('/src/syncLocal.js');
        const {encodeSnapshot} = await import('/src/syncProtocol.js');
        const request = navigator.locks.request.bind(navigator.locks);
        let holdingWorkspace = false;
        navigator.locks.request = (name, callback) => request(name, async lock => {
          if (name === 'lean-workspace-change-v1') holdingWorkspace = true;
          try { return await callback(lock); }
          finally { if (name === 'lean-workspace-change-v1') holdingWorkspace = false; }
        });
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (key.startsWith('lean.sync.base.v1.')) window.baselineLocked = holdingWorkspace;
          return setItem.call(this, key, value);
        };
        return encodeSnapshot(await captureLocal());
      });
      try {
        await compare.click();
        await expect(sync.getByRole('status')).toContainText('이 브라우저와 클라우드가 같아요');
        expect(await page.evaluate(() => window.baselineLocked)).toBe(true);
      } finally { workspace.payload = backup; }
    });

    await test.step('a queued download rejects a revision that changes before activation', async () => {
      await compare.click();
      await expect(sync.getByRole('status')).toContainText('클라우드 버전 4');
      const download = sync.getByRole('button',{name:'이 브라우저 백업 후 클라우드 복사본 열기'});
      await page.evaluate(async () => {
        const {workspaceLock} = await import('/src/workspaceStorage.js');
        await new Promise(resolve => workspaceLock(() => new Promise(release => {
          window.releaseDownload = release;
          resolve();
        })));
      });
      try {
        page.once('dialog', prompt => prompt.accept());
        await download.click();
        await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending.length)).toBe(1);
        workspace.revision++;
      } finally { await page.evaluate(() => window.releaseDownload()); }
      await expect(sync.getByRole('alert')).toContainText('클라우드가 바뀌었어요');
      await expect(download).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('lean.sync.workspace.v1'))).toBeNull();

      await compare.click();
      await expect(sync.getByRole('status')).toContainText('클라우드 버전 5');
      page.once('dialog', prompt => prompt.accept());
      await download.click();
      await expect.poll(() => page.evaluate(() => {
        const id = JSON.parse(localStorage.getItem('lean.sync.workspace.v1'))?.id;
        return id && JSON.parse(localStorage.getItem(`lean.sync.base.v1.https://fixture-project.supabase.co.11111111-1111-4111-8111-111111111111.${id}`))?.revision;
      })).toBe(5);
    });
  } finally {
    for (const [name,value] of old) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await page.close();
    await server?.close();
    await rm(cacheDir,{recursive:true,force:true});
  }
});
