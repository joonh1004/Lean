const { test, expect } = require('@playwright/test');
const origin = 'http://127.0.0.1:5173';

for (const {open, field, view, key} of [
  {open:'할 일 추가', field:'제목', key:'records'},
  {open:'기록 추가', field:'제목', view:'저장소', key:'records'},
  {open:'폴더 추가', field:'폴더 이름', view:'저장소', key:'records'},
  {open:'추가', field:'문구', view:'명언', key:'quoteGate'},
]) {
  test(`delayed ${open} save leaves a replacement draft intact`, async ({page}) => {
    await page.goto(origin);
    await page.getByRole('textbox', {name:'문구 입력'}).fill(await page.getByRole('blockquote').innerText());
    await page.getByRole('button', {name:'시작', exact:true}).click();
    if (view) await page.getByRole('navigation', {name:'주 메뉴'}).getByRole('button', {name:view, exact:true}).click();
    const storageKey = `joonh.workspace.${key}.v1`;
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), storageKey)).not.toBeNull();
    const opener = page.getByRole('button', {name:open, exact:true});
    const editor = page.getByRole('dialog');
    const input = editor.getByLabel(field, {exact:true});
    await opener.click();
    await input.fill('first saved draft');
    if (open === '기록 추가') await editor.getByLabel('내용', {exact:true}).fill('first body');
    await page.evaluate(async () => {
      const {workspaceLock} = await import('/src/workspaceStorage.js');
      await new Promise(resolve => workspaceLock(() => new Promise(release => {
        window.releaseSave = release;
        resolve();
      })));
    });
    try {
      await editor.getByRole('button', {name:'저장', exact:true}).click();
      await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending.length)).toBe(1);
      await page.keyboard.press('Escape');
      await expect(editor).toHaveCount(0);
      await opener.click();
      await input.fill('second unsaved draft');
    } finally { await page.evaluate(() => window.releaseSave()); }
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), storageKey)).toContain('first saved draft');
    await expect(input).toHaveValue('second unsaved draft');
  });
}

test('two tabs serialize initialization, saved edits and rollover with the workspace lock', async ({context, page}) => {
  const app = await context.newPage();
  await page.goto(`${origin}/src/workspaceStorage.js`);
  await app.clock.install({time:new Date(2026, 7, 13, 23, 59, 50)});
  const hold = () => page.evaluate(async () => {
    const {workspaceLock} = await import('/src/workspaceStorage.js');
    await new Promise(resolve => workspaceLock(() => new Promise(release => {
      window.releaseWorkspace = release;
      resolve();
    })));
  });
  const release = () => page.evaluate(() => window.releaseWorkspace());
  const pending = () => page.evaluate(async () => (await navigator.locks.query()).pending.filter(l => l.name === 'lean-workspace-change-v1').length);
  const read = key => page.evaluate(key => localStorage.getItem(`joonh.workspace.${key}.v1`), key);

  await hold();
  await app.goto(origin);
  await expect.poll(pending, {timeout:3000}).toBe(1);
  expect(await read('quoteGate')).toBeNull();
  await release();
  await app.getByRole('textbox',{name:'문구 입력'}).fill(await app.getByRole('blockquote').innerText());
  await hold();
  await app.getByRole('button',{name:'시작',exact:true}).click();
  await expect.poll(pending).toBe(1);
  expect(JSON.parse(await read('quoteGate')).days['2026-08-13'].completed).toBe(false);
  const nextLock = hold();
  await expect.poll(pending).toBe(2);
  await release();
  await nextLock;
  await expect.poll(pending).toBe(1);
  expect(await read('records')).toBeNull();
  await release();
  const task = app.getByRole('region',{name:'오늘 할 일'}).getByRole('checkbox').first();
  await expect(task).toBeVisible();

  await hold();
  await task.click();
  await expect.poll(pending).toBe(1);
  expect(JSON.parse(await read('records')).records[0].done).toBe(false);
  await release();
  await expect(task).toBeChecked();

  await hold();
  await app.clock.fastForward(20000);
  await expect.poll(pending).toBe(1);
  expect(JSON.parse(await read('quoteGate')).days['2026-08-14']).toBeUndefined();
  await release();
  await expect(app.getByRole('blockquote')).toBeVisible();
  expect(JSON.parse(await read('quoteGate')).days['2026-08-14'].completed).toBe(false);
});

