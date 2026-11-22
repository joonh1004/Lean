import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { dateKey } from "./calendar";
import {
  STORAGE_KEY,
  defaultState,
  assignDay,
  canEnter,
  completeDay,
  parseState,
  addQuote,
  saveQuoteState,
} from "./quotes";
import QuoteLibrary from "./QuoteLibrary";
import { QuoteContext } from "./QuoteContext";
import { localWrite, workspaceStorage } from "./workspaceStorage.js";
import { usePendingSubmission } from "./useEditorSession.js";
import "./editor.css";
const todayKey = () => dateKey(new Date());
const storageMessage =
  "이 브라우저에 저장하지 못했어. 저장 설정을 확인하고 다시 시도해줘.";
function readSession(day) {
  let state;
  let raw;
  try {
    raw = workspaceStorage.getItem(STORAGE_KEY);
    state = raw === null ? defaultState() : parseState(raw);
  } catch {
    return {
      day,
      state: null,
      error: "저장된 문구를 읽을 수 없어. 기존 데이터는 변경하지 않았어.",
    };
  }
  const assigned = assignDay(state, day);
  try {
    if (raw === null || assigned !== state) saveQuoteState(workspaceStorage, assigned);
    return { day, state: assigned, error: "" };
  } catch {
    return { day, state: assigned, error: storageMessage };
  }
}
export default function DailyEntry({ children }) {
  const [session, setSession] = useState(null);
  const [managing, setManaging] = useState(false);
  const requestedDay = useRef(null);
  async function refresh(force = false) {
    const day = todayKey();
    if (!force && requestedDay.current === day) return;
    requestedDay.current = day;
    let next;
    try { next = await localWrite(() => readSession(day)); }
    catch { next = { day, state: null, error: '작업공간을 열 수 없어요. 이 탭을 새로고침해 주세요.' }; }
    if (requestedDay.current === day) setSession(next);
  }
  async function commit(next) {
    const assigned = assignDay(next, session.day);
    await localWrite(() => {
      if (todayKey() !== session.day) throw new Error("Day changed; reload");
      saveQuoteState(workspaceStorage, assigned, session.state);
    });
    setSession(current => current?.day === session.day ? { ...session, state: assigned, error: "" } : current);
  }
  useEffect(() => {
    const checkDay = () => { void refresh(); };
    checkDay();
    const timer = setInterval(checkDay, 15000);
    window.addEventListener("focus", checkDay);
    document.addEventListener("visibilitychange", checkDay);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", checkDay);
      document.removeEventListener("visibilitychange", checkDay);
    };
  }, []);
  async function finish(input, composing) {
    const day = todayKey();
    if (day !== session.day) {
      await refresh();
      return;
    }
    const next = completeDay(session.state, day, input, composing);
    if (next === session.state) return;
    await commit(next);
  }
  async function addFirst(text) {
    if (!text.trim()) return;
    await commit(addQuote(session.state, text));
  }
  function reportStorageError() {
    setSession(current => current?.day === session.day ? { ...current, error: storageMessage } : current);
  }
  if (!session) return null;
  if (!session.state)
    return (
      <div className="quote-stage">
        <section className="quote-panel">
          <h1>문구 저장소</h1>
          <p role="alert">{session.error}</p>
          <button
            className="primary"
            onClick={() => refresh(true)}
          >
            다시 시도
          </button>
        </section>
      </div>
    );
  const shared = { state: session.state, day: session.day, commit };
  if (session.state.days[session.day]?.completed)
    return (
      <QuoteContext.Provider value={shared}>{children}</QuoteContext.Provider>
    );
  if (managing)
    return (
      <QuoteContext.Provider value={shared}>
        <div className="shell quote-manager-shell">
          <main className="quote-manager-stage">
            <QuoteLibrary onReturn={() => setManaging(false)} />
          </main>
        </div>
      </QuoteContext.Provider>
    );
  return (
    <QuoteGate
      key={session.day}
      day={session.day}
      quote={
        session.state.quotes.length
          ? session.state.days[session.day]?.text
          : undefined
      }
      error={session.error}
      onStorageError={reportStorageError}
      onFinish={finish}
      onAdd={addFirst}
      onManage={() => setManaging(true)}
      sample={
        session.state.quotes.length > 0 &&
        defaultState().quotes.some(
          (q) =>
            q.id === session.state.days[session.day]?.id &&
            q.text === session.state.days[session.day]?.text,
        )
      }
    />
  );
}
function fitTextarea(element) {
  if (!element) return;
  element.style.height = "auto";
  const style = getComputedStyle(element);
  const contentHeight =
    element.scrollHeight +
    parseFloat(style.borderTopWidth) +
    parseFloat(style.borderBottomWidth);
  element.style.height = `${Math.min(240, Math.max(112, contentHeight))}px`;
  element.style.overflowY = contentHeight > 240 ? "auto" : "hidden";
}
function QuoteGate({
  day, quote, error, onStorageError, onFinish, onAdd, onManage, sample,
}) {
  const [input, setInput] = useState(""),
    [composing, setComposing] = useState(false);
  const { pending, isPending, run } = usePendingSubmission();
  const compositionRef = useRef(false),
    field = useRef(null);
  function updateInput(e) {
    if (!isPending()) setInput(e.currentTarget.value);
  }
  useLayoutEffect(() => {
    fitTextarea(field.current);
  }, [input, quote]);
  useEffect(() => {
    const resize = () => fitTextarea(field.current);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    setInput("");
    field.current?.focus();
  }, [quote]);
  const matched = canEnter(input, quote || "", composing);
  return (
    <div className="quote-stage">
      <section className="quote-panel" aria-label="오늘의 문구">
        <div className="quote-meta">
          <time dateTime={day}>{day.replaceAll("-", ". ")}</time>
          {sample && <span className="sample">샘플</span>}
        </div>
        {quote ? (
          <>
            <blockquote>{quote}</blockquote>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canEnter(input, quote, compositionRef.current)) {
                  void run(
                    "저장 중…",
                    () => onFinish(input, compositionRef.current),
                    onStorageError,
                  );
                }
              }}
            >
              <label htmlFor="quote-input">문구 입력</label>
              <textarea
                id="quote-input"
                ref={field}
                value={input}
                aria-describedby="quote-hint"
                disabled={!!pending}
                onChange={updateInput}
                onCompositionStart={() => {
                  if (isPending()) return;
                  compositionRef.current = true;
                  setComposing(true);
                }}
                onCompositionEnd={(e) => {
                  compositionRef.current = false;
                  setComposing(false);
                  updateInput(e);
                }}
              />
              <div className="quote-actions">
                <span id="quote-hint">위 문구를 그대로 입력</span>
                <button
                  className="primary"
                  type="submit"
                  disabled={!!pending || !matched}
                >
                  시작
                </button>
              </div>
            </form>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) void run("저장 중…", () => onAdd(input), onStorageError);
            }}
          >
            <h1>첫 문구</h1>
            <p>문구를 추가해 주세요.</p>
            <label htmlFor="first-quote">문구</label>
            <textarea
              id="first-quote"
              ref={field}
              value={input}
              disabled={!!pending}
              onChange={updateInput}
            />
            <div className="quote-actions">
              <span />
              <button className="primary" disabled={!!pending || !input.trim()}>
                저장
              </button>
            </div>
          </form>
        )}
        <button
          className="manage-quotes"
          disabled={!!pending}
          onClick={() => {
            if (!isPending()) onManage();
          }}
        >
          명언 관리
        </button>
        {pending && <p role="status">{pending}</p>}
        {!pending && error && (
          <p className="storage-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
