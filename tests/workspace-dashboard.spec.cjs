const { test, expect } = require("@playwright/test");
const base = process.env.LEAN_TEST_URL || "http://127.0.0.1:5173";

async function enter(page, url) {
  await page.goto(url);
  await page
    .getByRole("textbox", { name: "문구 입력" })
    .fill(await page.getByRole("blockquote").innerText());
  await page.getByRole("button", { name: "시작", exact: true }).click();
}

async function openDashboard(page, url = base) {
  await enter(page, url);
  await selectDashboard(page);
}

async function selectDashboard(page) {
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("button", { name: "작업 대시보드" })
    .click();
}

test("작업 대시보드 follows 명언 in the menu and in Tab order", async ({
  page,
}) => {
  await enter(page, base);
  const menu = page.getByRole("navigation", { name: "주 메뉴" });
  await expect(menu.getByRole("button")).toHaveText([
    "오늘",
    "캘린더",
    "저장소",
    "명언",
    "작업 대시보드",
  ]);
  await menu.getByRole("button", { name: "명언" }).focus();
  await page.keyboard.press("Tab");
  const dashboard = menu.getByRole("button", { name: "작업 대시보드" });
  await expect(dashboard).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dashboard).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("main").getByRole("heading", { name: "작업 대시보드" }),
  ).toBeVisible();
});

const monitorPath = "/__lean_dashboard/";

test("Lean retires the standalone dashboard document and all executable asset routes", async ({
  request,
}) => {
  const retired = [
    "",
    "index.html",
    "monitor.js",
    "monitor-state.js",
    "monitor.css",
  ].map((file) => monitorPath + file);
  for (const path of [monitorPath.slice(0, -1), ...retired]) {
    const result = await request.get(base + path);
    expect(result.status(), path).toBe(404);
  }
});

test("local dashboard renders the live, read-only Workspace monitor in main", async ({
  page,
}) => {
  test.skip(
    !process.env.LEAN_DASHBOARD_LIVE,
    "Requires the live loopback Workspace monitor",
  );
  const reads = [];
  page.on("request", (request) => {
    if (request.url().startsWith(base + monitorPath)) reads.push(request.url());
  });
  await enter(page, base);
  expect(reads).toEqual([]);
  const result = page.waitForResponse(
    (r) => r.url() === base + monitorPath + "state",
  );
  await selectDashboard(page);
  expect((await result).status()).toBe(200);
  const frame = page.getByRole("main");
  await expect(frame.getByRole("heading", { name: "작업 흐름" })).toBeVisible();
  await expect(frame.getByText("연결됨", { exact: true })).toBeVisible();
  await expect(
    frame.getByRole("heading", { name: "역할별 상태" }),
  ).toBeVisible();
  await expect(
    frame.getByRole("region", { name: "인계 기록 목록" }),
  ).toBeVisible();
  await expect(frame.locator("iframe")).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "명언" })
    .click();
  await expect(frame.getByRole("heading", { name: "작업 흐름" })).toHaveCount(
    0,
  );
  await expect(page.locator("main iframe")).toHaveCount(0);
  const count = reads.length;
  await page.waitForTimeout(2300);
  expect(reads).toEqual(Array(count).fill(base + monitorPath + "state"));
});

test("bridge rejects cross-origin, wrong Host, non-read requests and routes outside its allowlist", async ({
  request,
}) => {
  const url = base + monitorPath;
  const headers = { Referer: base + "/" };
  for (const [path, options, code] of [
    [
      "state",
      { headers: { ...headers, Origin: "https://public.example.invalid" } },
      403,
    ],
    ["state", { headers: { ...headers, "Sec-Fetch-Site": "same-site" } }, 403],
    ["state", { headers: { ...headers, Host: "public.example.invalid" } }, 403],
    ["state", { headers: { Referer: "https://public.example.invalid/" } }, 403],
    ["state", { method: "POST", headers }, 405],
    ["state", { method: "HEAD", headers }, 405],
    ["state", {}, 403],
    ["state?extra=1", { headers: { Referer: url } }, 404],
    ["status_server.py", {}, 404],
  ]) {
    const response = await request.fetch(url + path, options);
    expect(response.status()).toBe(code);
    expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
  }
});