test('a two-tab upload guard excludes local writers and rejects stale input; import invalidates old pages', async ({context, page}) => {
  const app = await context.newPage();
  await app.clock.install({time:new Date(2026, 7, 13, 10)});
  await app.goto(origin);
  await app.getByRole('textbox',{name:'문구 입력'}).fill(await app.getByRole('blockquote').innerText());
  await app.getByRole('button',{name:'시작',exact:true}).click();
  const task = app.getByRole('region',{name:'오늘 할 일'}).getByRole('checkbox').first();
  await expect(task).toBeVisible();
  await page.goto(`${origin}/src/workspaceStorage.js`);
  const guard = await page.evaluate(async () => {
    const {localGuard, withUnchangedLocal} = await import('/src/syncLocal.js');
    const guard = await localGuard();
    await new Promise(resolve => withUnchangedLocal(guard, () => new Promise(release => {
      window.releaseUpload = release;
      resolve();
    })));
    return guard;
  });
  await task.click();
  await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending.length)).toBe(1);
  expect(await page.evaluate(key => localStorage.getItem('joonh.workspace.records.v1') === key, guard.records)).toBe(true);
  await page.evaluate(() => window.releaseUpload());
  await expect(task).toBeChecked();
  expect(await page.evaluate(async guard => {
    const {withUnchangedLocal, importLocal, localGuard} = await import('/src/syncLocal.js');
    let dispatched = false;
    try { await withUnchangedLocal(guard, () => { dispatched = true; }); } catch {}
    const current = await localGuard();
    const next = await importLocal({records:current.records, quotes:current.quotes, problems:[]}, current);
    return {dispatched, next};
  }, guard)).toMatchObject({dispatched:false, next:expect.any(String)});
  await task.click();
  await expect(app.getByRole('alert')).toContainText('저장하지 못했어요');
  await expect(task).toBeChecked();
  await app.clock.fastForward(24 * 60 * 60 * 1000);
  await expect(app.getByRole('alert')).toContainText('새로고침');
  const states = await page.evaluate(() => {
    const id = JSON.parse(localStorage.getItem('lean.sync.workspace.v1')).id;
    return ['', `lean.profile.${id}.`].map(prefix => ({
      completed:JSON.parse(localStorage.getItem(`${prefix}joonh.workspace.records.v1`)).records[0].done,
      days:Object.keys(JSON.parse(localStorage.getItem(`${prefix}joonh.workspace.quoteGate.v1`)).days),
    }));
  });
  expect(states).toEqual(Array(2).fill({completed:true, days:['2026-08-13']}));
});

for (const hasLocks of [true, false]) {
  test(`problem-bank reads leave a missing database absent (locks: ${hasLocks})`, async ({page}) => {
    if (!hasLocks) await page.addInitScript(() => Object.defineProperty(navigator, 'locks', {value:undefined}));
    await page.goto(`${origin}/src/workspaceStorage.js`);
    const result = await page.evaluate(async () => {
      const {workspaceLock} = await import('/src/workspaceStorage.js');
      const {getProblem, listProblems, problemIds, saveProblem} = await import('/src/problemBank.js');
      const read = async () => ({ids:await problemIds(), list:await listProblems(), missing:(await getProblem('a')) === undefined});
      const before = navigator.locks ? await workspaceLock(read) : await read();
      const hasDatabase = async () => (await indexedDB.databases()).some(db => db.name === 'lean-problem-bank');
      const createdByRead = await hasDatabase();
      const fixture = {id:'a', title:'fixture', savedAt:'2026-01-01'};
      await saveProblem(fixture);
      return {before, createdByRead, createdBySave:await hasDatabase(), saved:await getProblem('a')};
    });
    expect(result).toEqual({before:{ids:[], list:[], missing:true}, createdByRead:false, createdBySave:true,
      saved:{id:'a', title:'fixture', savedAt:'2026-01-01'}});
  });
}

test('without Web Locks the browser still saves records and quotes, but cannot switch workspaces', async ({page}) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'locks', {value:undefined}));
  await page.clock.install({time:new Date(2026, 7, 13, 10)});
  await page.goto(origin);
  await page.getByRole('textbox',{name:'문구 입력'}).fill(await page.getByRole('blockquote').innerText());
  await page.getByRole('button',{name:'시작',exact:true}).click();
  const task = page.getByRole('region',{name:'오늘 할 일'}).getByRole('checkbox').first();
  await task.click();
  await expect(task).toBeChecked();
  await page.reload();
  await expect(task).toBeChecked();
  await page.getByRole('button',{name:'기기 동기화',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('최신 브라우저');
});

