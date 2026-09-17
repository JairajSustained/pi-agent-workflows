/**
 * Run persistence: every workflow invocation records its script, args,
 * per-agent results, and final status under
 * `<cwd>/.pi/workflows/runs/<runId>/`.
 *
 * Resume replays a previous run's label-keyed results without re-spawning
 * those agents: scripts that label agents deterministically (e.g. per-item
 * or per-stage labels) resume near-instantly for completed labels and only
 * execute what is missing. Same-session semantic like Claude; the files also
 * survive restarts for inspection.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentFn, AgentResult } from "./types.ts";

export interface RunStatus {
  runId: string;
  name: string;
  status: "running" | "complete" | "failed";
  startedAt: string;
  finishedAt?: string;
  agentsSpawned?: number;
  resumedFrom?: string;
  error?: string;
}

export interface RunSummary extends RunStatus {
  result?: unknown;
}

export function runsRoot(cwd: string): string {
  return path.join(cwd, ".pi", "workflows", "runs");
}

export function sanitizeRunId(runId: string): string {
  if (!/^[\w.-]{1,80}$/.test(runId)) {
    throw new Error(`invalid run id "${runId}": expected <runId> from /workflows`);
  }
  return runId;
}

function newRunId(): string {
  const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `wf-${new Date().toISOString().replace(/[:.]/g, "-")}-${rand}`;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.promises.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

export async function createRun(
  cwd: string,
  script: string,
  args: Record<string, unknown>,
  resumedFrom?: string,
): Promise<{ runId: string; dir: string }> {
  const runId = newRunId();
  const dir = path.join(runsRoot(cwd), runId);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, "script.js"), script, "utf-8");
  await writeJson(path.join(dir, "args.json"), args);
  const status: RunStatus = {
    runId,
    name: "pending",
    status: "running",
    startedAt: new Date().toISOString(),
    resumedFrom,
  };
  await writeJson(path.join(dir, "status.json"), status);
  return { runId, dir };
}

export async function recordAgentResult(
  dir: string,
  label: string,
  result: AgentResult,
): Promise<void> {
  const line = JSON.stringify({ label, at: new Date().toISOString(), result }) + "\n";
  await fs.promises.appendFile(path.join(dir, "results.jsonl"), line, "utf-8");
}

export async function loadCachedResults(dir: string): Promise<Map<string, AgentResult>> {
  const cache = new Map<string, AgentResult>();
  let text = "";
  try {
    text = await fs.promises.readFile(path.join(dir, "results.jsonl"), "utf-8");
  } catch {
    return cache;
  }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as { label?: unknown; result?: AgentResult };
      if (typeof entry.label === "string" && entry.result) cache.set(entry.label, entry.result);
    } catch {
      /* skip corrupt lines */
    }
  }
  return cache;
}

/** Wrap an AgentFn so deterministically-labelled agents replay from cache. */
export function withResultCache(base: AgentFn, cache: Map<string, AgentResult>): AgentFn {
  return async (prompt, options = {}) => {
    const label = options.label;
    const hit = label != null ? cache.get(label) : undefined;
    if (hit) return { ...hit, label, cached: true };
    return base(prompt, options);
  };
}

export async function finishRun(
  dir: string,
  patch: { status: "complete" | "failed"; name: string; agentsSpawned: number; error?: string; result?: unknown },
): Promise<void> {
  const file = path.join(dir, "status.json");
  let status: RunStatus;
  try {
    status = JSON.parse(await fs.promises.readFile(file, "utf-8")) as RunStatus;
  } catch {
    status = { runId: path.basename(dir), name: "pending", status: "running", startedAt: "" };
  }
  status.status = patch.status;
  status.name = patch.name;
  status.agentsSpawned = patch.agentsSpawned;
  status.finishedAt = new Date().toISOString();
  if (patch.error) status.error = patch.error;
  await writeJson(file, status);
  if (patch.result !== undefined) {
    await writeJson(path.join(dir, "summary.json"), { result: patch.result });
  }
}

export async function listRuns(cwd: string): Promise<RunStatus[]> {
  let entries: string[] = [];
  try {
    entries = await fs.promises.readdir(runsRoot(cwd));
  } catch {
    return [];
  }
  const runs: RunStatus[] = [];
  for (const entry of entries.sort().reverse()) {
    try {
      const raw = await fs.promises.readFile(path.join(runsRoot(cwd), entry, "status.json"), "utf-8");
      runs.push(JSON.parse(raw) as RunStatus);
    } catch {
      /* skip incomplete run dirs */
    }
  }
  return runs;
}

export function sanitizeWorkflowName(name: string): string {
  if (!/^[\w.-]{1,60}$/.test(name)) {
    throw new Error(`invalid workflow name "${name}": use letters, numbers, dot, dash (max 60 chars)`);
  }
  return name;
}

export function savedWorkflowsDir(cwd: string): string {
  return path.join(cwd, ".pi", "workflows");
}

export interface SavedWorkflow {
  name: string;
  scope: "project" | "user";
  file: string;
}

export async function saveWorkflowRun(cwd: string, runId: string, name: string): Promise<string> {
  const id = sanitizeRunId(runId);
  const safe = sanitizeWorkflowName(name);
  const script = await fs.promises.readFile(path.join(runsRoot(cwd), id, "script.js"), "utf-8");
  const dir = savedWorkflowsDir(cwd);
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${safe}.js`);
  await fs.promises.writeFile(file, script, "utf-8");
  return file;
}

export async function listSavedWorkflows(cwd: string, userDir: string): Promise<SavedWorkflow[]> {
  const out: SavedWorkflow[] = [];
  const scan = async (dir: string, scope: "project" | "user"): Promise<void> => {
    let entries: string[] = [];
    try {
      entries = await fs.promises.readdir(dir);
    } catch {
      return;
    }
    for (const e of entries.sort()) {
      if (!e.endsWith(".js")) continue;
      try {
        out.push({ name: sanitizeWorkflowName(e.slice(0, -3)), scope, file: path.join(dir, e) });
      } catch {
        /* skip oddly-named files */
      }
    }
  };
  await scan(savedWorkflowsDir(cwd), "project");
  await scan(userDir, "user");
  return out;
}

export async function readRunSummary(cwd: string, runId: string): Promise<RunSummary> {
  const id = sanitizeRunId(runId);
  const dir = path.join(runsRoot(cwd), id);
  const status = JSON.parse(await fs.promises.readFile(path.join(dir, "status.json"), "utf-8")) as RunStatus;
  let result: unknown;
  try {
    const summary = JSON.parse(await fs.promises.readFile(path.join(dir, "summary.json"), "utf-8")) as {
      result?: unknown;
    };
    result = summary.result;
  } catch {
    result = undefined;
  }
  const cache = await loadCachedResults(dir);
  return { ...status, result, agentsSpawned: status.agentsSpawned ?? cache.size };
}
