/**
 * Isolated JS execution for workflow scripts.
 *
 * The script is plain JavaScript with top-level await. It declares `meta`
 * and orchestrates agents via injected globals. It gets NO filesystem,
 * network, process, or timer access — only spawned agents can act.
 *
 * Implementation: capture `meta` via a preprocess rewrite, wrap the body in
 * an async IIFE (top-level await/return keep working), run in node:vm with
 * a frozen minimal global set.
 */

import vm from "node:vm";
import { Scheduler } from "./scheduler.ts";
import type { AgentFn, AgentResult, RunConfig, WorkflowMeta } from "./types.ts";
import { validateMeta, validateScript } from "./validate.ts";

export interface RunEvents {
  onLog?: (message: string) => void;
  onPhase?: (title: string) => void;
  /** Called after every freshly-spawned agent (never for cache replays) */
  onAgentResult?: (label: string, result: AgentResult) => void | Promise<void>;
  signal?: AbortSignal;
}

export interface WorkflowUsage {
  agents: number;
  turns: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export interface WorkflowOutcome {
  result: unknown;
  meta: WorkflowMeta;
  agentsSpawned: number;
  phasesSeen: string[];
  logs: string[];
  usage: WorkflowUsage;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("workflow aborted");
  }
}

export async function runWorkflow(
  script: string,
  args: Record<string, unknown>,
  agentFn: AgentFn,
  config: RunConfig,
  events: RunEvents = {},
): Promise<WorkflowOutcome> {
  validateScript(script);

  const scheduler = new Scheduler(config.maxConcurrency, config.maxAgents);
  const logs: string[] = [];
  const phasesSeen: string[] = [];
  const usage: WorkflowUsage = { agents: 0, turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  let currentPhase = "";

  const wrappedAgent = async (prompt: unknown, options: unknown): Promise<AgentResult> => {
    checkAborted(events.signal);
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("agent(prompt, ...) requires a non-empty string prompt");
    }
    const opts = (options ?? {}) as Record<string, unknown>;
    const label =
      typeof opts.label === "string" && opts.label ? opts.label : `agent-${scheduler.totalSpawned + 1}`;
    const res = await scheduler.schedule(label, () =>
      agentFn(prompt, {
        label,
        phase: typeof opts.phase === "string" ? opts.phase : currentPhase || undefined,
        schema: typeof opts.schema === "string" ? opts.schema : undefined,
        model: typeof opts.model === "string" ? opts.model : config.defaultModel,
        systemPrompt: typeof opts.systemPrompt === "string" ? opts.systemPrompt : undefined,
        worktree: opts.worktree === true,
        signal: events.signal,
      }),
    );
    if (res.cached === true) return res;
    usage.agents++;
    usage.turns += res.turns;
    usage.input += res.usage.input;
    usage.output += res.usage.output;
    usage.cacheRead += res.usage.cacheRead;
    usage.cacheWrite += res.usage.cacheWrite;
    usage.cost += res.usage.cost;
    // Persist for resume/inspection. Never fail the workflow on a logging error.
    try {
      await events.onAgentResult?.(label, res);
    } catch (err) {
      logs.push(`run-log warn: could not record agent "${label}": ${err instanceof Error ? err.message : String(err)}`);
    }
    return res;
  };

  const parallel = (fns: unknown): Promise<unknown[]> => {
    checkAborted(events.signal);
    if (!Array.isArray(fns)) throw new Error("parallel([...]) requires an array of functions");
    return Promise.all(
      fns.map((fn, i) => {
        if (typeof fn !== "function") throw new Error(`parallel() item ${i} is not a function`);
        return (fn as () => Promise<unknown>)();
      }),
    );
  };

  const pipeline = async (items: unknown, ...stages: unknown[]): Promise<unknown[]> => {
    checkAborted(events.signal);
    if (!Array.isArray(items)) throw new Error("pipeline(items, ...) requires an array of items");
    if (stages.length === 0) throw new Error("pipeline(items, ...) requires at least one stage");
    for (const [i, s] of stages.entries()) {
      if (typeof s !== "function") throw new Error(`pipeline() stage ${i} is not a function`);
    }
    const fns = stages as Array<(prev: unknown, item: unknown) => Promise<unknown>>;
    // Each item flows through all stages independently; items run concurrently.
    return Promise.all(
      items.map(async (item) => {
        let prev: unknown = item;
        for (let i = 0; i < fns.length; i++) {
          checkAborted(events.signal);
          prev = i === 0 ? await fns[0](item, item) : await fns[i](prev, item);
        }
        return prev;
      }),
    );
  };

  const phase = (title: unknown): void => {
    if (typeof title !== "string" || !title) throw new Error("phase(title) requires a non-empty string");
    currentPhase = title;
    phasesSeen.push(title);
    events.onPhase?.(title);
  };

  const log = (message: unknown): void => {
    const text = typeof message === "string" ? message : JSON.stringify(message);
    logs.push(text);
    events.onLog?.(text);
  };

  // Capture meta: rewrite the declaration so it also assigns the vm global.
  const withMetaCapture = script.replace(/(const|let|var)\s+meta\s*=/, "$1 meta = globalThis.__pi_meta =");

  const wrapped = `(async () => {\n${withMetaCapture}\n})()`;

  const context: Record<string, unknown> = {
    agent: wrappedAgent,
    parallel,
    pipeline,
    phase,
    log,
    args,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Error,
    Promise,
  };
  vm.createContext(context);

  let result: unknown;
  try {
    const promise = vm.runInContext(wrapped, context, { timeout: 30_000 }) as Promise<unknown>;
    result = await promise;
  } catch (err) {
    throw new Error(`workflow script failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const meta = context.__pi_meta as unknown;
  validateMeta(meta);

  return { result, meta, agentsSpawned: scheduler.totalSpawned, phasesSeen, logs, usage };
}
