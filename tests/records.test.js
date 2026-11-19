import { test } from "node:test";
import assert from "node:assert/strict";
test("deletion affects only its record and unsupported or duplicate schemas are rejected", async () => {
  const { createRecord, deleteRecord, parseRecords } = await import(
    "../src/records.js"
  );
  const draft = {
    type: "task",
    title: "기록",
    date: "2026-11-15",
    dueDate: null,
  };
  const a = createRecord(draft, "a", "now"),
    b = {
      ...createRecord(draft, "b", "now"),
      linkedRecordIds: ["a", "future-note"],
    };
  const store = { version: 1, records: [a, b] },
    deleted = deleteRecord(store, "a");
  assert.deepEqual(deleted.records, [b]);
  assert.deepEqual(b.linkedRecordIds, ["a", "future-note"]);
  assert.equal(store.records.length, 2);
  assert.throws(() => parseRecords(JSON.stringify({ ...store, version: 2 })));
  assert.throws(() =>
    parseRecords(JSON.stringify({ version: 1, records: [a, a] })),
  );
});
test("record storage is durable, validates input, keeps originals on failure and never reseeds empty data", async () => {
  const mod = await import("../src/records.js");
  assert.equal(
    typeof mod.loadRecords,
    "function",
    "record persistence missing",
  );
  let raw = null;
  const storage = {
    getItem: () => raw,
    setItem: (k, v) => {
      raw = v;
    },
    removeItem: () => {
      raw = null;
    },
  };
  const seed = { version: 1, records: [] };
  assert.deepEqual(mod.loadRecords(storage, seed), seed);
  const record = mod.createRecord(
    { type: "task", title: "공부", date: "2026-11-15", dueDate: null },
    "new",
    "now",
  );
  const next = { version: 1, records: [record] };
  mod.saveRecords(storage, next);
  assert.deepEqual(mod.loadRecords(storage, seed), next);
  const before = raw;
  const denied = {
    ...storage,
    setItem: () => {
      throw new Error("Denied");
    },
  };
  assert.throws(() => mod.saveRecords(denied, seed));
  assert.equal(raw, before);
  assert.deepEqual(mod.deleteRecord(next, "new").records, []);
  mod.saveRecords(storage, seed);
  assert.deepEqual(mod.loadRecords(storage, next), seed);
  raw = "{broken";
  assert.throws(() => mod.loadRecords(storage, seed));
  assert.equal(raw, "{broken");
  assert.throws(() =>
    mod.createRecord(
      { type: "task", title: "", date: "2026-11-15", dueDate: null },
      "bad",
      "now",
    ),
  );
});
test("date/time validation rejects invalid dates but permits planned date after deadline", async () => {
  const mod = await import("../src/records.js");
  assert.equal(
    typeof mod.validateDraft,
    "function",
    "draft validation missing",
  );
  const task = {
    type: "task",
    title: "공부",
    date: "2026-11-18",
    dueDate: "2026-11-16",
  };
  assert.deepEqual(mod.validateDraft(task), {});
  assert.ok(mod.validateDraft({ ...task, title: "   " }).title);
  assert.ok(mod.validateDraft({ ...task, date: "" }).date);
  assert.ok(mod.validateDraft({ ...task, date: "2026-02-30" }).date);
  assert.deepEqual(mod.validateDraft({ ...task, date: "2028-02-29" }), {});
  assert.ok(mod.validateDraft({ ...task, dueDate: "2026-02-29" }).dueDate);
  assert.ok(
    mod.validateDraft({
      type: "event",
      title: "상담",
      date: "2026-11-15",
      time: "25:00",
    }).time,
  );
  assert.deepEqual(
    mod.validateDraft({
      type: "event",
      title: "상담",
      date: "2026-11-15",
      time: null,
    }),
    {},
  );
});
test("record edits preserve independent deadline and stable future links", async () => {
  const mod = await import("../src/records.js").catch(() => ({}));
  assert.equal(
    typeof mod.updateRecord,
    "function",
    "record model not implemented",
  );
  const original = {
    id: "t1",
    type: "task",
    title: "공부",
    date: "2026-11-15",
    dueDate: "2026-11-16",
    done: false,
    subject: "수학",
    folderId: null,
    tagIds: ["tag1"],
    linkedRecordIds: ["note1"],
    createdAt: "created",
    updatedAt: "old",
    isSample: false,
  };
  const store = { version: 1, records: [original] };
  const next = mod.updateRecord(store, "t1", { date: "2026-11-18" }, "updated");
  assert.equal(next.records[0].dueDate, "2026-11-16");
  assert.deepEqual(next.records[0].linkedRecordIds, ["note1"]);
  assert.deepEqual(next.records[0].tagIds, ["tag1"]);
  assert.equal(next.records[0].createdAt, "created");
  assert.equal(next.records[0].updatedAt, "updated");
  assert.equal(original.date, "2026-11-15");
  assert.throws(() => mod.updateRecord(store, "t1", { type: "event" }));
});
