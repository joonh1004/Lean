import { test } from "node:test";
import assert from "node:assert/strict";
test("refill swaps repeated boundary; single-quote and empty collections stay usable", async () => {
  const { assignDay, defaultState } = await import("../src/quotes.js");
  const seed = defaultState();
  seed.lastId = seed.quotes[0].id;
  assert.notEqual(
    assignDay(seed, "2026-11-15", () => 0.99).lastId,
    seed.lastId,
  );
  const single = {
    ...defaultState(),
    quotes: [{ id: "only", text: "한 문구." }],
  };
  const first = assignDay(single, "2026-11-15");
  assert.equal(
    assignDay(first, "2026-11-16").days["2026-11-16"].text,
    "한 문구.",
  );
  const empty = { ...defaultState(), quotes: [] };
  assert.equal(assignDay(empty, "2026-11-15"), empty);
});
test("persisted quote state is validated and corrupt/future data is never silently replaced", async () => {
  const mod = await import("../src/quotes.js");
  assert.equal(
    typeof mod.parseState,
    "function",
    "storage validation is not implemented",
  );
  const original = mod.assignDay(mod.defaultState(), "2026-11-15");
  assert.deepEqual(mod.parseState(JSON.stringify(original)), original);
  for (const value of [
    "{broken",
    JSON.stringify({ ...original, version: 2 }),
    JSON.stringify({
      ...original,
      days: { "2026-11-15": { completed: "yes" } },
    }),
    JSON.stringify({ ...original, quotes: [{ id: "x", text: 42 }] }),
  ])
    assert.throws(() => mod.parseState(value));
  assert.equal(
    mod.assignDay({ ...mod.defaultState(), quotes: [] }, "2026-11-15").days[
      "2026-11-15"
    ],
    undefined,
  );
});
test("completion is recorded only for an assigned matching quote outside composition", async () => {
  const mod = await import("../src/quotes.js");
  assert.equal(
    typeof mod.completeDay,
    "function",
    "completion is not implemented",
  );
  const state = mod.assignDay(mod.defaultState(), "2026-11-15", () => 0.2),
    text = state.days["2026-11-15"].text;
  assert.equal(mod.completeDay(state, "2026-11-15", "아직", false), state);
  assert.equal(mod.completeDay(state, "2026-11-15", text, true), state);
  assert.equal(mod.completeDay(state, "2026-11-16", text, false), state);
  assert.equal(
    mod.completeDay(state, "2026-11-15", text, false).days["2026-11-15"]
      .completed,
    true,
  );
  assert.equal(state.days["2026-11-15"].completed, false);
});
test("rotation covers every quote before refill and avoids cycle-boundary repeat", async () => {
  const { assignDay, defaultState } = await import("../src/quotes.js");
  let state = defaultState();
  const ids = [];
  for (let i = 1; i <= 30; i++) {
    state = assignDay(
      state,
      `2026-11-${String(i).padStart(2, "0")}`,
      () => 0.99,
    );
    ids.push(state.lastId);
  }
  for (let i = 0; i < 30; i += 3)
    assert.equal(new Set(ids.slice(i, i + 3)).size, 3);
  ids.slice(1).forEach((id, i) => assert.notEqual(id, ids[i]));
});
test("matching is exact after NFC and line-ending normalization, never while composing", async () => {
  const mod = await import("../src/quotes.js");
  assert.equal(
    typeof mod.canEnter,
    "function",
    "input validation not implemented",
  );
  assert.equal(mod.canEnter("한 걸음.", "한 걸음.", false), true);
  assert.equal(mod.canEnter("한 걸음.", "한 걸음.", true), false);
  assert.equal(mod.canEnter("한 걸음", "한 걸음.", false), false);
  assert.equal(mod.canEnter(" 한 걸음.", "한 걸음.", false), false);
  assert.equal(
    mod.canEnter("한 걸음.".normalize("NFD"), "한 걸음.", false),
    true,
  );
  assert.equal(mod.canEnter("한\r\n걸음.", "한\n걸음.", false), true);
});
test("daily quote remains fixed without consuming rotation on refresh", async () => {
  const mod = await import("../src/quotes.js").catch(() => ({}));
  assert.equal(
    typeof mod.assignDay,
    "function",
    "daily quote engine is not implemented",
  );
  const seed = {
    quotes: [
      { id: "a", text: "한 걸음." },
      { id: "b", text: "꾸준히." },
      { id: "c", text: "배우기." },
    ],
    days: {},
    bag: [],
    lastId: null,
  };
  const first = mod.assignDay(seed, "2026-11-15", () => 0.3);
  const refresh = mod.assignDay(first, "2026-11-15", () => 0.8);
  assert.deepEqual(refresh, first);
  assert.equal(first.days["2026-11-15"].completed, false);
});
