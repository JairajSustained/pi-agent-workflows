/**
 * LIVE integration test — spawns real `pi` subprocess agents.
 * Costs a fraction of a cent per run. Only runs with PI_WORKFLOWS_LIVE=1
 * and PI_WORKFLOWS_MODEL set (e.g. opencode-go/muse-spark-1.3-contributor).
 *
 *   PI_WORKFLOWS_LIVE=1 PI_WORKFLOWS_MODEL="opencode-go/muse-spark-1.3-contributor" npm test
 *
 * SAFETY (2026-09-17 fork-bomb incident): never run the live suite without the
 * isPiEntryPoint + PI_WORKFLOWS_DEPTH guards in agent-runner.ts. Blast-radius
 * procedure for a first run after touching the runner: run ONE case with
 * --test-name-pattern, watch `pgrep -f 'pi-agent-workflows/tests/live.test.ts'`,
 * and keep a pkill loop ready (see PLAN.md §6). Kill-switch trips at >6 procs.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAgentRunner } from "../src/runtime/agent-runner.ts";
import { runWorkflow } from "../src/runtime/sandbox.ts";
import { DEFAULT_RUN_CONFIG } from "../src/runtime/types.ts";

const LIVE = process.env.PI_WORKFLOWS_LIVE === "1";
const MODEL = process.env.PI_WORKFLOWS_MODEL;

describe("live agent runner", { skip: !LIVE || !MODEL }, () => {
  it("round-trips a real pi subprocess", async () => {
    const [provider, ...rest] = (MODEL as string).split("/");
    const runner = createAgentRunner({
      cwd: process.cwd(),
      provider,
      model: MODEL,
      tools: [],
      timeoutMs: 120_000,
    });
    const res = await runner("Reply with exactly: live-ok", { label: "live-spike" });
    assert.match(res.output, /live-ok/);
    assert.equal(res.turns, 1);
  });

  it("runs a 2-agent workflow end to end", async () => {
    const [provider, ...rest] = (MODEL as string).split("/");
    const runner = createAgentRunner({
      cwd: process.cwd(),
      provider,
      model: MODEL,
      tools: [],
      timeoutMs: 120_000,
    });
    const outcome = await runWorkflow(
      `const meta = { name: 'live-e2e', description: 'live fanout' };
       const rs = await parallel([
         () => agent('Reply with exactly: red', { label: 'a-red' }),
         () => agent('Reply with exactly: blue', { label: 'a-blue' }),
       ]);
       return rs.map(r => r.output).sort().join('+');`,
      {},
      runner,
      { ...DEFAULT_RUN_CONFIG, defaultCwd: process.cwd() },
    );
    assert.equal(JSON.stringify(outcome.result), '"blue+red"');
    assert.equal(outcome.usage.agents, 2);
  });
});
