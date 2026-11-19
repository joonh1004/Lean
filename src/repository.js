export function relationDateLabel(record) {
  return record.date && ["task", "event"].includes(record.type)
    ? `${record.type === "task" ? "예정" : "일정일"} ${record.date}`
    : "";
}
export function linkResource(state, recordId, resourceId) {
  const owner = state.records.find((r) => r.id === recordId),
    resource = state.records.find((r) => r.id === resourceId);
  if (
    !owner ||
    !["task", "event"].includes(owner.type) ||
    !resource ||
    !["note", "link"].includes(resource.type)
  )
    throw new Error("연결 대상을 확인해 주세요.");
  return {
    ...state,
    records: state.records.map((r) =>
      r.id === recordId
        ? {
            ...r,
            linkedRecordIds: [...new Set([...r.linkedRecordIds, resourceId])],
            updatedAt: new Date().toISOString(),
          }
        : r,
    ),
  };
}
export function unlinkResource(state, recordId, resourceId) {
  return {
    ...state,
    records: state.records.map((r) =>
      r.id === recordId
        ? {
            ...r,
            linkedRecordIds: r.linkedRecordIds.filter(
              (id) => id !== resourceId,
            ),
            updatedAt: new Date().toISOString(),
          }
        : r,
    ),
  };
}
export function folderPath(folders, id) {
  const names = [],
    visited = new Set();
  while (id !== null) {
    if (visited.has(id)) throw new Error("폴더 경로가 올바르지 않아요.");
    visited.add(id);
    const folder = folders.find((f) => f.id === id);
    if (!folder) throw new Error("폴더를 찾지 못했어요.");
    names.unshift(folder.name);
    id = folder.parentId;
  }
  return ["저장소", ...names].join(" / ");
}
export function addFolder(
  state,
  name,
  parentId = null,
  id = crypto.randomUUID(),
) {
  if (!name.trim()) throw new Error("폴더 이름을 입력해 주세요.");
  folderPath(state.folders || [], parentId);
  if ((state.folders || []).some((f) => f.id === id))
    throw new Error("중복 폴더 ID");
  return {
    ...state,
    folders: [...(state.folders || []), { id, name, parentId }],
  };
}
export function editFolder(state, id, patch) {
  const folders = state.folders || [];
  const current = folders.find((f) => f.id === id);
  if (!current) throw new Error("폴더를 찾지 못했어요.");
  const next = { ...current, ...patch, id };
  if (!next.name.trim()) throw new Error("폴더 이름을 입력해 주세요.");
  let parent = next.parentId;
  const seen = new Set([id]);
  while (parent !== null) {
    if (seen.has(parent))
      throw new Error("자기 자신이나 하위 폴더로 이동할 수 없어요.");
    seen.add(parent);
    const f = folders.find((x) => x.id === parent);
    if (!f) throw new Error("폴더를 찾지 못했어요.");
    parent = f.parentId;
  }
  return { ...state, folders: folders.map((f) => (f.id === id ? next : f)) };
}
export function removeFolder(state, id) {
  if (
    (state.folders || []).some((f) => f.parentId === id) ||
    state.records.some((r) => r.folderId === id)
  )
    throw new Error(
      "내용이 있는 폴더는 삭제할 수 없어요. 기록이나 하위 폴더를 먼저 이동·정리해 주세요.",
    );
  return {
    ...state,
    folders: (state.folders || []).filter((f) => f.id !== id),
  };
}
