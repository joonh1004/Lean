const { test, expect } = require("@playwright/test");
const key = "joonh.workspace.quoteGate.v1";
const day = "2026-11-15";
async function open(
  page,
  quotes = [
    { id: "a", text: "오늘 원문." },
    { id: "b", text: "다른 문구." },
  ],
) {
  await page.clock.install({ time: new Date("2026-11-15T10:00:00+09:00") });
  await page.addInitScript(
    ({ key, quotes, day }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            quotes,
            days: { [day]: { ...quotes[0], completed: false } },
            bag: quotes.slice(1).map((q) => q.id),
            lastId: quotes[0].id,
          }),
        );
    },
    { key, quotes, day },
  );
  await page.goto("http://127.0.0.1:5173");
}
test("editing assigned quote freezes today, removes exact-match badge and deletion confirms saved not draft copy", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "명언 관리", exact: true }).click();
  const row = page.locator(".quote-row").first();
  await expect(row.getByText("오늘", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "수정", exact: true }).click();
  await expect(
    page.getByText("오늘 입력 문구는 유지돼요.", { exact: true }),
  ).toBeVisible();
  const field = page.getByRole("textbox", { name: "문구", exact: true });
  await expect(field).toBeFocused();
  await field.fill("수정된\n문구.");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(row.getByText("오늘", { exact: true })).toHaveCount(0);
  expect((await stored(page)).days[day]).toEqual({
    id: "a",
    text: "오늘 원문.",
    completed: false,
  });
  await row.getByRole("button", { name: "수정", exact: true }).click();
  await field.fill("저장하지 않은 초안");
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.locator(".quote-delete-copy")).toHaveText("수정된\n문구.");
  await page.getByRole("button", { name: "삭제 확인", exact: true }).click();
  expect((await stored(page)).quotes.map((q) => q.id)).toEqual(["b"]);
  expect((await stored(page)).days[day].text).toBe("오늘 원문.");
  await page.getByRole("button", { name: "문구 입력으로" }).click();
  await expect(page.getByRole("blockquote")).toHaveText("오늘 원문.");
  await page.reload();
  await expect(page.getByRole("blockquote")).toHaveText("오늘 원문.");
});
test("last deletion shows recoverable empty gate, keeps snapshot and first add restores typing not completion", async ({
  page,
}) => {
  await open(page, [{ id: "a", text: "오늘 원문." }]);
  await page.getByRole("button", { name: "명언 관리", exact: true }).click();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(
    page.getByText(
      "마지막 문구예요. 삭제하면 문구를 추가할 때까지 입력을 시작할 수 없어요.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "삭제 확인", exact: true }).click();
  await expect(
    page.getByText("저장한 문구 없음", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "문구 입력으로" }).click();
  await expect(
    page.getByText("문구를 추가해 주세요.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("blockquote")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("문구를 추가해 주세요.", { exact: true }),
  ).toBeVisible();
  const snapshot = (await stored(page)).days[day];
  await page
    .getByRole("textbox", { name: "문구", exact: true })
    .fill("새 시작 문구.");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("blockquote")).toHaveText("오늘 원문.");
  await expect(
    page.getByRole("button", { name: "시작", exact: true }),
  ).toBeDisabled();
  const next = await stored(page);
  expect(next.quotes.map((q) => q.text)).toEqual(["새 시작 문구."]);
  expect(next.days[day]).toEqual(snapshot);
  expect(next.days[day].completed).toBe(false);
});
test("delete confirmation focuses cancel and restores delete without losing draft; removed row returns to heading", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "명언 관리", exact: true }).click();
  await page
    .locator(".quote-row")
    .first()
    .getByRole("button", { name: "수정" })
    .click();
  const field = page.getByRole("textbox", { name: "문구", exact: true });
  await field.fill("보존할 초안");
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "삭제 취소", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "삭제 취소", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "삭제", exact: true }),
  ).toBeFocused();
  await expect(field).toHaveValue("보존할 초안");
  await page.keyboard.press("Escape");
  await expect(
    page.locator(".quote-row").first().getByRole("button", { name: "수정" }),
  ).toBeFocused();
  await page
    .locator(".quote-row")
    .first()
    .getByRole("button", { name: "수정" })
    .click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await page.getByRole("button", { name: "삭제 확인", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "명언", exact: true }),
  ).toBeFocused();
});
test("completed day stays complete after last deletion with accurate confirmation", async ({
  page,
}) => {
  await open(page, [{ id: "a", text: "오늘 원문." }]);
  await page.getByRole("textbox", { name: "문구 입력" }).fill("오늘 원문.");
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "명언", exact: true })
    .click();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(
    page.getByText(
      "완료한 오늘 기록은 유지돼요. 다음 입력 전에 문구를 추가해 주세요.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "삭제 확인", exact: true }).click();
  expect((await stored(page)).days[day].completed).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "오늘", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "명언", exact: true })
    .click();
  await expect(
    page.getByText("저장한 문구 없음", { exact: true }),
  ).toBeVisible();
});
test("completion cannot overwrite storage corrupted after initial read", async ({
  page,
}) => {
  await open(page);
  await page.evaluate((k) => localStorage.setItem(k, "{broken"), key);
  await page.getByRole("textbox", { name: "문구 입력" }).fill("오늘 원문.");
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
    "{broken",
  );
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("custom and empty gates never mislabel personal quotes as samples", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByText("샘플", { exact: true })).toHaveCount(0);
});
test("verification coverage: add failure and corrupt-on-edit preserve draft, source bytes and unrelated records", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() =>
    localStorage.setItem(
      "joonh.workspace.records.v1",
      "unrelated bytes left untouched",
    ),
  );
  await page.getByRole("button", { name: "명언 관리", exact: true }).click();
  await page.getByRole("button", { name: "추가", exact: true }).click();
  const field = page.getByRole("textbox", { name: "문구", exact: true });
  await field.fill("추가 실패 초안\n보존");
  const before = await page.evaluate((k) => localStorage.getItem(k), key);
  await page.evaluate(() => {
    window.originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "joonh.workspace.quoteGate.v1")
        throw new DOMException("test", "QuotaExceededError");
      return window.originalSet.call(this, k, v);
    };
  });
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(field).toHaveValue("추가 실패 초안\n보존");
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(before);
  await page.evaluate(() => (Storage.prototype.setItem = window.originalSet));
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page
    .locator(".quote-row")
    .first()
    .getByRole("button", { name: "수정" })
    .click();
  await field.fill("손상 뒤의 초안");
  await page.evaluate((k) => localStorage.setItem(k, "{broken"), key);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(field).toHaveValue("손상 뒤의 초안");
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
    "{broken",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("joonh.workspace.records.v1"),
    ),
  ).toBe("unrelated bytes left untouched");
});
test("verification coverage: added quote participates in next pending days without skipping or boundary repeats", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "명언 관리", exact: true }).click();
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await page
    .getByRole("textbox", { name: "문구", exact: true })
    .fill("새 순환 문구.");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const added = (await stored(page)).quotes.at(-1).id;
  await page.getByRole("button", { name: "문구 입력으로" }).click();
  await page.clock.fastForward(86400000);
  await expect(page.getByRole("blockquote")).toHaveText("다른 문구.");
  await page.clock.fastForward(86400000);
  await expect(page.getByRole("blockquote")).toHaveText("새 순환 문구.");
  expect((await stored(page)).days["2026-11-17"].id).toBe(added);
  await page.clock.fastForward(86400000);
  await expect(page.getByRole("blockquote")).not.toHaveText("새 순환 문구.");
});
async function stored(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
}
test("gate management adds exact copy without authorizing workspace; completed sidebar shares persisted library", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "명언 관리", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "명언", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await page
    .getByRole("textbox", { name: "문구", exact: true })
    .fill("  새 문구\n두 번째 줄  ");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  expect((await stored(page)).quotes.at(-1).text).toBe(
    "  새 문구\n두 번째 줄  ",
  );
  expect((await stored(page)).days[day].completed).toBe(false);
  await page.getByRole("button", { name: "문구 입력으로" }).click();
  await expect(page.getByRole("blockquote")).toHaveText("오늘 원문.");
  await expect(
    page.getByRole("button", { name: "시작", exact: true }),
  ).toBeDisabled();
  await page.getByRole("textbox", { name: "문구 입력" }).fill("오늘 원문.");
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "명언", exact: true })
    .click();
  await expect(page.locator(".quote-row")).toHaveCount(3);
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "명언", exact: true })
    .click();
  await expect(page.locator(".quote-row")).toHaveCount(3);
});
