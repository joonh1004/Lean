const { test, expect } = require("@playwright/test");
const key = "joonh.workspace.quoteGate.v1";
const original = "오늘의 작은 질문을 기록하자.\n답은 직접 해보며 찾아가자.";
for (const width of [1440, 1280])
  test(`quote evidence and failure-safe recovery ${width}x900`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install({ time: new Date("2026-11-15T10:00:00+09:00") });
    await page.addInitScript(
      ({ key, original }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(
            key,
            JSON.stringify({
              version: 1,
              quotes: [
                { id: "today", text: original },
                {
                  id: "long",
                  text:
                    "긴 문장도 생략된 목록에서 수정으로 열면 원문 전체를 확인할 수 있어요. ".repeat(
                      9,
                    ) + "\n줄바꿈도 그대로 남겨요.",
                },
                { id: "short", text: "꾸준히, 한 걸음." },
              ],
              days: {
                "2026-11-15": { id: "today", text: original, completed: false },
                "2026-11-14": {
                  id: "old",
                  text: "이전 기록.",
                  completed: true,
                },
              },
              bag: ["long", "short"],
              lastId: "today",
              extra: { preserved: true },
            }),
          );
      },
      { key, original },
    );
    await page.goto("http://127.0.0.1:5173");
    const shot = async (name) => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/quote-management-${name}-${width}.png`,
        animations: "disabled",
      });
    };
    const bytes = () => page.evaluate((k) => localStorage.getItem(k), key);
    await page.getByRole("button", { name: "명언 관리", exact: true }).click();
    await expect(page.locator(".quote-row")).toHaveCount(3);
    await shot("list");
    await page
      .locator(".quote-row")
      .nth(1)
      .getByRole("button", { name: "수정" })
      .click();
    const longField = page.getByRole("textbox", { name: "문구", exact: true });
    await expect(longField).toHaveValue(
      "긴 문장도 생략된 목록에서 수정으로 열면 원문 전체를 확인할 수 있어요. ".repeat(
        9,
      ) + "\n줄바꿈도 그대로 남겨요.",
    );
    await shot("long-edit");
    await page.keyboard.press("Escape");
    await page
      .locator(".quote-row")
      .first()
      .getByRole("button", { name: "수정" })
      .click();
    const field = page.getByRole("textbox", { name: "문구", exact: true });
    await expect(field).toHaveValue(original);
    await expect(
      page.getByText("오늘 입력 문구는 유지돼요.", { exact: true }),
    ).toBeVisible();
    const bounds = await page.getByRole("dialog").boundingBox();
    expect(Math.abs(bounds.x + bounds.width / 2 - width / 2)).toBeLessThan(2);
    await shot("edit");
    // Keyboard containment and Escape use only the isolated Playwright page.
    await field.press("Shift+Tab");
    await expect(
      page.getByRole("button", { name: "저장", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(field).toBeFocused();
    const before = await bytes();
    await page.evaluate(() => {
      window.realQuoteSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === "joonh.workspace.quoteGate.v1")
          throw new DOMException("test-only denied", "QuotaExceededError");
        return window.realQuoteSet.call(this, k, v);
      };
    });
    await field.fill("저장 실패 뒤에도\n입력한 초안이 남아 있어요.");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("저장하지 못했어요");
    await expect(field).toHaveValue(
      "저장 실패 뒤에도\n입력한 초안이 남아 있어요.",
    );
    expect(await bytes()).toBe(before);
    await shot("failure");
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(page.locator(".quote-delete-copy")).toHaveText(original);
    await page.getByRole("button", { name: "삭제 확인", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await bytes()).toBe(before);
    await expect(field).toHaveValue(
      "저장 실패 뒤에도\n입력한 초안이 남아 있어요.",
    );
    await page.evaluate(
      () => (Storage.prototype.setItem = window.realQuoteSet),
    );
    await page.getByRole("button", { name: "삭제 취소", exact: true }).click();
    // A silent no-op write must fail readback, retain original and keep the draft.
    await page.evaluate(() => {
      Storage.prototype.setItem = function (k, v) {
        if (k === "joonh.workspace.quoteGate.v1") return;
        return window.realQuoteSet.call(this, k, v);
      };
    });
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await bytes()).toBe(before);
    await page.evaluate(
      () => (Storage.prototype.setItem = window.realQuoteSet),
    );
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.locator(".quote-row").first().getByText("오늘", { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "문구 입력으로" }).click();
    await expect(page.getByRole("blockquote")).toHaveText(original);
    await shot("frozen");
    await page.getByRole("button", { name: "명언 관리", exact: true }).click();
    // Remove non-assigned rows first; their editors have no frozen-today notice.
    for (let i = 0; i < 2; i++) {
      await page
        .locator(".quote-row")
        .last()
        .getByRole("button", { name: "수정" })
        .click();
      await expect(
        page.getByText("오늘 입력 문구는 유지돼요.", { exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "삭제", exact: true }).click();
      await page
        .getByRole("button", { name: "삭제 확인", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "수정", exact: true }).click();
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(
      page.getByText(
        "마지막 문구예요. 삭제하면 문구를 추가할 때까지 입력을 시작할 수 없어요.",
      ),
    ).toBeVisible();
    await shot("last-delete");
    await page.getByRole("button", { name: "삭제 확인", exact: true }).click();
    await expect(
      page.getByText("저장한 문구 없음", { exact: true }),
    ).toBeVisible();
    await shot("empty-list");
    await page.getByRole("button", { name: "문구 입력으로" }).click();
    await expect(
      page.getByText("문구를 추가해 주세요.", { exact: true }),
    ).toBeVisible();
    await shot("empty-gate");
    await page
      .getByRole("textbox", { name: "문구", exact: true })
      .fill("새로 등록한 문구.");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("blockquote")).toHaveText(original);
    await expect(
      page.getByRole("button", { name: "시작", exact: true }),
    ).toBeDisabled();
    await shot("restored");
    const state = JSON.parse(await bytes());
    expect(state.days["2026-11-14"]).toEqual({
      id: "old",
      text: "이전 기록.",
      completed: true,
    });
    expect(state.days["2026-11-15"].completed).toBe(false);
    expect(state.extra).toEqual({ preserved: true });
    await page.getByRole("textbox", { name: "문구 입력" }).fill(original);
    await page.getByRole("button", { name: "시작", exact: true }).click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "명언", exact: true })
      .click();
    await expect(page.locator(".quote-row")).toHaveCount(1);
    await shot("sidebar");
  });
