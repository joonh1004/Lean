import { test } from "node:test";
import assert from "node:assert/strict";
import * as q from "../src/quotes.js";
test("edit and delete preserve assigned snapshots, completed history and unrelated metadata", () => {
  let state = q.assignDay(q.defaultState(), "2026-11-15", () => 0.99);
  state = q.completeDay(state, "2026-11-15", state.days["2026-11-15"].text);
  state = { ...state, extension: { keep: true } };
  const id = state.lastId;
  const edited = q.editQuote(state, id, "변경\n원문");
  assert.equal(edited.quotes.find((x) => x.id === id).text, "변경\n원문");
  assert.deepEqual(edited.days, state.days);
  assert.throws(() => q.editQuote(state, id, " "));
  assert.throws(() => q.editQuote(state, "missing", "문구"));
  const removed = q.removeQuote(edited, id);
  assert.deepEqual(removed.days, state.days);
  assert.deepEqual(removed.extension, state.extension);
  assert.ok(!removed.quotes.some((x) => x.id === id));
  assert.ok(!removed.bag.includes(id));
  assert.throws(() => q.removeQuote(state, "missing"));
});
test("verified quote writes reject corrupt or stale originals and roll back unverified writes", () => {
  const state = q.defaultState(),
    next = q.addQuote(state, "새 문구", "new");
  let raw = JSON.stringify(state),
    fail = false;
  const storage = {
    getItem: () => raw,
    setItem: (k, v) => {
      raw = fail && v === JSON.stringify(next) ? "wrong" : v;
    },
  };
  q.saveQuoteState(storage, next, state);
  assert.equal(raw, JSON.stringify(next));
  assert.throws(() => q.saveQuoteState(storage, state, state));
  assert.equal(raw, JSON.stringify(next));
  raw = "{broken";
  assert.throws(() => q.saveQuoteState(storage, next, state));
  assert.equal(raw, "{broken");
  raw = JSON.stringify(state);
  fail = true;
  assert.throws(() => q.saveQuoteState(storage, next, state));
  assert.equal(raw, JSON.stringify(state));
});
test("verification coverage: new pending quotes cannot starve and next complete cycles have no repeats", () => {
  let state = q.assignDay(q.defaultState(), "2026-10-01", () => 0.99);
  const oldPending = [...state.bag];
  state = q.addQuote(state, "신규 문구", "new");
  const selected = [];
  for (let i = 2; i <= 22; i++) {
    state = q.assignDay(
      state,
      `2026-10-${String(i).padStart(2, "0")}`,
      () => 0.99,
    );
    selected.push(state.lastId);
  }
  assert.deepEqual(selected.slice(0, oldPending.length + 1), [
    ...oldPending,
    "new",
  ]);
  const refillStart = oldPending.length + 1;
  for (let i = refillStart; i + 4 <= selected.length; i += 4)
    assert.equal(new Set(selected.slice(i, i + 4)).size, 4);
  selected.slice(1).forEach((id, i) => assert.notEqual(id, selected[i]));
  const remaining = q.removeQuote(state, state.bag[0]);
  assert.ok(
    remaining.bag.every((id) => remaining.quotes.some((x) => x.id === id)),
  );
});
test("adding a quote preserves exact multiline copy, history and enters the pending rotation once", () => {
  const state = q.assignDay(q.defaultState(), "2026-11-15", () => 0.99);
  const next = q.addQuote(state, "  첫 줄\n둘째 줄  ", "new");
  assert.deepEqual(next.quotes.at(-1), {
    id: "new",
    text: "  첫 줄\n둘째 줄  ",
  });
  assert.deepEqual(next.days, state.days);
  assert.deepEqual(next.bag, [...state.bag, "new"]);
  assert.equal(state.quotes.length, 3);
  assert.throws(() => q.addQuote(state, " \n ", "empty"));
  assert.throws(() => q.addQuote(state, "중복", state.quotes[0].id));
});
