const { test, expect } = require('@playwright/test');

const recordsKey = 'joonh.workspace.records.v1';
const quotesKey = 'joonh.workspace.quoteGate.v1';
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const field = (scope, name) => scope.getByLabel(name, { exact: true });
const read = (page, key) => page.evaluate(key => localStorage.getItem(key), key);

async function start(page) {
  await page.clock.install({ time: new Date(2026, 7, 13, 10) });
  await page.goto('http://127.0.0.1:5173');
  await field(page, '문구 입력').fill(await page.getByRole('blockquote').innerText());
  await button(page, '시작').click();
  await expect(button(page, '할 일 추가')).toBeEnabled();
}

function navigate(page, view) {
  return button(page.getByRole('navigation', { name: '주 메뉴' }), view).click();
}

async function holdWrite(page, deniedKey) {
  await page.evaluate(async key => {
    const { workspaceLock } = await import('/src/workspaceStorage.js');
    await new Promise(ready => workspaceLock(() => new Promise(release => {
      window.releasePendingEditorLock = release;
      ready();
    })));
    if (key) {
      const write = Storage.prototype.setItem;
      window.restorePendingEditorStorage = () => { Storage.prototype.setItem = write; };
      Storage.prototype.setItem = function (name, value) {
        if (name === key) throw new DOMException('quota', 'QuotaExceededError');
        return write.call(this, name, value);
      };
    }
  }, deniedKey);
}

const releaseWrite = page => page.evaluate(() => window.releasePendingEditorLock());
const restoreStorage = page => page.evaluate(() => window.restorePendingEditorStorage());
const queued = page => page.evaluate(async () => (await navigator.locks.query()).pending
  .filter(lock => lock.name === 'lean-workspace-change-v1').length);

// Submit twice in one turn so a render-only disabled flag cannot hide a duplicate write.
function submitTwice(button, form = true) {
  return button.evaluate((element, form) => {
    const target = form ? element.form : element;
    for (let i = 0; i < 2; i++) {
      target.dispatchEvent(new Event(form ? 'submit' : 'click', { bubbles: true, cancelable: true }));
    }
  }, form);
}

for (const scenario of [
  { name: 'calendar task', open: '할 일 추가', label: '제목', view: '캘린더', key: recordsKey, group: 'records', property: 'title' },
  { name: 'note', open: '기록 추가', label: '제목', view: '저장소', key: recordsKey, group: 'records', property: 'title', extra: '내용' },
  { name: 'link', open: '기록 추가', label: '제목', view: '저장소', key: recordsKey, group: 'records', property: 'title', extra: 'URL' },
  { name: 'folder', open: '폴더 추가', label: '폴더 이름', view: '저장소', key: recordsKey, group: 'folders', property: 'name' },
  { name: 'quote', open: '추가', label: '문구', view: '명언', key: quotesKey, group: 'quotes', property: 'text' },
]) {
  test(`pending ${scenario.name} save is single-flight and retryable`, async ({ page }) => {
    await start(page);
    await navigate(page, scenario.view);
    const before = await read(page, scenario.key);
    await button(page, scenario.open).click();
    const editor = page.getByRole('dialog');
    const input = field(editor, scenario.label);
    const save = button(editor, '저장');
    await input.fill('draft to retry');
    if (scenario.name === 'link') await field(editor, '종류').selectOption('link');
    const extra = scenario.extra && field(editor, scenario.extra);
    const extraValue = scenario.name === 'link' ? 'https://example.com/draft' : 'body to retry';
    if (extra) await extra.fill(extraValue);
    await holdWrite(page, scenario.key);
    try {
      await submitTwice(save);
      await expect(editor.getByRole('status')).toHaveText('저장 중…', { timeout: 2000 });
      expect(await queued(page)).toBe(1);
      await expect(input).toBeDisabled();
      if (extra) await expect(extra).toBeDisabled();
      await expect(save).toBeDisabled();
      await expect(button(editor, '취소')).toBeEnabled();
      await page.keyboard.type('attempted edit');
      await expect(input).toHaveValue('draft to retry');
      expect(await read(page, scenario.key)).toBe(before);
    } finally { await releaseWrite(page); }
    await expect(editor.getByRole('alert')).toContainText('저장하지 못했어요');
    await expect(editor.getByRole('status')).toHaveCount(0);
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue('draft to retry');
    if (extra) await expect(extra).toHaveValue(extraValue);
    expect(await read(page, scenario.key)).toBe(before);
    await restoreStorage(page);
    await save.click();
    await expect(editor).toHaveCount(0);
    expect(JSON.parse(await read(page, scenario.key))[scenario.group].filter(record => record[scenario.property] === 'draft to retry')).toHaveLength(1);
  });
}

