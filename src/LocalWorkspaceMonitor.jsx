import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  createWorkspaceMonitor,
  pendingMonitor,
} from "./workspaceMonitorState.js";
import "./workspace-dashboard.css";

const roles = {
  maker: {
    name: "Maker",
    role: "총괄",
    x: 160,
    glyph: (
      <>
        <rect className="casing" x="7" y="7" width="78" height="78" rx="14" />
        <rect
          className="glyph-shell"
          x="16"
          y="16"
          width="60"
          height="60"
          rx="10"
        />
        <path
          className="detail"
          d="M23 32V23h9m28 0h9v9m0 28v9h-9m-28 0h-9v-9"
        />
        <path d="M46 29 63 46 46 63 29 46Z M46 37v18m-9-9h18" />
        <circle cx="46" cy="46" r="2.2" fill="currentColor" />
      </>
    ),
  },
  veo: {
    name: "Veo",
    role: "시각 검토",
    x: 480,
    glyph: (
      <>
        <circle className="casing" cx="46" cy="46" r="39" />
        <circle className="glyph-shell" cx="46" cy="46" r="30" />
        <path className="detail" d="M46 14v9m0 46v9m32-32h-9m-46 0h-9" />
        <path d="M28 46c10-16 26-16 36 0-10 16-26 16-36 0Z" />
        <circle cx="46" cy="46" r="6" />
        <circle cx="46" cy="46" r="2" fill="currentColor" />
      </>
    ),
  },
  pi: {
    name: "Pi",
    role: "구현·검증",
    x: 800,
    glyph: (
      <>
        <path className="casing" d="M46 6 81 26v40L46 86 11 66V26Z" />
        <path className="glyph-shell" d="M46 14 74 30v32L46 78 18 62V30Z" />
        <path className="detail" d="M45 20 25 32m42 28L46 72" />
        <path d="m33 38 9 8-9 8m14 0h12" />
      </>
    ),
  },
};
const roleEntries = Object.entries(roles);
const states = {
  running: "실행 중",
  waiting: "대기 중",
  idle: "유휴",
  completed: "완료",
  interrupted: "중단됨",
  unknown: "알 수 없음",
};
const zone = "Asia/Seoul";
const clock = {
  timeZone: zone,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
};
const dateFormat = new Intl.DateTimeFormat("sv-SE", {
  ...clock,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("ko-KR", clock);
const format = (iso, formatter = dateFormat) =>
  Number.isFinite(Date.parse(iso)) ? formatter.format(new Date(iso)) : "—";
const stateOf = (value) => (Object.hasOwn(states, value) ? value : "unknown");
const motionQuery = "(prefers-reduced-motion: reduce)";

function useMonitorStatus() {
  const [status, setStatus] = useState(pendingMonitor);
  useEffect(() => {
    const update = createWorkspaceMonitor();
    const lifecycle = new AbortController();
    let nextPoll;
    async function poll() {
      const request = new AbortController();
      const stop = () => request.abort();
      lifecycle.signal.addEventListener("abort", stop, { once: true });
      const deadline = setTimeout(stop, 4000);
      let snapshot = null;
      try {
        const response = await fetch("/__lean_dashboard/state", {
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "same-origin",
          redirect: "error",
          signal: request.signal,
        });
        if (
          response.ok &&
          response.headers.get("content-type")?.startsWith("application/json")
        ) {
          snapshot = await response.json();
        }
      } catch {
        // Transport failure is unknown status, not an interrupted room turn.
      } finally {
        clearTimeout(deadline);
        lifecycle.signal.removeEventListener("abort", stop);
      }
      if (lifecycle.signal.aborted) return;
      setStatus(update(snapshot));
      nextPoll = setTimeout(poll, 2000);
    }
    poll();
    return () => {
      lifecycle.abort();
      clearTimeout(nextPoll);
    };
  }, []);
  return status;
}

function Badge({ state }) {
  return (
    <span className="status" data-state={state}>
      {states[state]}
    </span>
  );
}

function LastObservation({ record, className }) {
  return (
    <p className={className}>
      마지막 관측 · {states[stateOf(record.state)]} ·{" "}
      <time dateTime={record.observedAt ?? undefined}>
        {format(record.observedAt)}
      </time>
    </p>
  );
}

function Agent({ id, role, record, live }) {
  const state = live ? stateOf(record?.state) : "unknown";
  return (
    <article
      className="agent"
      data-agent={id}
      data-role={id}
      data-state={state}
    >
      <div className="orbit" aria-hidden="true">
        <span className="ripple" />
        <svg className="glyph" viewBox="0 0 92 92">
          {role.glyph}
        </svg>
      </div>
      <div className="agent-title">
        <h4>{role.name}</h4>
        <p>{role.role}</p>
      </div>
      <div className="agent-info">
        <Badge state={state} />
        <dl className="kv">
          <dt>단계</dt>
          <dd>{record?.stage ?? "—"}</dd>
        </dl>
        {!live && record && (
          <LastObservation record={record} className="last-agent" />
        )}
      </div>
    </article>
  );
}

function Pulse({ event }) {
  const motion = useRef(null);
  const [active, setActive] = useState(() => !matchMedia(motionQuery).matches);
  useLayoutEffect(() => {
    if (!active) return;
    const preference = matchMedia(motionQuery);
    const stop = () => setActive(false);
    if (preference.matches || !motion.current?.beginElement) {
      stop();
      return;
    }
    motion.current.beginElement();
    const timer = setTimeout(stop, 1000);
    preference.addEventListener("change", stop);
    return () => {
      clearTimeout(timer);
      preference.removeEventListener("change", stop);
    };
  }, [active]);
  if (!active) return null;
  const from = roles[event.from].x;
  const to = roles[event.to].x;
  const direction = Math.sign(to - from);
  const start = from + direction * 58;
  const end = to - direction * 58;
  const path =
    Math.abs(to - from) > 320
      ? `M${start} 70 Q${(start + end) / 2} -25 ${end} 70`
      : `M${start} 70 H${end}`;
  return (
    <g className="pulse" data-pulse-id={event.id}>
      <path d="M-11 -3H2v-4l10 7-10 7V3h-13Z" />
      <animateMotion
        ref={motion}
        path={path}
        begin="indefinite"
        dur="1s"
        rotate="auto"
        fill="freeze"
      />
    </g>
  );
}

function PanelHeading({ index, id, label, children }) {
  return (
    <header className="panel-heading">
      <div>
        <p className="section-index">{index}</p>
        <h3 id={id}>{label}</h3>
      </div>
      {children}
    </header>
  );
}

function History({ history }) {
  return (
    <section className="panel timeline" aria-labelledby="lean-monitor-history">
      <PanelHeading
        index="02 / 전달 흐름"
        id="lean-monitor-history"
        label="인계 기록"
      >
        <span className="sort-note">최신순</span>
      </PanelHeading>
      <div
        className="history-window"
        role="region"
        tabIndex={0}
        aria-label="인계 기록 목록"
      >
        {history.length ? (
          <ol className="history">
            {history.map((event) => (
              <li key={event.id}>
                <span className="event-tick" aria-hidden="true" />
                <div>
                  <div className="event-meta">
                    <span>
                      {roles[event.from].name} → {roles[event.to].name}
                    </span>
                    <time
                      className="event-time"
                      dateTime={event.at}
                      title={`${format(event.at)} KST`}
                    >
                      {format(event.at, timeFormat)}
                    </time>
                  </div>
                  <p className="event-label">Room assignment</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">표시할 인계 기록이 없습니다.</p>
        )}
      </div>
      <p className="timeline-foot">인계 방향은 보낸 역할 → 받은 역할입니다.</p>
    </section>
  );
}

function Delegation({ jobs, live }) {
  return (
    <section className="panel jobs-panel" aria-labelledby="lean-monitor-jobs">
      <PanelHeading
        index="03 / 별도 실행"
        id="lean-monitor-jobs"
        label="백그라운드 작업"
      >
        <span className="sort-note">소유자 기준</span>
      </PanelHeading>
      <div className="job-groups">
        {roleEntries.map(([id, role]) => {
          const owned = jobs.filter((job) => job.owner === id);
          return (
            <section
              className="job-group"
              data-role={id}
              aria-labelledby={`lean-monitor-job-${id}`}
              key={id}
            >
              <h4 id={`lean-monitor-job-${id}`}>{role.name}</h4>
              {owned.length ? (
                <ul className="job-list">
                  {owned.map((job) => (
                    <li key={job.id}>
                      <div className="job-line">
                        <p className="job-task">Background delegation</p>
                        <Badge state={live ? stateOf(job.state) : "unknown"} />
                      </div>
                      <p className="job-stage">단계 · {job.stage ?? "—"}</p>
                      {!live && (
                        <LastObservation record={job} className="last-job" />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="job-empty">
                  {live ? "관측된 작업 없음" : "현재 작업을 확인할 수 없음"}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

export default function LocalWorkspaceMonitor() {
  const { connection, observedAt, agents, jobs, history, handoffs } =
    useMonitorStatus();
  const live = connection === "live";
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  return (
    <div className="lean-monitor" data-connection={connection}>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <div className="monitor-brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M3 13h4l3-7 3.5 12 3-5H21" />
              </svg>
            </span>
            워크스페이스
          </div>
          <div className="top-meta">
            <span className="connection" role="status">
              <i aria-hidden="true" />
              {live
                ? "연결됨"
                : connection === "offline"
                  ? "연결 끊김"
                  : "연결 확인 중"}
            </span>
            <span className="updated">
              마지막 갱신{" "}
              <time dateTime={observedAt ?? undefined}>
                {format(observedAt)}
              </time>
              <span className="zone">KST</span>
            </span>
          </div>
        </div>
      </header>
      <div className="wrap">
        <div className="page-intro">
          <div>
            <p className="intro-kicker">
              <span aria-hidden="true" /> 작업 관제
            </p>
            <h2>작업 흐름</h2>
          </div>
          {connection === "offline" && (
            <p className="offline-note">
              {observedAt
                ? "현재 상태를 확인할 수 없어 마지막 관측 내용을 표시합니다."
                : "워크스페이스의 현재 상태를 확인할 수 없습니다."}
            </p>
          )}
        </div>
        <div className="main-grid">
          <section className="panel flow" aria-labelledby="lean-monitor-flow">
            <PanelHeading
              index="01 / 작업 노드"
              id="lean-monitor-flow"
              label="역할별 상태"
            >
              <span className="flow-key">
                <i aria-hidden="true" /> 확인된 실행
              </span>
            </PanelHeading>
            <div className="scene">
              <svg
                className="links"
                viewBox="0 0 960 140"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path className="track" d="M160 70H800" />
                <path
                  className="ticks"
                  d="M240 65v10 M320 65v10 M400 65v10 M560 65v10 M640 65v10 M720 65v10"
                />
                {live &&
                  handoffs.map((event) => (
                    <Pulse key={event.id} event={event} />
                  ))}
              </svg>
              <div className="nodes">
                {roleEntries.map(([id, role]) => (
                  <Agent
                    key={id}
                    id={id}
                    role={role}
                    record={agentById.get(id)}
                    live={live}
                  />
                ))}
              </div>
            </div>
          </section>
          <History history={history} />
        </div>
        <Delegation jobs={jobs} live={live} />
        <footer className="footer">
          <span>워크스페이스 관제</span>
          <span>관측 시각 · 한국 표준시</span>
        </footer>
      </div>
    </div>
  );
}
