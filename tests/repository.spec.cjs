const { test, expect } = require("@playwright/test");
const key = "joonh.workspace.records.v1";
test("source deletion confirmation focuses cancel, names saved title and retains unsaved body", async ({
  page,
}) => {
  await repo(page);
  let dialog = await resource(page, "저장된 원본 제목", "저장된 본문");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByRole("button", { name: "기록 수정", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("제목", { exact: true }).fill("초안 제목");
  await dialog.getByLabel("내용", { exact: true }).fill("초안 본문");
  await dialog.getByRole("button", { name: "원본 삭제", exact: true }).click();
  await expect(dialog.locator(".delete-confirm")).toContainText(
    "저장된 원본 제목",
  );
  await expect(
    dialog.getByRole("button", { name: "취소", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "원본 삭제", exact: true }),
  ).toBeFocused();
  await expect(dialog.getByLabel("내용", { exact: true })).toHaveValue(
    "초안 본문",
  );
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)).records[0].body,
      key,
    ),
  ).toBe("저장된 본문");
});
test("denied relationship and folder writes retain originals and editable folder draft", async ({
  page,
}) => {
  for (const [label, title] of [
    ["할 일", "보존할 공부"],
    ["일정", "보존할 행사"],
  ]) {
    await page
      .getByRole("button", { name: `${label} 추가`, exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("제목", { exact: true }).fill(title);
    await dialog.getByRole("button", { name: "저장", exact: true }).click();
  }
  await repo(page);
  let dialog = await resource(page, "보존할 메모", "원문");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await page
    .getByRole("button", { name: "할 일·일정 연결", exact: true })
    .click();
  await page
    .getByRole("button", { name: "연결 할 일 보존할 공부 저장소", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const before = await page.evaluate((k) => localStorage.getItem(k), key);
  await page.evaluate((k) => {
    window.realRecordSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === k) throw new DOMException("quota", "QuotaExceededError");
      return window.realRecordSet.call(this, key, value);
    };
  }, key);
  await page
    .getByRole("button", { name: "연결 해제 보존할 공부", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "연결 해제하지 못했어요. 다시 시도해 주세요.",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(before);
  await page
    .getByRole("button", { name: "할 일·일정 연결", exact: true })
    .click();
  await page
    .getByRole("button", { name: "연결 일정 보존할 행사 저장소", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toHaveText(
    "연결하지 못했어요. 다시 시도해 주세요.",
  );
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(before);
  await page.getByRole("button", { name: "폴더 추가", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("폴더 이름", { exact: true })
    .fill("실패해도 남는 폴더 이름");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "저장하지 못했어요. 다시 시도해 주세요.",
  );
  await expect(dialog.getByLabel("폴더 이름", { exact: true })).toHaveValue(
    "실패해도 남는 폴더 이름",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(before);
  await page.evaluate(() => (Storage.prototype.setItem = window.realRecordSet));
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "폴더 선택 저장소 / 실패해도 남는 폴더 이름",
      exact: true,
    }),
  ).toBeVisible();
});
test("task/event links and unlinking preserve sources; deleting source removes relationships only", async ({
  page,
}) => {
  for (const label of ["할 일", "일정"]) {
    await page
      .getByRole("button", { name: `${label} 추가`, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("제목", { exact: true })
      .fill(label === "할 일" ? "연결할 공부" : "연결할 상담");
    await dialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await repo(page);
  let dialog = await resource(page, "교재 메모", "연결해도 유지할 원문");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await page
    .getByRole("button", { name: "할 일·일정 연결", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.screenshot({
    path: "artifacts/repository-relations-1440.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "연결 할 일 연결할 공부 저장소", exact: true })
    .click();
  await expect(page.locator(".repo-relation")).toContainText("연결할 공부");
  await page.reload();
  await repo(page);
  await page
    .getByRole("button", {
      name: "기록 선택 메모 교재 메모 저장소",
      exact: true,
    })
    .click();
  await expect(page.locator(".repo-relation")).toContainText("연결할 공부");
  await page
    .getByRole("button", { name: "연결 해제 연결할 공부", exact: true })
    .click();
  await expect(page.locator(".repo-relation")).toHaveCount(0);
  await expect(page.locator(".note-body")).toHaveText("연결해도 유지할 원문");
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("button", { name: "캘린더", exact: true })
    .click();
  await page.getByRole("button", { name: "2026-11-15 상세" }).click();
  await page
    .getByRole("button", { name: "자료 연결 연결할 공부", exact: true })
    .click();
  await page
    .getByRole("button", { name: "연결 메모 교재 메모 저장소", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "연결 해제 교재 메모", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "연결 해제 교재 메모", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "연결 해제 교재 메모", exact: true })).toHaveCount(0);
  let state = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)),
    key,
  );
  expect(state.records.find((r) => r.type === "note").body).toBe(
    "연결해도 유지할 원문",
  );
  await page
    .getByRole("button", { name: "자료 연결 연결할 공부", exact: true })
    .click();
  await page
    .getByRole("button", { name: "연결 메모 교재 메모 저장소", exact: true })
    .click();
  await page
    .getByRole("button", { name: "수정 연결할 공부", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(dialog.getByLabel("제목", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await repo(page);
  await page
    .getByRole("button", {
      name: "기록 선택 메모 교재 메모 저장소",
      exact: true,
    })
    .click();
  await expect(page.locator(".note-body")).toHaveText("연결해도 유지할 원문");
  await page
    .getByRole("button", { name: "할 일·일정 연결", exact: true })
    .click();
  await page
    .getByRole("button", { name: "연결 일정 연결할 상담 저장소", exact: true })
    .click();
  await page.getByRole("button", { name: "기록 수정", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "원본 삭제", exact: true }).click();
  await dialog.getByRole("button", { name: "원본 삭제", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  state = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
  expect(state.records).toHaveLength(1);
  expect(state.records[0].type).toBe("event");
  expect(state.records[0].linkedRecordIds).toEqual([]);
  await page.reload();
  await expect(page.getByRole("region", { name: "오늘 일정" })).toContainText(
    "연결할 상담",
  );
});
test("repository note save failures preserve draft body and original bytes until retry", async ({
  page,
}) => {
  await repo(page);
  let dialog = await resource(page, "원본 메모", "저장된 본문");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const before = await page.evaluate((k) => localStorage.getItem(k), key);
  await page.getByRole("button", { name: "기록 수정", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("내용", { exact: true }).fill("실패해도 유지할 초안");
  await page.evaluate((k) => {
    window.originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === k) throw new DOMException("quota", "QuotaExceededError");
      return window.originalSet.call(this, key, value);
    };
  }, key);
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "저장하지 못했어요. 다시 시도해 주세요.",
  );
  await expect(dialog.getByLabel("내용", { exact: true })).toHaveValue(
    "실패해도 유지할 초안",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(before);
  await page.screenshot({
    path: "artifacts/repository-save-failure-1440.png",
    animations: "disabled",
  });
  await page.evaluate(() => (Storage.prototype.setItem = window.originalSet));
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await repo(page);
  await page
    .getByRole("button", {
      name: "기록 선택 메모 원본 메모 저장소",
      exact: true,
    })
    .click();
  await expect(page.locator(".note-body")).toHaveText("실패해도 유지할 초안");
});
async function repo(page) {
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("button", { name: "저장소", exact: true })
    .click();
}
async function resource(page, title, body, type = "note") {
  await page.getByRole("button", { name: "기록 추가", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("제목", { exact: true }).fill(title);
  if (type === "link")
    await dialog.getByLabel("종류", { exact: true }).selectOption("link");
  await dialog
    .getByLabel(type === "link" ? "URL" : "내용", { exact: true })
    .fill(body);
  return dialog;
}
test("links reject executable schemes; selection stays local; explicit external action and source CRUD persist", async ({
  page,
}) => {
  await repo(page);
  let dialog = await resource(page, "학습 링크", "javascript:alert(1)", "link");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    dialog.getByText("http 또는 https 주소를 입력해 주세요.", { exact: true }),
  ).toBeVisible();
  const url = "https://example.com/" + "long-url-".repeat(30) + "?topic=math";
  await dialog.getByLabel("URL", { exact: true }).fill(url);
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  const external = page.getByRole("link", { name: "링크 열기 (새 탭)" });
  await expect(external).toHaveAttribute("href", url);
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.locator(".full-url")).toHaveText(url);
  expect(page.url()).toContain("127.0.0.1:5173");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/repository-link-1440.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "기록 수정", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("제목", { exact: true }).fill("수정한 학습 링크");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await repo(page);
  await page
    .getByRole("button", {
      name: "기록 선택 링크 수정한 학습 링크 저장소",
      exact: true,
    })
    .click();
  await expect(page.locator(".full-url")).toHaveText(url);
  await page.getByRole("button", { name: "기록 수정", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "원본 삭제", exact: true }).click();
  await expect(dialog.locator(".delete-confirm")).toContainText(
    "할 일·일정은 유지",
  );
  await dialog.getByRole("button", { name: "원본 삭제", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await repo(page);
  await expect(page.getByText("기록 없음", { exact: true })).toBeVisible();
});
test("deep folders, duplicate search paths, move and narrow detail remain navigable", async ({
  page,
}) => {
  await repo(page);
  let path = "저장소";
  const names = [
    "학습",
    "수학",
    "미적분",
    "단원별 정리",
    "아주 긴 제목을 가진 다섯 번째 학습 폴더",
    "여섯 번째",
  ];
  for (const name of names) {
    await page.getByRole("button", { name: "폴더 추가", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("폴더 이름", { exact: true }).fill(name);
    await dialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    path += " / " + name;
  }
  await page.getByText("전체 경로", { exact: true }).click();
  await expect(page.locator(".full-path p")).toHaveText(path);
  let dialog = await resource(page, "같은 제목", "깊은 폴더의 원문");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await page.screenshot({
    path: "artifacts/repository-deep-1440.png",
    animations: "disabled",
  });
  await page
    .getByRole("navigation", { name: "폴더 탐색" })
    .getByRole("button", { name: "저장소", exact: true })
    .click();
  dialog = await resource(page, "같은 제목", "루트의 다른 원문");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await page
    .getByRole("textbox", { name: "전체 검색", exact: true })
    .fill("같은 제목");
  await expect(page.locator(".repo-record")).toHaveCount(2);
  await expect(
    page.locator(".result-path").filter({ hasText: "여섯 번째" }),
  ).toHaveCount(1);
  await page.screenshot({
    path: "artifacts/repository-search-1440.png",
    animations: "disabled",
  });
  await page
    .getByRole("textbox", { name: "전체 검색", exact: true })
    .fill("존재하지 않는 자료");
  await expect(page.getByText("검색 결과 없음", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "검색 지우기", exact: true }).click();
  await expect(page.locator(".repo-record")).toHaveCount(1);
  await page
    .getByRole("button", { name: `폴더 선택 ${path}`, exact: true })
    .click();
  await page.setViewportSize({ width: 1280, height: 900 });
  const row = page.getByRole("button", {
    name: `기록 선택 메모 같은 제목 ${path}`,
    exact: true,
  });
  await row.click();
  const detail = page.getByRole("dialog", { name: "기록 상세", exact: true });
  await expect(detail).toBeVisible();
  expect((await detail.boundingBox()).width).toBe(360);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/repository-detail-1280.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();
  await row.click();
  await detail.getByRole("button", { name: "기록 수정", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "기록 수정", exact: true });
  await dialog.getByLabel("폴더", { exact: true }).selectOption("");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "폴더 수정", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "폴더 삭제", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)).folders.length,
      key,
    ),
  ).toBe(5);
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /업로드/ })).toHaveCount(0);
});
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-15T10:00:00+09:00") });
  await page.addInitScript((k) => {
    if (localStorage.getItem(k) === null)
      localStorage.setItem(
        k,
        JSON.stringify({ version: 1, records: [], folders: [] }),
      );
  }, key);
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("textbox", { name: "문구 입력" })
    .fill(await page.getByRole("blockquote").innerText());
  await page.getByRole("button", { name: "시작", exact: true }).click();
});
test("repository folders, safe note CRUD, blocked non-empty deletion, search paths and reload", async ({
  page,
}) => {
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("button", { name: "저장소", exact: true })
    .click();
  await page.getByRole("button", { name: "폴더 추가", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("폴더 이름", { exact: true }).fill("학습");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByRole("button", { name: "기록 추가", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("제목", { exact: true }).fill("오답 노트");
  const body =
    '<img src=x onerror="window.noteExecuted=true">\n<script>window.noteExecuted=true</script>';
  await dialog.getByLabel("내용", { exact: true }).fill(body);
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator(".note-body")).toHaveText(body);
  expect(await page.evaluate(() => window.noteExecuted)).toBe(undefined);
  await expect(page.locator(".note-body img,.note-body script")).toHaveCount(0);
  await page.getByRole("button", { name: "폴더 수정", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "폴더 삭제", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "내용이 있는 폴더는 삭제할 수 없어요.",
  );
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await page
    .getByRole("textbox", { name: "전체 검색", exact: true })
    .fill("오답");
  await expect(page.locator(".repo-list")).toContainText("저장소 / 학습");
  await page.reload();
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("button", { name: "저장소", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "기록 선택 메모 오답 노트 저장소 / 학습",
      exact: true,
    })
    .click();
  await expect(page.locator(".note-body")).toHaveText(body);
});
