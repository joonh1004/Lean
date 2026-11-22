const prefix = '/__lean_dashboard/';
const api = `${prefix}state`;

const roles = ['maker', 'veo', 'pi'];
const states = ['running', 'waiting', 'idle', 'completed', 'interrupted', 'unknown'];
const stages = ['Room turn', 'Queued room turn', 'Room turn settled', 'Room turn cancelled'];
const time = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
const stage = value => stages.includes(value) ? value : null;
const workers = value => typeof value === 'string' && /^(?:1 live worker|(?:[2-9]|[1-9]\d{1,3}|10000) live workers)$/.test(value) ? value : null;

function project(status) {
  if (status?.connected !== true) return { connected: false };
  if (![status.agents, status.jobs, status.events].every(Array.isArray)) throw new Error('Invalid status');
  const observedAt = time(status.observedAt);
  if (!observedAt) throw new Error('Invalid observation');
  return {
    connected: true, observedAt,
    agents: status.agents.filter(row => roles.includes(row?.id)).slice(0, 3)
      .map(({ id, state, stage: value, observedAt }) => ({ id, state: states.includes(state) ? state : 'unknown', task: null, stage: stage(value), observedAt: time(observedAt) })),
    jobs: status.jobs.filter(row => row?.id === 'maker-room-delegation' && row.owner === 'maker' && row.state === 'running').slice(0, 1)
      .map(row => ({ id: 'maker-room-delegation', owner: 'maker', state: 'running', task: 'Background delegation', stage: workers(row.stage), observedAt: time(row.observedAt) })),
    events: status.events.filter(row => row && typeof row.id === 'string' && /^[a-f0-9]{32}$/.test(row.id) && roles.includes(row.from) && roles.includes(row.to) && row.from !== row.to && time(row.at)).slice(-100)
      .map(({ id, from, to, at }) => ({ id, from, to, at, label: 'Room assignment' })),
  };
}

async function state() {
  const response = await fetch('http://127.0.0.1:8765/api/state', {
    redirect: 'error', signal: AbortSignal.timeout(3500),
  });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')) {
    await response.body?.cancel();
    throw new Error('Monitor unavailable');
  }
  const chunks = [];
  let length = 0;
  for await (const bytes of response.body) {
    length += bytes.byteLength;
    if (length > 64 * 1024) throw new Error('Status exceeds size limit');
    chunks.push(bytes);
  }
  return JSON.stringify(project(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
}

export default function workspaceDashboard() {
  return {
    name: 'lean-local-workspace-dashboard',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(prefix) && req.url?.split('?')[0] !== prefix.slice(0, -1)) return next();
        const send = (status, mime = 'text/plain', body = '') => {
          res.statusCode = status;
          res.setHeader('Content-Type', `${mime}; charset=utf-8`);
          res.end(req.method === 'HEAD' ? undefined : body);
        };
        const host = `127.0.0.1:${req.socket.localPort}`;
        const site = req.headers['sec-fetch-site'];
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        res.setHeader('Referrer-Policy', 'same-origin');
        res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; sandbox");
        // Reserve the namespace before Vite's SPA fallback; it serves JSON only.
        if (req.url !== api) return send(404);
        if (req.headers.host !== host || !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) ||
            (req.headers.origin !== undefined && req.headers.origin !== `http://${host}`) ||
            (site !== undefined && site !== 'same-origin') ||
            !req.headers.referer?.startsWith(`http://${host}/`)) return send(403);
        if (req.method !== 'GET') {
          res.setHeader('Allow', 'GET');
          return send(405);
        }
        try {
          return send(200, 'application/json', await state());
        } catch {
          return send(503);
        }
      });
    },
  };
}
