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
import "./editor.css";
const todayKey = () => dateKey(new Date());
const storageMessage =
  "이 브라우저에 저장하지 못했어. 저장 설정을 확인하고 다시 시도해줘.";
function persist(state) {
  saveQuoteState(localStorage, state);
}
function readSession(day) {
  let state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw === null ? defaultState() : parseState(raw);
  } catch {
    return {
      day,
      state: null,
      error: "저장된 문구를 읽을 수 없어. 기존 데이터는 변경하지 않았어.",
    };
  }
  state = assignDay(state, day);
  try {
    persist(state);
    return { day, state, error: "" };
  } catch {
    return { day, state, error: storageMessage };
  }
}
export default function DailyEntry({ children }) {
  const [session, setSession] = useState(() => readSession(todayKey()));
  const [managing, setManaging] = useState(false);
  function commit(next) {
    if (todayKey() !== session.day) throw new Error("Day changed; reload");
    const assigned = assignDay(next, session.day);
    saveQuoteState(localStorage, assigned, session.state);
    setSession({ ...session, state: assigned, error: "" });
  }
  useEffect(() => {
    const refresh = () => {
      const day = todayKey();
      setSession((previous) =>
        day === previous.day ? previous : readSession(day),
      );
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  function finish(input, composing) {
    const day = todayKey();
    if (day !== session.day) {
      setSession(readSession(day));
      return;
    }
    const next = completeDay(session.state, day, input, composing);
    if (next === session.state) return;
    try {
      saveQuoteState(localStorage, next, session.state);
      setSession({ ...session, state: next, error: "" });
    } catch {
      setSession({ ...session, error: storageMessage });
    }
  }
  function addFirst(text) {
    if (!text.trim()) return;
    try {
      commit(addQuote(session.state, text));
    } catch {
      setSession({ ...session, error: storageMessage });
    }
  }
  if (!session.state)
    return (
      <div className="quote-stage">
        <section className="quote-panel">
          <h1>문구 저장소</h1>
          <p role="alert">{session.error}</p>
          <button
            className="primary"
            onClick={() => setSession(readSession(todayKey()))}
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
function QuoteGate({ day, quote, error, onFinish, onAdd, onManage, sample }) {
  const [input, setInput] = useState(""),
    [composing, setComposing] = useState(false);
  const compositionRef = useRef(false),
    field = useRef(null);
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
                if (canEnter(input, quote, compositionRef.current))
                  onFinish(input, compositionRef.current);
              }}
            >
              <label htmlFor="quote-input">문구 입력</label>
              <textarea
                id="quote-input"
                ref={field}
                value={input}
                aria-describedby="quote-hint"
                onChange={(e) => setInput(e.target.value)}
                onCompositionStart={() => {
                  compositionRef.current = true;
                  setComposing(true);
                }}
                onCompositionEnd={(e) => {
                  compositionRef.current = false;
                  setComposing(false);
                  setInput(e.currentTarget.value);
                }}
              />
              <div className="quote-actions">
                <span id="quote-hint">위 문구를 그대로 입력</span>
                <button className="primary" type="submit" disabled={!matched}>
                  시작
                </button>
              </div>
            </form>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAdd(input);
            }}
          >
            <h1>첫 문구</h1>
            <p>문구를 추가해 주세요.</p>
            <label htmlFor="first-quote">문구</label>
            <textarea
              id="first-quote"
              ref={field}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="quote-actions">
              <span />
              <button className="primary" disabled={!input.trim()}>
                저장
              </button>
            </div>
          </form>
        )}
        <button className="manage-quotes" onClick={onManage}>
          명언 관리
        </button>
        {error && (
          <p className="storage-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
