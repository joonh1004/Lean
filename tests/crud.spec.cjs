const { test, expect } = require("@playwright/test");
const key = "joonh.workspace.records.v1";
test("inline delete confirmation focuses cancel and returns to delete without losing draft", async ({
  page,
}) => {
  await page.getByRole("button", { name: "할 일 추가", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("제목", { exact: true }).fill("삭제 취소 검증");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await page
    .getByRole("button", { name: "수정 삭제 취소 검증", exact: true })
    .click();
  await dialog.getByLabel("제목", { exact: true }).fill("편집 중인 제목");
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "취소", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: "artifacts/editor-delete-confirm-1440.png",
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "삭제", exact: true }),
  ).toBeFocused();
  await expect(dialog.getByLabel("제목", { exact: true })).toHaveValue(
    "편집 중인 제목",
  );
});
test("editor is centered at both desktop widths despite shared overlay CSS", async ({
  page,
}) => {
  await page.getByRole("button", { name: "할 일 추가", exact: true }).click();
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.getByRole("dialog").boundingBox();
    expect(Math.abs(bounds.x + bounds.width / 2 - width / 2)).toBeLessThan(1);
    expect(bounds.width).toBe(480);
  }
});
test("completion survives reload; deleting from Today returns focus to stable heading", async ({
  page,
}) => {
  await page.getByRole("button", { name: "할 일 추가", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("제목", { exact: true }).fill("완료 기록");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  const task = page
    .getByRole("region", { name: "오늘 할 일" })
    .getByRole("checkbox");
  await task.click();
  await expect(task).toBeChecked();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "오늘 할 일" }).getByRole("checkbox"),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "수정 완료 기록", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "오늘", exact: true }),
  ).toBeFocused();
});
test("event CRUD persists time, folding retains it and explicit removal creates all-day event", async ({
  page,
}) => {
  await page.getByRole("button", { name: "일정 추가", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("제목", { exact: true }).fill("학원 상담");
  await dialog.getByRole("button", { name: "시간 추가" }).click();
  await dialog.getByLabel("시간", { exact: true }).fill("16:30");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "오늘 일정" })
      .getByText("16:30", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "수정 학원 상담", exact: true })
    .click();
  await expect(dialog.getByLabel("시간", { exact: true })).toHaveValue("16:30");
  await dialog.getByRole("button", { name: "접기" }).click();
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await page
    .getByRole("button", { name: "수정 학원 상담", exact: true })
    .click();
  await expect(dialog.getByLabel("시간", { exact: true })).toHaveValue("16:30");
  await page.screenshot({
    path: "artifacts/editor-event-1440.png",
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "시간 제거" }).click();
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "오늘 일정" })
      .getByText("종일", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "오늘 일정" })
    .getByRole("button", { name: "캘린더", exact: true })
    .click();
  await page.getByRole("button", { name: "2026-11-15 상세" }).click();
  await page
    .getByRole("button", { name: "수정 학원 상담", exact: true })
    .click();
  await dialog.getByLabel("제목", { exact: true }).fill("상담 변경");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("상담 변경", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "수정 상담 변경", exact: true })
    .click();
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(dialog.getByText("상담 변경", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "삭제", exact: true })).toHaveCount(0);
  await page.reload();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)).records.length,
      key,
    ),
  ).toBe(0);
});
test("save and delete failures retain input and exact original stored bytes with retry", async ({
  page,
}) => {
  await page.getByRole("button", { name: "할 일 추가", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("제목", { exact: true }).fill("원본 제목");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const original = await page.evaluate((k) => localStorage.getItem(k), key);
  await page
    .getByRole("button", { name: "수정 원본 제목", exact: true })
    .click();
  await dialog.getByLabel("제목", { exact: true }).fill("아직 저장 안 된 제목");
  await page.evaluate((k) => {
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === k) throw new DOMException("quota", "QuotaExceededError");
      return window.realSetItem.call(this, key, value);
    };
  }, key);
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "저장하지 못했어요. 다시 시도해 주세요.",
  );
  await expect(dialog.getByLabel("제목", { exact: true })).toHaveValue(
    "아직 저장 안 된 제목",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
    original,
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "artifacts/editor-save-failure-1280.png",
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "삭제하지 못했어요. 다시 시도해 주세요.",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
    original,
  );
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog.getByLabel("제목", { exact: true })).toHaveValue(
    "아직 저장 안 된 제목",
  );
  await page.evaluate(() => (Storage.prototype.setItem = window.realSetItem));
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "오늘 할 일" })
      .getByText("아직 저장 안 된 제목", { exact: true }),
  ).toBeVisible();
});
test("calendar editor replaces detail, defaults selected date, validates title and restores context", async ({
  page,
}) => {
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("button", { name: "캘린더", exact: true })
    .click();
  const day = page.getByRole("button", { name: "2026-11-20 상세" });
  await day.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "할 일 추가", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "할 일 추가" });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog.getByLabel("실행 예정일", { exact: true })).toHaveValue(
    "2026-11-20",
  );
  await expect(dialog.getByLabel("제목", { exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "저장", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByLabel("제목", { exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    dialog.getByText("제목을 입력해 주세요.", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel("제목", { exact: true })).toBeFocused();
  await dialog
    .getByLabel("제목", { exact: true })
    .fill("긴 제목을 가진 학습 기록을 추가하고 날짜와 마감일을 함께 확인하기");
  await dialog.getByRole("button", { name: "마감일 추가" }).click();
  await dialog.getByLabel("마감일", { exact: true }).fill("2026-11-19");
  await expect(dialog.getByRole("status")).toBeVisible();
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: `artifacts/editor-task-${width}.png`,
      animations: "disabled",
    });
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveAccessibleName("11월 20일");
  await page.keyboard.press("Escape");
  await expect(day).toBeFocused();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)).records.length,
      key,
    ),
  ).toBe(0);
});
test("corrupt record storage is shown without reseeding or overwriting", async ({
  page,
}) => {
  await page.evaluate((k) => localStorage.setItem(k, "{broken"), key);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "기록을 읽거나 저장하지 못했어요",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
    "{broken",
  );
  await expect(
    page.getByRole("button", { name: "할 일 추가", exact: true }),
  ).toBeDisabled();
});
test("deadline fold retains value; clearing requires explicit remove and preserves stored value until save", async ({
  page,
}) => {
  await page.getByRole("button", { name: "할 일 추가", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("제목", { exact: true }).fill("기한 있는 공부");
  await dialog.getByRole("button", { name: "마감일 추가" }).click();
  await dialog.getByLabel("마감일", { exact: true }).fill("2026-11-16");
  await dialog.getByRole("button", { name: "접기" }).click();
  await expect(dialog.getByText("2026-11-16", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await page
    .getByRole("button", { name: "수정 기한 있는 공부", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("마감일", { exact: true })).toHaveValue(
    "2026-11-16",
  );
  await dialog.getByLabel("마감일", { exact: true }).fill("");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("마감일을 확인해 주세요.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)).records[0].dueDate,
      key,
    ),
  ).toBe("2026-11-16");
  await dialog.getByRole("button", { name: "마감일 제거" }).click();
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)).records[0].dueDate,
      key,
    ),
  ).toBe(null);
});
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-15T10:00:00+09:00") });
  await page.addInitScript((k) => {
    if (localStorage.getItem(k) === null)
      localStorage.setItem(k, JSON.stringify({ version: 1, records: [] }));
  }, key);
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("textbox", { name: "문구 입력" })
    .fill(await page.getByRole("blockquote").innerText());
  await page.getByRole("button", { name: "시작", exact: true }).click();
});
test("task CRUD shares Today/calendar and persists planned move, deadline and completion", async ({
  page,
}) => {
  await page.getByRole("button", { name: "할 일 추가", exact: true }).click();
  const form = page.getByRole("dialog", { name: "할 일 추가" });
  await expect(form.getByLabel("실행 예정일", { exact: true })).toHaveValue(
    "2026-11-15",
  );
  await form.getByLabel("제목", { exact: true }).fill("미적분 공부");
  await form.getByRole("button", { name: "마감일 추가" }).click();
  await form.getByLabel("마감일", { exact: true }).fill("2026-11-16");
  await form.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "오늘 할 일" })
      .getByText("미적분 공부", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "수정 미적분 공부", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "할 일 수정" });
  await expect(edit.getByLabel("마감일", { exact: true })).toHaveValue(
    "2026-11-16",
  );
  await edit.getByLabel("실행 예정일", { exact: true }).fill("2026-11-18");
  await expect(edit.getByRole("status")).toHaveText(
    "실행 예정일이 마감일 이후예요.",
  );
  await edit.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("할 일 없음", { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("button", { name: "캘린더", exact: true })
    .click();
  await page.getByRole("button", { name: "2026-11-18 상세" }).click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByText("미적분 공부", { exact: true })).toBeVisible();
  await detail.getByRole("checkbox").click();
  await expect(detail.getByRole("checkbox")).toBeChecked();
  await detail
    .getByRole("button", { name: "수정 미적분 공부", exact: true })
    .click();
  await expect(edit.getByLabel("마감일", { exact: true })).toHaveValue(
    "2026-11-16",
  );
  await edit.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await edit.getByRole("button", { name: "취소", exact: true }).click();
  await expect(edit.getByLabel("제목", { exact: true })).toHaveValue(
    "미적분 공부",
  );
  await edit.getByRole("button", { name: "삭제", exact: true }).click();
  await edit.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(edit.getByLabel("제목", { exact: true })).toHaveCount(0);
  await expect(detail.getByText("미적분 공부", { exact: true })).toHaveCount(0);
  await page.reload();
  const saved = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)),
    key,
  );
  expect(saved.records).toEqual([]);
});
