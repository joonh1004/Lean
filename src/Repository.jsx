import React, { useState, useEffect, useRef } from "react";
import Modal from "./Modal";
import RelationChoices, { kindLabel } from "./RelationChoices";
import { FolderForm, ResourceForm } from "./RepositoryForms";
import {
  addFolder,
  editFolder,
  removeFolder,
  folderPath,
  linkResource,
  unlinkResource,
} from "./repository";
import { createRecord, updateRecord, deleteRecord } from "./records";
import "./repository.css";
export default function Repository({ store, commit, initialSelection = null }) {
  const folders = store.folders || [],
    resources = store.records.filter((r) => ["note", "link"].includes(r.type));
  const [folder, setFolder] = useState("all"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(initialSelection),
    [detailOpen, setDetailOpen] = useState(!!initialSelection),
    [modal, setModal] = useState(null),
    [error, setError] = useState("");
  const [expanded, setExpanded] = useState(
      () => new Set(folders.map((f) => f.id)),
    ),
    [small, setSmall] = useState(
      () => matchMedia("(max-width:1359px)").matches,
    );
  const heading = useRef(null);
  useEffect(() => {
    const media = matchMedia("(max-width:1359px)"),
      change = () => setSmall(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => heading.current?.focus(), []);
  const selectedRecord = resources.find((r) => r.id === selected),
    activeFolder = folders.find((f) => f.id === folder);
  const path = folder === "all" ? "전체" : folderPath(folders, folder),
    parts = path.split(" / "),
    shortPath =
      parts.length > 3 ? [parts[0], "…", parts.at(-1)].join(" / ") : path;
  const normalized = query.trim().normalize("NFC").toLocaleLowerCase();
  const visible = resources.filter((r) =>
    normalized
      ? [r.title, r.body || "", r.url || ""].some((s) =>
          s.normalize("NFC").toLocaleLowerCase().includes(normalized),
        )
      : folder === "all" || r.folderId === folder,
  );
  function apply(next) {
    try {
      commit(next);
    } catch {
      throw new Error("저장하지 못했어요. 다시 시도해 주세요.");
    }
    setError("");
  }
  function saveResource(draft) {
    const next = modal.record
      ? updateRecord(store, modal.record.id, draft)
      : null;
    const created = next ? null : createRecord(draft);
    apply(next || { ...store, records: [...store.records, created] });
    setSelected(modal.record?.id || created.id);
    setDetailOpen(true);
    setModal(null);
  }
  function deleteResource(id) {
    apply(deleteRecord(store, id));
    setModal(null);
    setSelected(null);
    setDetailOpen(false);
  }
  function saveFolder(draft) {
    if (modal.folder) {
      apply(editFolder(store, modal.folder.id, draft));
    } else {
      const id = crypto.randomUUID();
      apply(addFolder(store, draft.name, draft.parentId, id));
      setFolder(id);
      setExpanded((previous) => new Set([...previous, draft.parentId, id]));
    }
    setModal(null);
  }
  function deleteFolder(id) {
    apply(removeFolder(store, id));
    setFolder(activeFolder?.parentId ?? null);
    setModal(null);
  }
  function connect(taskId, resourceId) {
    apply(linkResource(store, taskId, resourceId));
    setModal(null);
  }
  function unlink(taskId, resourceId) {
    try {
      apply(unlinkResource(store, taskId, resourceId));
    } catch {
      setError("연결 해제하지 못했어요. 다시 시도해 주세요.");
    }
  }
  function tree(parentId = null, depth = 0) {
    return folders
      .filter((f) => f.parentId === parentId)
      .map((f) => {
        const full = folderPath(folders, f.id),
          children = folders.some((x) => x.parentId === f.id),
          open = expanded.has(f.id);
        return (
          <React.Fragment key={f.id}>
            <div
              className="folder-row"
              style={{
                paddingLeft: folder === f.id ? 0 : Math.min(depth, 2) * 8,
              }}
            >
              {children ? (
                <button
                  className="folder-expand"
                  aria-expanded={open}
                  aria-label={`${open ? "하위 폴더 접기" : "하위 폴더 펼치기"} ${full}`}
                  onClick={() =>
                    setExpanded((previous) => {
                      const next = new Set(previous);
                      next.has(f.id) ? next.delete(f.id) : next.add(f.id);
                      return next;
                    })
                  }
                >
                  {open ? "⌄" : "›"}
                </button>
              ) : (
                <span className="folder-spacer" />
              )}
              <button
                aria-label={`폴더 선택 ${full}`}
                aria-pressed={folder === f.id}
                className={
                  folder === f.id ? "folder-select selected" : "folder-select"
                }
                onClick={() => {
                  setFolder(f.id);
                  setSelected(null);
                  setDetailOpen(false);
                }}
              >
                {folder === f.id ? "▸" : "▱"}{" "}
                {folder !== f.id && depth > 2 ? "… " : ""}
                {f.name}
              </button>
            </div>
            {children && open && tree(f.id, depth + 1)}
          </React.Fragment>
        );
      });
  }
  function detail() {
    if (!selectedRecord) return <p className="empty">기록 선택</p>;
    const record = selectedRecord,
      incoming = store.records.filter(
        (r) =>
          ["task", "event"].includes(r.type) &&
          r.linkedRecordIds.includes(record.id),
      );
    return (
      <>
        <div className="repo-detail-top">
          <small>{kindLabel(record.type)}</small>
          {small && (
            <button
              aria-label="기록 상세 닫기"
              onClick={() => setDetailOpen(false)}
            >
              ×
            </button>
          )}
        </div>
        <h2>{record.title}</h2>
        <p className="repo-detail-path">
          {folderPath(folders, record.folderId)}
        </p>
        {record.type === "note" ? (
          <p className="note-body">{record.body}</p>
        ) : (
          <div className="link-content">
            <span>{new URL(record.url).hostname}</span>
            <p className="full-url">{record.url}</p>
            <a
              className="open-link"
              href={record.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="링크 열기 (새 탭)"
            >
              링크 열기 ↗
            </a>
          </div>
        )}
        <button
          className="repo-edit"
          onClick={() => setModal({ type: "record", record })}
        >
          기록 수정
        </button>
        <div className="repo-relationships">
          <div>
            <h3>연결</h3>
            <button onClick={() => setModal({ type: "connect" })}>
              할 일·일정 연결
            </button>
          </div>
          {incoming.map((owner) => (
            <div className="repo-relation" key={owner.id}>
              <span>
                <small>{kindLabel(owner.type)}</small>
                <span>{owner.title}</span>
              </span>
              <button
                aria-label={`연결 해제 ${owner.title}`}
                onClick={() => unlink(owner.id, record.id)}
              >
                연결 해제
              </button>
            </div>
          ))}
          {!incoming.length && <p className="empty">연결 없음</p>}
        </div>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </>
    );
  }
  return (
    <section className="repository-view" aria-labelledby="repository-heading">
      <header className="repository-header">
        <h1 id="repository-heading" ref={heading} tabIndex={-1}>
          저장소
        </h1>
        <div>
          <button
            onClick={() =>
              setModal({
                type: "folder",
                parentId: folder === "all" ? null : folder,
              })
            }
          >
            폴더 추가
          </button>
          <button
            className="add-record"
            onClick={() => setModal({ type: "record", record: null })}
          >
            기록 추가
          </button>
        </div>
      </header>
      <div className="repository-surface">
        <nav className="folder-pane" aria-label="폴더 탐색">
          <h2>폴더</h2>
          {[
            ["all", "전체"],
            [null, "저장소"],
          ].map(([id, name]) => (
            <button
              key={name}
              className={folder === id ? "folder-root selected" : "folder-root"}
              aria-pressed={folder === id}
              onClick={() => {
                setFolder(id);
                setSelected(null);
                setDetailOpen(false);
              }}
            >
              {folder === id ? "▸ " : ""}
              {name}
            </button>
          ))}
          {tree()}
        </nav>
        <div className="repo-list-pane">
          <div className="repo-path">
            <span>{shortPath}</span>
            {activeFolder && (
              <button
                onClick={() =>
                  setModal({ type: "folder", folder: activeFolder })
                }
              >
                폴더 수정
              </button>
            )}
          </div>
          {parts.length > 3 && (
            <details className="full-path">
              <summary>전체 경로</summary>
              <p>{path}</p>
            </details>
          )}
          <label className="repo-search">
            전체 검색
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {normalized && (
            <div className="search-state">
              <span>저장소 전체 검색</span>
              <button onClick={() => setQuery("")}>검색 지우기</button>
            </div>
          )}
          <div className="repo-list">
            {visible.map((record) => {
              const recordPath = folderPath(folders, record.folderId);
              return (
                <button
                  className={`repo-record ${selected === record.id ? "selected" : ""}`}
                  key={record.id}
                  aria-pressed={selected === record.id}
                  aria-label={`기록 선택 ${kindLabel(record.type)} ${record.title} ${recordPath}`}
                  onClick={() => {
                    setSelected(record.id);
                    setDetailOpen(true);
                    setError("");
                  }}
                >
                  <small>
                    {kindLabel(record.type)} · {record.updatedAt.slice(0, 10)}
                  </small>
                  <span>{record.title}</span>
                  <small className="result-path">{recordPath}</small>
                </button>
              );
            })}
            {!visible.length && (
              <p className="empty">
                {normalized ? "검색 결과 없음" : "기록 없음"}
              </p>
            )}
          </div>
        </div>
        {!small && (
          <section className="repo-detail" aria-label="기록 상세">
            {detail()}
          </section>
        )}
      </div>
      {!modal && small && selectedRecord && detailOpen && (
        <Modal title="기록 상세" side onClose={() => setDetailOpen(false)}>
          {detail()}
        </Modal>
      )}
      {modal && (
        <Modal
          key={`${modal.type}-${modal.record?.id || modal.folder?.id || "new"}`}
          title={
            modal.type === "folder"
              ? modal.folder
                ? "폴더 수정"
                : "폴더 추가"
              : modal.type === "connect"
                ? "기록 연결"
                : modal.record
                  ? "기록 수정"
                  : "기록 추가"
          }
          onClose={() => setModal(null)}
        >
          {modal.type === "folder" ? (
            <FolderForm
              {...modal}
              folders={folders}
              onSave={saveFolder}
              onDelete={deleteFolder}
              onCancel={() => setModal(null)}
            />
          ) : modal.type === "connect" ? (
            <RelationChoices
              store={store}
              resource={selectedRecord}
              onConnect={connect}
              onCancel={() => setModal(null)}
            />
          ) : (
            <ResourceForm
              record={modal.record}
              folderId={folder === "all" ? null : folder}
              folders={folders}
              onSave={saveResource}
              onDelete={deleteResource}
              onCancel={() => setModal(null)}
            />
          )}
        </Modal>
      )}
    </section>
  );
}
