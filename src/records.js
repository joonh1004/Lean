import { folderPath } from "./repository.js";
import { recordColor } from "./recordColors.js";
export const RECORDS_KEY = "joonh.workspace.records.v1";
export function validHttpUrl(value) {
  if (
    typeof value !== "string" ||
    !/^https?:\/\//i.test(value) ||
    /[\u0000-\u0020\u007f]/.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !!url.hostname;
  } catch {
    return false;
  }
}
export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(y, m - 1, d);
  return (
    y >= 1 &&
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}
export function validateDraft(draft) {
  const errors = {};
  if (typeof draft.title !== "string" || !draft.title.trim())
    errors.title = "제목을 입력해 주세요.";
  if (["task", "event"].includes(draft.type) && !validDate(draft.date))
    errors.date = "날짜를 입력해 주세요.";
  if (draft.type === "note" && typeof draft.body !== "string")
    errors.body = "메모를 확인해 주세요.";
  if (draft.type === "link" && !validHttpUrl(draft.url))
    errors.url = "http 또는 https 주소를 입력해 주세요.";
  if (
    draft.type === "task" &&
    draft.dueDate != null &&
    !validDate(draft.dueDate)
  )
    errors.dueDate = "마감일을 확인해 주세요.";
  if (
    draft.type === "event" &&
    draft.time != null &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)
  )
    errors.time = "시간을 확인해 주세요.";
  return errors;
}

export function createRecord(
  draft,
  id = crypto.randomUUID(),
  now = new Date().toISOString(),
) {
  if (
    !["task", "event", "note", "link"].includes(draft.type) ||
    Object.keys(validateDraft(draft)).length
  )
    throw new Error("Invalid record");
  const common = {
    id,
    type: draft.type,
    title: draft.title,
    ...(["task", "event"].includes(draft.type) ? { date: draft.date } : {}),
    subject: draft.subject || "",
    folderId: draft.folderId ?? null,
    tagIds: [],
    linkedRecordIds: [],
    createdAt: now,
    updatedAt: now,
    isSample: false,
  };
  if (draft.type === "note") return { ...common, body: draft.body };
  if (draft.type === "link") return { ...common, url: draft.url };
  const color = recordColor(draft.color);
  if (color) common.color = color;
  return draft.type === "task"
    ? { ...common, done: false, dueDate: draft.dueDate ?? null }
    : { ...common, time: draft.time ?? null };
}
export function deleteRecord(store, id) {
  const source = store.records.find((r) => r.id === id);
  return {
    ...store,
    records: store.records
      .filter((r) => r.id !== id)
      .map((r) =>
        source &&
        ["note", "link"].includes(source.type) &&
        r.linkedRecordIds.includes(id)
          ? {
              ...r,
              linkedRecordIds: r.linkedRecordIds.filter((link) => link !== id),
              updatedAt: new Date().toISOString(),
            }
          : r,
      ),
  };
}
export function parseRecords(raw) {
  const state = JSON.parse(raw),
    text = (v) => typeof v === "string",
    ids = (v) => Array.isArray(v) && v.every(text);
  if (
    !state ||
    state.version !== 1 ||
    !Array.isArray(state.records) ||
    new Set(state.records.map((r) => r?.id)).size !== state.records.length ||
    !state.records.every(
      (r) =>
        r &&
        text(r.id) &&
        r.id &&
        ["task", "event", "note", "link"].includes(r.type) &&
        !Object.keys(validateDraft(r)).length &&
        text(r.subject) &&
        text(r.createdAt) &&
        text(r.updatedAt) &&
        typeof r.isSample === "boolean" &&
        (r.folderId === null || text(r.folderId)) &&
        ids(r.tagIds) &&
        ids(r.linkedRecordIds) &&
        (r.type === "task"
          ? typeof r.done === "boolean" &&
            (r.dueDate === null || validDate(r.dueDate))
          : r.type === "event"
            ? r.time === null || typeof r.time === "string"
            : r.type === "note"
              ? typeof r.body === "string"
              : validHttpUrl(r.url)),
    )
  )
    throw new Error("Invalid record storage");
  if (state.folders !== undefined) {
    if (
      !Array.isArray(state.folders) ||
      new Set(state.folders.map((f) => f?.id)).size !== state.folders.length ||
      !state.folders.every(
        (f) =>
          f &&
          text(f.id) &&
          !!f.id &&
          text(f.name) &&
          !!f.name.trim() &&
          (f.parentId === null || text(f.parentId)),
      )
    )
      throw new Error("Invalid folders");
    state.folders.forEach((f) => folderPath(state.folders, f.id));
  }
  state.records
    .filter((r) => ["note", "link"].includes(r.type))
    .forEach((r) => folderPath(state.folders || [], r.folderId));
  return state;
}
export function saveRecords(storage, state) {
  const serialized = JSON.stringify(state);
  parseRecords(serialized);
  const previous = storage.getItem(RECORDS_KEY);
  storage.setItem(RECORDS_KEY, serialized);
  try {
    if (storage.getItem(RECORDS_KEY) !== serialized)
      throw new Error("Readback mismatch");
  } catch (error) {
    try {
      if (previous === null) storage.removeItem(RECORDS_KEY);
      else storage.setItem(RECORDS_KEY, previous);
    } catch {}
    throw error;
  }
}
export function loadRecords(storage, seed) {
  const raw = storage.getItem(RECORDS_KEY);
  if (raw !== null) return parseRecords(raw);
  saveRecords(storage, seed);
  return seed;
}
export function updateRecord(store, id, patch, now = new Date().toISOString()) {
  const record = store.records.find((r) => r.id === id);
  if (!record) throw new Error("Record not found");
  if (patch.type && patch.type !== record.type)
    throw new Error("Cannot change record type");
  const {
    id: ignoredId,
    type: ignoredType,
    createdAt: ignoredCreated,
    ...changes
  } = patch;
  return {
    ...store,
    records: store.records.map((r) =>
      r.id === id ? { ...r, ...changes, updatedAt: now } : r,
    ),
  };
}