test("initial status failure shows disconnected without implying current activity", async ({
  page,
}) => {
  await page.route(base + monitorPath + "state", (route) =>
    route.fulfill({ status: 503 }),
  );
  await openDashboard(page);
  await expect(page.getByRole("status")).toHaveText("연결 끊김");
  await expect(
    page.getByText("워크스페이스의 현재 상태를 확인할 수 없습니다."),
  ).toBeVisible();
  await expect(page.locator("main iframe")).toHaveCount(0);
});

test("synthetic state: live animation stops on backend failure", async ({
  page,
}) => {
  let offline = false;
  await page.route(base + monitorPath + "state", (route) =>
    offline
      ? route.fulfill({ status: 503 })
      : route.fulfill({
          json: {
            connected: true,
            observedAt: "2026-08-13T01:00:00.000Z",
            jobs: [],
            events: [],
            agents: [
              {
                id: "maker",
                state: "running",
                stage: "Room turn",
                observedAt: "2026-08-13T01:00:00.000Z",
              },
            ],
          },
        }),
  );
  await openDashboard(page);
  const frame = page.locator(".lean-monitor");
  const ripple = frame.locator('.agent[data-agent="maker"] .ripple');
  await expect(frame.getByText("Room turn", { exact: true })).toBeVisible();
  await expect(ripple).toHaveCSS("animation-name", "lean-monitor-heartbeat");
  offline = true;
  await expect(frame.getByText("연결 끊김")).toBeVisible({ timeout: 6000 });
  await expect(frame.getByText(/마지막 관측 · 실행 중/)).toBeVisible();
  await expect(ripple).toHaveCSS("animation-name", "none");
  await expect(frame.locator("[data-pulse-id]")).toHaveCount(0);
});

const observedAt = "2026-08-13T01:00:00.000Z";
const [initial, missed, fresh] = ["a", "b", "c"].map((letter) =>
  letter.repeat(32),
);
const assignment = (id, minute) => ({
  id,
  from: "pi",
  to: "maker",
  at: `2026-08-13T01:0${minute}:00.000Z`,
  label: "Room assignment",
});
const snapshot = (...events) => ({
  connected: true,
  observedAt,
  events,
  agents: [{ id: "maker", state: "idle", stage: "Room turn", observedAt }],
  jobs: [
    {
      id: "maker-room-delegation",
      owner: "maker",
      state: "running",
      stage: "2 live workers",
      observedAt,
    },
  ],
});

test("reconnect backfills silently; only a new matching-label assignment animates in its recorded direction", async ({
  page,
}) => {
  let payload = snapshot(assignment(initial, 0));
  let reads = 0;
  await page.route(base + monitorPath + "state", (route) => {
    reads++;
    return payload
      ? route.fulfill({ json: payload })
      : route.fulfill({ status: 503 });
  });
  await page.addInitScript(() => {
    window.dashboardPulses = [];
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const pulses = node.matches("[data-pulse-id]")
            ? [node]
            : node.querySelectorAll("[data-pulse-id]");
          for (const pulse of pulses)
            window.dashboardPulses.push(pulse.getAttribute("data-pulse-id"));
        }
    }).observe(document, { childList: true, subtree: true });
  });
  await openDashboard(page);
  const motion = () => page.evaluate(() => window.dashboardPulses);
  const history = page.getByRole("region", { name: "인계 기록 목록" });
  const maker = page.locator('.lean-monitor .agent[data-agent="maker"]');
  const jobs = page.getByRole("region", { name: "백그라운드 작업" });
  await expect(maker.getByText("유휴", { exact: true })).toBeVisible();
  await expect(
    jobs.getByText("2 live workers", { exact: false }),
  ).toBeVisible();
  await expect(jobs.getByText("실행 중", { exact: true })).toBeVisible();
  await expect(maker.locator(".ripple")).toHaveCSS("animation-name", "none");
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
  expect(await motion()).toEqual([]);
  payload = null;
  await expect(page.getByText("연결 끊김", { exact: true })).toBeVisible();
  await expect(maker.getByText(/마지막 관측 · 유휴/)).toBeVisible();
  await expect(
    jobs.getByText("2 live workers", { exact: false }),
  ).toBeVisible();
  payload = snapshot(assignment(initial, 0), assignment(missed, 1));
  await expect(history.getByRole("listitem")).toHaveCount(2);
  expect(await motion()).toEqual([]);
  payload = snapshot(
    assignment(initial, 0),
    assignment(missed, 1),
    assignment(fresh, 2),
  );
  const pulse = page.locator(`[data-pulse-id="${fresh}"]`);
  await pulse.waitFor({ state: "visible" });
  const [before, after] = await pulse.evaluate(async (arrow) => {
    const x = arrow.getCTM().e;
    await new Promise((resolve) => setTimeout(resolve, 160));
    return [x, arrow.getCTM().e];
  });
  expect(after).toBeLessThan(before);
  await expect(history.getByRole("listitem")).toHaveCount(3);
  await expect(history.getByRole("listitem").first()).toContainText(
    "Pi → Maker",
  );
  await expect(pulse).toHaveCount(0);
  const previousReads = reads;
  await expect.poll(() => reads).toBeGreaterThan(previousReads);
  expect(await motion()).toEqual([fresh]);
  await expect(history.getByRole("listitem")).toHaveCount(3);
});