for (const scenario of [
  { name: 'calendar task', open: '할 일 추가', label: '제목', edit: '수정 delete fixture', first: '삭제', action: '삭제', confirm: '취소', key: recordsKey },
  { name: 'note', view: '저장소', open: '기록 추가', label: '제목', edit: '기록 수정', first: '원본 삭제', action: '원본 삭제', confirm: '취소', key: recordsKey },
  { name: 'folder', view: '저장소', open: '폴더 추가', label: '폴더 이름', edit: '폴더 수정', action: '폴더 삭제', key: recordsKey },
  { name: 'quote', view: '명언', open: '추가', label: '문구', edit: '수정', first: '삭제', action: '삭제 확인', confirm: '삭제 취소', key: quotesKey },
]) {
  test(`pending ${scenario.name} delete locks the draft until retry`, async ({ page }) => {
    await start(page);
    if (scenario.view) await navigate(page, scenario.view);
    const editor = page.getByRole('dialog');
    const input = field(editor, scenario.label);
    await button(page, scenario.open).click();
    await input.fill('delete fixture');
    if (scenario.name === 'note') await field(editor, '내용').fill('fixture body');
    await button(editor, '저장').click();
    await expect(editor).toHaveCount(0);
    const scope = scenario.name === 'quote' ? page.locator('article').filter({ hasText: 'delete fixture' }) : page;
    await button(scope, scenario.edit).click();
    await input.fill('unsaved delete draft');
    if (scenario.first) await button(editor, scenario.first).click();
    const remove = button(editor, scenario.action);
    const before = await read(page, scenario.key);
    await holdWrite(page, scenario.key);
    try {
      await submitTwice(remove, false);
      await expect(editor.getByRole('status')).toHaveText('삭제 중…', { timeout: 2000 });
      expect(await queued(page)).toBe(1);
      await expect(input).toBeDisabled();
      await expect(remove).toBeDisabled();
      if (scenario.confirm) await expect(button(editor, scenario.confirm)).toBeDisabled();
      expect(await read(page, scenario.key)).toBe(before);
    } finally { await releaseWrite(page); }
    await expect(editor.getByRole('alert')).toBeVisible();
    await expect(editor.getByRole('status')).toHaveCount(0);
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue('unsaved delete draft');
    expect(await read(page, scenario.key)).toBe(before);
    await restoreStorage(page);
    await remove.click();
    await expect(editor).toHaveCount(0);
    expect(await read(page, scenario.key)).not.toContain('delete fixture');
  });
}

async function relationFixture(page) {
  await start(page);
  const editor = page.getByRole('dialog');
  for (const [view, open, title] of [
    [null, '할 일 추가', 'relation task'],
    ['저장소', '기록 추가', 'relation note'],
  ]) {
    if (view) await navigate(page, view);
    await button(page, open).click();
    await field(editor, '제목').fill(title);
    if (view) await field(editor, '내용').fill('relation fixture');
    await button(editor, '저장').click();
    await expect(editor).toHaveCount(0);
  }
}

async function calendarRelationOpener(page) {
  await navigate(page, '캘린더');
  await button(page, '2026-08-13 상세').click();
  return button(page.getByRole('dialog'), '자료 연결 relation task');
}

