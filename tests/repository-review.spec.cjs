const { test, expect } = require("@playwright/test");
const recordsKey = "joonh.workspace.records.v1";
test("legacy empty-gate inline registration remains recoverable alongside routine management", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "joonh.workspace.quoteGate.v1",
      JSON.stringify({
        version: 1,
        quotes: [],
        days: {},
        bag: [],
        lastId: null,
      }),
    );
  });
  await page.goto("http://127.0.0.1:5173");
  await expect(
    page.getByRole("heading", { name: "첫 문구", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/audit-quote-first-registration.png",
    animations: "disabled",
  });
  await page
    .getByRole("textbox", { name: "문구", exact: true })
    .fill("직접 등록을 확인하는 테스트 문구.");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("blockquote")).toHaveText(
    "직접 등록을 확인하는 테스트 문구.",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("joonh.workspace.quoteGate.v1")).quotes
          .length,
    ),
  ).toBe(1);
});
test("candidate dates are semantic; completed long-title link and unlink retain original with screenshots", async ({
  page,
}) => {
  await enter(page);
  await page
    .getByRole("button", { name: /^기록 선택 메모 원본 학습 메모 / })
    .click();
  await page
    .getByRole("button", { name: "할 일·일정 연결", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".relation-choice").first()).toContainText(
    "예정 2026-11-15",
  );
  await expect(dialog.locator(".relation-choice").nth(1)).toContainText(
    "일정일 2026-11-16",
  );
  await expect(dialog.locator(".relation-choice")).not.toContainText([
    "2026-10-02",
    "2026-10-02",
  ]);
  await page.screenshot({
    path: "artifacts/repository-review-candidates-1440.png",
    animations: "disabled",
  });
  const title = fixture().records[0].title;
  await dialog
    .getByRole("button", { name: `연결 할 일 ${title} 저장소`, exact: true })
    .click();
  await expect(page.locator(".repo-relation")).toContainText(title);
  await expect(
    page.getByRole("button", { name: `연결 해제 ${title}`, exact: true }),
  ).toBeVisible();
  const sourceBefore = await page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key)).records.find((r) => r.id === "n"),
    recordsKey,
  );
  await page.screenshot({
    path: "artifacts/repository-review-linked-1440.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("dialog", { name: "기록 상세" })).toBeVisible();
  await page.screenshot({
    path: "artifacts/repository-review-linked-1280.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: `연결 해제 ${title}`, exact: true })
    .click();
  await expect(page.locator(".repo-relation")).toHaveCount(0);
  await expect(page.locator(".note-body")).toHaveText(sourceBefore.body);
  await page.screenshot({
    path: "artifacts/repository-review-unlinked-1280.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "artifacts/repository-review-unlinked-1440.png",
    animations: "disabled",
  });
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    recordsKey,
  );
  expect(saved.records.find((r) => r.id === "n")).toEqual(sourceBefore);
  expect(saved.records.find((r) => r.id === "t").linkedRecordIds).toEqual([]);
  await page.reload();
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("button", { name: "저장소", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^기록 선택 메모 원본 학습 메모 / })
    .click();
  await expect(page.locator(".note-body")).toHaveText(sourceBefore.body);
  await expect(page.locator(".repo-relation")).toHaveCount(0);
});
function fixture() {
  const meta = {
    subject: "",
    folderId: null,
    tagIds: [],
    linkedRecordIds: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    isSample: false,
  };
  const folders = Array.from({ length: 6 }, (_, i) => ({
    id: `f${i}`,
    name:
      i === 5 ? "여섯 번째의 긴 이름을 가진 현재 학습 폴더" : `상위 ${i + 1}`,
    parentId: i ? `f${i - 1}` : null,
  }));
  return {
    version: 1,
    folders,
    records: [
      {
        ...meta,
        id: "t",
        type: "task",
        title:
          "미적분 풀이 과정을 검토하고 선택한 풀이의 근거와 다음 복습 계획을 함께 정리하는 긴 제목의 할 일",
        date: "2026-11-15",
        done: false,
        dueDate: null,
      },
      {
        ...meta,
        id: "e",
        type: "event",
        title: "학원 상담",
        date: "2026-11-16",
        time: null,
      },
      {
        ...meta,
        id: "n",
        type: "note",
        title: "원본 학습 메모",
        body: "연결을 해제해도 남아 있어야 하는 원문",
        folderId: "f5",
      },
    ],
  };
}
async function enter(page) {
  await page.clock.install({ time: new Date("2026-11-15T10:00:00+09:00") });
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: recordsKey, state: fixture() },
  );
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("textbox", { name: "문구 입력" })
    .fill(await page.getByRole("blockquote").innerText());
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("button", { name: "저장소", exact: true })
    .click();
}
test("deep selected folder and keyboard-focused folder reveal their own full names", async ({
  page,
}) => {
  await enter(page);
  const path =
    "저장소 / " +
    fixture()
      .folders.map((f) => f.name)
      .join(" / ");
  const selected = page.getByRole("button", {
    name: `폴더 선택 ${path}`,
    exact: true,
  });
  await selected.click();
  await expect(selected).toHaveCSS("white-space", "normal");
  expect(
    await selected.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  expect((await selected.boundingBox()).width).toBeGreaterThan(120);
  await page.screenshot({
    path: "artifacts/repository-review-folder-1440.png",
    animations: "disabled",
  });
  await page
    .getByRole("navigation", { name: "폴더 탐색" })
    .getByRole("button", { name: "전체", exact: true })
    .click();
  await selected.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(selected).toBeFocused();
  await expect(selected).toHaveCSS("white-space", "normal");
  expect(
    await selected.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});
