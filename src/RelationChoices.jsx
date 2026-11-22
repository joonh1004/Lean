import React, { useState } from "react";
import { folderPath, relationDateLabel } from "./repository";
import { usePendingSubmission } from "./useEditorSession.js";
export const kindLabel = (type) =>
  ({ task: "할 일", event: "일정", note: "메모", link: "링크" })[type];
export default function RelationChoices({
  store,
  owner = null,
  resource = null,
  onConnect,
  onCancel,
}) {
  const [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const { pending, isPending, run } = usePendingSubmission();
  const candidates = store.records
    .filter((r) =>
      owner
        ? ["note", "link"].includes(r.type)
        : ["task", "event"].includes(r.type),
    )
    .filter((r) =>
      r.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    );
  return (
    <>
      <h2 id="relation-heading">기록 연결</h2>
      <label className="relation-search">
        연결할 기록 검색
        <input
          data-autofocus
          value={query}
          disabled={!!pending}
          onChange={(e) => {
            if (!isPending()) setQuery(e.target.value);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {pending && <p role="status">{pending}</p>}
      <div className="relation-choices">
        {candidates.length ? (
          candidates.map((candidate) => {
            const task = owner || candidate,
              note = resource || candidate,
              linked = task.linkedRecordIds.includes(note.id);
            const path = folderPath(store.folders || [], candidate.folderId);
            return (
              <div className="relation-choice" key={candidate.id}>
                <span>
                  <small>
                    {kindLabel(candidate.type)} · {path}
                    {relationDateLabel(candidate) &&
                      ` · ${relationDateLabel(candidate)}`}
                  </small>
                  <span>{candidate.title}</span>
                </span>
                <button
                  type="button"
                  disabled={linked || !!pending}
                  aria-label={`${linked ? "연결됨" : "연결"} ${kindLabel(candidate.type)} ${candidate.title} ${path}`}
                  onClick={() => {
                    if (isPending()) return;
                    setError("");
                    void run("연결 중…", () => onConnect(task.id, note.id), () => {
                      setError("연결하지 못했어요. 다시 시도해 주세요.");
                    });
                  }}
                >
                  {linked ? "연결됨" : "연결"}
                </button>
              </div>
            );
          })
        ) : (
          <p className="empty">연결할 기록 없음</p>
        )}
      </div>
      <div className="repo-form-actions">
        <button type="button" onClick={onCancel}>
          취소
        </button>
      </div>
    </>
  );
}
