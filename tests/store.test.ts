import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { runWorkflow } from "../src/runtime/sandbox.ts";
import {
  createRun,
  finishRun,
  listRuns,
  loadCachedResults,
  listSavedWorkflows,
  readRunSummary,
  recordAgentResult,
  sanitizeRunId,
  sanitizeWorkflowName,
  saveWorkflowRun,
  withResultCache,
} from "../src/runtime/store.ts";
import { DEFAULT_RUN_CONFIG } from "../src/runtime/types.ts";
import type { AgentFn, AgentResult } from "../src/runtime/types.ts";

async function fakeCwd(): Promise<{ cwd: string; cleanup: () => Promise<void> }> {
  const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-wf-store-"));
  return { cwd, cleanup: () => fs.promises.rm(cwd, { recursive: true, force: true }) };
}

function ok(output: string): AgentResult {
  return { output, turns: 1, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0 } };
}

describe("run store", () => {
  it("records and replays label-keyed results", async () => {
    const { cwd, cleanup } = await fakeCwd();
    try {
      const { dir } = await createRun(cwd, "script", {});
      await recordAgentResult(dir, "a", ok("out-a"));
      await recordAgentResult(dir, "b", ok("out-b"));
      const cache = await loadCachedResults(dir);
      assert.equal(cache.get("a")?.output, "out-a");
      assert.equal(cache.size, 2);
    } finally {
      await cleanup();
    }
  });

  it("withResultCache replays hits without calling base", async () => {
    let baseCalls = 0;
    const base: AgentFn = async (prompt) => {
      baseCalls++;
      return ok(`fresh:${prompt}`);
    };
    const cache = new Map([["a", ok("cached-a")]]);
    const fn = withResultCache(base, cache);
    const hit = await fn("whatever", { label: "a" });
    assert.equal(hit.output, "cached-a");
    assert.equal(hit.cached, true);
    const miss = await fn("b-task", { label: "b" });
    assert.equal(miss.output, "fresh:b-task");
    assert.equal(miss.cached ?? false, false);
    assert.equal(baseCalls, 1);
  });

  it("finish/list/read round-trip", async () => {
    const { cwd, cleanup } = await fakeCwd();
    try {
      const { runId, dir } = await createRun(cwd, "s", { q: 1 });
      await recordAgentResult(dir, "a", ok("x"));
      await finishRun(dir, { status: "complete", name: "demo", agentsSpawned: 1, result: { ok: true } });
      const runs = await listRuns(cwd);
      assert.equal(runs.length, 1);
      assert.equal(runs[0].runId, runId);
      assert.equal(runs[0].status, "complete");
      const summary = await readRunSummary(cwd, runId);
      assert.equal(summary.name, "demo");
      assert.equal(JSON.stringify(summary.result), '{"ok":true}');
    } finally {
      await cleanup();
    }
  });

  it("saves a run script as a reusable workflow", async () => {
    const { cwd, cleanup } = await fakeCwd();
    const userDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-wf-user-"));
    try {
      const { runId } = await createRun(cwd, "const meta = { name: 'x', description: 'y' };", {});
      assert.throws(() => sanitizeWorkflowName("bad name!"), /invalid workflow name/);
      const file = await saveWorkflowRun(cwd, runId, "audit");
      assert.ok(file.endsWith(".pi/workflows/audit.js"));
      await fs.promises.writeFile(path.join(userDir, "global-thing.js"), "// global");
      const saved = await listSavedWorkflows(cwd, userDir);
      assert.deepEqual(
        saved.map((s) => `${s.scope}:${s.name}`).sort(),
        ["project:audit", "user:global-thing"],
      );
    } finally {
      await cleanup();
      await fs.promises.rm(userDir, { recursive: true, force: true });
    }
  });

  it("sanitizeRunId rejects path traversal", () => {
    assert.throws(() => sanitizeRunId("../evil"), /invalid run id/);
    assert.throws(() => sanitizeRunId("a/b"), /invalid run id/);
    assert.equal(sanitizeRunId("wf-2026-abc"), "wf-2026-abc");
  });

  it("resume replays completed labels and only runs what is missing", async () => {
    const { cwd, cleanup } = await fakeCwd();
    try {
      const script = `const meta = { name: 'r', description: 'resume demo' };
        const a = await agent('task a', { label: 'a' });
        const b = await agent('task b', { label: 'b' });
        const c = await agent('task c', { label: 'c' });
        return [a.output, b.output, c.output].join(',');`;
      const config = { ...DEFAULT_RUN_CONFIG, defaultCwd: cwd };

      // Run 1: fails on agent c. Wire recording like the extension does.
      const { dir } = await createRun(cwd, script, {});
      const calls1: string[] = [];
      const failing: AgentFn = async (prompt, options = {}) => {
        calls1.push(options.label ?? prompt);
        if (options.label === "c") throw new Error("boom on c");
        return { ...ok(`out-${options.label}`), label: options.label };
      };
      await assert.rejects(
        () =>
          runWorkflow(script, {}, failing, config, {
            onAgentResult: (label, result) => recordAgentResult(dir, label, result),
          }),
        /boom on c/,
      );
      assert.deepEqual(calls1, ["a", "b", "c"]);

      // Run 2 (resume): only c executes; a and b replay from cache.
      const calls2: string[] = [];
      const base2: AgentFn = async (prompt, options = {}) => {
        calls2.push(options.label ?? prompt);
        return { ...ok(`out-${options.label}`), label: options.label };
      };
      const resumed = withResultCache(base2, await loadCachedResults(dir));
      const outcome = await runWorkflow(script, {}, resumed, config);
      assert.deepEqual(calls2, ["c"]);
      assert.equal(JSON.stringify(outcome.result), '"out-a,out-b,out-c"');
      assert.equal(outcome.usage.agents, 1);
    } finally {
      await cleanup();
    }
  });
});
