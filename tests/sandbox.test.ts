import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runWorkflow } from "../src/runtime/sandbox.ts";
import { DEFAULT_RUN_CONFIG } from "../src/runtime/types.ts";
import type { AgentFn, AgentResult } from "../src/runtime/types.ts";

function stubAgent(responses?: Record<string, string>): { fn: AgentFn; calls: string[] } {
  const calls: string[] = [];
  const fn: AgentFn = async (prompt, options = {}): Promise<AgentResult> => {
    calls.push(prompt);
    const key = options.label ?? prompt;
    return {
      output: responses?.[key] ?? `done:${prompt.slice(0, 40)}`,
      label: options.label,
      phase: options.phase,
      turns: 1,
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost: 0.001 },
    };
  };
  return { fn, calls };
}

const config = { ...DEFAULT_RUN_CONFIG, defaultCwd: "/tmp" };

describe("sandbox spike", () => {
  it("fan-out + synthesize keeps intermediates out of the result", async () => {
    const { fn, calls } = stubAgent();
    const outcome = await runWorkflow(
      `
      const meta = { name: 'sweep', description: 'sweep modules', phases: [{title:'Scan'},{title:'Report'}] };
      phase('Scan');
      const found = await parallel([
        () => agent('scan auth module', { label: 'scan-auth', phase: 'Scan' }),
        () => agent('scan billing module', { label: 'scan-billing', phase: 'Scan' }),
      ]);
      phase('Report');
      const report = await agent('synthesize: ' + found.map(f => f.output).join(' | '), { label: 'synth', phase: 'Report' });
      return { summary: report.output, count: found.length };
      `,
      {},
      fn,
      config,
    );
    assert.equal(outcome.meta.name, "sweep");
    assert.equal(outcome.agentsSpawned, 3);
    assert.deepEqual(outcome.phasesSeen, ["Scan", "Report"]);
    assert.equal(calls.length, 3);
    // NB: results cross the vm realm boundary (different prototypes) — compare via JSON.
    assert.equal(
      JSON.stringify(outcome.result),
      JSON.stringify({
        summary: "done:synthesize: done:scan auth module | done",
        count: 2,
      }),
    );
  });

  it("pipeline streams items through stages", async () => {
    const seen: string[] = [];
    const fn: AgentFn = async (prompt): Promise<AgentResult> => {
      seen.push(prompt);
      return { output: `out(${prompt})`, turns: 1, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0 } };
    };
    const outcome = await runWorkflow(
      `
      const meta = { name: 'pipe', description: 'pipeline check' };
      const results = await pipeline(
        ['a', 'b'],
        (item) => agent('fix ' + item),
        (prev) => agent('review ' + prev.output),
      );
      return results.map(r => r.output);
      `,
      {},
      fn,
      config,
    );
    assert.equal(outcome.agentsSpawned, 4);
    assert.equal(JSON.stringify(outcome.result), JSON.stringify(["out(review out(fix a))", "out(review out(fix b))"]));
  });

  it("args global + adversarial verification pattern", async () => {
    const { fn } = stubAgent({
      "verify-1": "confirmed",
      "skeptic-1": "refuted: citation does not support claim",
    });
    const outcome = await runWorkflow(
      `
      const meta = { name: 'factcheck', description: 'verify claims' };
      const verdicts = await parallel(
        args.claims.map((c) => () => agent('verify claim: ' + c, { label: 'verify-' + c })),
      );
      const challenged = await parallel(
        verdicts.map((v, i) => () => agent('refute this verdict: ' + v.output, { label: 'skeptic-' + args.claims[i] })),
      );
      return { verdicts: verdicts.map(v => v.output), challenged: challenged.map(c => c.output) };
      `,
      { claims: ["1"] },
      fn,
      config,
    );
    assert.equal(
      JSON.stringify(outcome.result),
      JSON.stringify({
        verdicts: ["confirmed"],
        challenged: ["refuted: citation does not support claim"],
      }),
    );
  });

  it("accumulates usage across agents", async () => {
    const { fn } = stubAgent();
    const outcome = await runWorkflow(
      `const meta = { name: 'u', description: 'usage' };
       await parallel([() => agent('one'), () => agent('two')]);
       return 'ok';`,
      {},
      fn,
      config,
    );
    assert.equal(outcome.usage.agents, 2);
    assert.equal(outcome.usage.turns, 2);
    assert.equal(outcome.usage.input, 20);
    assert.equal(outcome.usage.output, 10);
  });

  it("scripts can retry schema failures in plain JS (no runtime magic)", async () => {
    let calls = 0;
    // Emulates the real runner: schema:'json' rejects non-JSON with a clear error.
    const flaky: AgentFn = async (prompt, options = {}): Promise<AgentResult> => {
      calls++;
      const output = calls === 1 ? "not json" : '{"ok":true}';
      if (options.schema === "json") {
        try {
          JSON.parse(output);
        } catch {
          throw new Error(`agent "${options.label ?? "unnamed"}" did not return valid JSON as required by schema`);
        }
      }
      return { output, turns: 1, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0 } };
    };
    const outcome = await runWorkflow(
      `const meta = { name: 'retry', description: 'retry demo' };
       let task = 'extract as JSON';
       let res;
       for (let i = 0; i < 2; i++) {
         try { res = await agent(task, { label: 'ext', schema: 'json' }); break; }
         catch (e) { task = 'Return ONLY valid JSON. Previous error: ' + e.message; }
       }
       return JSON.parse(res.output);`,
      {},
      flaky,
      config,
    );
    assert.equal(calls, 2);
    // cross-realm: compare via JSON
    assert.equal(JSON.stringify(outcome.result), '{"ok":true}');
  });

  it("rejects banned APIs with actionable errors", async () => {
    const { fn } = stubAgent();
    await assert.rejects(
      () =>
        runWorkflow(`const meta = { name: 'x', description: 'y' }; require('fs'); return 1;`, {}, fn, config),
      /banned/,
    );
    await assert.rejects(
      () => runWorkflow(`const meta = { name: 'x', description: 'y' }; fetch('http://x'); return 1;`, {}, fn, config),
      /banned/,
    );
  });

  it("rejects missing meta", async () => {
    const { fn } = stubAgent();
    await assert.rejects(() => runWorkflow(`return 1;`, {}, fn, config), /must declare `meta`/);
    await assert.rejects(
      () => runWorkflow(`const meta = { name: '' }; return 1;`, {}, fn, config),
      /meta\.name/,
    );
  });

  it("enforces the total agent cap", async () => {
    const { fn } = stubAgent();
    await assert.rejects(
      () =>
        runWorkflow(
          `const meta = { name: 'x', description: 'y' }; await parallel(Array.from({length: 5}, (_, i) => () => agent('t' + i))); return 1;`,
          {},
          fn,
          { ...config, maxAgents: 3 },
        ),
      /agent cap reached/,
    );
  });

  it("script has no access to process/require escape hatches", async () => {
    const { fn } = stubAgent();
    // Static lint blocks these before the vm ever runs (fail fast with LLM-actionable errors).
    await assert.rejects(
      () =>
        runWorkflow(`const meta = { name: 'x', description: 'y' }; return typeof process;`, {}, fn, config),
      /not available/,
    );
    await assert.rejects(
      () =>
        runWorkflow(`const meta = { name: 'x', description: 'y' }; return require('fs');`, {}, fn, config),
      /banned/,
    );
    // …and identifiers that pass the lint are still undefined inside the vm.
    const outcome = await runWorkflow(
      `const meta = { name: 'x', description: 'y' }; return [typeof someUndeclaredThing, typeof globalThis.pi];`,
      {},
      fn,
      config,
    );
    // NB: result arrays come from the vm realm (different Array prototype),
    // so compare via JSON rather than deepStrictEqual.
    assert.equal(JSON.stringify(outcome.result), '["undefined","undefined"]');
  });
});
