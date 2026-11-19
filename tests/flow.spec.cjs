const { test, expect } = require("@playwright/test");
const key = "joonh.workspace.quoteGate.v1";
test("today uses dated fixtures without moving records and shares completion with calendar", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-08-13T10:00:00+09:00") });
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("textbox", { name: "문구 입력" })
    .fill(await page.getByRole("blockquote").innerText());
  await page.getByRole("button", { name: "시작", exact: true }).click();
  const tasks = page.getByRole("region", { name: "오늘 할 일" }),
    events = page.getByRole("region", { name: "오늘 일정" });
  await expect(tasks.getByRole("checkbox")).toHaveCount(6);
  await expect(events.getByText("16:00")).toBeVisible();
  await tasks.getByRole("checkbox").first().check();
  await page.screenshot({
    path: "artifacts/today-fixture-1440.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "artifacts/today-fixture-1280.png",
    animations: "disabled",
  });
  await tasks.getByRole("button", { name: "캘린더", exact: true }).click();
  await expect(page.getByRole("heading", { name: "2026년 8월" })).toBeVisible();
  await page.getByRole("button", { name: "2026-08-13 상세" }).click();
  await expect(
    page.getByRole("dialog").getByRole("checkbox").first(),
  ).toBeChecked();
});
test("open page re-gates at local midnight and does not repeat cycle boundary quote", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-15T23:59:50+09:00") });
  await page.goto("http://127.0.0.1:5173");
  const first = await page.getByRole("blockquote").innerText();
  await page.getByRole("textbox", { name: "문구 입력" }).fill(first);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "오늘", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(20000);
  await expect(page.getByRole("blockquote")).toBeVisible();
  await expect(page.getByRole("blockquote")).not.toHaveText(first);
  await expect(page.getByRole("textbox", { name: "문구 입력" })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("button", { name: "시작", exact: true }),
  ).toBeDisabled();
  const state = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)),
    key,
  );
  expect(state.days["2026-11-15"].completed).toBe(true);
  expect(state.days["2026-11-16"].completed).toBe(false);
});
test("long quote wraps at 1280 and Enter remains multiline; today reduced motion", async ({
  page,
}) => {
  const text = "작은 질문을 기록하고 직접 실험하며 배운 것을 돌아보자. "
    .repeat(12)
    .trim();
  await page.addInitScript(
    ({ key, text }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          quotes: [{ id: "long", text }],
          days: {},
          bag: [],
          lastId: null,
        }),
      );
    },
    { key, text },
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:5173");
  const field = page.getByRole("textbox", { name: "문구 입력" });
  await field.fill("첫 줄");
  await field.press("Enter");
  await field.type("둘째 줄");
  await expect(field).toHaveValue("첫 줄\n둘째 줄");
  await field.fill(text);
  await page.screenshot({
    path: "artifacts/quote-long-1280.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "오늘", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".today-view")).toHaveCSS("animation-name", "none");
  await page.screenshot({
    path: "artifacts/today-1280.png",
    animations: "disabled",
  });
});
test("empty quote collection can save first quote then requires typing it", async ({
  page,
}) => {
  await page.addInitScript(
    (k) =>
      localStorage.setItem(
        k,
        JSON.stringify({
          version: 1,
          quotes: [],
          days: {},
          bag: [],
          lastId: null,
        }),
      ),
    key,
  );
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("textbox", { name: "문구", exact: true })
    .fill("나의 첫 문구.");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("blockquote")).toHaveText("나의 첫 문구.");
  await expect(
    page.getByRole("button", { name: "시작", exact: true }),
  ).toBeDisabled();
  const state = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)),
    key,
  );
  expect(state.quotes[0].text).toBe("나의 첫 문구.");
});
test("invalid storage is preserved with an error, not silently reset", async ({
  page,
}) => {
  await page.addInitScript((k) => localStorage.setItem(k, "{broken"), key);
  await page.goto("http://127.0.0.1:5173");
  await expect(page.getByRole("alert")).toContainText(
    "기존 데이터는 변경하지 않았어",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
    "{broken",
  );
});
test("storage write failure never claims completed entry", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("blocked", "QuotaExceededError");
    };
  });
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("textbox", { name: "문구 입력" })
    .fill(await page.getByRole("blockquote").innerText());
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("저장하지 못했어");
  await expect(page.getByRole("blockquote")).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(null);
});
test("daily gate: fixed on reload, Korean composition, explicit start, persisted completion, today to actual calendar", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-15T10:00:00+09:00") });
  await page.goto("http://127.0.0.1:5173");
  const quote = page.getByRole("blockquote");
  await expect(quote).toBeVisible();
  const text = await quote.innerText();
  await page.reload();
  await expect(quote).toHaveText(text);
  const field = page.getByRole("textbox", { name: "문구 입력" }),
    start = page.getByRole("button", { name: "시작", exact: true });
  await expect(start).toBeDisabled();
  await field.fill("다른 문구");
  await expect(start).toBeDisabled();
  await field.dispatchEvent("compositionstart");
  await field.fill(text);
  await expect(field).toBeFocused();
  await expect(start).toBeDisabled();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)).days["2026-11-15"].completed,
      key,
    ),
  ).toBe(false);
  await field.dispatchEvent("compositionend", { data: text });
  await expect(start).toBeEnabled();
  await expect(quote).toBeVisible();
  await page.screenshot({
    path: "artifacts/quote-1440.png",
    animations: "disabled",
    fullPage: true,
  });
  await start.click();
  await expect(
    page.getByRole("heading", { name: "오늘", exact: true }),
  ).toBeFocused();
  await expect(page.getByText("할 일 없음", { exact: true })).toBeVisible();
  await expect(page.getByText("일정 없음", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "artifacts/today-1440.png",
    animations: "disabled",
  });
  await page.reload();
  await expect(quote).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "오늘", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)).days["2026-11-15"].completed,
      key,
    ),
  ).toBe(true);
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("button", { name: "캘린더", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "2026년 11월" }),
  ).toBeVisible();
  await expect(page.locator(".day.selected .is-today")).toHaveCount(1);
});
