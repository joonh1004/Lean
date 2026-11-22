const { test, expect } = require("@playwright/test");
test.beforeEach(async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/?view=calendar-sample");
  await page
    .getByRole("textbox", { name: "문구 입력" })
    .fill(await page.getByRole("blockquote").innerText());
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.getByRole("region", { name: "월간 캘린더" })).toBeVisible();
});
test("tab state matches content and has a persistent indicator while other tab is hovered", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5173/?view=calendar-sample");
  const task = page.getByRole("tab", { name: "할 일", exact: true }),
    event = page.getByRole("tab", { name: "일정", exact: true });
  await event.click();
  await task.click();
  await event.hover();
  console.log(
    "tab state probe",
    await page.getByRole("tab").evaluateAll((tabs) =>
      tabs.map((el) => ({
        name: el.getAttribute("aria-label"),
        selected: el.getAttribute("aria-selected"),
        active: el.classList.contains("active"),
        background: getComputedStyle(el).backgroundColor,
      })),
    ),
  );
  await expect(task).toHaveAttribute("aria-selected", "true");
  await expect(event).toHaveAttribute("aria-selected", "false");
  await expect(
    page.getByRole("button", { name: "2026-08-13 상세" }),
  ).toContainText("+3개");
  await expect(task).toHaveCSS("border-bottom-color", "rgb(56, 104, 173)");
  await expect(task).toHaveCSS("border-bottom-width", "3px");
});
test("calendar starts near top without repeated breadcrumb and title", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5173/?view=calendar-sample");
  const bounds = await page
    .getByRole("region", { name: "월간 캘린더" })
    .boundingBox();
  expect(bounds.y).toBeLessThanOrEqual(80);
  await expect(page.locator(".sample")).toHaveCount(1);
});
test("sample titles do not repeat their subject prefix", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/?view=calendar-sample");
  const duplicates = await page.locator(".entry-text").evaluateAll((entries) =>
    entries
      .map((el) => ({
        subject: el.querySelector("b").textContent,
        title: el.childNodes[el.childNodes.length - 1].textContent.trim(),
      }))
      .filter((x) => x.title.startsWith(x.subject + " ")),
  );
  expect(duplicates).toEqual([]);
});
test("completed detail keeps full title readable without strike-through", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5173/?view=calendar-sample");
  await page.getByRole("button", { name: "2026-08-13 상세" }).click();
  await page.getByRole("dialog").getByRole("checkbox").first().click();
  await expect(page.getByRole("dialog").getByRole("checkbox").first()).toBeChecked();
  await expect(page.locator(".detail-item.done .full-title").first()).toHaveCSS(
    "text-decoration-line",
    "none",
  );
});
test("monthly prototype: busy date, full title, task completion, events, navigation and focus", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/?view=calendar-sample");
  await expect(page.getByRole("heading", { name: "2026년 8월" })).toBeVisible();
  await expect(page.locator(".day")).toHaveCount(42);
  const day = page.getByRole("button", { name: "2026-08-13 상세" });
  await expect(day).toContainText("+3개");
  await day.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByText(
      "미적분 오답 정리와 풀이 과정 비교 — 치환적분부터 부분적분까지",
    ),
  ).toBeVisible();
  const box = drawer.getByRole("checkbox").first();
  const checked = await box.isChecked();
  await box.click();
  await expect(box).toBeChecked({ checked: !checked });
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(day).toBeFocused();
  await page.getByRole("tab", { name: "일정", exact: true }).click();
  await day.click();
  await expect(drawer.getByText("학원 상담")).toBeVisible();
  await expect(drawer.getByRole("checkbox")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "다음 달" }).click();
  await expect(page.getByRole("heading", { name: "2026년 9월" })).toBeVisible();
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "이전 달" }).click();
  await page.getByRole("tab", { name: "할 일", exact: true }).click();
  await page.screenshot({
    path: "artifacts/calendar-1440.png",
    fullPage: true,
  });
  await day.click();
  await page.screenshot({
    path: "artifacts/calendar-detail-1440.png",
    fullPage: false,
    animations: "disabled",
  });
});
test("1280px, reduced motion, keyboard opening and actual today selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:5173/?view=calendar-sample");
  const day = page.getByRole("button", { name: "2026-08-13 상세" });
  await day.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  expect(
    await drawer.evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("button").last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "상세 닫기" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(day).toBeFocused();
  await page.screenshot({
    path: "artifacts/calendar-1280.png",
    fullPage: true,
  });
  await page
    .getByRole("region", { name: "월간 캘린더" })
    .getByRole("button", { name: "오늘", exact: true })
    .click();
  await expect(page.locator(".is-today")).toHaveCount(1);
  await expect(page.locator(".day.selected .is-today")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