test("reduced motion preserves confirmed status and new history without pulses", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let events = [];
  await page.route(base + monitorPath + "state", (route) => {
    const payload = snapshot(...events);
    payload.agents[0].state = "running";
    return route.fulfill({ json: payload });
  });
  await openDashboard(page);
  await expect(page.getByText("연결됨", { exact: true })).toBeVisible();
  await expect(
    page.locator('.lean-monitor .agent[data-agent="maker"] .ripple'),
  ).toHaveCSS("animation-name", "none");
  events = [assignment(initial, 0)];
  await expect(
    page
      .getByRole("region", { name: "인계 기록 목록" })
      .getByText("Pi → Maker"),
  ).toBeVisible();
  await expect(page.locator("[data-pulse-id]")).toHaveCount(0);
});

test("static loopback preview still makes no monitor requests", async ({
  page,
}) => {
  const staticUrl = process.env.LEAN_DASHBOARD_STATIC_URL;
  test.skip(!staticUrl, "Requires the built static output");
  const requests = [];
  page.on("request", (request) => requests.push(new URL(request.url())));
  await enter(page, staticUrl);
  await page.waitForLoadState("networkidle");
  const beforeDashboard = requests.length;
  await selectDashboard(page);
  await expect(
    page.getByText(/공개 페이지에서는 작업 상태를 읽지 않습니다/),
  ).toBeVisible();
  await expect(page.locator("main iframe, main .lean-monitor")).toHaveCount(0);
  await page.waitForTimeout(2200);
  expect(requests.slice(beforeDashboard)).toEqual([]);
  expect(
    requests.filter(
      (url) =>
        url.origin !== new URL(staticUrl).origin ||
        url.pathname.includes(monitorPath) ||
        url.pathname === "/api/state",
    ),
  ).toEqual([]);
});

test("static build displays a public-safe explanation and makes no monitor requests", async ({
  page,
}) => {
  const staticUrl = process.env.LEAN_DASHBOARD_STATIC_URL;
  test.skip(
    !staticUrl,
    "Serve npm run build -- --base ./ with a static server first",
  );
  const publicOrigin = "https://lean.example.invalid";
  const publicPath = "/lean/";
  await page.route(`${publicOrigin}${publicPath}**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.includes(monitorPath)) return route.abort();
    await route.fulfill({
      response: await route.fetch({
        url: new URL(pathname.slice(publicPath.length), staticUrl).href,
      }),
    });
  });
  const requests = [];
  page.on("request", (request) => requests.push(new URL(request.url())));
  await enter(page, publicOrigin + publicPath);
  await page.waitForLoadState("networkidle");
  const beforeDashboard = requests.length;
  await selectDashboard(page);
  await expect(
    page.getByText(/공개 페이지에서는 작업 상태를 읽지 않습니다/),
  ).toBeVisible();
  await expect(page.locator("main iframe")).toHaveCount(0);
  await page.waitForTimeout(2200);
  expect(requests.slice(beforeDashboard)).toEqual([]);
  expect(
    requests.filter(
      (url) =>
        url.origin !== publicOrigin ||
        url.pathname.includes(monitorPath) ||
        url.pathname === "/api/state",
    ),
  ).toEqual([]);
});
