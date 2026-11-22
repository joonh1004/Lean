import React, { lazy, Suspense } from "react";

const LocalDashboard = __LEAN_LOCAL_DASHBOARD__
  ? lazy(() => import("./LocalWorkspaceMonitor.jsx"))
  : null;

export default function WorkspaceDashboard() {
  const local =
    LocalDashboard &&
    location.protocol === "http:" &&
    location.hostname === "127.0.0.1";
  return (
    <section
      className="workspace-dashboard"
      aria-labelledby="workspace-dashboard-heading"
    >
      <h1 id="workspace-dashboard-heading">작업 대시보드</h1>
      {local ? (
        <Suspense
          fallback={<p role="status">로컬 대시보드를 확인하는 중입니다.</p>}
        >
          <LocalDashboard />
        </Suspense>
      ) : (
        <p>
          이 PC에서 실행하는 Lean에서만 작업 상태를 볼 수 있습니다. 공개
          페이지에서는 작업 상태를 읽지 않습니다.
        </p>
      )}
    </section>
  );
}
