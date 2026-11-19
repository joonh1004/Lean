import { test } from "node:test";
import assert from "node:assert/strict";
// Dynamic import lets a missing feature produce a deliberate assertion failure.
test("six-week month keeps all dates including adjacent-month cells", async () => {
  const mod = await import("../src/calendar.js").catch(() => ({}));
  assert.equal(
    typeof mod.monthDays,
    "function",
    "monthDays is not implemented",
  );
  const days = mod.monthDays(2026, 7);
  assert.equal(days.length, 42);
  assert.equal(days[0], "2026-07-26");
  assert.equal(days.at(-1), "2026-09-05");
});
