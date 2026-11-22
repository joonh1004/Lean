const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const base = process.env.LEAN_TEST_URL || 'http://127.0.0.1:5173';

async function openBank(page) {
  await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '저장소', exact: true }).click();
  await page.getByRole('button', { name: '문제은행', exact: true }).click({ timeout: 4000 });
}

async function start(page, url = base) {
  await page.goto(url);
  await page.getByRole('textbox', { name: '문구 입력' }).fill(await page.getByRole('blockquote').innerText());
  await page.getByRole('button', { name: '시작', exact: true }).click();
}

async function fixture(page) {
  return Buffer.from(await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 80; c.height = 60;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0,0,80,60);
    g.fillStyle = '#000'; g.fillRect(0,0,2,60); g.fillRect(12,20,40,1);
    g.fillStyle = '#f00'; g.fillRect(16,18,2,6); g.fillRect(29,6,4,5);
    g.fillStyle = '#0033cc'; g.font = '12px sans-serif'; g.fillText('x² + △', 11, 40);
    return c.toDataURL().split(',')[1];
  }), 'base64');
}
async function rect(page, values, action) {
  for (const [label, value] of ['영역 X', '영역 Y', '영역 너비', '영역 높이'].map((label,i) => [label,values[i]])) {
    await page.getByLabel(label, {exact:true}).fill(String(value));
  }
  await page.getByRole('button', {name:action,exact:true}).click();
}
async function imageData(image) {
  return image.evaluate(async (img) => {
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img,0,0);
    return { w:c.width, h:c.height, pixels:Array.from(ctx.getImageData(0,0,c.width,c.height).data) };
  });
}
function pixel(data,x,y) { return data.pixels.slice(4*(y*data.w+x),4*(y*data.w+x)+4); }

async function saveFixture(page) {
  await openBank(page);
  await page.getByLabel('문제 이미지').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: await fixture(page) });
  await page.getByLabel('과목', { exact: true }).fill('수학');
  await page.getByRole('button', { name: '현재 미리보기 승인' }).click();
  await page.getByRole('button', { name: '최종 저장' }).click();
  return page.getByRole('button', { name: 'HWPX 다운로드' });
}

async function watchExportRequests(page) {
  await page.addInitScript(() => {
    window.exportMethods = [];
    const fetch = window.fetch;
    window.fetch = (url, options) => {
      if (new URL(url, location.href).pathname === '/api/problem-hwpx') {
        window.exportMethods.push(options?.method || 'GET');
      }
      return fetch(url, options);
    };
  });
}

test('public origin never requests HWPX and still downloads the cleaned PNG', async ({ page }) => {
  const publicOrigin = 'https://127.0.0.1.example.invalid';
  await watchExportRequests(page);
  // Serve the app at a synthetic public origin; never forward an export request.
  await page.route(`${publicOrigin}/**`, async route => {
    const { pathname, search } = new URL(route.request().url());
    if (pathname === '/api/problem-hwpx') return route.abort();
    await route.fulfill({ response: await route.fetch({ url: new URL(pathname + search, base).href }) });
  });
  await start(page, publicOrigin);
  const exportButton = await saveFixture(page);
  await exportButton.evaluate(button => button.click());
  expect(await page.evaluate(() => window.exportMethods)).toEqual([]);
  await expect(exportButton).toBeDisabled();
  await expect(page.getByText(/HWPX는 이 PC의 로컬/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: '정리 이미지 다운로드' }).click();
  expect((await download).suggestedFilename()).toBe('fixture.png');
});

