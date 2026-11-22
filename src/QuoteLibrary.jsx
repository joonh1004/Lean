import React, { useState, useRef, useEffect } from "react";
import Modal from "./Modal";
import { useQuotes } from "./QuoteContext";
import { addQuote, editQuote, removeQuote } from "./quotes";
import "./quote-library.css";
import { useEditorSession, usePendingSubmission } from "./useEditorSession.js";
export default function QuoteLibrary({ onReturn }) {
  const { state, day, commit } = useQuotes();
  const [editor, setEditor, closeEditor] = useEditorSession();
  const heading = useRef(null),
    focusHeading = useRef(true);
  useEffect(() => {
    if (!editor && focusHeading.current) {
      heading.current?.focus();
      focusHeading.current = false;
    }
  }, [editor]);
  return (
    <section className="quote-library" aria-label="명언 목록">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          명언
        </h1>
        <div>
          {onReturn && <button onClick={onReturn}>문구 입력으로</button>}
          <button className="primary" onClick={() => setEditor({})}>
            추가
          </button>
        </div>
      </header>
      {state.quotes.length ? (
        <div className="quote-list">
          {state.quotes.map((q) => (
            <article className="quote-row" key={q.id}>
              <p>{q.text}</p>
              {state.days[day]?.id === q.id &&
                state.days[day]?.text === q.text && (
                  <span className="sample">오늘</span>
                )}
              <button onClick={() => setEditor({ quote: q })}>수정</button>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty">저장한 문구 없음</p>
      )}
      {editor && (
        <QuoteEditor
          completed={state.days[day]?.completed}
          last={state.quotes.length === 1}
          quote={editor.quote}
          affected={!!editor.quote && state.days[day]?.id === editor.quote.id}
          onClose={() => setEditor(null)}
          onSave={async (text) => {
            await commit(
              editor.quote
                ? editQuote(state, editor.quote.id, text)
                : addQuote(state, text),
            );
            closeEditor(editor);
          }}
          onDelete={async () => {
            await commit(removeQuote(state, editor.quote.id));
            if (closeEditor(editor)) focusHeading.current = true;
          }}
        />
      )}
    </section>
  );
}
function QuoteEditor({
  quote,
  affected,
  last,
  completed,
  onClose,
  onSave,
  onDelete,
}) {
  const [text, setText] = useState(quote?.text || ""),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const { pending, isPending, run } = usePendingSubmission();
  const title = quote ? "명언 수정" : "명언 추가";
  const cancelDelete = useRef(null),
    deleteButton = useRef(null),
    wasConfirm = useRef(false);
  useEffect(() => {
    if (confirm) cancelDelete.current?.focus();
    else if (wasConfirm.current) deleteButton.current?.focus();
    wasConfirm.current = confirm;
  }, [confirm]);
  function attempt(message, action) {
    if (isPending()) return;
    setError("");
    void run(message, action, () => {
      setError("저장하지 못했어요. 저장 설정을 확인하고 다시 시도해 주세요.");
    });
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) attempt("저장 중…", () => onSave(text));
        }}
      >
        <h2>{title}</h2>
        <label htmlFor="quote-copy">문구</label>
        <textarea
          id="quote-copy"
          data-autofocus
          required
          value={text}
          disabled={!!pending}
          onChange={(e) => {
            if (!isPending()) setText(e.target.value);
          }}
        />
        {affected && <p className="quote-notice">오늘 입력 문구는 유지돼요.</p>}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {pending && <p role="status">{pending}</p>}
        <div className="editor-actions">
          <div>
            {quote && (
              <button
                ref={deleteButton}
                className="delete-link"
                type="button"
                disabled={!!pending}
                onClick={() => setConfirm(true)}
              >
                삭제
              </button>
            )}
          </div>
          <div>
            <button type="button" onClick={onClose}>
              취소
            </button>
            <button className="primary" disabled={!!pending || !text.trim()}>
              저장
            </button>
          </div>
        </div>
        {confirm && (
          <section className="delete-confirm" aria-label="명언 삭제 확인">
            <p>이 문구를 삭제할까요?</p>
            {last && (
              <p>
                {completed
                  ? "완료한 오늘 기록은 유지돼요. 다음 입력 전에 문구를 추가해 주세요."
                  : "마지막 문구예요. 삭제하면 문구를 추가할 때까지 입력을 시작할 수 없어요."}
              </p>
            )}
            {last && affected && !completed && (
              <p>
                오늘 기록은 보존돼요. 문구 추가 후에는 오늘의 원래 입력 문구로
                돌아가요.
              </p>
            )}
            <blockquote className="quote-delete-copy">{quote.text}</blockquote>
            <div>
              <button
                ref={cancelDelete}
                type="button"
                disabled={!!pending}
                onClick={() => setConfirm(false)}
              >
                삭제 취소
              </button>
              <button
                className="danger"
                type="button"
                disabled={!!pending}
                onClick={() => attempt("삭제 중…", onDelete)}
              >
                삭제 확인
              </button>
            </div>
          </section>
        )}
      </form>
    </Modal>
  );
}
