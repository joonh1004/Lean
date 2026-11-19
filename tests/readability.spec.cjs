const { test, expect } = require("@playwright/test");
test("Today wraps a test-only long title to 2–3 lines without moving checkbox or overlapping next item", async ({
  page,
}) => {
  const original =
    "미적분 오답 정리와 풀이 과정 비교 — 치환적분부터 부분적분까지";
  const title =
    "미적분 오답의 풀이 과정을 비교하고 치환적분과 부분적분을 선택한 근거를 정리한 뒤 다시 풀면서 틀린 이유와 다음 복습 계획을 기록하기";
  await page.route("**/src/main.jsx*", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    expect(body).toContain(original);
    await route.fulfill({ response, body: body.replace(original, title) });
  });
  await page.clock.install({ time: new Date("2026-08-13T10:00:00+09:00") });
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("textbox", { name: "문구 입력" })
    .fill(await page.getByRole("blockquote").innerText());
  await page.getByRole("button", { name: "시작", exact: true }).click();
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const rows = page.locator(
      '.today-panel[aria-label="오늘 할 일"] .today-item',
    );
    const first = rows.first(),
      next = rows.nth(1),
      full = first.locator(".full-title");
    await expect(full).toHaveText(title);
    const lines = await full.evaluate(
      (el) =>
        el.getBoundingClientRect().height /
        parseFloat(getComputedStyle(el).lineHeight),
    );
    expect(Math.round(lines)).toBeGreaterThanOrEqual(2);
    expect(Math.round(lines)).toBeLessThanOrEqual(3);
    const box = await first.getByRole("checkbox").boundingBox(),
      secondBox = await next.getByRole("checkbox").boundingBox();
    expect(Math.abs(box.x - secondBox.x)).toBeLessThan(1);
    expect(box.width).toBe(18);
    const one = await first.boundingBox(),
      two = await next.boundingBox();
    expect(two.y).toBeGreaterThanOrEqual(one.y + one.height - 1);
    expect(Math.abs(box.y - one.y - (secondBox.y - two.y))).toBeLessThan(1);
    await page.screenshot({
      path: `artifacts/today-wrapped-${width}.png`,
      animations: "disabled",
    });
  }
});
test("900px viewport retains accessible input and Start for a long scrollable quote", async ({
  page,
}) => {
  const key = "joonh.workspace.quoteGate.v1",
    text = "작은 질문을 기록하고 직접 실험하며 배운 것을 돌아보자. "
      .repeat(12)
      .trim();
  await page.addInitScript(
    ({ key, text }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          quotes: [{ id: "long", text }],
          days: {},
          bag: [],
          lastId: null,
        }),
      ),
    { key, text },
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://127.0.0.1:5173");
  const field = page.getByRole("textbox", { name: "문구 입력" }),
    start = page.getByRole("button", { name: "시작", exact: true });
  await field.fill(text);
  await start.scrollIntoViewIfNeeded();
  const bounds = await field.boundingBox(),
    button = await start.boundingBox();
  expect(bounds.height).toBe(240);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
  expect(button.y + button.height).toBeLessThanOrEqual(900);
  await expect(start).toBeEnabled();
  await expect(field).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/quote-long-viewport-1280.png",
    animations: "disabled",
    fullPage: false,
  });
  await field.fill("한 단어");
  expect((await field.boundingBox()).height).toBe(112);
});
test("quote input grows from 112px to 240px cap, scrolls only at cap and shrinks again", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://127.0.0.1:5173");
  const field = page.getByRole("textbox", { name: "문구 입력" });
  expect((await field.boundingBox()).height).toBe(112);
  await field.fill(Array(5).fill("한 줄을 읽고 기록하기.").join("\n"));
  expect((await field.boundingBox()).height).toBeGreaterThan(112);
  expect((await field.boundingBox()).height).toBeLessThan(240);
  await field.fill(Array(30).fill("한 줄을 읽고 기록하기.").join("\n"));
  expect((await field.boundingBox()).height).toBe(240);
  expect(await field.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await expect(field).toHaveCSS("overflow-y", "auto");
  await field.fill("짧은 문구.");
  expect((await field.boundingBox()).height).toBe(112);
  await expect(field).toBeFocused();
});
test("quote preserves Korean word boundaries with fallback for unbroken text", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5173");
  await expect(page.getByRole("blockquote")).toHaveCSS(
    "word-break",
    "keep-all",
  );
  await expect(page.getByRole("blockquote")).toHaveCSS(
    "overflow-wrap",
    "anywhere",
  );
});