test('loopback static fallback does not receive an image', async ({ page }) => {
  await watchExportRequests(page);
  await page.route('**/api/problem-hwpx', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
  await start(page);
  const exportButton = await saveFixture(page);
  await expect(page.getByText(/로컬 HWPX 변환기를 사용할 수 없어요/)).toBeVisible({ timeout: 4000 });
  await exportButton.evaluate(button => button.click());
  expect(await page.evaluate(() => window.exportMethods)).toEqual(['HEAD']);
  await expect(exportButton).toBeDisabled();
});

test('crop and localized cleanup, revision approval and original/cleaned bytes survive reload', async ({ page }, testInfo) => {
  await start(page);
  const bytes = await fixture(page);
  await openBank(page);
  const oldRecords = await page.evaluate(() => localStorage.getItem('joonh.workspace.records.v1'));
  await page.getByLabel('문제 이미지').setInputFiles({ name:'fixture.png',mimeType:'image/png',buffer:bytes });
  await page.getByLabel('문제 제목').fill('합성 수학 문항');
  await page.getByLabel('과목', {exact:true}).fill('수학');
  await expect(page.getByText(/Codex.*미설정/)).toBeVisible();
  await expect(page.getByRole('button', {name:'최종 저장'})).toBeDisabled();
  await rect(page,[4,3,70,52],'이 영역으로 자르기');
  await rect(page,[28,5,7,7],'확실한 표식 제거');
  await rect(page,[16,18,2,6],'확실한 표식 제거');
  await rect(page,[15,17,4,8],'불확실 영역 원본 유지');
  await rect(page,[20,3,54,52],'이 영역으로 자르기');
  await expect(page.getByRole('alert')).toContainText('유지하기로 한 영역');
  await expect(page.getByText(/인쇄와 겹치거나.*X 15/)).toBeVisible();
  await page.getByLabel('정답 표시 상태').selectOption('retained');
  await page.getByRole('button', {name:'현재 미리보기 승인'}).click();
  await expect(page.getByRole('button', {name:'최종 저장'})).toBeEnabled();
  await rect(page,[5,3,68,52],'이 영역으로 자르기');
  await expect(page.getByRole('button', {name:'최종 저장'})).toBeDisabled();
  const original = await imageData(page.getByRole('img', {name:'원본 이미지'}));
  const cleaned = await imageData(page.getByRole('img', {name:'정리 미리보기'}));
  expect([cleaned.w,cleaned.h]).toEqual([68,52]);
  expect(pixel(cleaned,24,3)).toEqual([255,255,255,255]);
  for(let y=0;y<52;y++) for(let x=0;x<68;x++) {
    if(x+5>=28 && x+5<35 && y+3>=5 && y+3<12) continue;
    expect(pixel(cleaned,x,y)).toEqual(pixel(original,x+5,y+3));
  }
  await page.getByLabel('정답 표시 상태').selectOption('retained');
  await page.getByRole('button', {name:'현재 미리보기 승인'}).click();
  const approvedBytes = await page.getByRole('img', {name:'정리 미리보기'}).evaluate(async (img) =>
    Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())));
  const { writeFile } = require('node:fs/promises');
  await writeFile(testInfo.outputPath('fixture-approved.png'), Buffer.from(approvedBytes));
  await page.getByRole('button', {name:'최종 저장'}).click();
  await expect(page.getByText('문제를 저장했어요.')).toBeVisible();
  await page.reload();
  await openBank(page);
  await page.getByRole('button',{name:'합성 수학 문항',exact:true}).click();
  await expect(page.getByText('과목: 수학',{exact:true})).toBeVisible();
  await expect(page.getByText(/자동 사용 제외.*정답 표시/)).toBeVisible();
  expect(await imageData(page.getByRole('img',{name:'저장된 정리 이미지'}))).toEqual(cleaned);
  const originalDownload = page.waitForEvent('download');
  await page.getByRole('link',{name:'원본 이미지 다운로드'}).click();
  expect(await readFile(await (await originalDownload).path())).toEqual(bytes);
  expect(await page.evaluate(() => localStorage.getItem('joonh.workspace.records.v1'))).toBe(oldRecords);
  if (process.env.LEAN_TEST_HWPX === '1') {
    const exportButton = page.getByRole('button', { name: 'HWPX 다운로드' });
    await expect(exportButton).toBeEnabled({ timeout: 7000 });
    const [output] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
    expect(output.suggestedFilename()).toBe('합성 수학 문항.hwpx');
    await output.saveAs(testInfo.outputPath('fixture.hwpx'));
    const cleanLink = page.getByRole('link',{name:'정리 이미지 다운로드'});
    const pngDownload = page.waitForEvent('download');
    await cleanLink.click();
    await (await pngDownload).saveAs(testInfo.outputPath('fixture-cleaned.png'));
  }
});
