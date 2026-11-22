export const pendingMonitor = {
  connection: "pending",
  observedAt: null,
  agents: [],
  jobs: [],
  history: [],
  handoffs: [],
};

// Consume only the bridge's projected status. A disconnect makes the last
// observation historical; the first connected snapshot (also after reconnect)
// fills the history without replaying motion.
export function createWorkspaceMonitor() {
  const seen = new Set();
  let status = pendingMonitor;
  return (snapshot) => {
    const valid =
      snapshot?.connected === true &&
      Number.isFinite(Date.parse(snapshot.observedAt)) &&
      [snapshot.agents, snapshot.jobs, snapshot.events].every(Array.isArray);
    if (!valid) {
      status = { ...status, connection: "offline", handoffs: [] };
      return status;
    }

    const fresh = [];
    for (const event of snapshot.events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      fresh.push(event);
    }
    status = {
      connection: "live",
      observedAt: snapshot.observedAt,
      agents: snapshot.agents,
      jobs: snapshot.jobs,
      history: fresh.length
        ? [...fresh, ...status.history].sort(
            (a, b) => Date.parse(b.at) - Date.parse(a.at),
          )
        : status.history,
      handoffs: status.connection === "live" ? fresh : [],
    };
    return status;
  };
}