for (const source of ['calendar', 'repository']) {
  test(`pending ${source} relation prevents duplicate connects and preserves its search`, async ({ page }) => {
    await relationFixture(page);
    const open = source === 'calendar' ? await calendarRelationOpener(page) : button(page, '할 일·일정 연결');
    await open.click();
    const picker = page.getByRole('dialog', { name: '기록 연결' });
    const query = field(picker, '연결할 기록 검색');
    const connect = button(picker, source === 'calendar' ? '연결 메모 relation note 저장소' : '연결 할 일 relation task 저장소');
    await query.fill('relation');
    const before = await read(page, recordsKey);
    await holdWrite(page, recordsKey);
    try {
      await submitTwice(connect, false);
      await expect(picker.getByRole('status')).toHaveText('연결 중…', { timeout: 2000 });
      expect(await queued(page)).toBe(1);
      await expect(query).toBeDisabled();
      await expect(connect).toBeDisabled();
      await expect(button(picker, '취소')).toBeEnabled();
      expect(await read(page, recordsKey)).toBe(before);
    } finally { await releaseWrite(page); }
    await expect(picker.getByRole('alert')).toContainText('연결하지 못했어요');
    await expect(query).toBeEnabled();
    await expect(query).toHaveValue('relation');
    expect(await read(page, recordsKey)).toBe(before);
    await restoreStorage(page);
    await connect.click();
    await expect(picker).toHaveCount(0);
    const { records } = JSON.parse(await read(page, recordsKey));
    expect(records.find(record => record.title === 'relation task').linkedRecordIds)
      .toEqual([records.find(record => record.title === 'relation note').id]);
  });
}

test('a calendar relation write does not close a reopened picker for the same task', async ({ page }) => {
  await relationFixture(page);
  const open = await calendarRelationOpener(page);
  const picker = page.getByRole('dialog', { name: '기록 연결' });
  const query = field(picker, '연결할 기록 검색');
  await open.click();
  const before = await read(page, recordsKey);
  await holdWrite(page);
  try {
    await button(picker, '연결 메모 relation note 저장소').click();
    await expect.poll(() => queued(page)).toBe(1);
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await open.click();
    await query.fill('relation note');
  } finally { await releaseWrite(page); }
  await expect.poll(() => read(page, recordsKey)).not.toBe(before);
  await expect(button(picker, '연결됨 메모 relation note 저장소')).toBeDisabled({ timeout: 2000 });
  await expect(query).toHaveValue('relation note');
});

for (const firstQuote of [false, true]) {
  test(`pending ${firstQuote ? 'first quote' : 'daily quote'} submission preserves input on failure`, async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 7, 13, 10) });
    if (firstQuote) {
      await page.addInitScript(key => {
        localStorage.setItem(key, JSON.stringify({ version: 1, quotes: [], bag: [], pending: [], days: {}, lastId: null }));
      }, quotesKey);
    }
    await page.goto('http://127.0.0.1:5173');
    const input = field(page, firstQuote ? '문구' : '문구 입력');
    const value = firstQuote ? 'first quote draft' : await page.getByRole('blockquote').innerText();
    const save = button(page, firstQuote ? '저장' : '시작');
    await input.fill(value);
    const before = await read(page, quotesKey);
    await holdWrite(page, quotesKey);
    try {
      await submitTwice(save);
      await expect(page.getByRole('status')).toHaveText('저장 중…', { timeout: 2000 });
      expect(await queued(page)).toBe(1);
      await expect(input).toBeDisabled();
      await expect(save).toBeDisabled();
      await expect(button(page, '명언 관리')).toBeDisabled();
      expect(await read(page, quotesKey)).toBe(before);
    } finally { await releaseWrite(page); }
    await expect(page.getByRole('alert')).toContainText('저장하지 못했어');
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue(value);
    expect(await read(page, quotesKey)).toBe(before);
    await restoreStorage(page);
    await save.click();
    if (firstQuote) await expect(page.getByRole('blockquote')).toHaveText(value);
    else await expect(button(page, '할 일 추가')).toBeEnabled();
  });
}
