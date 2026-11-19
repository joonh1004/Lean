import QuoteLibrary from "./QuoteLibrary";
import React, { useState, useRef, useEffect } from "react";
import { dateKey, monthDays } from "./calendar";
import {
  createRecord,
  updateRecord,
  deleteRecord,
  loadRecords,
  saveRecords,
} from "./records";
import RecordEditor from "./RecordEditor";
import Repository from "./Repository.jsx";
import RelationChoices from "./RelationChoices";
import { linkResource, unlinkResource } from "./repository";
import "./editor.css";
export default function Workspace({ sampleTasks, sampleEvents }) {
  const sampleView =
    new URLSearchParams(location.search).get("view") === "calendar-sample";
  const [view, setView] = useState(sampleView ? "calendar" : "today"),
    [mode, setMode] = useState("할 일");
  const [month, setMonth] = useState(() =>
    sampleView
      ? new Date(2026, 7, 1)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState(
    sampleView ? null : dateKey(new Date()),
  );
  function read() {
    try {
      const timestamp = "2026-08-01T00:00:00.000Z";
      const seed = {
        version: 1,
        records: [
          ...sampleTasks.map(({ due, ...t }) => ({
            ...createRecord(
              {
                type: "task",
                title: t.title,
                date: t.date,
                subject: t.subject,
                dueDate: due ? t.date : null,
              },
              t.id,
              timestamp,
            ),
            done: t.done,
            isSample: true,
          })),
          ...sampleEvents.map((e) => ({
            ...createRecord({ type: "event", ...e }, e.id, timestamp),
            isSample: true,
          })),
        ],
      };
      return { store: loadRecords(localStorage, seed), error: "" };
    } catch {
      return {
        store: null,
        error:
          "기록을 읽거나 저장하지 못했어요. 기존 데이터는 변경하지 않았어요.",
      };
    }
  }
  const [picker, setPicker] = useState(null),
    [resourceSelection, setResourceSelection] = useState(null);
  const [data, setData] = useState(read),
    [detail, setDetail] = useState(false),
    [editor, setEditor] = useState(null);
  const opener = useRef(null),
    returnItem = useRef(null),
    dialogRoot = useRef(null),
    heading = useRef(null);
  const records = data.store?.records || [],
    tasks = records.filter((r) => r.type === "task"),
    events = records.filter((r) => r.type === "event");
  const today = dateKey(new Date()),
    days = monthDays(month.getFullYear(), month.getMonth()),
    items = mode === "할 일" ? tasks : events;
  const surface = picker
    ? "picker"
    : editor
      ? "editor"
      : detail
        ? "detail"
        : null;
  function commit(next) {
    saveRecords(localStorage, next);
    setData({ store: next, error: "" });
  }
  function toggle(item) {
    try {
      commit(updateRecord(data.store, item.id, { done: !item.done }));
    } catch {
      setData((previous) => ({
        ...previous,
        error: "저장하지 못했어요. 다시 시도해 주세요.",
      }));
    }
  }
  function edit(type, date, record, event) {
    if (!data.store) return;
    if (!detail)
      opener.current = event?.currentTarget || document.activeElement;
    returnItem.current = record?.id || null;
    setEditor({ type, date, record });
  }
  function save(draft) {
    const next = editor.record
      ? updateRecord(data.store, editor.record.id, draft)
      : {
          ...data.store,
          records: [...data.store.records, createRecord(draft)],
        };
    commit(next);
    setEditor(null);
  }
  function remove(id) {
    commit(deleteRecord(data.store, id));
    setEditor(null);
  }
  function calendar(type = "할 일") {
    const now = new Date();
    setMode(type);
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(dateKey(now));
    setDetail(false);
    setView("calendar");
  }
  useEffect(() => {
    if (view === "today") heading.current?.focus();
  }, [view]);
  useEffect(() => {
    if (!surface) {
      const fallback =
        view === "today"
          ? heading.current
          : document.querySelector(`[aria-label="${selected} 상세"]`);
      (opener.current?.isConnected ? opener.current : fallback)?.focus();
      return;
    }
    const root = dialogRoot.current;
    const item =
      surface === "detail" && returnItem.current
        ? [...root.querySelectorAll("[data-edit-id]")].find(
            (el) => el.dataset.editId === returnItem.current,
          )
        : null;
    (
      item ||
      root.querySelector("[data-autofocus]") ||
      root.querySelector("button")
    )?.focus();
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (surface === "picker") setPicker(null);
        else if (surface === "editor") setEditor(null);
        else setDetail(false);
      }
      if (e.key === "Tab") {
        const controls = [
          ...root.querySelectorAll("button,input,textarea,select"),
        ].filter((el) => !el.disabled && el.offsetParent !== null);
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [surface]);
  const move = (n) => {
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
    setSelected(null);
  };
  function add(type, date, event) {
    edit(type, date, null, event);
  }
  const addDate =
    selected ||
    days.find((day) => Number(day.slice(5, 7)) === month.getMonth() + 1);
  const stamp = records.some((r) => r.isSample) ? "샘플 포함" : "브라우저 저장";
  function row(item, context) {
    return (
      <div
        className={`${context === "detail" ? "detail-item" : "today-item"} ${item.done ? "done" : ""}`}
        key={item.id}
      >
        {item.type === "task" ? (
          <input
            type="checkbox"
            aria-label={item.title}
            checked={item.done}
            onChange={() => toggle(item)}
          />
        ) : (
          context === "today" && <time>{item.time || "종일"}</time>
        )}
        <span>
          <small>
            {item.subject}
            {context === "detail" && item.time && ` · ${item.time}`}
            {item.dueDate && ` · 마감 ${item.dueDate}`}
          </small>
          <span className="full-title">{item.title}</span>
        </span>
        <button
          className="edit-entry"
          data-edit-id={item.id}
          aria-label={`수정 ${item.title}`}
          onClick={(e) => edit(item.type, item.date, item, e)}
        >
          수정
        </button>
        {context === "detail" && (
          <div className="record-relations">
            <button
              aria-label={`자료 연결 ${item.title}`}
              onClick={() => {
                returnItem.current = item.id;
                setPicker(item);
              }}
            >
              자료 연결
            </button>
            {item.linkedRecordIds
              .map((id) => records.find((r) => r.id === id))
              .filter(
                (resource) =>
                  resource && ["note", "link"].includes(resource.type),
              )
              .map((resource) => (
                <div key={resource.id}>
                  <span>
                    <button
                      onClick={() => {
                        setResourceSelection(resource.id);
                        setDetail(false);
                        setView("repository");
                      }}
                    >
                      {resource.type === "note" ? "메모" : "링크"} ·{" "}
                      {resource.title}
                    </button>
                  </span>
                  <button
                    aria-label={`연결 해제 ${resource.title}`}
                    onClick={() => {
                      try {
                        commit(
                          unlinkResource(data.store, item.id, resource.id),
                        );
                      } catch {
                        setData((previous) => ({
                          ...previous,
                          error: "연결 해제하지 못했어요. 다시 시도해 주세요.",
                        }));
                      }
                    }}
                  >
                    연결 해제
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="shell">
      <aside inert={surface ? "" : undefined}>
        <a className="brand" href="#">
          j<span>·</span>
        </a>
        <div className="workspace-name">
          joonh<span>WORKSPACE</span>
        </div>
        <nav aria-label="주 메뉴">
          <button
            className={view === "today" ? "nav-current" : "nav-item"}
            aria-current={view === "today" ? "page" : undefined}
            onClick={() => {
              setDetail(false);
              setView("today");
            }}
          >
            오늘
          </button>
          <button
            className={view === "calendar" ? "nav-current" : "nav-item"}
            aria-current={view === "calendar" ? "page" : undefined}
            onClick={() => calendar()}
          >
            캘린더
          </button>
          <button
            className={view === "repository" ? "nav-current" : "nav-item"}
            aria-current={view === "repository" ? "page" : undefined}
            onClick={() => {
              setResourceSelection(null);
              setDetail(false);
              setView("repository");
            }}
          >
            저장소
          </button>
          <button
            className={view === "quotes" ? "nav-current" : "nav-item"}
            aria-current={view === "quotes" ? "page" : undefined}
            onClick={() => {
              setDetail(false);
              setView("quotes");
            }}
          >
            명언
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">J</div>
          <span>
            joonh<small>Personal space</small>
          </span>
        </div>
      </aside>
      <main inert={surface ? "" : undefined}>
        {data.error && (
          <p className="storage-error" role="alert">
            {data.error}
            {!data.store && (
              <button onClick={() => setData(read())}>다시 시도</button>
            )}
          </p>
        )}
        {view === "quotes" ? (
          <QuoteLibrary />
        ) : view === "today" ? (
          <section className="today-view" aria-labelledby="today-heading">
            <header className="today-header">
              <div>
                <h1 id="today-heading" ref={heading} tabIndex={-1}>
                  오늘
                </h1>
                <time dateTime={today}>{today.replaceAll("-", ". ")}</time>
              </div>
              <span className="sample">{stamp}</span>
            </header>
            <div className="today-columns">
              {[
                ["task", "할 일", tasks],
                ["event", "일정", events],
              ].map(([type, label, list]) => (
                <section
                  key={type}
                  className="today-panel"
                  aria-label={`오늘 ${label}`}
                >
                  <div className="today-panel-title">
                    <h2>{label}</h2>
                    <div className="panel-actions">
                      <button
                        aria-label={`${label} 추가`}
                        disabled={!data.store}
                        onClick={(e) => add(type, today, e)}
                      >
                        추가
                      </button>
                      <button onClick={() => calendar(label)}>캘린더</button>
                    </div>
                  </div>
                  {list.filter((r) => r.date === today).length ? (
                    list
                      .filter((r) => r.date === today)
                      .map((item) => row(item, "today"))
                  ) : (
                    <p className="empty">{label} 없음</p>
                  )}
                </section>
              ))}
            </div>
          </section>
        ) : view === "repository" ? (
          data.store ? (
            <Repository
              store={data.store}
              commit={commit}
              initialSelection={resourceSelection}
            />
          ) : (
            <p className="empty">저장소를 불러오지 못했어요.</p>
          )
        ) : (
          <section className="calendar" aria-label="월간 캘린더">
            <div className="toolbar">
              <div className="month-nav">
                <h2>
                  {month.getFullYear()}년 {month.getMonth() + 1}월
                </h2>
                <span className="sample">{stamp}</span>
                <button aria-label="이전 달" onClick={() => move(-1)}>
                  ‹
                </button>
                <button aria-label="다음 달" onClick={() => move(1)}>
                  ›
                </button>
                <button
                  className="today-btn"
                  onClick={() => {
                    const now = new Date();
                    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                    setSelected(dateKey(now));
                  }}
                >
                  오늘
                </button>
              </div>
              <div className="calendar-actions">
                <div className="tabs" role="tablist" aria-label="캘린더 종류">
                  {["할 일", "일정"].map((x) => (
                    <button
                      role="tab"
                      aria-label={x}
                      aria-selected={mode === x}
                      className={mode === x ? "active" : ""}
                      key={x}
                      onClick={() => setMode(x)}
                    >
                      {x === "할 일" ? "✓" : "◷"} <span>{x}</span>
                    </button>
                  ))}
                </div>
                <button
                  className="add-record"
                  aria-label={`${mode} 추가`}
                  disabled={!data.store}
                  onClick={(e) =>
                    add(mode === "할 일" ? "task" : "event", addDate, e)
                  }
                >
                  추가
                </button>
              </div>
            </div>
            <div className="weekdays">
              {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            <div className="grid">
              {days.map((day, index) => {
                const list = items.filter((r) => r.date === day),
                  outside = Number(day.slice(5, 7)) !== month.getMonth() + 1;
                return (
                  <button
                    key={day}
                    className={`day ${outside ? "outside" : ""} ${selected === day ? "selected" : ""} ${index % 7 === 0 ? "sunday" : ""}`}
                    aria-label={`${day} 상세`}
                    aria-pressed={selected === day}
                    onClick={(e) => {
                      opener.current = e.currentTarget;
                      returnItem.current = null;
                      setSelected(day);
                      setDetail(true);
                    }}
                  >
                    <span className={`date ${day === today ? "is-today" : ""}`}>
                      {Number(day.slice(-2))}
                    </span>
                    <span className="entries">
                      {list.slice(0, 3).map((item) => (
                        <span
                          key={item.id}
                          className={`entry ${item.done ? "done" : ""} tone-${item.subject}`}
                          title={item.title}
                        >
                          <span className="entry-mark">
                            {item.type === "task"
                              ? item.done
                                ? "☑"
                                : "□"
                              : item.time || "종일"}
                          </span>
                          <span className="entry-text">
                            <b>{item.subject}</b> {item.title}
                          </span>
                          {item.dueDate && <span className="due">마감</span>}
                        </span>
                      ))}
                      {list.length > 3 && (
                        <span className="more">+{list.length - 3}개</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>
      {surface && (
        <div
          ref={dialogRoot}
          className={`overlay ${editor || picker ? "editor-overlay" : ""}`}
          onClick={() =>
            picker
              ? setPicker(null)
              : editor
                ? setEditor(null)
                : setDetail(false)
          }
        >
          {picker ? (
            <section
              className="record-editor repo-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="relation-heading"
              onClick={(e) => e.stopPropagation()}
            >
              <RelationChoices
                store={data.store}
                owner={picker}
                onConnect={(taskId, resourceId) => {
                  commit(linkResource(data.store, taskId, resourceId));
                  setPicker(null);
                }}
                onCancel={() => setPicker(null)}
              />
            </section>
          ) : editor ? (
            <div onClick={(e) => e.stopPropagation()}>
              <RecordEditor
                key={editor.record?.id || `new-${editor.type}`}
                {...editor}
                onSave={save}
                onDelete={remove}
                onCancel={() => setEditor(null)}
              />
            </div>
          ) : (
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="detail-heading"
              className="drawer"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="drawer-top">
                <span>{mode}</span>
                <button aria-label="상세 닫기" onClick={() => setDetail(false)}>
                  ×
                </button>
              </div>
              <h2 id="detail-heading">
                {Number(selected.slice(5, 7))}월 {Number(selected.slice(-2))}일
              </h2>
              <div className="detail-count">
                <span>{items.filter((r) => r.date === selected).length}개</span>
                <button
                  className="add-record"
                  aria-label={`${mode} 추가`}
                  disabled={!data.store}
                  onClick={(e) =>
                    add(mode === "할 일" ? "task" : "event", selected, e)
                  }
                >
                  추가
                </button>
              </div>
              {data.error && (
                <p role="alert" className="field-error">
                  {data.error}
                </p>
              )}
              <div className="detail-list">
                {items
                  .filter((r) => r.date === selected)
                  .map((item) => row(item, "detail"))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
