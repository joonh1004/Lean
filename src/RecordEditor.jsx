import React, { useState, useRef, useEffect } from "react";
import { validateDraft } from "./records";
import { RECORD_COLORS, recordColor } from "./recordColors";
export default function RecordEditor({
  record,
  type,
  date,
  onSave,
  onDelete,
  onCancel,
}) {
  const [draft, setDraft] = useState(() =>
    record
      ? { ...record }
      : {
          type,
          title: "",
          date,
          subject: "",
          ...(type === "task" ? { dueDate: null } : { time: null }),
        },
  );
  const task = type === "task",
    optional = task ? "dueDate" : "time",
    label = task ? "마감일" : "시간";
  const [expanded, setExpanded] = useState(Boolean(draft[optional]));
  const [errors, setErrors] = useState({}),
    [failure, setFailure] = useState(""),
    [confirming, setConfirming] = useState(false);
  const titleRef = useRef(null);
  const confirmCancelRef = useRef(null),
    deleteRef = useRef(null),
    wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming) confirmCancelRef.current?.focus();
    else if (wasConfirming.current) deleteRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  const set = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    setFailure("");
  };
  const heading = `${task ? "할 일" : "일정"} ${record ? "수정" : "추가"}`;
  async function submit(e) {
    e.preventDefault();
    const invalid = validateDraft(draft);
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      document.getElementById(`record-${Object.keys(invalid)[0]}`)?.focus();
      return;
    }
    try {
      onSave(draft);
    } catch {
      setFailure("저장하지 못했어요. 다시 시도해 주세요.");
    }
  }
  function remove() {
    try {
      onDelete(record.id);
    } catch {
      setFailure("삭제하지 못했어요. 다시 시도해 주세요.");
    }
  }
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-heading"
      className="record-editor"
    >
      <h2 id="editor-heading">{heading}</h2>
      <form noValidate onSubmit={submit}>
        <div className="field">
          <label htmlFor="record-title">제목</label>
          <input
            data-autofocus
            id="record-title"
            ref={titleRef}
            value={draft.title}
            required
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "error-title" : undefined}
            onChange={(e) => set("title", e.target.value)}
          />
          {errors.title && (
            <p id="error-title" className="field-error">
              {errors.title}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="record-date">{task ? "실행 예정일" : "날짜"}</label>
          <input
            id="record-date"
            type="date"
            value={draft.date}
            required
            aria-invalid={Boolean(errors.date)}
            aria-describedby={errors.date ? "error-date" : undefined}
            onChange={(e) => set("date", e.target.value)}
          />
          {errors.date && (
            <p id="error-date" className="field-error">
              {errors.date}
            </p>
          )}
        </div>
        <div className="optional-field">
          {expanded ? (
            <>
              <div className="optional-heading">
                <label htmlFor={`record-${optional}`}>{label}</label>
                <button type="button" onClick={() => setExpanded(false)}>
                  접기
                </button>
              </div>
              <input
                id={`record-${optional}`}
                type={task ? "date" : "time"}
                value={draft[optional] || ""}
                aria-invalid={Boolean(errors[optional])}
                aria-describedby={
                  errors[optional] ? `error-${optional}` : undefined
                }
                onChange={(e) => set(optional, e.target.value)}
              />
              {
                <button
                  className="remove-value"
                  type="button"
                  onClick={() => set(optional, null)}
                >
                  {label} 제거
                </button>
              }
            </>
          ) : (
            <div className="optional-summary">
              <button type="button" onClick={() => setExpanded(true)}>
                {label} {draft[optional] ? "펼치기" : "추가"}
              </button>
              {draft[optional] && <span>{draft[optional]}</span>}
            </div>
          )}
          {errors[optional] && (
            <p id={`error-${optional}`} className="field-error">
              {errors[optional]}
            </p>
          )}
        </div>
        <div className="field color-field">
          <label htmlFor="record-color">색상 (선택)</label>
          <select
            id="record-color"
            value={recordColor(draft.color) ?? ""}
            onChange={(e) => set("color", e.target.value || null)}
          >
            <option value="">기본</option>
            {RECORD_COLORS.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </div>
        {task && draft.dueDate && draft.date > draft.dueDate && (
          <p className="date-warning" role="status">
            실행 예정일이 마감일 이후예요.
          </p>
        )}
        {failure && (
          <p className="field-error" role="alert">
            {failure}
          </p>
        )}
        {confirming ? (
          <div className="delete-confirm">
            <p>‘{record.title}’을 삭제할까요?</p>
            <div>
              <button
                ref={confirmCancelRef}
                type="button"
                onClick={() => setConfirming(false)}
              >
                취소
              </button>
              <button className="danger" type="button" onClick={remove}>
                삭제
              </button>
            </div>
          </div>
        ) : (
          <div className="editor-actions">
            <div>
              {record && (
                <button
                  className="delete-link"
                  ref={deleteRef}
                  type="button"
                  onClick={() => setConfirming(true)}
                >
                  삭제
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
    </section>
  );
}
