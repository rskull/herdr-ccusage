#!/usr/bin/env node
// Report ccusage per-session cost onto herdr agent panes as metadata tokens.
// Usage: refresh.mjs all | event
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const HERDR = process.env.HERDR_BIN_PATH || "herdr";
const CCUSAGE = (process.env.HERDR_CCUSAGE_CMD || "npx -y ccusage@20.0.37").split(" ");
const SOURCE = "rskull.ccusage";
// Statuses that mean a turn just ended, so the session log has new usage.
const SETTLED = new Set(["idle", "done", "blocked"]);

const stateDir = process.env.HERDR_PLUGIN_STATE_DIR;

function log(msg) {
  if (!stateDir) return;
  try {
    mkdirSync(stateDir, { recursive: true });
    appendFileSync(join(stateDir, "refresh.log"), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

function run(argv) {
  return execFileSync(argv[0], argv.slice(1), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 60_000,
  });
}

function herdrJson(...args) {
  return JSON.parse(run([HERDR, ...args]));
}

function claudeAgents() {
  const { result } = herdrJson("agent", "list");
  return result.agents.filter(
    (a) => a.agent === "claude" && a.agent_session?.kind === "id" && a.agent_session.value,
  );
}

function sessionUsage(sessionId) {
  const out = run([...CCUSAGE, "session", "--id", sessionId, "--json", "--offline"]);
  // ccusage prints `null` for a session that has no usage logged yet.
  const { totalCost, totalTokens } = JSON.parse(out) ?? {};
  return { cost: totalCost ?? 0, tokens: totalTokens ?? 0 };
}

function formatTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function report(agent) {
  const sessionId = agent.agent_session.value;
  let usage;
  try {
    usage = sessionUsage(sessionId);
  } catch (e) {
    log(`ccusage failed for ${agent.pane_id} ${sessionId}: ${e.message}`);
    return;
  }
  const cost = `$${usage.cost.toFixed(2)}`;
  run([
    HERDR, "pane", "report-metadata", agent.pane_id,
    "--source", SOURCE,
    "--token", `cc_cost=${cost}`,
    "--token", `cc_tokens=${formatTokens(usage.tokens)}`,
    // Remembers which session these values belong to, so a /clear can be detected.
    "--token", `cc_session=${sessionId}`,
  ]);
  log(`${agent.pane_id} ${sessionId} ${cost} ${usage.tokens}`);
}

// The event payload may be the bare event or wrapped; find pane_id/agent_status either way.
function parseEvent() {
  let ev;
  try {
    ev = JSON.parse(process.env.HERDR_PLUGIN_EVENT_JSON || "{}");
  } catch {
    return {};
  }
  const body = ev.data ?? ev.event ?? ev.payload ?? ev;
  return {
    paneId: body.pane_id ?? ev.pane_id ?? process.env.HERDR_PANE_ID,
    status: body.agent_status ?? ev.agent_status,
  };
}

const mode = process.argv[2] || "all";
let agents = claudeAgents();

if (mode === "event") {
  const { paneId, status } = parseEvent();
  if (!paneId) process.exit(0);
  // Refresh when a turn ends, or right away when the pane switched sessions (e.g. /clear)
  // so the previous session's values don't linger through the next turn.
  agents = agents.filter(
    (a) =>
      a.pane_id === paneId &&
      (!status || SETTLED.has(status) || a.tokens?.cc_session !== a.agent_session.value),
  );
}

for (const agent of agents) report(agent);
