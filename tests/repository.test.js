import { test } from "node:test";
import assert from "node:assert/strict";
test("relationship date labels use planned/event date only and never substitute modified date", async () => {
  const mod = await import("../src/repository.js");
  assert.equal(
    typeof mod.relationDateLabel,
    "function",
    "date meaning labels missing",
  );
  assert.equal(
    mod.relationDateLabel({
      type: "task",
      date: "2026-11-15",
      updatedAt: "2026-10-02",
    }),
    "예정 2026-11-15",
  );
  assert.equal(
    mod.relationDateLabel({
      type: "event",
      date: "2026-11-16",
      updatedAt: "2026-10-02",
    }),
    "일정일 2026-11-16",
  );
  for (const type of ["task", "event", "note", "link"])
    assert.equal(mod.relationDateLabel({ type, updatedAt: "2026-10-02" }), "");
});
test("legacy task envelopes remain readable; folder moves preserve resources and malformed graphs are rejected", async () => {
  const { createRecord, parseRecords } = await import("../src/records.js");
  const { addFolder, editFolder, folderPath, removeFolder } = await import(
    "../src/repository.js"
  );
  const legacy = {
    version: 1,
    records: [
      createRecord(
        {
          type: "task",
          title: "기존 일정",
          date: "2026-11-15",
          dueDate: "2026-11-16",
        },
        "t",
        "now",
      ),
    ],
  };
  assert.deepEqual(parseRecords(JSON.stringify(legacy)), legacy);
  let state = addFolder({ ...legacy, folders: [] }, "첫 폴더", null, "a");
  state = addFolder(state, "자식", "a", "b");
  state = addFolder(state, "둘째 폴더", null, "c");
  state.records.push(
    createRecord(
      { type: "note", title: "원문", body: "유지", folderId: "b" },
      "n",
      "now",
    ),
  );
  state = editFolder(state, "a", { name: "바꾼 이름", parentId: "c" });
  assert.equal(
    folderPath(state.folders, "b"),
    "저장소 / 둘째 폴더 / 바꾼 이름 / 자식",
  );
  assert.equal(parseRecords(JSON.stringify(state)).records[1].folderId, "b");
  assert.throws(() => removeFolder(state, "b"), /내용이 있는 폴더/);
  assert.throws(() =>
    parseRecords(
      JSON.stringify({
        ...state,
        folders: [{ id: "a", name: "잘못된 경로", parentId: "a" }],
      }),
    ),
  );
  assert.throws(() =>
    parseRecords(
      JSON.stringify({
        ...state,
        records: [{ ...state.records[1], folderId: "missing" }],
      }),
    ),
  );
});
test("linking/unlinking and deleting tasks never delete source notes; deleting a source cleans only relationships", async () => {
  const { createRecord, deleteRecord } = await import("../src/records.js");
  const mod = await import("../src/repository.js");
  assert.equal(
    typeof mod.linkResource,
    "function",
    "record relationships missing",
  );
  const task = createRecord(
      { type: "task", title: "공부", date: "2026-11-15", dueDate: null },
      "t",
      "now",
    ),
    note = createRecord(
      { type: "note", title: "노트", body: "원문" },
      "n",
      "now",
    );
  let state = { version: 1, folders: [], records: [task, note] };
  state = mod.linkResource(state, "t", "n");
  assert.deepEqual(state.records[0].linkedRecordIds, ["n"]);
  assert.deepEqual(
    mod.linkResource(state, "t", "n").records[0].linkedRecordIds,
    ["n"],
  );
  const unlinked = mod.unlinkResource(state, "t", "n");
  assert.deepEqual(unlinked.records[0].linkedRecordIds, []);
  assert.deepEqual(unlinked.records[1], note);
  assert.deepEqual(deleteRecord(state, "t").records, [note]);
  const deleted = deleteRecord(state, "n");
  assert.equal(deleted.records.length, 1);
  assert.deepEqual(deleted.records[0].linkedRecordIds, []);
  assert.throws(() => mod.linkResource(state, "n", "t"));
});
test("notes preserve literal HTML text and link records accept only explicit http(s) URLs", async () => {
  const { createRecord, validateDraft, parseRecords } = await import(
    "../src/records.js"
  );
  const body = "<img src=x onerror=alert(1)>\n<script>window.bad=true</script>";
  let note;
  assert.doesNotThrow(() => {
    note = createRecord(
      { type: "note", title: "메모", body, folderId: null },
      "n",
      "now",
    );
  });
  assert.equal(note.body, body);
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///x",
    "//example.com",
    "https://",
    "https://example.com\n",
  ])
    assert.ok(validateDraft({ type: "link", title: "링크", url }).url);
  for (const url of ["http://example.com/a", "https://example.com/가?a=1"])
    assert.deepEqual(validateDraft({ type: "link", title: "링크", url }), {});
  const parsed = parseRecords(
    JSON.stringify({ version: 1, records: [note], folders: [] }),
  );
  assert.equal(parsed.records[0].body, body);
});
test("folders form safe nested paths and non-empty folders cannot be deleted or cycled", async () => {
  const mod = await import("../src/repository.js").catch(() => ({}));
  assert.equal(
    typeof mod.addFolder,
    "function",
    "repository folder model missing",
  );
  let state = { version: 1, records: [], folders: [] };
  state = mod.addFolder(state, "학습", null, "a");
  state = mod.addFolder(state, "수학", "a", "b");
  assert.equal(mod.folderPath(state.folders, "b"), "저장소 / 학습 / 수학");
  assert.throws(() => mod.removeFolder(state, "a"), /내용이 있는 폴더/);
  assert.throws(
    () => mod.editFolder(state, "a", { parentId: "b" }),
    /하위 폴더/,
  );
  assert.equal(mod.removeFolder(state, "b").folders.length, 1);
});