test('sync can be opened before the quote gate and unconfigured builds never connect', async ({page}) => {
  const attempted = [];
  page.on('request', req => { if (!req.url().startsWith(origin)) attempted.push(req.url()); });
  await page.goto(origin);
  await page.getByRole('button',{name:'기기 동기화', exact:true}).click({timeout:3000});
  await expect(page.getByRole('dialog',{name:'기기 동기화'})).toContainText('이 빌드에는 클라우드 설정이 없어요');
  expect(attempted).toEqual([]);
});

test('two browser contexts exchange a protocol snapshot; the receiving device keeps its prior data', async ({browser}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const first = await a.newPage();
    const second = await b.newPage();
    await Promise.all([first.goto(origin), second.goto(origin)]);
    const payload = await first.evaluate(async () => {
      const {captureLocal, workspaceStorage} = await import('/src/syncLocal.js');
      const {saveProblem} = await import('/src/problemBank.js');
      const {encodeSnapshot} = await import('/src/syncProtocol.js');
      const {RECORDS_KEY, createRecord} = await import('/src/records.js');
      const {STORAGE_KEY, defaultState} = await import('/src/quotes.js');
      const at = '2026-01-01T00:00:00Z';
      const inputs = [
        {type:'task',title:'done',date:'2026-01-01'}, {type:'event',title:'event',date:'2026-01-01',time:'10:00'},
        {type:'note',title:'note',body:'private text',folderId:'folder'}, {type:'link',title:'link',url:'https://example.com',folderId:'folder'},
      ];
      const records = inputs.map((draft, i) => createRecord(draft, `r${i}`, at));
      Object.assign(records[0], {done:true, linkedRecordIds:['r2','r3']});
      workspaceStorage.setItem(RECORDS_KEY, JSON.stringify({version:1,records,folders:[{id:'folder',name:'folder',parentId:null}]}));
      workspaceStorage.setItem(STORAGE_KEY, JSON.stringify({...defaultState(), days:{'2026-01-01':{id:'q',text:'finished',completed:true}}}));
      const bytes = Uint8Array.of(137,80,78,71,13,10,26,10);
      await saveProblem({id:'image', title:'problem',subject:'math',savedAt:at,originalName:'photo.png',original:new File([bytes],'photo.png',{type:'image/png',lastModified:1}),cleaned:new Blob([bytes],{type:'image/png'}),edits:{marks:[]}});
      return encodeSnapshot(await captureLocal());
    });
    const result = await second.evaluate(async payload => {
      const {localGuard, importLocal, workspaceStorage} = await import('/src/syncLocal.js');
      const {RECORDS_KEY} = await import('/src/records.js');
      const {decodeSnapshot} = await import('/src/syncProtocol.js');
      const old = JSON.stringify({version:1, records:[], folders:[{id:'local',name:'local',parentId:null}]});
      workspaceStorage.setItem(RECORDS_KEY,old);
      const stale = await localGuard();
      workspaceStorage.setItem(RECORDS_KEY,old+' ');
      let blocked;
      try {await importLocal(decodeSnapshot(payload), stale); } catch {blocked=true;}
      await importLocal(decodeSnapshot(payload), await localGuard());
      let inactive;
      try {workspaceStorage.setItem(RECORDS_KEY, old); } catch {inactive=true;}
      return {blocked,inactive,originalPreserved:localStorage.getItem(RECORDS_KEY)===old+' '};
    }, payload);
    expect(result).toEqual({blocked:true,inactive:true,originalPreserved:true});
    await second.reload();
    const restored = await second.evaluate(async () => {
      const {captureLocal, restoreLocal, registry} = await import('/src/syncLocal.js');
      const data = await captureLocal();
      await restoreLocal(registry().backups[0].id);
      const {records,folders} = JSON.parse(data.records);
      const p = (await data.problems.next()).value;
      return {titles:records.map(r=>r.title),done:records[0].done,links:records[0].linkedRecordIds, folder:folders[0].name, quote:JSON.parse(data.quotes).days['2026-01-01'].completed, name:p.original.name, cleaned:[...new Uint8Array(await p.cleaned.arrayBuffer())]};
    });
    expect(restored).toEqual({titles:['done','event','note','link'],done:true,links:['r2','r3'],folder:'folder',quote:true,name:'photo.png',cleaned:[137,80,78,71,13,10,26,10]});
    await second.reload();
    expect(await second.evaluate(async () => JSON.parse((await (await import('/src/syncLocal.js')).captureLocal()).records).folders[0].name)).toBe('local');
  } finally { await a.close(); await b.close(); }
});
