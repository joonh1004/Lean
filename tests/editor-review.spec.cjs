const { test, expect } = require("@playwright/test");
const key = "joonh.workspace.records.v1";
async function enter(page) {
  await page.clock.install({ time: new Date("2026-11-15T10:00:00+09:00") });
  await page.addInitScript(
    (k) => localStorage.setItem(k, JSON.stringify({ version: 1, records: [] })),
    key,
  );
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("textbox", { name: "문구 입력" })
    .fill(await page.getByRole("blockquote").innerText());
  await page.getByRole("button", { name: "시작", exact: true }).click();
}
test("delete confirmation names the saved title, wraps long titles, preserves unsaved draft on cancel", async ({
  page,
}) => {
  await enter(page);
  const saved =
    "저장된 긴 제목과 실제 삭제 대상을 확인하기 ".repeat(4) + "X".repeat(60);
  await page.getByRole("button", { name: "할 일 추가", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("제목", { exact: true }).fill(saved);
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await page
    .getByRole("button", { name: `수정 ${saved}`, exact: true })
    .click();
  await dialog
    .getByLabel("제목", { exact: true })
    .fill("저장하지 않은 새 초안");
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  const confirmation = dialog.locator(".delete-confirm p");
  await expect(confirmation).toHaveText(`‘${saved}’을 삭제할까요?`);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  expect((await confirmation.boundingBox()).height).toBeGreaterThan(40);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "artifacts/editor-delete-saved-title-1280.png",
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog.getByLabel("제목", { exact: true })).toHaveValue(
    "저장하지 않은 새 초안",
  );
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)).records[0].title,
      key,
    ),
  ).toBe(saved);
});
test("Korean document keeps native date values identical across browser locales", async ({
  browser,
}) => {
  for (const locale of ["en-US", "ko-KR"]) {
    const context = await browser.newContext({
      locale,
      viewport: { width: 1280, height: 900 },
    });
    try {
      const page = await context.newPage();
      await enter(page);
      await page
        .getByRole("button", { name: "할 일 추가", exact: true })
        .click();
      const date = page
        .getByRole("dialog")
        .getByLabel("실행 예정일", { exact: true });
      await expect(page.locator("html")).toHaveAttribute("lang", "ko");
      await expect(date).toHaveAttribute("type", "date");
      await expect(date).toHaveValue("2026-11-15");
      console.log(
        "native date locale probe",
        await page.evaluate(() => ({
          language: navigator.language,
          documentLanguage: document.documentElement.lang,
          value: document.getElementById("record-date").value,
        })),
      );
      await page.screenshot({
        path: `artifacts/editor-native-date-${locale}.png`,
        animations: "disabled",
      });
    } finally {
      await context.close();
    }
  }
});
