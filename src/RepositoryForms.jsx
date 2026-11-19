import React, { useState, useEffect, useRef } from "react";
import { validateDraft } from "./records";
import { folderPath } from "./repository";
export function FolderForm({
  folder,
  parentId,
  folders,
  onSave,
  onDelete,
  onCancel,
}) {
  const [name, setName] = useState(folder?.name || ""),
    [parent, setParent] = useState(folder ? folder.parentId : parentId),
    [error, setError] = useState("");
  return (
    <>
      <h2>{folder ? "폴더 수정" : "폴더 추가"}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            setError("폴더 이름을 입력해 주세요.");
            return;
          }
          try {
            onSave({ name, parentId: parent });
          } catch (error) {
            setError(error.message || "저장하지 못했어요. 다시 시도해 주세요.");
          }
        }}
      >
        <div className="field">
          <label htmlFor="folder-name">폴더 이름</label>
          <input
            data-autofocus
            id="folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="folder-parent">상위 폴더</label>
          <select
            id="folder-parent"
            value={parent || ""}
            onChange={(e) => setParent(e.target.value || null)}
          >
            <option value="">저장소</option>
            {folders
              .filter((f) => f.id !== folder?.id)
              .map((f) => (
                <option value={f.id} key={f.id}>
                  {folderPath(folders, f.id)}
                </option>
              ))}
          </select>
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="editor-actions">
          <div>
            {folder && (
              <button
                type="button"
                className="delete-link"
                onClick={() => {
                  try {
                    onDelete(folder.id);
                  } catch (error) {
                    setError(error.message);
                  }
                }}
              >
                폴더 삭제
              </button>
            )}
          </div>
          <div>
            <button type="button" onClick={onCancel}>
              취소
            </button>
            <button className="primary" type="submit">
              저장
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
export function ResourceForm({
  record,
  folderId,
  folders,
  onSave,
  onDelete,
  onCancel,
}) {
  const [draft, setDraft] = useState(() =>
      record
        ? { ...record }
        : { type: "note", title: "", body: "", url: "", folderId },
    ),
    [errors, setErrors] = useState({}),
    [failure, setFailure] = useState(""),
    [confirm, setConfirm] = useState(false);
  const cancelDelete = useRef(null),
    deleteButton = useRef(null),
    previousConfirm = useRef(false);
  useEffect(() => {
    if (confirm) cancelDelete.current?.focus();
    else if (previousConfirm.current) deleteButton.current?.focus();
    previousConfirm.current = confirm;
  }, [confirm]);
  const set = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    setFailure("");
  };
  return (
    <>
      <h2>{record ? "기록 수정" : "기록 추가"}</h2>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm) return;
          const invalid = validateDraft(draft);
          setErrors(invalid);
          if (Object.keys(invalid).length) {
            document
              .getElementById(`resource-${Object.keys(invalid)[0]}`)
              ?.focus();
            return;
          }
          try {
            onSave(draft);
          } catch {
            setFailure("저장하지 못했어요. 다시 시도해 주세요.");
          }
        }}
      >
        {!record && (
          <div className="field">
            <label htmlFor="resource-type">종류</label>
            <select
              id="resource-type"
              value={draft.type}
              onChange={(e) => set("type", e.target.value)}
            >
              <option value="note">메모</option>
              <option value="link">링크</option>
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="resource-title">제목</label>
          <input
            data-autofocus
            id="resource-title"
            value={draft.title}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? "resource-title-error" : undefined}
            onChange={(e) => set("title", e.target.value)}
          />
          {errors.title && (
            <p id="resource-title-error" className="field-error">
              {errors.title}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="resource-folder">폴더</label>
          <select
            id="resource-folder"
            value={draft.folderId || ""}
            onChange={(e) => set("folderId", e.target.value || null)}
          >
            <option value="">저장소</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {folderPath(folders, f.id)}
              </option>
            ))}
          </select>
        </div>
        {draft.type === "note" ? (
          <div className="field">
            <label htmlFor="resource-body">내용</label>
            <textarea
              id="resource-body"
              value={draft.body}
              onChange={(e) => set("body", e.target.value)}
            />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="resource-url">URL</label>
            <input
              id="resource-url"
              type="url"
              value={draft.url}
              aria-invalid={!!errors.url}
              aria-describedby={errors.url ? "resource-url-error" : undefined}
              onChange={(e) => set("url", e.target.value)}
            />
            {errors.url && (
              <p className="field-error" id="resource-url-error">
                {errors.url}
              </p>
            )}
          </div>
        )}
        {failure && (
          <p className="field-error" role="alert">
            {failure}
          </p>
        )}
        {confirm ? (
          <div className="delete-confirm">
            <p>
              ‘{record.title}’ 원본을 삭제할까요? 할 일·일정은 유지되고 연결만
              해제돼요.
            </p>
            <div>
              <button
                ref={cancelDelete}
                type="button"
                onClick={() => setConfirm(false)}
              >
                취소
              </button>
              <button
                className="danger"
                type="button"
                onClick={() => {
                  try {
                    onDelete(record.id);
                  } catch {
                    setFailure("삭제하지 못했어요. 다시 시도해 주세요.");
                  }
                }}
              >
                원본 삭제
              </button>
            </div>
          </div>
        ) : (
          <div className="editor-actions">
            <div>
              {record && (
                <button
                  className="delete-link"
                  type="button"
                  ref={deleteButton}
                  onClick={() => setConfirm(true)}
                >
                  원본 삭제
                </button>
              )}
            </div>
            <div>
              <button type="button" onClick={onCancel}>
                취소
              </button>
              <button className="primary" type="submit">
                저장
              </button>
            </div>
          </div>
        )}
      </form>
    </>
  );
}
