const { test, expect } = require("@playwright/test");

const url = "http://127.0.0.1:5173";
const purple = "rgb(241, 234, 250)";
const neutral = "rgb(236, 242, 252)";
const accent = /rgb\(124, 88, 165\)/;

async function openDetail(page, date) {
  await page.getByRole("button", { name: `${date} 상세` }).click();
  return page.getByRole("dialog");
}

async function openCalendar(page, tab) {
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("button", { name: "캘린더", exact: true })
    .click();
  await page.getByRole("tab", { name: tab, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 7, 14, 12));
  await page.goto(url);
  await page
    .getByRole("textbox", { name: "문구 입력" })
    .fill(await page.getByRole("blockquote").innerText());
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.getByRole("heading", { name: "오늘", exact: true })).toBeVisible();
});

for (const { tab, title } of [
  { tab: "할 일", title: "샘플 할 일 — 발표 자료 준비" },
  { tab: "일정", title: "샘플 일정 — 프로젝트 회의" },
]) {
  test(`${tab}: keyboard preset, refresh, detail edit and reset`, async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: `${tab} 추가`, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const color = dialog.getByRole("combobox", { name: "색상 (선택)" });
    const save = dialog.getByRole("button", { name: "저장", exact: true });
    await dialog.getByLabel("제목", { exact: true }).fill(title);
    await expect(color.locator("option:checked")).toHaveText("기본");
    await dialog
      .getByRole("button", {
        name: tab === "할 일" ? "마감일 추가" : "시간 추가",
      })
      .press("Tab");
    await expect(color).toBeFocused();
    await color.press("End");
    await expect(color.locator("option:checked")).toHaveText("보라");
    await save.click();
    await expect(color).toHaveCount(0);

    await page.reload();
    const today = page.getByRole("region", { name: `오늘 ${tab}` });
    await expect(
      today.locator(".today-item").filter({ hasText: title }),
    ).toHaveCSS("box-shadow", accent);
    await openCalendar(page, tab);
    const day = page.getByRole("button", { name: "2026-08-14 상세" });
    const chip = day.locator(".entry").filter({ hasText: title });
    await expect(chip).toHaveCSS("background-color", purple);
    await expect(chip).toHaveCSS("color", "rgb(70, 43, 105)");
    await expect(chip.locator(".entry-text")).toHaveCSS(
      "text-overflow",
      "ellipsis",
    );
    await page.mouse.move(0, 0);
    await expect(
      page.getByRole("button", { name: "2026-08-15 상세" }),
    ).toHaveCSS("background-color", "rgb(255, 255, 255)");

    await openDetail(page, "2026-08-14");
    await expect(
      dialog.locator(".detail-item").filter({ hasText: title }),
    ).toHaveCSS("box-shadow", accent);
    await dialog
      .getByRole("button", { name: `수정 ${title}`, exact: true })
      .click();
    await expect(color.locator("option:checked")).toHaveText("보라");
    await color.selectOption({ label: "초록" });
    await save.click();
    await expect(chip).toHaveCSS("background-color", "rgb(230, 245, 237)");
    await dialog
      .getByRole("button", { name: `수정 ${title}`, exact: true })
      .click();
    await expect(color.locator("option:checked")).toHaveText("초록");
    await color.press("Home");
    await expect(color.locator("option:checked")).toHaveText("기본");
    await save.click();
    await expect(color).toHaveCount(0);
    await page.reload();
    await expect(
      today.locator(".today-item").filter({ hasText: title }),
    ).toHaveCSS("box-shadow", "none");
    await openCalendar(page, tab);
    await expect(chip).toHaveCSS("background-color", neutral);
  });
}

test("sample month keeps legacy appearance, overflow, completion and deadline cues", async ({
  page,
}) => {
  await page.goto(`${url}/?view=calendar-sample`);
  const busyDay = page.getByRole("button", { name: "2026-08-13 상세" });
  await expect(busyDay).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(busyDay.locator(".entry")).toHaveCount(3);
  await expect(busyDay.getByText("+3개")).toBeVisible();
  await expect(busyDay.locator(".entry.done .entry-text")).toHaveCSS(
    "text-decoration-line",
    "line-through",
  );
  await expect(busyDay.getByText("마감", { exact: true })).toBeVisible();
  const completed = busyDay.locator(".entry").filter({ hasText: "지문 분석" });
  await expect(completed).toHaveCSS("background-color", "rgb(229, 243, 237)");

  for (const [date, title, choice] of [
    ["2026-08-05", "신경망 실험 노트", "파랑"],
    ["2026-08-10", "단어 복습", "초록"],
    ["2026-08-13", "탐구 보고서", "보라"],
    ["2026-08-18", "역학 문제 풀이", "분홍"],
    ["2026-08-21", "책 읽고 기록하기", "주황"],
  ]) {
    const detail = await openDetail(page, date);
    await detail
      .getByRole("button", { name: `수정 ${title}`, exact: true })
      .click();
    const color = detail.getByRole("combobox", { name: "색상 (선택)" });
    await expect(color.locator("option:checked")).toHaveText("기본");
    await color.selectOption({ label: choice });
    await detail.getByRole("button", { name: "저장", exact: true }).click();
    await expect(color).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  await page.reload();
  await expect(busyDay.getByText("+3개")).toBeVisible();
  await expect(
    busyDay.locator(".entry").filter({ hasText: "탐구 보고서" }),
  ).toHaveCSS("background-color", purple);
  await expect(completed).toHaveCSS("background-color", "rgb(229, 243, 237)");
  await expect(busyDay).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.screenshot({
    path: "artifacts/calendar-item-colors-1440.png",
    fullPage: true,
    animations: "disabled",
  });
});
