import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createWorkspaceMonitor } from "../src/workspaceMonitorState.js";
import workspaceDashboard from "../tools/workspace-dashboard.js";
import viteConfig from "../vite.config.js";

const observedAt = "2026-08-13T01:00:00.000Z";
const id = "a".repeat(32);

function install() {
  let handle;
  workspaceDashboard().configureServer({
    middlewares: {
      use(fn) {
        handle = fn;
      },
    },
  });
  return async (url = "/__lean_dashboard/state") => {
    const headers = new Map();
    const req = {
      method: "GET",
      url,
      socket: { localPort: 5173, remoteAddress: "127.0.0.1" },
      headers: {
        host: "127.0.0.1:5173",
        referer: "http://127.0.0.1:5173/",
        "sec-fetch-site": "same-origin",
      },
    };
    const res = {
      setHeader(name, value) {
        headers.set(name, value);
      },
    };
    res.end = (body) => {
      res.body = body;
    };
    await handle(req, res, () => assert.fail("Unexpected Vite fallback"));
    return { status: res.statusCode, body: res.body, headers };
  };
}

test("the local bridge fetches fixed read-only JSON and returns only the projected contract", async (t) => {
  const privateText = "synthetic private field";
  const upstream = t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      connected: true,
      observedAt,
      logs: [privateText],
      agents: [
        {
          id: "maker",
          state: "running",
          task: privateText,
          stage: "Room turn",
          observedAt,
        },
        {
          id: "veo",
          state: privateText,
          stage: privateText,
          observedAt: privateText,
        },
        { id: "unseated", state: "running" },
      ],
      jobs: [
        {
          id: "maker-room-delegation",
          owner: "maker",
          state: "running",
          task: privateText,
          stage: "2 live workers",
          observedAt,
        },
        {
          id: "unrelated",
          owner: "maker",
          state: "running",
          stage: privateText,
        },
      ],
      events: [
        {
          id,
          from: "maker",
          to: "pi",
          at: observedAt,
          label: privateText,
          text: privateText,
        },
        { id: "unknown", from: "maker", to: "pi", at: observedAt },
      ],
    }),
  );
  const response = await install()();
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("Content-Type"),
    "application/json; charset=utf-8",
  );
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(
    response.headers.get("Cross-Origin-Resource-Policy"),
    "same-origin",
  );
  assert.deepEqual(JSON.parse(response.body), {
    connected: true,
    observedAt,
    agents: [
      {
        id: "maker",
        state: "running",
        task: null,
        stage: "Room turn",
        observedAt,
      },
      {
        id: "veo",
        state: "unknown",
        task: null,
        stage: null,
        observedAt: null,
      },
    ],
    jobs: [
      {
        id: "maker-room-delegation",
        owner: "maker",
        state: "running",
        task: "Background delegation",
        stage: "2 live workers",
        observedAt,
      },
    ],
    events: [
      { id, from: "maker", to: "pi", at: observedAt, label: "Room assignment" },
    ],
  });
  assert.equal(upstream.mock.callCount(), 1);
  const [url, options] = upstream.mock.calls[0].arguments;
  assert.equal(url, "http://127.0.0.1:8765/api/state");
  assert.equal(options.method ?? "GET", "GET");
  assert.equal(options.redirect, "error");
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.headers, undefined);
});

test("the bridge fails closed on wrong MIME, malformed or oversized upstream responses", async (t) => {
  let upstream;
  t.mock.method(globalThis, "fetch", async () => upstream);
  const request = install();
  for (const body of [
    new Response("not JSON"),
    Response.json({ connected: true }),
    Response.json({ connected: false, extra: "a".repeat(64 * 1024) }),
  ]) {
    upstream = body;
    const response = await request();
    assert.equal(response.status, 503);
    assert.equal(response.body, "");
  }
  upstream = Response.json({
    connected: false,
    error: "synthetic upstream detail",
  });
  assert.equal((await request()).body, '{"connected":false}');
});

test("the project does not widen Vite file access to a parent workspace", () => {
  const config = viteConfig({ mode: "development" });
  const root = fileURLToPath(new URL("../", import.meta.url));
  assert.deepEqual(
    config.server.fs.allow.map((directory) => path.resolve(directory)),
    [path.resolve(root)],
  );
  assert.notEqual(config.server.fs.strict, false);
});

test("static build omits the status client even under a development NODE_ENV", (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const out = mkdtempSync(
    path.join(process.env.TMPDIR || tmpdir(), "lean-dashboard-build-"),
  );
  t.after(() => rmSync(out, { recursive: true, force: true }));
  execFileSync(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "build",
      "--base",
      "./",
      "--outDir",
      out,
      "--emptyOutDir",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "development",
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
      },
    },
  );
  const assets = path.join(out, "assets");
  for (const file of readdirSync(assets)) {
    assert.doesNotMatch(file, /LocalWorkspaceMonitor/);
    if (file.endsWith(".js")) {
      assert.doesNotMatch(
        readFileSync(path.join(assets, file), "utf8"),
        /__lean_dashboard\/state|127\.0\.0\.1:8765/,
      );
    }
  }
});

test("observation history preserves IDs across disconnects and poll windows", () => {
  const consume = createWorkspaceMonitor();
  const a = { id, at: observedAt };
  const b = { id: "b".repeat(32), at: "2026-08-13T01:01:00.000Z" };
  const c = { ...b, id: "c".repeat(32) };
  const status = (...events) => ({
    connected: true,
    observedAt,
    agents: [],
    jobs: [],
    events,
  });
  assert.deepEqual(consume(status(a, a)).handoffs, []);
  assert.deepEqual(consume(status()).history, [a]);
  assert.deepEqual(consume(null).history, [a]);
  assert.deepEqual(consume(status(b)).handoffs, []);
  assert.deepEqual(consume(status(c, a, b, c)).handoffs, [c]);
  const current = consume(status());
  assert.equal(current.history.length, 3);
  assert.deepEqual(current.handoffs, []);
});
